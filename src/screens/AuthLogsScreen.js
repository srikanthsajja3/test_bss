import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { Note, SearchSelect, isSuperAdmin } from '../components/internet/shared';
import { formatApiDate } from '../components/CustomerAccountsOverview';
import { NAS_STATUS } from './NasScreen';

/**
 * Auth Logs by NAS (networking/nas_auth_logs.php → RADIUS GET /api/auth-logs).
 *   operator    → its own NAS (given on Networking › NAS), through its own RADIUS login
 *   admin       → picks one of its operators first
 *   super admin → every NAS (super admin RADIUS login), or one operator's view
 * RADIUS pages oldest-first; the page opens on the latest page and shows newest first.
 */
const INDIGO = '#4f46e5';
const PAGE_SIZES = [25, 50, 100, 200];
const EMPTY_FILTERS = { customerid: '', mac: '', framedipaddress: '', reason: '' };

const fmt = (d) => {
  try {
    return formatApiDate(d) || d;
  } catch (e) {
    return d;
  }
};

export const AuthLogsScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSuper = isSuperAdmin(user);
  const isOperator = user?.role === 'operator';

  const [ctx, setCtx] = useState(null); // { nas, operators, needs_operator }
  const [ctxLoading, setCtxLoading] = useState(true);
  const [opId, setOpId] = useState(''); // '' = super admin view
  const [nasId, setNasId] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('all'); // all | accept | reject (within the page)
  const reqId = useRef(0);

  // ---- which NAS (and operators) may be picked
  const loadCtx = useCallback(async (operatorId) => {
    setCtxLoading(true);
    const res = await OneBssApi.getNasAuthLogs({ operator_id: operatorId || '' });
    setCtxLoading(false);
    if (!res.ok) {
      setCtx({ nas: [], operators: [], needs_operator: false });
      setError(res.data?.message || `Could not load NAS list (HTTP ${res.status}).`);
      return;
    }
    setError('');
    const data = res.data || {};
    setCtx({ nas: data.nas || [], operators: data.operators || [], needs_operator: !!data.needs_operator });
    setNasId((cur) => {
      const list = data.nas || [];
      if (cur && list.some((n) => String(n.nas_id) === String(cur))) return cur;
      return list.length === 1 ? String(list[0].nas_id) : '';
    });
  }, []);

  useEffect(() => {
    loadCtx(opId);
  }, [loadCtx, opId, refreshSignal]);

  // ---- logs
  const fetchLogs = useCallback(async (page = 'last', f = applied, size = pageSize) => {
    if (!nasId) return;
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    const res = await OneBssApi.getNasAuthLogs({ operator_id: opId || '', nas_id: nasId, page, page_size: size, ...f });
    if (id !== reqId.current) return; // a newer request is on its way
    setLoading(false);
    if (!res.ok) {
      setResult(null);
      setError(res.data?.message || `Could not load authentication logs (HTTP ${res.status}).`);
      return;
    }
    setResult(res.data);
  }, [nasId, opId, applied, pageSize]);

  useEffect(() => {
    setResult(null);
    if (nasId) fetchLogs('last');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nasId, opId]);

  const apply = () => {
    setApplied(filters);
    fetchLogs('last', filters);
  };
  const clear = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    fetchLogs('last', EMPTY_FILTERS);
  };
  const changeSize = (n) => {
    setPageSize(n);
    fetchLogs('last', applied, n);
  };

  const nasOptions = useMemo(() => (ctx?.nas || []).map((n) => ({
    value: String(n.nas_id),
    label: n.nas_name || `NAS #${n.nas_id}`,
    sub: `${n.nas_ip}${n.area ? ` · ${n.area}` : ''}`,
    search: `${n.nas_ip} ${n.area} ${n.device_type}`,
  })), [ctx]);
  const opOptions = useMemo(() => [
    ...(isSuper ? [{ value: '', label: 'All operators (super admin view)', sub: 'Every NAS · super admin RADIUS login' }] : []),
    ...(ctx?.operators || []).map((o) => ({ value: String(o.partner_id), label: o.name, sub: `#${o.partner_id} · only its NAS` })),
  ], [ctx, isSuper]);

  const selectedNas = (ctx?.nas || []).find((n) => String(n.nas_id) === String(nasId));
  const logs = useMemo(() => {
    const list = [...(result?.logs || [])].reverse(); // newest first
    if (reply === 'accept') return list.filter((l) => l.accepted);
    if (reply === 'reject') return list.filter((l) => !l.accepted);
    return list;
  }, [result, reply]);
  const showUser = (result?.logs || []).some((l) => l.username);
  const page = result?.page ?? 0;
  const lastPage = result?.last_page;
  const atNewest = lastPage !== null && lastPage !== undefined ? page >= lastPage : !result?.has_more;
  const activeFilters = Object.values(applied).filter((v) => v.trim()).length;
  const setF = (k) => (v) => setFilters((x) => ({ ...x, [k]: v }));

  const Pager = () => (
    <View style={s.pager}>
      <TouchableOpacity style={[s.pgBtn, page <= 0 && s.pgOff]} disabled={page <= 0 || loading} onPress={() => fetchLogs(0)} title="Oldest">
        <Feather name="chevrons-left" size={14} color={page <= 0 ? '#cbd5e1' : '#334155'} />
      </TouchableOpacity>
      <TouchableOpacity style={[s.pgBtn, page <= 0 && s.pgOff]} disabled={page <= 0 || loading} onPress={() => fetchLogs(page - 1)}>
        <Feather name="chevron-left" size={14} color={page <= 0 ? '#cbd5e1' : '#334155'} />
        <Text style={[s.pgText, page <= 0 && { color: '#cbd5e1' }]}>Older</Text>
      </TouchableOpacity>
      <Text style={s.pgInfo}>
        Page {page + 1}{lastPage !== null && lastPage !== undefined ? ` of ${lastPage + 1}` : ''}
      </Text>
      <TouchableOpacity style={[s.pgBtn, atNewest && s.pgOff]} disabled={atNewest || loading} onPress={() => fetchLogs(page + 1)}>
        <Text style={[s.pgText, atNewest && { color: '#cbd5e1' }]}>Newer</Text>
        <Feather name="chevron-right" size={14} color={atNewest ? '#cbd5e1' : '#334155'} />
      </TouchableOpacity>
      <TouchableOpacity style={[s.pgBtn, atNewest && s.pgOff]} disabled={atNewest || loading} onPress={() => fetchLogs('last')} title="Latest">
        <Feather name="chevrons-right" size={14} color={atNewest ? '#cbd5e1' : '#334155'} />
      </TouchableOpacity>
    </View>
  );

  const ReplyPill = ({ l }) => (
    <View style={[s.pill, { backgroundColor: l.accepted ? '#dcfce7' : '#fee2e2' }]}>
      <Feather name={l.accepted ? 'check' : 'x'} size={11} color={l.accepted ? '#047857' : '#b91c1c'} />
      <Text style={[s.pillText, { color: l.accepted ? '#047857' : '#b91c1c' }]}>{l.accepted ? 'ACCEPT' : 'REJECT'}</Text>
    </View>
  );

  const noNas = !ctxLoading && ctx && !ctx.needs_operator && !(ctx.nas || []).length;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {/* pickers */}
        <View style={[s.card, { padding: 14, gap: 12 }]}>
          <View style={[s.row, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
            {!isOperator ? (
              <View style={[s.field, { maxWidth: isMobile ? '100%' : 320 }]}>
                <Text style={s.label}>OPERATOR</Text>
                <SearchSelect
                  value={opId}
                  options={opOptions}
                  onChange={(v) => { setOpId(String(v || '')); setNasId(''); }}
                  placeholder={isSuper ? 'All operators' : 'Choose an operator'}
                  searchPlaceholder="Search operators…"
                  accent={INDIGO}
                />
              </View>
            ) : null}
            <View style={[s.field, { maxWidth: isMobile ? '100%' : 380 }]}>
              <Text style={s.label}>NAS</Text>
              <SearchSelect
                value={nasId}
                options={nasOptions}
                onChange={(v) => setNasId(String(v || ''))}
                disabled={ctxLoading || !nasOptions.length}
                placeholder={ctxLoading ? 'Loading…' : nasOptions.length ? 'Choose a NAS' : 'No NAS'}
                searchPlaceholder="Name, IP, area…"
                accent={INDIGO}
              />
            </View>
            {selectedNas ? (
              <View style={[s.nasInfo, isMobile && { marginTop: 0 }]}>
                <View style={[s.dot, { backgroundColor: (NAS_STATUS[selectedNas.last_status] || NAS_STATUS.unknown).dot }]} />
                <Text style={s.sub} numberOfLines={1}>
                  <Text style={s.mono}>{selectedNas.nas_ip}</Text>
                  {selectedNas.device_type ? ` · ${selectedNas.device_type}` : ''}
                  {result?.via === 'operator' ? ' · operator login' : result?.via === 'superadmin' ? ' · super admin login' : ''}
                </Text>
              </View>
            ) : null}
          </View>

          {/* filters */}
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {[
              ['customerid', 'Username', 'e.g. ravi123'],
              ['mac', 'MAC', '00:00:00:00:00:03'],
              ['framedipaddress', 'Framed IP', '192.168.0.1'],
              ['reason', 'Reject reason', 'e.g. reject'],
            ].map(([k, label, ph]) => (
              <View key={k} style={[s.field, { maxWidth: isMobile ? '100%' : 210, minWidth: isMobile ? '100%' : 160 }]}>
                <Text style={s.label}>{label.toUpperCase()}</Text>
                <TextInput
                  style={s.input}
                  value={filters[k]}
                  onChangeText={setF(k)}
                  placeholder={ph}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  onSubmitEditing={apply}
                  editable={!!nasId}
                />
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-end' }}>
              <TouchableOpacity style={[s.primaryBtn, !nasId && { opacity: 0.5 }]} onPress={apply} disabled={!nasId || loading}>
                <Feather name="search" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>Search</Text>
              </TouchableOpacity>
              {activeFilters ? (
                <TouchableOpacity style={s.ghostBtn} onPress={clear} disabled={loading}>
                  <Feather name="x" size={14} color={INDIGO} />
                  <Text style={s.ghostBtnText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        {error ? <Note tone="error" text={error} /> : null}
        {ctx?.needs_operator && !opId ? <Note tone="info" text="Choose one of your operators to see the NAS given to it." /> : null}
        {noNas ? (
          <Note
            tone="info"
            text={isOperator
              ? 'No NAS has been given to you yet. Ask the super admin to give you a NAS (Networking › NAS › Give to operators).'
              : opId ? 'This operator has no NAS yet. Give it one on Networking › NAS.' : 'No NAS yet — add one on Networking › NAS.'}
          />
        ) : null}

        {nasId ? (
          <View style={s.card}>
            {/* toolbar */}
            <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['all', 'All'], ['accept', 'Accepted'], ['reject', 'Rejected']].map(([k, label]) => {
                  const n = k === 'all' ? result?.summary?.shown : k === 'accept' ? result?.summary?.accepted : result?.summary?.rejected;
                  const on = reply === k;
                  return (
                    <TouchableOpacity key={k} style={[s.chip, on && s.chipOn]} onPress={() => setReply(k)}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>{label}{n !== undefined ? ` · ${n}` : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
                <Text style={[s.sub, { marginLeft: 4 }]}>on this page</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {PAGE_SIZES.map((n) => (
                    <TouchableOpacity key={n} style={[s.sizeBtn, pageSize === n && s.chipOn]} onPress={() => changeSize(n)} disabled={loading}>
                      <Text style={[s.chipText, pageSize === n && s.chipTextOn]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={s.iconBtn} onPress={() => fetchLogs(atNewest ? 'last' : page)} disabled={loading} title="Refresh">
                  {loading ? <ActivityIndicator size="small" color={INDIGO} /> : <Feather name="refresh-cw" size={14} color={INDIGO} />}
                </TouchableOpacity>
              </View>
            </View>

            {loading && !result ? (
              <View style={{ padding: 30, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={INDIGO} />
                <Text style={s.sub}>Finding the latest attempts…</Text>
              </View>
            ) : isMobile ? (
              <View style={{ padding: 10, gap: 8, opacity: loading ? 0.5 : 1 }}>
                {logs.map((l, i) => (
                  <View key={`${l.authdate}-${i}`} style={s.mCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ReplyPill l={l} />
                      <Text style={s.sub}>{fmt(l.authdate)}</Text>
                    </View>
                    {l.username ? <Text style={[s.td, { fontWeight: '700', marginTop: 6 }]}>{l.username}</Text> : null}
                    <Text style={[s.sub, s.mono]}>{l.mac || '—'} · {l.framedipaddress || '—'} · port {l.nasportid || '—'}</Text>
                    {l.reason ? <Text style={[s.sub, { color: '#b91c1c' }]}>{l.reason}</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
                <View style={{ minWidth: 940, flexGrow: 1, opacity: loading ? 0.5 : 1 }}>
                  <View style={[s.tr, s.thRow]}>
                    <Text style={[s.th, { width: 170 }]}>Time</Text>
                    <Text style={[s.th, { width: 100 }]}>Result</Text>
                    {showUser ? <Text style={[s.th, { width: 150 }]}>Username</Text> : null}
                    <Text style={[s.th, { width: 160 }]}>MAC</Text>
                    <Text style={[s.th, { width: 130 }]}>Framed IP</Text>
                    <Text style={[s.th, { width: 90 }]}>NAS port</Text>
                    <Text style={[s.th, { width: 130 }]}>Called station</Text>
                    <Text style={[s.th, { flex: 1, minWidth: 160 }]}>Reason</Text>
                  </View>
                  {logs.map((l, i) => (
                    <View key={`${l.authdate}-${i}`} style={s.tr}>
                      <Text style={[s.td, { width: 170 }]}>{fmt(l.authdate)}</Text>
                      <View style={{ width: 100 }}><ReplyPill l={l} /></View>
                      {showUser ? <Text style={[s.td, { width: 150, fontWeight: '600' }]} numberOfLines={1} selectable>{l.username || '—'}</Text> : null}
                      <Text style={[s.td, s.mono, { width: 160 }]} selectable>{l.mac || '—'}</Text>
                      <Text style={[s.td, s.mono, { width: 130 }]} selectable>{l.framedipaddress || '—'}</Text>
                      <Text style={[s.td, { width: 90 }]}>{l.nasportid || '—'}</Text>
                      <Text style={[s.td, { width: 130 }]} numberOfLines={1}>{l.calledstationid || '—'}</Text>
                      <Text style={[s.td, { flex: 1, minWidth: 160, color: l.reason ? '#b91c1c' : '#94a3b8' }]} numberOfLines={2}>{l.reason || '—'}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {result && !logs.length ? (
              <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                <Feather name="inbox" size={22} color="#94a3b8" />
                <Text style={s.sub}>{(result.logs || []).length ? 'Nothing of this kind on this page.' : 'No authentication attempts match.'}</Text>
              </View>
            ) : null}

            {result ? (
              <View style={[s.foot, isMobile && { flexDirection: 'column', gap: 8 }]}>
                <Text style={s.sub}>Newest first · {pageSize} per page</Text>
                <Pager />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  field: { flex: 1, minWidth: 200, gap: 6 },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.4 },
  input: { height: 40, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: COLORS.textMain, backgroundColor: '#ffffff', outlineStyle: 'none' },
  nasInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 11, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, height: 30, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  chipTextOn: { color: '#ffffff' },
  sizeBtn: { paddingHorizontal: 9, height: 30, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 8, backgroundColor: INDIGO },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#ffffff' },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: INDIGO },
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain, paddingRight: 8 },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  mono: { fontFamily: 'monospace' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  mCard: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, padding: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pgBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  pgOff: { backgroundColor: '#f8fafc' },
  pgText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  pgInfo: { fontSize: 12, fontWeight: '700', color: '#0f172a', paddingHorizontal: 6 },
});
