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
 * Super admin picks the operator, or lets each row's IPTV Partner ID (Pioneer cid, required on
 * every row) or Branch column decide; an operator imports into its own account. Reads .xlsx and .csv.
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
  // super admin bulk import: Pioneer's partner id (cid) of the operator
  'iptv partner id': 'iptv_partner_id', 'iptv partnerid': 'iptv_partner_id', 'iptv partner': 'iptv_partner_id',
  'partner id': 'iptv_partner_id', cid: 'iptv_partner_id',
};
const DATE_FIELDS = ['last_renewal', 'date_added'];

// Excel date serial (days since 1899-12-30) -> "YYYY-MM-DD HH:MM:SS"
const excelSerialToText = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return v;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

/**
 * grid (array of rows of cells) -> { rows } | { error }.
 * needCid: every row must have an "IPTV Partner ID" (super admin bulk import).
 */
export const gridToRows = (grid, needCid = false) => {
  if (!grid || !grid.length) return { error: 'The file is empty.' };
  const head = grid[0].map((h) => HEADERS[String(h || '').trim().toLowerCase().replace(/[\s_]+/g, ' ')] || null);
  const need = [['stb', 'Stb Number'], ['mobile', 'Mobile'], ...(needCid ? [['iptv_partner_id', 'IPTV Partner ID']] : [])];
  const missing = need.filter(([f]) => !head.includes(f)).map(([, l]) => l);
  if (missing.length) {
    return { error: `The file needs the columns ${need.map(([, l]) => `"${l}"`).join(', ')} (missing: ${missing.join(', ')}). Use the Pioneer customer export${needCid ? ' with an "IPTV Partner ID" column added' : ''}.` };
  }
  const rows = [];
  // line numbers as a spreadsheet shows them: header = 1 (multi-line cells count once)
  grid.slice(1).forEach((cells, i) => {
    const r = { line: i + 2 };
    head.forEach((f, j) => {
      if (!f) return;
      let v = String(cells[j] ?? '').trim();
      if (DATE_FIELDS.includes(f) && /^\d+(\.\d+)?$/.test(v)) v = excelSerialToText(v);
      r[f] = v;
    });
    rows.push(r);
  });
  if (needCid) {
    const empty = rows.filter((r) => !r.iptv_partner_id).map((r) => r.line);
    if (empty.length) {
      return { error: `"IPTV Partner ID" must not be empty — fill it in on line${empty.length === 1 ? '' : 's'} ${empty.slice(0, 15).join(', ')}${empty.length > 15 ? ` and ${empty.length - 15} more` : ''}.` };
    }
    const bad = rows.filter((r) => !/^\d+$/.test(r.iptv_partner_id)).map((r) => r.line);
    if (bad.length) {
      return { error: `"IPTV Partner ID" must be a number (Pioneer's partner id) — check line${bad.length === 1 ? '' : 's'} ${bad.slice(0, 15).join(', ')}${bad.length > 15 ? ` and ${bad.length - 15} more` : ''}.` };
    }
  }
  return { rows };
};

export const csvToRows = (text, needCid = false) => gridToRows(parseCsv(text), needCid);

// ---- minimal .xlsx reader (no library): zip directory + DecompressionStream + DOMParser ----
const unzipEntries = (buf) => {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i -= 1) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let k = 0; k < count; k += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    out[name] = { method, data: new Uint8Array(buf, start, size) };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
};

const entryText = async (e) => {
  if (!e) return '';
  if (e.method === 0) return new TextDecoder().decode(e.data);
  if (e.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('unsupported');
  const stream = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
};

const colIndex = (ref) => {
  const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (let i = 0; i < letters.length; i += 1) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
};

/** first worksheet of an .xlsx -> grid of strings */
export const xlsxToGrid = async (buf) => {
  const files = unzipEntries(buf);
  const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
  const strings = [];
  if (files['xl/sharedStrings.xml']) {
    const doc = xml(await entryText(files['xl/sharedStrings.xml']));
    Array.from(doc.getElementsByTagName('si')).forEach((si) => {
      // rich text: all <t> pieces, but not the phonetic (<rPh>) ones
      strings.push(Array.from(si.getElementsByTagName('t')).filter((t) => t.parentNode && t.parentNode.nodeName !== 'rPh').map((t) => t.textContent).join(''));
    });
  }
  // the first sheet in workbook order
  let sheetPath = 'xl/worksheets/sheet1.xml';
  try {
    const wb = xml(await entryText(files['xl/workbook.xml']));
    const first = wb.getElementsByTagName('sheet')[0];
    const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    if (rid && files['xl/_rels/workbook.xml.rels']) {
      const rels = xml(await entryText(files['xl/_rels/workbook.xml.rels']));
      const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
      const target = rel && rel.getAttribute('Target');
      if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    }
  } catch (e) { /* keep sheet1 */ }
  if (!files[sheetPath]) sheetPath = Object.keys(files).find((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  if (!sheetPath) throw new Error('no sheet');
  const sheet = xml(await entryText(files[sheetPath]));
  const grid = [];
  Array.from(sheet.getElementsByTagName('row')).forEach((rowEl, ri) => {
    const rIdx = Number(rowEl.getAttribute('r')) ? Number(rowEl.getAttribute('r')) - 1 : ri;
    const cells = [];
    Array.from(rowEl.getElementsByTagName('c')).forEach((c, ci) => {
      const idx = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : ci;
      const t = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let v = vEl ? vEl.textContent : '';
      if (t === 's') v = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') v = Array.from(c.getElementsByTagName('t')).map((x) => x.textContent).join('');
      else if (t === 'b') v = v === '1' ? 'TRUE' : 'FALSE';
      cells[idx] = v;
    });
    if (cells.some((v) => String(v ?? '').trim() !== '')) {
      grid[rIdx] = Array.from(cells, (v) => (v == null ? '' : String(v)));
    }
  });
  // keep the header as row 1 even when the sheet starts lower: drop leading empty rows only
  const compact = [];
  let started = false;
  grid.forEach((r) => { if (r) { started = true; } if (started) compact.push(r || []); });
  return compact.filter((r) => r.length);
};

const pickFile = () => new Promise((resolve) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve(null); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) { resolve(null); return; }
    const lower = f.name.toLowerCase();
    if (lower.endsWith('.xls')) { resolve({ name: f.name, error: 'Old .xls files cannot be read — save the sheet as .xlsx or .csv and choose it again.' }); return; }
    try {
      if (lower.endsWith('.xlsx')) {
        const grid = await xlsxToGrid(await f.arrayBuffer());
        resolve({ name: f.name, grid });
      } else {
        resolve({ name: f.name, grid: parseCsv(await f.text()) });
      }
    } catch (e) {
      resolve({ name: f.name, error: 'Could not read this file. Save it as .xlsx or .csv and try again.' });
    }
  };
  input.click();
});

const addSummary = (a, b) => {
  const out = { ...a };
  Object.keys(b || {}).forEach((k) => { out[k] = (out[k] || 0) + (Number(b[k]) || 0); });
  return out;
};

export const IptvImportModal = ({ visible, user, operators = [], onClose, onDone, onLinkRemaining }) => {
  const isOperator = String(user?.role || '').toLowerCase() === 'operator';
  const isSuper = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'superadmin';
  const defaultOp = isOperator ? String(user?.partner_id || '') : isSuper ? 'cid' : '0';
  const [file, setFile] = useState(null); // { name, grid, rows }
  const [fileError, setFileError] = useState('');
  const [operatorId, setOperatorId] = useState(defaultOp); // 'cid' = by the IPTV Partner ID column
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
    setOperatorId(defaultOp);
    cancelRef.current = false;
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const byCid = operatorId === 'cid';

  // reads the grid for the current mode (the IPTV Partner ID column is required only in 'cid' mode)
  const applyGrid = (name, grid, cidMode) => {
    const parsed = gridToRows(grid, cidMode);
    if (parsed.error) { setFile({ name, grid, rows: null }); setFileError(parsed.error); return; }
    if (!parsed.rows.length) { setFile({ name, grid, rows: null }); setFileError('The file has a header but no customers.'); return; }
    setFileError('');
    setFile({ name, grid, rows: parsed.rows });
  };

  // a new file or operator needs a new check
  useEffect(() => {
    if (stage === 'checked') { setStage('pick'); setCheck(null); }
    if (file?.grid) applyGrid(file.name, file.grid, byCid);
  }, [operatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async () => {
    const f = await pickFile();
    if (!f) return;
    setCheck(null); setStage('pick');
    if (f.error) { setFile(null); setFileError(f.error); return; }
    applyGrid(f.name, f.grid, byCid);
  };
  const ready = !!(file && file.rows && file.rows.length);

  // runs the rows through iptv_import.php in chunks
  const sendRows = async (dryRun) => {
    let summary = {};
    let results = [];
    const byOp = {};
    const total = file.rows.length;
    for (let i = 0; i < total; i += IMPORT_CHUNK) {
      if (cancelRef.current) break;
      const part = file.rows.slice(i, i + IMPORT_CHUNK);
      const res = await OneBssApi.importIptvCustomers(operatorId === '0' || byCid ? 0 : operatorId, part, dryRun, { byIptvPartner: byCid });
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
    if (!ready || busy) return;
    setBusy(true);
    const out = await sendRows(true);
    setBusy(false); setProgress(null);
    setCheck(out); setStage('checked');
  };

  const runImport = async () => {
    if (!ready || busy) return;
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
    for (let k = 0; k < jobs.length; k += 1) {
      const j = jobs[k];
      if (cancelRef.current) break;
      const res = await OneBssApi.syncIptvMobiles(j.op, j.mobiles);
      // the server stops after ~40 s and hands back the mobiles it did not reach: send them next
      const left = res.ok && Array.isArray(res.data.remaining) ? res.data.remaining : [];
      if (left.length) {
        jobs.splice(k + 1, 0, { op: j.op, mobiles: left });
      }
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
      st.done += j.mobiles.length - left.length;
      setSync({ ...st });
    }
    setBusy(false); setStage('done');
    onDone && onDone();
  };

  const close = () => { cancelRef.current = true; onClose(); };

  const errors = (check?.results || imported?.results || []).filter((r) => !r.ok);
  const S = (stage === 'done' || stage === 'syncing' || stage === 'importing') ? imported?.summary || {} : check?.summary || {};
  const opOptions = [
    ...(isSuper ? [{ value: 'cid', label: 'Bulk — by the IPTV Partner ID column', sub: 'every row needs Pioneer\'s partner id (cid) of its operator' }] : []),
    ...(!isOperator ? [{ value: '0', label: 'Automatic — by the Branch column', sub: 'each branch must be given to exactly one operator' }] : []),
    ...operators.map((o) => ({ value: String(o.value), label: o.label, search: o.label })),
  ];

  return (
    <ModalShell
      visible={visible}
      title="Import IPTV customers (Excel / CSV)"
      icon="upload"
      iconColor="#7c3aed"
      onClose={close}
      maxWidth={720}
      busy={busy && stage === 'importing'}
      footer={(
        <>
          <Btn label={stage === 'done' ? 'Close' : 'Cancel'} kind="ghost" onPress={close} disabled={busy && stage === 'importing'} />
          {stage === 'pick' ? <Btn label={busy ? 'Checking…' : 'Check file'} icon="search" onPress={runCheck} disabled={!ready || busy || (!isOperator && !operatorId)} /> : null}
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
              <Text style={s.label}>1. Excel / CSV file</Text>
              <TouchableOpacity style={s.fileBox} onPress={choose} disabled={busy}>
                <Feather name={file ? 'file-text' : 'upload-cloud'} size={20} color="#7c3aed" />
                <View style={{ flex: 1 }}>
                  <Text style={s.fileName}>{file ? file.name : 'Choose the Pioneer customer export (.xlsx or .csv)'}</Text>
                  <Text style={s.fileSub}>{file?.rows ? `${file.rows.length} customer row(s)` : `Columns used: ${byCid ? 'IPTV Partner ID (required), ' : ''}Stb Number, Name, Mobile, Status, Last Renewal, Branch, Installation Address, Email, Date Added`}</Text>
                </View>
                <Text style={s.fileBtn}>{file ? 'Change' : 'Browse'}</Text>
              </TouchableOpacity>
              {fileError ? <View style={{ marginTop: 8 }}><Note tone="error" text={fileError} /></View> : null}
            </View>

            {!isOperator ? (
              <View>
                <Text style={s.label}>2. Operator</Text>
                <SearchSelect value={operatorId} options={opOptions} onChange={(v) => setOperatorId(String(v))} placeholder="Pick the operator…" searchPlaceholder="Search operators…" accent="#7c3aed" />
                {byCid ? <View style={{ marginTop: 8 }}><Note tone="info" text="Each row goes to the operator whose IPTV settings have that IPTV Partner ID. Rows with an ID that no operator has are skipped and listed." /></View> : null}
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
            {stage === 'done' && onLinkRemaining && Number(S.customers_created || 0) > 0 ? (
              <TouchableOpacity style={s.linkCta} onPress={() => onLinkRemaining(operatorId && operatorId !== '0' && !byCid ? operatorId : '')}>
                <Feather name="link" size={14} color="#7c3aed" />
                <Text style={s.linkCtaText}>
                  {S.customers_created} mobile{Number(S.customers_created) === 1 ? '' : 's'} matched no existing customer — link those IPTV accounts to internet customers
                </Text>
                <Feather name="arrow-right" size={14} color="#7c3aed" />
              </TouchableOpacity>
            ) : null}
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
                <Text key={r.line} style={s.errLine}><Text style={{ fontWeight: '700' }}>Line {r.line}</Text>{r.name ? ` · ${r.name}` : ''}{r.mobile ? ` · ${r.mobile}` : ''}{r.iptv_partner_id ? ` · IPTV partner ${r.iptv_partner_id}` : ''} — {r.message}</Text>
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
  linkCta: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#c4b5fd', backgroundColor: '#ffffff' },
  linkCtaText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#6d28d9' },
  syncLine: { fontSize: 12.5, color: '#334155' },
  errList: { maxHeight: 180, borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 10, backgroundColor: '#fff7f7' },
  errLine: { fontSize: 12, color: '#7f1d1d', lineHeight: 18 },
});
