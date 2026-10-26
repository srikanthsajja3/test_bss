import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { parseApiDate, formatApiDate } from '../components/CustomerAccountsOverview';

/**
 * Super admin › Online Payments: every operator wallet top-up made through PayU
 * (pg/payu_payments.php). A wallet is credited only after the server confirmed the payment
 * with PayU; "Recheck" asks PayU again now (credits once if PayU says it was paid).
 */
const GREEN = '#059669';
const STATUS = {
  success: { label: 'CREDITED', fg: '#047857', bg: '#dcfce7', icon: 'check-circle' },
  initiated: { label: 'NOT PAID YET', fg: '#475569', bg: '#f1f5f9', icon: 'clock' },
  pending: { label: 'PENDING AT PAYU', fg: '#b45309', bg: '#fef3c7', icon: 'loader' },
  failed: { label: 'FAILED', fg: '#b91c1c', bg: '#fee2e2', icon: 'x-circle' },
  expired: { label: 'ABANDONED', fg: '#64748b', bg: '#f1f5f9', icon: 'slash' },
  review: { label: 'CHECK BY HAND', fg: '#9d174d', bg: '#fce7f3', icon: 'alert-triangle' },
};
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'success', label: 'Credited' },
  { id: 'pending', label: 'Pending' },
  { id: 'review', label: 'Check by hand' },
  { id: 'failed', label: 'Failed' },
];
const fmt = (d) => (parseApiDate(d) ? formatApiDate(d) : '—');
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const PayuPaymentsScreen = ({ refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [setup, setSetup] = useState(null); // { loading } | check result

  const load = useCallback(async () => {
    setLoading(true);
    const res = await OneBssApi.payuPayments({ status: filter, q: query, page, limit: 50 });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || `Could not load (HTTP ${res.status}).`);
      return;
    }
    setError('');
    setData(res.data);
  }, [filter, query, page]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const recheck = async (p) => {
    setBusy(p.txnid);
    const res = await OneBssApi.payuRecheck(p.txnid);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.data?.message || 'Recheck failed');
    } else {
      const st = res.data.payment?.status;
      const label = (STATUS[st] || {}).label || st;
      if (res.data.payment?.note) toast.warn(res.data.payment.note);
      else if (st === 'success') toast.success(`${p.txnid}: credited`);
      else toast.info(`${p.txnid}: ${label}`);
    }
    load();
  };

  const checkSetup = async () => {
    setSetup({ loading: true });
    const res = await OneBssApi.payuCheckSetup();
    setSetup(res.ok ? res.data.check : { ok: false, warnings: [res.data?.message || 'Could not run the check'] });
  };

  const sum = data?.summary || {};
  const tiles = [
    { label: 'Credited today', value: `${sum.paid_today_count ?? 0} · ${money(sum.paid_today_amount)}`, color: '#047857', icon: 'check-circle', f: 'success' },
    { label: 'Pending', value: sum.pending ?? 0, color: '#b45309', icon: 'clock', f: 'pending' },
    { label: 'Check by hand', value: sum.review ?? 0, color: '#9d174d', icon: 'alert-triangle', f: 'review' },
    { label: 'Failed today', value: sum.failed_today ?? 0, color: '#b91c1c', icon: 'x-circle', f: 'failed' },
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {data?.env === 'test' ? (
          <View style={s.testBanner}>
            <Feather name="alert-triangle" size={15} color="#92400e" />
            <Text style={s.testText}>PayU is in TEST mode (PAYU_ENV = test). Switch to production before operators pay real money.</Text>
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}

        {/* PayU setup check */}
        <View style={[s.setup, setup && !setup.loading && (setup.ok ? s.setupOk : s.setupBad)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Feather name={setup && !setup.loading ? (setup.ok ? 'check-circle' : 'alert-octagon') : 'settings'} size={16} color={setup && !setup.loading ? (setup.ok ? '#047857' : '#b91c1c') : '#475569'} />
            <Text style={[s.setupTitle, { flex: 1, minWidth: 200 }]}>
              {!setup || setup.loading
                ? 'PayU setup — checks your key and salt with PayU (no payment is made)'
                : setup.ok
                  ? `PayU ${setup.env === 'test' ? 'TEST' : 'LIVE'} key and salt are accepted by PayU`
                  : 'PayU rejected the key / salt — payments will fail with a hash error'}
            </Text>
            <TouchableOpacity style={s.setupBtn} onPress={checkSetup} disabled={setup?.loading}>
              {setup?.loading ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="shield" size={13} color={GREEN} />}
              <Text style={s.setupBtnText}>Check PayU setup</Text>
            </TouchableOpacity>
          </View>
          {setup && !setup.loading ? (
            <View style={{ marginTop: 8, gap: 3 }}>
              <Text style={s.setupLine}>
                Mode: {setup.env === 'test' ? 'TEST' : 'LIVE'} · Key: {setup.key_preview || 'not set'} ({setup.key_length || 0} chars) · Salt: {setup.salt_set ? `${setup.salt_length} chars` : 'not set'}
              </Text>
              {setup.payu_answer ? <Text style={s.setupLine}>PayU answered: {setup.payu_answer}</Text> : null}
              {(setup.warnings || []).map((w, i) => <Text key={i} style={[s.setupLine, { color: '#b91c1c' }]}>• {w}</Text>)}
            </View>
          ) : null}
        </View>

        <View style={s.tiles}>
          {tiles.map((t) => (
            <TouchableOpacity key={t.label} style={[s.tile, isMobile && { minWidth: '46%' }]} onPress={() => { setFilter(t.f); setPage(1); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name={t.icon} size={13} color={t.color} />
                <Text style={[s.tileLabel, { color: t.color }]}>{t.label}</Text>
              </View>
              <Text style={[s.tileValue, { color: t.color }]}>{loading && !data ? '…' : t.value}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {FILTERS.map((f) => (
              <TouchableOpacity key={f.id} style={[s.chip, filter === f.id && s.chipOn]} onPress={() => { setFilter(f.id); setPage(1); }}>
                <Text style={[s.chipText, filter === f.id && { color: '#ffffff' }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={s.searchRow}>
            <View style={[s.search, isMobile && { flex: 1, maxWidth: '100%', minWidth: 0 }]}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => { setQuery(search.trim()); setPage(1); }}
                placeholder="Txn ID, bank ref, operator…"
                placeholderTextColor="#94a3b8"
              />
              {search ? <TouchableOpacity onPress={() => { setSearch(''); setQuery(''); setPage(1); }}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
            </View>
            <TouchableOpacity onPress={load} style={s.refresh} accessibilityLabel="Refresh">
              {loading ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="refresh-cw" size={14} color={GREEN} />}
            </TouchableOpacity>
          </View>
        </View>

        {loading && !data ? (
          <ActivityIndicator size="large" color={GREEN} style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
              <View style={{ minWidth: 1080, flexGrow: 1 }}>
                <View style={[s.tr, s.thRow]}>
                  <Text style={[s.th, { width: 170 }]}>Date</Text>
                  <Text style={[s.th, { width: 170 }]}>Operator</Text>
                  <Text style={[s.th, { width: 110, textAlign: 'right', paddingRight: 16 }]}>Amount</Text>
                  <Text style={[s.th, { width: 150 }]}>Status</Text>
                  <Text style={[s.th, { width: 200 }]}>Txn / PayU</Text>
                  <Text style={[s.th, { flex: 1, minWidth: 200 }]}>Details</Text>
                  <Text style={[s.th, { width: 70, textAlign: 'right' }]}> </Text>
                </View>
                {(data?.payments || []).map((p) => {
                  const conf = STATUS[p.status] || STATUS.initiated;
                  return (
                    <View key={p.txnid} style={s.tr}>
                      <View style={{ width: 170, paddingRight: 8 }}>
                        <Text style={s.td}>{fmt(p.created_at)}</Text>
                        {p.credited_at ? <Text style={s.sub}>Credited {fmt(p.credited_at)}</Text> : null}
                      </View>
                      <View style={{ width: 170, paddingRight: 8 }}>
                        <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{p.partner_name || 'Operator'}</Text>
                        <Text style={s.sub}>#{p.partner_id}</Text>
                      </View>
                      <Text style={[s.td, { width: 110, textAlign: 'right', paddingRight: 16, fontWeight: '800' }]}>{money(p.amount)}</Text>
                      <View style={{ width: 150 }}>
                        <View style={[s.pill, { backgroundColor: conf.bg }]}>
                          <Feather name={conf.icon} size={11} color={conf.fg} />
                          <Text style={[s.pillText, { color: conf.fg }]}>{conf.label}</Text>
                        </View>
                      </View>
                      <View style={{ width: 200, paddingRight: 8 }}>
                        <Text style={[s.td, { fontSize: 12 }]} selectable>{p.txnid}</Text>
                        <Text style={s.sub} selectable>
                          {[p.mode, p.bank_ref_num ? `Ref ${p.bank_ref_num}` : null, p.mihpayid && p.mihpayid !== 'Not Found' ? `PayU ${p.mihpayid}` : null].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 200, paddingRight: 8 }}>
                        {p.error_message ? <Text style={[s.td, { fontSize: 12, color: p.status === 'review' ? '#9d174d' : '#b91c1c' }]} numberOfLines={3}>{p.error_message}</Text> : null}
                        {p.status === 'success' ? <Text style={s.sub}>Ledger #{p.ledger_id ?? '—'} · balance after {money(p.balance_after)} · via {p.credited_via}</Text> : null}
                        {p.remark ? <Text style={s.sub} numberOfLines={1}>Remark: {p.remark}</Text> : null}
                        {p.status !== 'success' && !p.error_message ? <Text style={s.sub}>{p.checks ? `Checked with PayU ${p.checks}× · last ${fmt(p.last_checked_at)}` : 'Not checked with PayU yet'}</Text> : null}
                      </View>
                      <View style={{ width: 70, alignItems: 'flex-end' }}>
                        {p.status !== 'success' ? (
                          <TouchableOpacity style={s.iconBtn} onPress={() => recheck(p)} disabled={busy === p.txnid} title="Recheck with PayU" accessibilityLabel="Recheck with PayU">
                            {busy === p.txnid ? <ActivityIndicator size="small" color={GREEN} /> : <Feather name="refresh-cw" size={14} color={GREEN} />}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
                {!loading && !(data?.payments || []).length ? <Text style={[s.sub, { padding: 24, textAlign: 'center' }]}>No payments here.</Text> : null}
              </View>
            </ScrollView>
          </View>
        )}
        {data && data.total > data.limit ? (
          <View style={s.pager}>
            <TouchableOpacity disabled={page <= 1} onPress={() => setPage((x) => x - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]}><Feather name="chevron-left" size={14} color="#334155" /></TouchableOpacity>
            <Text style={s.sub}>Page {page} of {pages} · {data.total} payments</Text>
            <TouchableOpacity disabled={page >= pages} onPress={() => setPage((x) => x + 1)} style={[s.pageBtn, page >= pages && { opacity: 0.4 }]}><Feather name="chevron-right" size={14} color="#334155" /></TouchableOpacity>
          </View>
        ) : null}
        <Text style={s.foot}>
          A wallet is credited only after the server confirms the payment with PayU, for exactly the amount ordered, and only once. Payments whose browser never came back are checked with PayU every 10 minutes. "Check by hand" means PayU reported a different amount or wallet — nothing was credited.
        </Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  testBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  testText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400e' },
  error: { fontSize: 13, color: '#b91c1c' },
  setup: { padding: 12, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  setupOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  setupBad: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  setupTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  setupLine: { fontSize: 12, color: '#475569' },
  setupBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#ffffff' },
  setupBtnText: { fontSize: 12.5, fontWeight: '700', color: GREEN },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, minWidth: 170, padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  tileLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  tileValue: { fontSize: 22, fontWeight: '800' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, minWidth: 240, maxWidth: 340, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  refresh: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  pageBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  foot: { fontSize: 11.5, color: '#94a3b8' },
});
