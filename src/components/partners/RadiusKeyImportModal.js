import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { downloadCsv } from '../../utils/sampleCsv';
import { pickFile } from '../iptv/IptvImportModal';
import { ModalShell, Btn, Note } from '../internet/shared';

const ACCENT = '#0f766e';
// header text -> field
const HEADERS = {
  'internet partner id': 'internet_partner_id', 'radius partner id': 'internet_partner_id', 'partner id': 'internet_partner_id',
  'api key': 'api_key', apikey: 'api_key', 'api token': 'api_key', token: 'api_key', key: 'api_key', 'radius key': 'api_key',
};

const gridToKeyRows = (grid) => {
  if (!grid || grid.length < 2) return { error: 'The file has no rows. Use the sample file: Internet Partner ID, API Key.' };
  const head = grid[0].map((h) => HEADERS[String(h || '').trim().toLowerCase().replace(/[\s_]+/g, ' ')] || null);
  const missing = [['internet_partner_id', 'Internet Partner ID'], ['api_key', 'API Key']].filter(([f]) => !head.includes(f)).map(([, l]) => l);
  if (missing.length) return { error: `The file needs the columns "Internet Partner ID" and "API Key" (missing: ${missing.join(', ')}). Download the sample file.` };
  const rows = [];
  grid.slice(1).forEach((cells, i) => {
    const r = { line: i + 2 };
    head.forEach((f, j) => { if (f) r[f] = String(cells[j] ?? '').trim(); });
    if (r.internet_partner_id || r.api_key) rows.push(r);
  });
  if (!rows.length) return { error: 'The file has a header but no rows.' };
  return { rows };
};

/**
 * Super admin, Partners page: update the operators' RADIUS API keys from a CSV / Excel file
 * matched by RADIUS partner id (radius_token_import.php). Check first (nothing saved), then
 * import. Keys are never shown — only their last 4 characters.
 */
export const RadiusKeyImportModal = ({ visible, onClose, onDone, inline = false }) => {
  const [file, setFile] = useState(null); // { name, rows }
  const [fileError, setFileError] = useState('');
  const [check, setCheck] = useState(null); // dry-run answer
  const [done, setDone] = useState(null); // import answer
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setFileError(''); setCheck(null); setDone(null); setBusy(false); };
  useEffect(() => {
    if (!visible) return;
    reset();
  }, [visible]);
  // inline (Bulk operations page): "Done" / "Cancel" start over instead of closing a window
  const close = () => (inline ? reset() : onClose && onClose());

  const choose = async () => {
    const f = await pickFile();
    if (!f) return;
    setCheck(null); setDone(null);
    if (f.error) { setFile(null); setFileError(f.error); return; }
    const parsed = gridToKeyRows(f.grid);
    if (parsed.error) { setFile(null); setFileError(parsed.error); return; }
    setFileError('');
    setFile({ name: f.name, rows: parsed.rows });
  };

  const send = async (dryRun) => {
    if (!file || busy) return;
    setBusy(true);
    const res = await OneBssApi.importRadiusKeys(file.rows, dryRun);
    setBusy(false);
    if (!res.ok || res.data?.success === false) {
      toast.error(res.data?.message || 'Could not read the file on the server');
      return;
    }
    if (dryRun) { setCheck(res.data); return; }
    setDone(res.data);
    toast.success(`${res.data.summary.updated} RADIUS key(s) updated`);
    if (onDone) onDone(res.data);
  };

  const sample = () => downloadCsv('radius_keys_sample.csv', ['Internet Partner ID', 'API Key'], [
    ['962', 'paste-the-api-key-of-partner-962-here'],
    ['1045', 'paste-the-api-key-of-partner-1045-here'],
  ]);

  const shown = done || check;
  const S = shown?.summary;

  return (
    <ModalShell
      visible={visible}
      inline={inline}
      title="Import RADIUS API keys"
      icon="key"
      iconColor={ACCENT}
      onClose={() => !busy && close()}
      busy={busy}
      maxWidth={640}
      footer={done ? (
        <Btn label={inline ? 'Import another file' : 'Done'} onPress={close} />
      ) : check ? (
        <>
          <Btn label="Back" kind="ghost" onPress={() => setCheck(null)} disabled={busy} />
          <Btn label={`Update ${S.updated} key(s)`} icon="upload" onPress={() => send(false)} loading={busy} disabled={!S.updated} />
        </>
      ) : (
        <>
          {!inline ? <Btn label="Cancel" kind="ghost" onPress={close} disabled={busy} /> : null}
          <Btn label="Check file" icon="check-circle" onPress={() => send(true)} loading={busy} disabled={!file} />
        </>
      )}
    >
      {!shown ? (
        <>
          <Note tone="info" text="Each row sets the API key of the operator whose RADIUS partner id matches. The RADIUS URL and everything else stay as they are. Check first: nothing is saved until you press Update." />
          <View style={st.labelRow}>
            <Text style={st.label}>CSV / EXCEL FILE</Text>
            <TouchableOpacity style={st.sampleBtn} onPress={sample}>
              <Feather name="download" size={12} color={ACCENT} />
              <Text style={st.sampleText}>Sample file</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={st.fileBox} onPress={choose} disabled={busy}>
            <Feather name="file-text" size={22} color={ACCENT} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.fileName} numberOfLines={1}>{file ? file.name : 'Choose the file (.csv or .xlsx)'}</Text>
              <Text style={st.fileSub}>{file ? `${file.rows.length} row(s)` : 'Columns: Internet Partner ID, API Key'}</Text>
            </View>
          </TouchableOpacity>
          {fileError ? <View style={{ marginTop: 10 }}><Note tone="error" text={fileError} /></View> : null}
          <View style={{ marginTop: 10 }}><Note tone="warn" text="API keys are secrets: delete the file from your computer after the import." /></View>
        </>
      ) : (
        <>
          <View style={st.chips}>
            <Text style={[st.chip, { color: '#047857', borderColor: '#a7f3d0' }]}>{S.updated} {done ? 'updated' : 'to update'}</Text>
            <Text style={[st.chip, { color: '#475569', borderColor: '#e2e8f0' }]}>{S.unchanged} already the same</Text>
            <Text style={[st.chip, { color: S.errors ? '#b91c1c' : '#475569', borderColor: S.errors ? '#fecaca' : '#e2e8f0' }]}>{S.errors} with errors</Text>
          </View>
          <ScrollView style={st.list} nestedScrollEnabled>
            {shown.results.map((r) => (
              <View key={r.line} style={st.item}>
                <Feather name={!r.ok ? 'x-circle' : r.action === 'same' ? 'minus-circle' : 'check-circle'} size={15} color={!r.ok ? '#dc2626' : r.action === 'same' ? '#94a3b8' : '#16a34a'} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.itemTitle} numberOfLines={1}>
                    Line {r.line} · RADIUS partner {r.internet_partner_id || '—'}{r.partner_name ? ` → ${r.partner_name} #${r.partner_id}` : ''}
                  </Text>
                  <Text style={[st.itemSub, !r.ok && { color: '#b91c1c' }]} numberOfLines={3}>{r.message}{r.key_hint ? ` · key ${r.key_hint}` : ''}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </ModalShell>
  );
};

const st = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', letterSpacing: 0.4 },
  sampleBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#99f6e4', backgroundColor: '#ffffff' },
  sampleText: { fontSize: 11.5, fontWeight: '700', color: ACCENT },
  fileBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5eead4', backgroundColor: '#f0fdfa' },
  fileName: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  fileSub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  chip: { fontSize: 11.5, fontWeight: '700', borderWidth: 1, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  list: { maxHeight: 360, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemTitle: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  itemSub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
});
