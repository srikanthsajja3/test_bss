import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { ModalShell, Btn, Note, sharedStyles } from '../components/internet/shared';
import { parseApiDate, formatApiDate } from '../components/CustomerAccountsOverview';

/**
 * Super admin › Networking › NAS (networking/nas.php, networking/nas_status.php).
 * Every NAS is checked when the page opens and again every minute while it stays open;
 * cron/nas_status_check.php keeps the last state fresh in between.
 */
const INDIGO = '#4f46e5';
export const NAS_STATUS = {
  online: { label: 'ONLINE', fg: '#047857', bg: '#dcfce7', dot: '#10b981' },
  offline: { label: 'OFFLINE', fg: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  unknown: { label: 'UNKNOWN', fg: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
};
const EMPTY = { nas_id: null, nas_name: '', nas_ip: '', area: '', device_type: '' };
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const ago = (d) => {
  const t = parseApiDate(d);
  if (!t) return 'never checked';
  const s = Math.max(0, Math.round((Date.now() - t.getTime()) / 1000));
  if (s < 60) return 'checked just now';
  if (s < 3600) return `checked ${Math.round(s / 60)} min ago`;
  return `checked ${formatApiDate(d)}`;
};

/** Runs fn over items, at most `limit` at a time. */
const runLimited = async (items, limit, fn) => {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

export const NasStatusPill = ({ status, latency, checking }) => {
  const conf = NAS_STATUS[status] || NAS_STATUS.unknown;
  return (
    <View style={[s.pill, { backgroundColor: conf.bg }]}>
      {checking ? <ActivityIndicator size={10} color={conf.fg} /> : <View style={[s.dot, { backgroundColor: conf.dot }]} />}
      <Text style={[s.pillText, { color: conf.fg }]}>
        {conf.label}
        {status === 'online' && latency !== null && latency !== undefined ? ` · ${Math.round(latency)} ms` : ''}
      </Text>
    </View>
  );
};

export const NasScreen = ({ refreshSignal, onOpenPools }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState({}); // nas_id -> true
  const [form, setForm] = useState(null); // null | EMPTY | row being edited
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [search, setSearch] = useState('');
  const rowsRef = useRef([]);

  const mergeStatus = (results) => {
    setRows((prev) => prev.map((r) => {
      const hit = results.find((x) => x.nas_id === r.nas_id);
      return hit ? { ...r, last_status: hit.status, last_latency_ms: hit.latency_ms, last_checked_at: hit.last_checked_at, method: hit.method } : r;
    }));
  };

  const checkOne = async (nasId) => {
    setChecking((c) => ({ ...c, [nasId]: true }));
    try {
      const res = await OneBssApi.checkNasStatus(nasId);
      if (res.ok && Array.isArray(res.data?.data)) mergeStatus(res.data.data);
    } finally {
      setChecking((c) => {
        const n = { ...c };
        delete n[nasId];
        return n;
      });
    }
  };

  const checkAll = useCallback(async (list) => {
    const ids = (list || rowsRef.current).map((r) => r.nas_id);
    await runLimited(ids, 4, checkOne);
  }, []);

  const load = useCallback(async (thenCheck = false) => {
    setLoading(true);
    const res = await OneBssApi.getNasList();
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || `Could not load NAS list (HTTP ${res.status}).`);
      return;
    }
    setError('');
    const list = Array.isArray(res.data?.data) ? res.data.data : [];
    setRows(list);
    rowsRef.current = list;
    if (thenCheck && list.length) checkAll(list);
  }, [checkAll]);

  useEffect(() => {
    load(true);
  }, [load, refreshSignal]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // keep the status live while the page is open
  useEffect(() => {
    const t = setInterval(() => checkAll(), 60000);
    return () => clearInterval(t);
  }, [checkAll]);

  const save = async () => {
    const f = form;
    if (!IPV4.test(f.nas_ip.trim())) return toast.warning('Enter a valid NAS IPv4 address');
    if (!f.area.trim()) return toast.warning('Area is required');
    if (!f.device_type.trim()) return toast.warning('Device type is required');
    setSaving(true);
    const payload = { nas_id: f.nas_id, nas_name: f.nas_name.trim(), nas_ip: f.nas_ip.trim(), area: f.area.trim(), device_type: f.device_type.trim() };
    const res = f.nas_id ? await OneBssApi.updateNas(payload) : await OneBssApi.createNas(payload);
    setSaving(false);
    if (!res.ok) return toast.error(res.data?.message || 'Could not save the NAS');
    toast.success(res.data?.message || 'Saved');
    setForm(null);
    await load(false);
    const id = f.nas_id || res.data?.nas_id;
    if (id) checkOne(id);
  };

  const remove = async (row) => {
    setDeleting(row.nas_id);
    const res = await OneBssApi.deleteNas(row.nas_id);
    setDeleting(null);
    setConfirmDel(null);
    if (!res.ok) return toast.error(res.data?.message || 'Could not delete the NAS');
    toast.success(res.data?.message || 'NAS deleted');
    load(false);
  };

  const qx = search.trim().toLowerCase();
  const shown = qx
    ? rows.filter((r) => [r.nas_name, r.nas_ip, r.area, r.device_type, ...(r.operators || []).map((o) => o.name)].join(' ').toLowerCase().includes(qx))
    : rows;
  const count = (st) => rows.filter((r) => (r.last_status || 'unknown') === st).length;
  const anyChecking = Object.keys(checking).length > 0;
  const unknownReason = (rows.find((r) => r.last_status === 'unknown' && r.method) || {}).method || '';
  const tiles = [
    { label: 'NAS devices', value: rows.length, color: '#0f172a', icon: 'server' },
    { label: 'Online', value: count('online'), color: '#047857', icon: 'check-circle' },
    { label: 'Offline', value: count('offline'), color: '#b91c1c', icon: 'x-circle' },
    { label: 'Not checkable', value: count('unknown'), color: '#475569', icon: 'help-circle' },
  ];
  const setF = (k) => (v) => setForm((x) => ({ ...x, [k]: v }));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {error ? <Note tone="error" text={error} /> : null}
        {unknownReason ? (
          <Note
            tone="warn"
            text="Online / offline can't be checked from the OneBSS server right now: the hosting blocks ping and intercepts the management ports. Ask your hosting provider to allow outgoing ping, or let the server reach the NAS on MikroTik API 8728 / Winbox 8291 / SSH 22 (a VPN is needed for NAS on private IPs)."
          />
        ) : null}

        <View style={s.tiles}>
          {tiles.map((t) => (
            <View key={t.label} style={[s.tile, isMobile && { minWidth: '46%' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name={t.icon} size={13} color={t.color} />
                <Text style={[s.tileLabel, { color: t.color }]}>{t.label}</Text>
              </View>
              <Text style={[s.tileValue, { color: t.color }]}>{loading && !rows.length ? '…' : t.value}</Text>
            </View>
          ))}
        </View>

        <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={[s.search, isMobile && { maxWidth: '100%' }]}>
            <Feather name="search" size={14} color="#94a3b8" />
            <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Name, IP, area, operator…" placeholderTextColor="#94a3b8" />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity style={s.ghostBtn} onPress={() => checkAll()} disabled={anyChecking || !rows.length}>
              {anyChecking ? <ActivityIndicator size="small" color={INDIGO} /> : <Feather name="activity" size={14} color={INDIGO} />}
              <Text style={s.ghostBtnText}>{anyChecking ? 'Checking…' : 'Check all now'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.primaryBtn} onPress={() => setForm({ ...EMPTY })}>
              <Feather name="plus" size={14} color="#ffffff" />
              <Text style={s.primaryBtnText}>Add NAS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && !rows.length ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
              <View style={{ minWidth: 1040, flexGrow: 1 }}>
                <View style={[s.tr, s.thRow]}>
                  <Text style={[s.th, { width: 170 }]}>Status</Text>
                  <Text style={[s.th, { width: 190 }]}>NAS</Text>
                  <Text style={[s.th, { width: 150 }]}>Area</Text>
                  <Text style={[s.th, { width: 150 }]}>Device type</Text>
                  <Text style={[s.th, { width: 130 }]}>IPs used</Text>
                  <Text style={[s.th, { flex: 1, minWidth: 160 }]}>Operators</Text>
                  <Text style={[s.th, { width: 150, textAlign: 'right' }]}> </Text>
                </View>
                {shown.map((r) => (
                  <View key={r.nas_id} style={s.tr}>
                    <View style={{ width: 170, paddingRight: 8 }}>
                      <NasStatusPill status={r.last_status} latency={r.last_latency_ms} checking={!!checking[r.nas_id]} />
                      <Text style={s.sub} numberOfLines={2} title={r.method || ''}>
                        {ago(r.last_checked_at)}{r.method && r.last_status !== 'unknown' ? ` · ${r.method}` : ''}
                      </Text>
                    </View>
                    <View style={{ width: 190, paddingRight: 8 }}>
                      <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{r.nas_name || `NAS #${r.nas_id}`}</Text>
                      <Text style={[s.sub, s.mono]} selectable>{r.nas_ip}</Text>
                    </View>
                    <Text style={[s.td, { width: 150, paddingRight: 8 }]} numberOfLines={2}>{r.area}</Text>
                    <Text style={[s.td, { width: 150, paddingRight: 8 }]} numberOfLines={2}>{r.device_type}</Text>
                    <TouchableOpacity style={{ width: 130, paddingRight: 8 }} onPress={onOpenPools}>
                      <Text style={s.td}>
                        <Text style={{ fontWeight: '800' }}>{r.assigned_ips}</Text> / {r.total_ips}
                      </Text>
                      <Text style={[s.sub, { color: INDIGO }]}>{r.pool_count} pool{r.pool_count === 1 ? '' : 's'} ›</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 160, flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingRight: 8 }}>
                      {(r.operators || []).length ? r.operators.map((o) => (
                        <View key={o.partner_id} style={s.opChip}><Text style={s.opChipText} numberOfLines={1}>{o.name}</Text></View>
                      )) : <Text style={s.sub}>No pool given to an operator yet</Text>}
                    </View>
                    <View style={{ width: 150, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                      {confirmDel === r.nas_id ? (
                        <>
                          <TouchableOpacity style={s.smallGhost} onPress={() => setConfirmDel(null)} disabled={deleting === r.nas_id}><Text style={s.smallGhostText}>No</Text></TouchableOpacity>
                          <TouchableOpacity style={s.smallDanger} onPress={() => remove(r)} disabled={deleting === r.nas_id}>
                            {deleting === r.nas_id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.smallDangerText}>Delete</Text>}
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <TouchableOpacity style={s.iconBtn} onPress={() => checkOne(r.nas_id)} disabled={!!checking[r.nas_id]} accessibilityLabel="Check now" title="Check now">
                            <Feather name="refresh-cw" size={14} color={INDIGO} />
                          </TouchableOpacity>
                          <TouchableOpacity style={s.iconBtn} onPress={() => setForm({ ...EMPTY, ...r })} accessibilityLabel="Edit" title="Edit">
                            <Feather name="edit-2" size={14} color="#334155" />
                          </TouchableOpacity>
                          <TouchableOpacity style={[s.iconBtn, { borderColor: '#fecaca' }]} onPress={() => setConfirmDel(r.nas_id)} accessibilityLabel="Delete" title={r.pool_count ? 'Delete its IP pools first' : 'Delete'} disabled={r.pool_count > 0}>
                            <Feather name="trash-2" size={14} color={r.pool_count > 0 ? '#cbd5e1' : '#dc2626'} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
                {!loading && !shown.length ? (
                  <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                    <Feather name="server" size={22} color="#94a3b8" />
                    <Text style={s.sub}>{rows.length ? 'No NAS matches the search.' : 'No NAS yet — add your first one.'}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <ModalShell
        visible={!!form}
        title={form?.nas_id ? `Edit NAS #${form.nas_id}` : 'Add NAS'}
        icon="server"
        iconColor={INDIGO}
        onClose={() => setForm(null)}
        busy={saving}
        footer={
          <>
            <Btn label="Cancel" kind="ghost" onPress={() => setForm(null)} disabled={saving} />
            <Btn label={form?.nas_id ? 'Save changes' : 'Add NAS'} onPress={save} loading={saving} />
          </>
        }
      >
        {form ? (
          <>
            <Text style={sharedStyles.label}>NAME (OPTIONAL)</Text>
            <TextInput style={sharedStyles.input} value={form.nas_name} onChangeText={setF('nas_name')} placeholder="e.g. BRAS-Guntur-1" placeholderTextColor="#94a3b8" />
            <Text style={[sharedStyles.label, { marginTop: 12 }]}>NAS IP ADDRESS *</Text>
            <TextInput style={[sharedStyles.input, form.nas_ip && !IPV4.test(form.nas_ip.trim()) && { borderColor: '#f87171' }]} value={form.nas_ip} onChangeText={setF('nas_ip')} placeholder="e.g. 10.10.0.1" placeholderTextColor="#94a3b8" autoCapitalize="none" />
            <Text style={[sharedStyles.label, { marginTop: 12 }]}>AREA *</Text>
            <TextInput style={sharedStyles.input} value={form.area} onChangeText={setF('area')} placeholder="e.g. Guntur" placeholderTextColor="#94a3b8" />
            <Text style={[sharedStyles.label, { marginTop: 12 }]}>DEVICE TYPE *</Text>
            <TextInput style={sharedStyles.input} value={form.device_type} onChangeText={setF('device_type')} placeholder="e.g. MikroTik CCR1036" placeholderTextColor="#94a3b8" onSubmitEditing={save} />
            {form.nas_id && form.pool_count ? <Note tone="info" text="Changing the NAS IP here does not change anything on the device or in RADIUS." /> : null}
          </>
        ) : null}
      </ModalShell>
    </View>
  );
};

export const s = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, minWidth: 170, padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  tileLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  tileValue: { fontSize: 22, fontWeight: '800' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, minWidth: 240, flexGrow: 1, maxWidth: 360, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 8, backgroundColor: INDIGO },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 38, borderRadius: 8, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#ffffff' },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: INDIGO },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  mono: { fontFamily: 'monospace' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  opChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#eef2ff', maxWidth: 180 },
  opChipText: { fontSize: 11, fontWeight: '700', color: '#3730a3' },
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  smallGhost: { paddingHorizontal: 10, height: 32, justifyContent: 'center', borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  smallGhostText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  smallDanger: { paddingHorizontal: 12, height: 32, justifyContent: 'center', borderRadius: 8, backgroundColor: '#dc2626', minWidth: 64, alignItems: 'center' },
  smallDangerText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  foot: { fontSize: 11.5, color: '#94a3b8' },
});
