import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { parseApiDate, formatApiDate } from './CustomerAccountsOverview';

/**
 * Super admin: money sent to the providers' wallets for SEPARATE Internet / IPTV wallets
 * (wallet_provider_sync.php). Internet wallet -> RADIUS partner wallet, IPTV wallet -> IPTV operator
 * wallet, for every super admin credit / debit and every paid PayU / Razorpay / HDFC top-up.
 * A failed transfer is retried here (or marked done after fixing it in the provider's panel).
 *
 * Props: partnerId (only that partner, compact list) · refreshSignal · onCounts(counts)
 */
const STATUS = {
  failed: { label: 'FAILED', fg: '#b91c1c', bg: '#fee2e2', icon: 'x-circle' },
  pending: { label: 'NOT SENT YET', fg: '#b45309', bg: '#fef3c7', icon: 'clock' },
  success: { label: 'DONE', fg: '#047857', bg: '#dcfce7', icon: 'check-circle' },
  resolved: { label: 'DONE BY HAND', fg: '#475569', bg: '#f1f5f9', icon: 'check' },
};
const FILTERS = [
  { id: 'open', label: 'To fix' },
  { id: 'success', label: 'Done' },
  { id: 'resolved', label: 'Done by hand' },
  { id: 'all', label: 'All' },
];
const fmt = (d) => (parseApiDate(d) ? formatApiDate(d) : '—');
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ProviderWalletSyncPanel = ({ partnerId = null, refreshSignal = 0, onCounts }) => {
  const compact = !!partnerId;
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [resolving, setResolving] = useState(null); // id
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await OneBssApi.getProviderWalletSync({ status: compact ? 'open' : filter, q: query, page, limit: compact ? 10 : 50, partner_id: partnerId || '' });
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.setup_needed ? 'Provider wallet sync is not set up yet (run migrations/wallet_provider_sync.sql).' : res.data?.message || 'Could not load.');
      setData(null);
      return;
    }
    setError('');
    setData(res.data);
    if (onCounts) onCounts(res.data.counts || {});
  }, [filter, query, page, partnerId, compact]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const retry = async (r) => {
    setBusy(r.id);
    const res = await OneBssApi.retryProviderWalletSync(r.id);
    setBusy(null);
    if (res.ok) toast.success(res.data.message || 'Sent to the provider.');
    else toast.error(res.data?.message || 'The provider refused it again.', { autoClose: 9000 });
    load();
  };

  const resolve = async (r) => {
    if (!note.trim()) {
      toast.warn('Write what was done, e.g. "added by hand in the RADIUS panel".');
      return;
    }
    setBusy(r.id);
    const res = await OneBssApi.resolveProviderWalletSync(r.id, note.trim());
    setBusy(null);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not mark it done.');
      return;
    }
    toast.success('Marked as done.');
    setResolving(null);
    setNote('');
    load();
  };

  const rows = data?.rows || [];
  if (compact && !loading && !error && !rows.length) return null; // nothing to fix for this partner

  const counts = data?.counts || {};
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const row = (r) => {
    const st = STATUS[r.status] || STATUS.pending;
    const open = r.status === 'failed' || r.status === 'pending';
    return (
      <View key={r.id} style={[s.row, compact && { paddingHorizontal: 10 }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={[s.pill, { backgroundColor: st.bg }]}>
              <Feather name={st.icon} size={11} color={st.fg} />
              <Text style={[s.pillText, { color: st.fg }]}>{st.label}</Text>
            </View>
            <Text style={[s.td, { fontWeight: '800', color: r.direction === 'debit' ? '#b91c1c' : '#047857' }]}>
              {r.direction === 'debit' ? '−' : '+'}{money(r.amount)}
            </Text>
            <Text style={s.td}>{r.direction === 'debit' ? 'from' : 'to'} {r.provider_label}</Text>
            {!compact ? <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>· {r.partner_name || 'Partner'} #{r.partner_id}</Text> : null}
          </View>
          <Text style={s.sub} numberOfLines={2}>
            {fmt(r.created_at)} · {r.source === 'manual' ? `by ${r.created_by || 'super admin'}` : r.source === 'payu' ? 'PayU top-up' : r.source === 'hdfc' ? 'HDFC top-up' : 'Razorpay top-up'}
            {r.provider_partner_id ? ` · ${r.provider === 'internet' ? 'RADIUS partner' : 'IPTV operator'} ${r.provider_partner_id}` : ''}
            {r.attempts ? ` · tried ${r.attempts}×` : ''}
            {r.remark ? ` · ${r.remark}` : ''}
          </Text>
          {r.error && open ? <Text style={[s.sub, { color: '#b91c1c', fontWeight: '600' }]} numberOfLines={3}>{r.error}</Text> : null}
          {r.status === 'resolved' ? <Text style={s.sub}>Done by hand by {r.resolved_by}: {r.resolved_note}</Text> : null}
          {resolving === r.id ? (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="What was done? e.g. added by hand in RADIUS"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              <TouchableOpacity style={[s.btn, { backgroundColor: '#0f172a' }]} onPress={() => resolve(r)} disabled={busy === r.id}>
                <Text style={s.btnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { setResolving(null); setNote(''); }}>
                <Text style={[s.btnText, { color: '#475569' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        {open && resolving !== r.id ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#0284c7' }]} onPress={() => retry(r)} disabled={busy === r.id}>
              {busy === r.id ? <ActivityIndicator size="small" color="#ffffff" /> : <Feather name="refresh-cw" size={13} color="#ffffff" />}
              <Text style={s.btnText}>Retry</Text>
            </TouchableOpacity>
            {!compact ? (
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => { setResolving(r.id); setNote(''); }} title="Already fixed in the provider's panel">
                <Feather name="check" size={13} color="#475569" />
                <Text style={[s.btnText, { color: '#475569' }]}>Mark done</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  if (compact) {
    return (
      <View style={s.compactBox}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, paddingBottom: 4 }}>
          <Feather name="alert-triangle" size={14} color="#b91c1c" />
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#991b1b', flex: 1 }}>
            Provider wallet not updated ({counts.open ?? rows.length}) — the OneBSS wallet changed, the provider's did not
          </Text>
        </View>
        {error ? <Text style={[s.sub, { padding: 10, color: '#b91c1c' }]}>{error}</Text> : rows.map(row)}
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={s.info}>
        <Feather name="info" size={14} color="#0369a1" />
        <Text style={s.infoText}>
          Separate wallets are copied to the providers: Internet wallet → RADIUS partner wallet, IPTV wallet → IPTV operator wallet
          (super admin credits / debits and paid PayU / Razorpay / HDFC top-ups). If a provider was down, retry it here — a retry never adds the money twice.
        </Text>
      </View>
      <View style={s.tiles}>
        {[
          { f: 'open', label: 'To fix', value: counts.open ?? 0, color: '#b91c1c', icon: 'alert-triangle' },
          { f: 'success', label: 'Done', value: counts.success ?? 0, color: '#047857', icon: 'check-circle' },
          { f: 'resolved', label: 'Done by hand', value: counts.resolved ?? 0, color: '#475569', icon: 'check' },
        ].map((t) => (
          <TouchableOpacity key={t.f} style={[s.tile, filter === t.f && { borderColor: t.color }]} onPress={() => { setFilter(t.f); setPage(1); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name={t.icon} size={13} color={t.color} />
              <Text style={[s.tileLabel, { color: t.color }]}>{t.label}</Text>
            </View>
            <Text style={[s.tileValue, { color: t.color }]}>{loading && !data ? '…' : t.value}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {FILTERS.map((f) => (
            <TouchableOpacity key={f.id} style={[s.chip, filter === f.id && s.chipOn]} onPress={() => { setFilter(f.id); setPage(1); }}>
              <Text style={[s.chipText, filter === f.id && { color: '#ffffff' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={s.search}>
            <Feather name="search" size={14} color="#94a3b8" />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => { setQuery(search.trim()); setPage(1); }}
              placeholder="Partner name / ID, remark…"
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TouchableOpacity onPress={load} style={s.refresh} accessibilityLabel="Refresh">
            {loading ? <ActivityIndicator size="small" color="#0284c7" /> : <Feather name="refresh-cw" size={14} color="#0284c7" />}
          </TouchableOpacity>
        </View>
      </View>
      {error ? <Text style={{ color: '#b91c1c', fontSize: 13 }}>{error}</Text> : null}
      <View style={s.card}>
        {rows.map(row)}
        {!loading && !rows.length && !error ? (
          <Text style={[s.sub, { padding: 24, textAlign: 'center' }]}>{filter === 'open' ? 'Nothing to fix — every provider wallet is up to date.' : 'Nothing here.'}</Text>
        ) : null}
      </View>
      {data && data.total > data.limit ? (
        <View style={s.pager}>
          <TouchableOpacity disabled={page <= 1} onPress={() => setPage((x) => x - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]}><Feather name="chevron-left" size={14} color="#334155" /></TouchableOpacity>
          <Text style={s.sub}>Page {page} of {pages} · {data.total}</Text>
          <TouchableOpacity disabled={page >= pages} onPress={() => setPage((x) => x + 1)} style={[s.pageBtn, page >= pages && { opacity: 0.4 }]}><Feather name="chevron-right" size={14} color="#334155" /></TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  info: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  infoText: { flex: 1, fontSize: 12.5, color: '#0c4a6e', lineHeight: 18 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, minWidth: 160, padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  tileLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  tileValue: { fontSize: 22, fontWeight: '800' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, minWidth: 220, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  refresh: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  compactBox: { borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff7f7', overflow: 'hidden', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexWrap: 'wrap' },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 32, borderRadius: 8 },
  btnGhost: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
  btnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  noteInput: { flex: 1, minWidth: 180, height: 32, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, fontSize: 12.5, color: COLORS.textMain, backgroundColor: '#ffffff', outlineStyle: 'none' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  pageBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
