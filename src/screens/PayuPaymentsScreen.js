import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { parseApiDate, formatApiDate } from '../components/CustomerAccountsOverview';
import { ProviderWalletSyncPanel } from '../components/ProviderWalletSyncPanel';

/**
 * Super admin › Online Payments: every operator wallet top-up made through Razorpay or PayU
 * (pg/razorpay/razorpay_payments.php and pg/payu/payu_payments.php). Which gateway may top up which
 * wallet is set per operator: partner page › Plans & Setup › Payment Gateways.
 */
const GREEN = '#059669';
const BLUE = '#0284c7';

const STATUS = {
  success: { label: 'CREDITED', fg: '#047857', bg: '#dcfce7', icon: 'check-circle' },
  initiated: { label: 'NOT PAID YET', fg: '#475569', bg: '#f1f5f9', icon: 'clock' },
  pending: { label: 'PENDING', fg: '#b45309', bg: '#fef3c7', icon: 'loader' },
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
  // 'razorpay' | 'payu' | 'hdfc' | 'sync' (provider wallet transfers; #payu_payments?view=sync opens it)
  const [gateway, setGateway] = useState(() => {
    try {
      if (typeof window !== 'undefined' && /[?&]view=sync/.test(window.location?.hash || '')) return 'sync';
    } catch (e) {}
    return 'razorpay';
  });
  const [syncOpen, setSyncOpen] = useState(0);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (gateway === 'sync') return;
    setLoading(true);
    const res = gateway === 'razorpay'
      ? await OneBssApi.razorpayPayments({ status: filter, q: query, page, limit: 50 })
      : gateway === 'hdfc'
        ? await OneBssApi.hdfcPayments({ status: filter, q: query, page, limit: 50 })
        : await OneBssApi.payuPayments({ status: filter, q: query, page, limit: 50 });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || `Could not load (HTTP ${res.status}).`);
      return;
    }
    setError('');
    setData(res.data);
  }, [gateway, filter, query, page]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  useEffect(() => {
    (async () => {
      const r = await OneBssApi.getProviderWalletSync({ status: 'open', limit: 5 });
      if (r.ok) setSyncOpen(r.data?.counts?.open || 0);
    })();
  }, [refreshSignal]);

  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const recheck = async (p) => {
    setBusy(p.txnid);
    const res = gateway === 'razorpay'
      ? await OneBssApi.razorpayRecheck(p.txnid)
      : gateway === 'hdfc'
        ? await OneBssApi.hdfcRecheck(p.txnid)
        : await OneBssApi.payuRecheck(p.txnid);
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

  const sum = data?.summary || {};
  const tiles = [
    { label: 'Credited today', value: `${sum.paid_today_count ?? 0} · ${money(sum.paid_today_amount)}`, color: '#047857', icon: 'check-circle', f: 'success' },
    { label: 'Pending', value: sum.pending ?? 0, color: '#b45309', icon: 'clock', f: 'pending' },
    { label: 'Check by hand', value: sum.review ?? 0, color: '#9d174d', icon: 'alert-triangle', f: 'review' },
    { label: 'Failed today', value: sum.failed_today ?? 0, color: '#b91c1c', icon: 'x-circle', f: 'failed' },
  ];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const gwThemeColor = gateway === 'razorpay' ? BLUE : GREEN;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {/* Gateway Switcher */}
        <View style={s.gwBar}>
          <TouchableOpacity
            style={[s.gwTab, gateway === 'razorpay' && s.gwTabRzpActive]}
            onPress={() => { setGateway('razorpay'); setPage(1); setData(null); }}
          >
            <Feather name="shield" size={16} color={gateway === 'razorpay' ? BLUE : '#64748b'} />
            <Text style={[s.gwTabText, gateway === 'razorpay' && { color: BLUE, fontWeight: '800' }]}>
              Razorpay
            </Text>
            {gateway === 'razorpay' ? <View style={[s.gwDot, { backgroundColor: BLUE }]} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gwTab, gateway === 'payu' && s.gwTabPayuActive]}
            onPress={() => { setGateway('payu'); setPage(1); setData(null); }}
          >
            <Feather name="credit-card" size={16} color={gateway === 'payu' ? GREEN : '#64748b'} />
            <Text style={[s.gwTabText, gateway === 'payu' && { color: GREEN, fontWeight: '800' }]}>
              PayU
            </Text>
            {gateway === 'payu' ? <View style={[s.gwDot, { backgroundColor: GREEN }]} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gwTab, gateway === 'hdfc' && s.gwTabHdfcActive]}
            onPress={() => { setGateway('hdfc'); setPage(1); setData(null); }}
          >
            <Feather name="shield" size={16} color={gateway === 'hdfc' ? '#1d4ed8' : '#64748b'} />
            <Text style={[s.gwTabText, gateway === 'hdfc' && { color: '#1d4ed8', fontWeight: '800' }]}>
              HDFC
            </Text>
            {gateway === 'hdfc' ? <View style={[s.gwDot, { backgroundColor: '#1d4ed8' }]} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.gwTab, gateway === 'sync' && s.gwTabSetActive]}
            onPress={() => { setGateway('sync'); setPage(1); setData(null); }}
          >
            <Feather name="repeat" size={16} color={gateway === 'sync' ? '#0f172a' : '#64748b'} />
            <Text style={[s.gwTabText, gateway === 'sync' && { color: '#0f172a', fontWeight: '800' }]}>
              Provider Wallet Sync
            </Text>
            {syncOpen > 0 ? (
              <View style={s.badge}><Text style={s.badgeText}>{syncOpen}</Text></View>
            ) : null}
          </TouchableOpacity>
        </View>

        {gateway === 'sync' ? (
          <ProviderWalletSyncPanel refreshSignal={refreshSignal} onCounts={(c) => setSyncOpen(c.open || 0)} />
        ) : (
        <>


        {error ? <Text style={s.error}>{error}</Text> : null}


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
              {loading ? <ActivityIndicator size="small" color={gwThemeColor} /> : <Feather name="refresh-cw" size={14} color={gwThemeColor} />}
            </TouchableOpacity>
          </View>
        </View>

        {loading && !data ? (
          <ActivityIndicator size="large" color={gwThemeColor} style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
              <View style={{ minWidth: 1080, flexGrow: 1 }}>
                <View style={[s.tr, s.thRow]}>
                  <Text style={[s.th, { width: 170 }]}>Date</Text>
                  <Text style={[s.th, { width: 170 }]}>Operator</Text>
                  <Text style={[s.th, { width: 110, textAlign: 'right', paddingRight: 16 }]}>Amount</Text>
                  <Text style={[s.th, { width: 150 }]}>Status</Text>
                  <Text style={[s.th, { width: 200 }]}>Txn / {gateway === 'razorpay' ? 'Razorpay' : gateway === 'hdfc' ? 'HDFC' : 'PayU'}</Text>
                  <Text style={[s.th, { flex: 1, minWidth: 200 }]}>Details</Text>
                  <Text style={[s.th, { width: 70, textAlign: 'right' }]}> </Text>
                </View>
                {(data?.payments || []).map((p) => {
                  const conf = STATUS[p.status] || STATUS.initiated;
                  const gatewayRef = gateway === 'razorpay'
                    ? (p.razorpay_payment_id ? `Rzp ${p.razorpay_payment_id}` : p.razorpay_order_id ? `Ord ${p.razorpay_order_id}` : null)
                    : gateway === 'hdfc'
                      ? (p.hdfc_order_id && p.hdfc_order_id !== p.txnid ? `HDFC ${p.hdfc_order_id}` : null)
                      : (p.mihpayid && p.mihpayid !== 'Not Found' ? `PayU ${p.mihpayid}` : null);
                  return (
                    <View key={p.txnid} style={s.tr}>
                      <View style={{ width: 170, paddingRight: 8 }}>
                        <Text style={s.td}>{fmt(p.created_at)}</Text>
                        {p.credited_at ? <Text style={s.sub}>Credited {fmt(p.credited_at)}</Text> : null}
                      </View>
                      <View style={{ width: 170, paddingRight: 8 }}>
                        <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{p.partner_name || 'Operator'}</Text>
                        <Text style={s.sub}>#{p.partner_id}{p.wallet_type && p.wallet_type !== 'Single' ? ` · ${p.wallet_type} wallet` : ''}</Text>
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
                          {[p.mode, p.bank_ref_num ? `Ref ${p.bank_ref_num}` : null, gatewayRef].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 200, paddingRight: 8 }}>
                        {p.error_message ? <Text style={[s.td, { fontSize: 12, color: p.status === 'review' ? '#9d174d' : '#b91c1c' }]} numberOfLines={3}>{p.error_message}</Text> : null}
                        {p.status === 'success' ? <Text style={s.sub}>Ledger #{p.ledger_id ?? '—'} · balance after {money(p.balance_after)} · via {p.credited_via}</Text> : null}
                        {p.remark ? <Text style={s.sub} numberOfLines={1}>Remark: {p.remark}</Text> : null}
                        {p.status !== 'success' && !p.error_message ? <Text style={s.sub}>{p.checks ? `Checked ${p.checks}× · last ${fmt(p.last_checked_at)}` : 'Not checked yet'}</Text> : null}
                      </View>
                      <View style={{ width: 70, alignItems: 'flex-end' }}>
                        {p.status !== 'success' ? (
                          <TouchableOpacity style={[s.iconBtn, { borderColor: gateway === 'razorpay' ? '#bae6fd' : '#a7f3d0' }]} onPress={() => recheck(p)} disabled={busy === p.txnid} title={`Recheck with ${gateway === 'razorpay' ? 'Razorpay' : gateway === 'hdfc' ? 'HDFC' : 'PayU'}`} accessibilityLabel="Recheck">
                            {busy === p.txnid ? <ActivityIndicator size="small" color={gwThemeColor} /> : <Feather name="refresh-cw" size={14} color={gwThemeColor} />}
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
        </>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  gwBar: { flexDirection: 'row', gap: 10, padding: 4, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  gwTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 8 },
  gwTabRzpActive: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  gwTabPayuActive: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  gwTabHdfcActive: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  gwTabSetActive: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  gwTabText: { fontSize: 13.5, fontWeight: '600', color: '#64748b' },
  gwDot: { width: 6, height: 6, borderRadius: 3 },
  badge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  error: { fontSize: 13, color: '#b91c1c' },
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
  iconBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  pageBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
