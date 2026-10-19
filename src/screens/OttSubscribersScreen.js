import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { formatApiDate } from '../components/CustomerAccountsOverview';

const OTT = '#0ea5e9';
const CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'expired', label: 'Expired' },
  { id: 'new', label: 'Not activated' },
  { id: 'disabled', label: 'Deactivated' },
];
const BADGE = {
  active: { fg: '#15803d', bg: '#dcfce7' },
  expired: { fg: '#b91c1c', bg: '#fee2e2' },
  new: { fg: '#6d28d9', bg: '#ede9fe' },
  disabled: { fg: '#475569', bg: '#f1f5f9' },
};
const PAGE = 100;

/**
 * OTT subscribers (customers_list.php?type=ott). Clicking a subscriber opens the customer page.
 * Props: user, refreshSignal
 */
export const OttSubscribersScreen = ({ user, refreshSignal = 0 }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isOperator = String(user?.role || user?.account_role || '').toLowerCase() === 'operator';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status]);

  const load = async () => {
    const my = ++seq.current;
    setLoading(true);
    const res = await OneBssApi.getCustomersList(page, PAGE, 'ott', debounced, { status });
    if (my !== seq.current) return;
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || 'Could not load OTT subscribers.');
      setRows([]);
      return;
    }
    setError('');
    setRows(Array.isArray(res.data?.data) ? res.data.data : []);
    setTotal(Number(res.data?.total || 0));
    setCounts(res.data?.counts || {});
  };
  useEffect(() => {
    load();
  }, [page, debounced, status, refreshSignal]);

  const open = (row) => {
    if (!row.cust_id) return;
    if (typeof window !== 'undefined') window.location.hash = `customers?sub_id=${row.cust_id}`;
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const table = (
    <View style={{ flex: 1 }}>
      <View style={[styles.tr, styles.thRow]}>
        <Text style={[styles.th, { flex: 1.4, minWidth: 130 }]}>Subscriber ID</Text>
        <Text style={[styles.th, { flex: 1, minWidth: 100 }]}>Status</Text>
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Full Name</Text>
        <Text style={[styles.th, { flex: 1.2, minWidth: 110 }]}>Mobile</Text>
        {!isOperator ? <Text style={[styles.th, { flex: 1.4, minWidth: 120 }]}>Operator</Text> : null}
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Package</Text>
        <Text style={[styles.th, { flex: 1.5, minWidth: 140 }]}>Expiry</Text>
      </View>
      {error ? (
        <Text style={[styles.empty, { color: '#b91c1c' }]}>{error}</Text>
      ) : rows.length === 0 ? (
        <View style={{ padding: 30, alignItems: 'center' }}>
          {loading ? <ActivityIndicator size="small" color={OTT} /> : <Text style={styles.empty}>No OTT subscribers match.</Text>}
        </View>
      ) : (
        rows.map((r) => {
          const b = BADGE[r.status_key] || BADGE.disabled;
          return (
            <View key={r.ott_id} style={styles.tr}>
              <View style={{ flex: 1.4, minWidth: 130 }}>
                <TouchableOpacity onPress={() => open(r)} disabled={!r.cust_id}>
                  <Text style={[styles.link, !r.cust_id && { color: COLORS.textMain, textDecorationLine: 'none' }]} numberOfLines={1}>{r.subscriber_id}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, minWidth: 100 }}>
                <View style={[styles.pill, { backgroundColor: b.bg }]}>
                  <Text style={[styles.pillText, { color: b.fg }]}>{r.status_key === 'disabled' ? 'DEACTIVATED' : r.status_key === 'new' ? 'NEW' : String(r.status || '').toUpperCase()}</Text>
                </View>
              </View>
              <Text style={[styles.td, { flex: 1.6, minWidth: 140 }]} numberOfLines={1}>{r.full_name || '—'}</Text>
              <Text style={[styles.td, { flex: 1.2, minWidth: 110 }]}>{r.mobile || '—'}</Text>
              {!isOperator ? <Text style={[styles.td, { flex: 1.4, minWidth: 120 }]} numberOfLines={1}>{r.partner_name || '—'}</Text> : null}
              <View style={{ flex: 1.6, minWidth: 140 }}>
                <Text style={[styles.td, { fontWeight: '700' }]} numberOfLines={1}>{r.package_name || '—'}</Text>
                {r.subplan_name ? <Text style={styles.sub}>{r.subplan_name}</Text> : null}
              </View>
              <Text style={[styles.td, { flex: 1.5, minWidth: 140 }]}>{r.expiration ? formatApiDate(r.expiration) : '—'}</Text>
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgPrimary }} contentContainerStyle={{ padding: isMobile ? 12 : 24 }}>
      <View style={styles.card}>
        <View style={styles.searchBox}>
          <Feather name="search" size={15} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search subscriber ID, name, mobile, package…"
            placeholderTextColor="#94a3b8"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={15} color="#94a3b8" /></TouchableOpacity>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {CHIPS.map((c) => (
            <TouchableOpacity key={c.id} style={[styles.chip, status === c.id && styles.chipOn]} onPress={() => setStatus(c.id)}>
              <Text style={[styles.chipText, status === c.id && { color: '#ffffff' }]}>
                {c.label} ({c.id === 'all' ? counts.total ?? 0 : counts[c.id] ?? 0})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.card, { padding: 0, marginTop: 14 }]}>
        <View style={styles.pager}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {loading ? <ActivityIndicator size="small" color={OTT} /> : null}
            <Text style={styles.sub}>{total} OTT subscriber{total === 1 ? '' : 's'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={[styles.pageBtn, page <= 1 && { opacity: 0.4 }]} disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>
              <Text style={styles.pageText}>Previous</Text>
            </TouchableOpacity>
            <Text style={[styles.pageText, { fontWeight: '700' }]}>Page {page} of {pages}</Text>
            <TouchableOpacity style={[styles.pageBtn, page >= pages && { opacity: 0.4 }]} disabled={page >= pages} onPress={() => setPage((p) => p + 1)}>
              <Text style={styles.pageText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: isMobile ? 880 : '100%', flexGrow: 1 }}>
          {table}
        </ScrollView>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f1f5f9', marginRight: 6 },
  chipOn: { backgroundColor: OTT },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  pager: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pageBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  pageText: { fontSize: 12, color: COLORS.textMain },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 10 },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  link: { fontSize: 13, fontWeight: '700', color: OTT, textDecorationLine: 'underline' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText: { fontSize: 10, fontWeight: '700' },
  empty: { padding: 20, fontSize: 13, color: '#64748b', textAlign: 'center' },
});
