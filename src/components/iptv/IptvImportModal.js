import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, SearchSelect } from '../internet/shared';

/**
 * Import IPTV customers from the Pioneer customer export (CSV) — iptv_import.php — then run the
 * IPTV sync for exactly those mobiles (iptv_bulk_customer_sync.php with a mobiles list).
 *   1. pick the file (read here in the browser)   2. Check: dry run, shows what will happen per row
 *   3. Import (200 rows per call)                  4. Sync with Pioneer (5 mobiles per call)
 * Super admin picks the operator, or lets each row's Branch column decide; an operator imports
 * into its own account.
 */
const IMPORT_CHUNK = 200;
const SYNC_CHUNK = 5;

// CSV -> array of rows (array of cells). Handles quotes, "" escapes, commas and line breaks inside quotes.
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = false; }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',' || c === '\t') {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
};

// header text -> field name the server expects
const HEADERS = {
  id: 'id', status: 'status', 'stb number': 'stb', 'stb no': 'stb', stb: 'stb', 'mac id': 'mac', name: 'name',
  mobile: 'mobile', 'mobile number': 'mobile', 'caf number': 'caf', 'last renewal': 'last_renewal',
  'operator name': 'operator_name', branch: 'branch', 'installation address': 'address', address: 'address',
  email: 'email', 'date added': 'date_added',
};

export const csvToRows = (text) => {
  const grid = parseCsv(text);
  if (!grid.length) return { error: 'The file is empty.' };
  const head = grid[0].map((h) => HEADERS[h.trim().toLowerCase().replace(/\s+/g, ' ')] || null);
  const missing = ['stb', 'mobile'].filter((f) => !head.includes(f));
  if (missing.length) {
    return { error: `The file needs the columns "Stb Number" and "Mobile" (missing: ${missing.map((m) => (m === 'stb' ? 'Stb Number' : 'Mobile')).join(', ')}). Use the Pioneer customer export.` };
  }
  const rows = [];
  // line numbers as a spreadsheet shows them: header = 1 (multi-line cells count once)
  grid.slice(1).forEach((cells, i) => {
    const r = { line: i + 2 };
    head.forEach((f, j) => { if (f) r[f] = (cells[j] || '').trim(); });
    rows.push(r);
  });
  return { rows };
};

const pickFile = () => new Promise((resolve) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve(null); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = () => {
    const f = input.files && input.files[0];
    if (!f) { resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: f.name, text: String(reader.result || '') });
    reader.onerror = () => resolve(null);
    reader.readAsText(f);
  };
  input.click();
});

const addSummary = (a, b) => {
  const out = { ...a };
  Object.keys(b || {}).forEach((k) => { out[k] = (out[k] || 0) + (Number(b[k]) || 0); });
  return out;
};

export const IptvImportModal = ({ visible, user, operators = [], onClose, onDone }) => {
  const isOperator = String(user?.role || '').toLowerCase() === 'operator';
  const [file, setFile] = useState(null); // { name, rows }
  const [fileError, setFileError] = useState('');
  const [operatorId, setOperatorId] = useState(isOperator ? String(user?.partner_id || '') : '0');
  const [stage, setStage] = useState('pick'); // pick | checked | importing | syncing | done
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(null); // { summary, results }
  const [imported, setImported] = useState(null);
  const [sync, setSync] = useState(null); // { done, total, ok, notFound, failed, failures: [] }
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setFile(null); setFileError(''); setStage('pick'); setCheck(null); setImported(null); setSync(null); setProgress(null);
    setOperatorId(isOperator ? String(user?.partner_id || '') : '0');
    cancelRef.current = false;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new file or operator needs a new check
  useEffect(() => { if (stage === 'checked') { setStage('pick'); setCheck(null); } }, [operatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async () => {
    const f = await pickFile();
    if (!f) return;
    const parsed = csvToRows(f.text);
    setCheck(null); setStage('pick');
    if (parsed.error) { setFile(null); setFileError(parsed.error); return; }
    if (!parsed.rows.length) { setFile(null); setFileError('The file has a header but no customers.'); return; }
    setFileError('');
    setFile({ name: f.name, rows: parsed.rows });
  };

  // runs the rows through iptv_import.php in chunks
  const sendRows = async (dryRun) => {
    let summary = {};
    let results = [];
    const byOp = {};
    const total = file.rows.length;
    for (let i = 0; i < total; i += IMPORT_CHUNK) {
      if (cancelRef.current) break;
      const part = file.rows.slice(i, i + IMPORT_CHUNK);
      const res = await OneBssApi.importIptvCustomers(operatorId === '0' ? 0 : operatorId, part, dryRun);
      if (!res.ok) {
        part.forEach((r) => results.push({ line: r.line, ok: false, mobile: r.mobile, name: r.name, message: res.data?.message || 'Request failed', stbs: [] }));
        summary = addSummary(summary, { rows: part.length, errors: part.length });
      } else {
        summary = addSummary(summary, res.data.summary);
        results = results.concat(res.data.results || []);
        Object.entries(res.data.mobiles_by_operator || {}).forEach(([op, list]) => {
          byOp[op] = Array.from(new Set([...(byOp[op] || []), ...list.map(String)]));
        });
      }
      setProgress({ label: dryRun ? 'Checking' : 'Importing', done: Math.min(i + IMPORT_CHUNK, total), total });
    }
    return { summary, results, byOp };
  };

  const runCheck = async () => {
    if (!file || busy) return;
    setBusy(true);
    const out = await sendRows(true);
    setBusy(false); setProgress(null);
    setCheck(out); setStage('checked');
  };

  const runImport = async () => {
    if (!file || busy) return;
    setBusy(true); setStage('importing');
    const out = await sendRows(false);
    setProgress(null);
    setImported(out);
    toast.success(`Imported: ${out.summary.stbs_added || 0} STB(s), ${out.summary.customers_created || 0} new customer(s)`);

    // then sync exactly those mobiles with Pioneer
    setStage('syncing');
    const jobs = [];
    Object.entries(out.byOp).forEach(([op, list]) => {
      for (let i = 0; i < list.length; i += SYNC_CHUNK) jobs.push({ op, mobiles: list.slice(i, i + SYNC_CHUNK) });
    });
    const totalMobiles = jobs.reduce((n, j) => n + j.mobiles.length, 0);
    const st = { done: 0, total: totalMobiles, ok: 0, notFound: 0, failed: 0, failures: [] };
    setSync({ ...st });
    for (const j of jobs) {
      if (cancelRef.current) break;
      const res = await OneBssApi.syncIptvMobiles(j.op, j.mobiles);
      if (res.ok) {
        st.ok += res.data.summary?.synced_ok || 0;
        (res.data.failures || []).forEach((f) => {
          if (/not found/i.test(f.message || '')) st.notFound += 1; else st.failed += 1;
          st.failures.push(f);
        });
      } else if (res.status === 409) {
        // a sync for this operator is already running: count them as not synced yet
        st.failed += j.mobiles.length;
        j.mobiles.forEach((m) => st.failures.push({ mobile: m, message: 'Another IPTV sync for this operator was running; sync again later.' }));
      } else {
        st.failed += j.mobiles.length;
        j.mobiles.forEach((m) => st.failures.push({ mobile: m, message: res.data?.message || 'Sync request failed' }));
      }
      st.done += j.mobiles.length;
      setSync({ ...st });
    }
    setBusy(false); setStage('done');
    onDone && onDone();
  };

  const close = () => { cancelRef.current = true; onClose(); };

  const errors = (check?.results || imported?.results || []).filter((r) => !r.ok);
  const S = (stage === 'done' || stage === 'syncing' || stage === 'importing') ? imported?.summary || {} : check?.summary || {};
  const opOptions = [
    ...(!isOperator ? [{ value: '0', label: 'Automatic — by the Branch column', sub: 'each branch must be given to exactly one operator' }] : []),
    ...operators.map((o) => ({ value: String(o.value), label: o.label, search: o.label })),
  ];

  return (
    <ModalShell
      visible={visible}
      title="Import IPTV customers (CSV)"
      icon="upload"
      iconColor="#7c3aed"
      onClose={close}
      maxWidth={720}
      busy={busy && stage === 'importing'}
      footer={(
        <>
          <Btn label={stage === 'done' ? 'Close' : 'Cancel'} kind="ghost" onPress={close} disabled={busy && stage === 'importing'} />
          {stage === 'pick' ? <Btn label={busy ? 'Checking…' : 'Check file'} icon="search" onPress={runCheck} disabled={!file || busy || (!isOperator && !operatorId)} /> : null}
          {stage === 'checked' ? (
            <Btn label={`Import ${S.stbs_added || 0} STB(s) and sync`} icon="upload" onPress={runImport} disabled={!S.stbs_added && !S.stbs_existing} />
          ) : null}
        </>
      )}
    >
      <View style={{ gap: 14 }}>
        {stage === 'pick' || stage === 'checked' ? (
          <>
            <View>
              <Text style={s.label}>1. CSV file</Text>
              <TouchableOpacity style={s.fileBox} onPress={choose} disabled={busy}>
                <Feather name={file ? 'file-text' : 'upload-cloud'} size={20} color="#7c3aed" />
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName}>{file ? file.name : 'Choose the Pioneer customer export (.csv)'}</Text>
                  <Text style={s.fileSub}>{file ? `${file.rows.length} customer row(s)` : 'Columns used: Stb Number, Name, Mobile, Status, Last Renewal, Branch, Installation Address, Email, Date Added'}</Text>
                </View>
                <Text style={s.fileBtn}>{file ? 'Change' : 'Browse'}</Text>
              </TouchableOpacity>
              {fileError ? <View style={{ marginTop: 8 }}><Note tone="error" text={fileError} /></View> : null}
            </View>

            {!isOperator ? (
              <View>
                <Text style={s.label}>2. Operator</Text>
                <SearchSelect value={operatorId} options={opOptions} onChange={(v) => setOperatorId(String(v))} placeholder="Pick the operator…" searchPlaceholder="Search operators…" accent="#7c3aed" />
              </View>
            ) : null}
          </>
        ) : null}

        {progress ? (
          <View>
            <Text style={s.progText}>{progress.label} {progress.done} / {progress.total} rows…</Text>
            <View style={s.progTrack}><View style={[s.progFill, { width: `${Math.round((progress.done / progress.total) * 100)}%` }]} /></View>
          </View>
        ) : null}

        {(check || imported) ? (
          <View style={s.statRow}>
            {[
              { label: stage === 'checked' ? 'STBs to add' : 'STBs added', value: S.stbs_added || 0, color: '#16a34a' },
              { label: 'New customers', value: S.customers_created || 0, color: '#0284c7' },
              { label: 'Matched customers', value: S.customers_matched || 0, color: '#7c3aed' },
              { label: 'Already on file', value: S.stbs_existing || 0, color: '#64748b' },
              { label: 'Rows with errors', value: S.errors || 0, color: (S.errors || 0) ? '#dc2626' : '#64748b' },
            ].map((t) => (
              <View key={t.label} style={s.stat}>
                <Text style={[s.statValue, { color: t.color }]}>{t.value}</Text>
                <Text style={s.statLabel}>{t.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {stage === 'checked' ? (
          <Note tone="info" text="Nothing is saved yet. Import adds the STBs and customers, then syncs those mobiles with Pioneer to load each box's plan, expiry and ids. STBs already on file are not added again — the sync refreshes them." />
        ) : null}

        {sync ? (
          <View style={s.syncBox}>
            <Text style={s.syncTitle}>{stage === 'done' ? 'Pioneer sync finished' : `Syncing with Pioneer… ${sync.done} / ${sync.total}`}</Text>
            <View style={s.progTrack}><View style={[s.progFill, { width: `${sync.total ? Math.round((sync.done / sync.total) * 100) : 100}%` }]} /></View>
            <Text style={s.syncLine}>{sync.ok} synced · {sync.notFound} not found on Pioneer · {sync.failed} failed</Text>
            {stage === 'done' && sync.failures.length ? (
              <ScrollView style={{ maxHeight: 140, marginTop: 6 }}>
                {sync.failures.map((f, i) => <Text key={i} style={s.errLine}>{f.mobile}: {f.message}</Text>)}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {errors.length ? (
          <View>
            <Text style={s.label}>Rows that {stage === 'checked' ? 'will be skipped' : 'were skipped'} ({errors.length})</Text>
            <ScrollView style={s.errList}>
              {errors.map((r) => (
                <Text key={r.line} style={s.errLine}><Text style={{ fontWeight: '700' }}>Line {r.line}</Text>{r.name ? ` · ${r.name}` : ''}{r.mobile ? ` · ${r.mobile}` : ''} — {r.message}</Text>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </ModalShell>
  );
};

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  fileBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  fileName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  fileSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  fileBtn: { fontSize: 12.5, fontWeight: '700', color: '#7c3aed' },
  progText: { fontSize: 12, color: '#475569', marginBottom: 6 },
  progTrack: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  progFill: { height: 6, backgroundColor: '#7c3aed' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 110, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  syncBox: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#faf5ff', gap: 8 },
  syncTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  syncLine: { fontSize: 12.5, color: '#334155' },
  errList: { maxHeight: 180, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10, backgroundColor: '#fff7f7' },
  errLine: { fontSize: 12, color: '#7f1d1d', lineHeight: 18 },
});
