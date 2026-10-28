import React, { useEffect, useRef, useState, useMemo } from 'react';
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

  // Excel-style column search filters
  const [colSearch, setColSearch] = useState({
    subId: '',
    name: '',
    mobile: '',
    operator: '',
    pkg: '',
    expiry: '',
  });

  const hasActiveColSearch = useMemo(() => {
    return Object.values(colSearch).some((val) => !!val && String(val).trim() !== '');
  }, [colSearch]);

  const resetColSearch = () => {
    setColSearch({
      subId: '',
      name: '',
      mobile: '',
      operator: '',
      pkg: '',
      expiry: '',
    });
  };

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

  // Filter rows by Excel column searches
  const filteredRows = useMemo(() => {
    let list = rows;
    if (colSearch.subId.trim()) {
      const q = colSearch.subId.toLowerCase().trim();
      list = list.filter((r) => String(r.subscriber_id || '').toLowerCase().includes(q));
    }
    if (colSearch.name.trim()) {
      const q = colSearch.name.toLowerCase().trim();
      list = list.filter((r) => String(r.full_name || '').toLowerCase().includes(q));
    }
    if (colSearch.mobile.trim()) {
      const q = colSearch.mobile.toLowerCase().trim();
      list = list.filter((r) => String(r.mobile || '').toLowerCase().includes(q));
    }
    if (colSearch.operator.trim()) {
      const q = colSearch.operator.toLowerCase().trim();
      list = list.filter((r) => String(r.partner_name || '').toLowerCase().includes(q));
    }
    if (colSearch.pkg.trim()) {
      const q = colSearch.pkg.toLowerCase().trim();
      list = list.filter((r) => String(r.package_name || r.subplan_name || '').toLowerCase().includes(q));
    }
    if (colSearch.expiry.trim()) {
      const q = colSearch.expiry.toLowerCase().trim();
      list = list.filter((r) => String(r.expiration || '').toLowerCase().includes(q));
    }
    return list;
  }, [rows, colSearch]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const table = (
    <View style={{ flex: 1 }}>
      {/* Table Header */}
      <View style={[styles.tr, styles.thRow]}>
        <Text style={[styles.th, { flex: 1.4, minWidth: 130 }]}>Subscriber ID</Text>
        <Text style={[styles.th, { flex: 1, minWidth: 100 }]}>Status</Text>
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Full Name</Text>
        <Text style={[styles.th, { flex: 1.2, minWidth: 110 }]}>Mobile</Text>
        {!isOperator ? <Text style={[styles.th, { flex: 1.4, minWidth: 120 }]}>Operator</Text> : null}
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Package</Text>
        <Text style={[styles.th, { flex: 1.5, minWidth: 140 }]}>Expiry</Text>
      </View>

      {/* Excel Filter Row (Row 1) */}
      <View style={styles.excelFilterRow}>
        {/* Subscriber ID */}
        <View style={{ flex: 1.4, minWidth: 130, paddingRight: 6 }}>
          <View style={[styles.colSearchBox, colSearch.subId && styles.colSearchBoxActive]}>
            <Feather name="search" size={10} color={colSearch.subId ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
            <TextInput
              style={styles.colSearchInput}
              placeholder="Filter ID..."
              placeholderTextColor="#94a3b8"
              value={colSearch.subId}
              onChangeText={(val) => setColSearch((f) => ({ ...f, subId: val }))}
            />
            {colSearch.subId ? (
              <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, subId: '' }))}>
                <Feather name="x" size={10} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Status Toggle [All | Act | Exp] */}
        <View style={{ flex: 1, minWidth: 100, paddingRight: 6 }}>
          <View style={styles.statusToggleWrap}>
            <TouchableOpacity
              style={[styles.statusToggleBtn, status === 'all' && styles.statusToggleBtnActiveAll]}
              onPress={() => setStatus('all')}
            >
              <Text style={[styles.statusToggleText, status === 'all' && styles.statusToggleTextActiveAll]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusToggleBtn, status === 'active' && styles.statusToggleBtnActiveAct]}
              onPress={() => setStatus('active')}
            >
              <Text style={[styles.statusToggleText, status === 'active' && styles.statusToggleTextActiveWhite]}>Act</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.statusToggleBtn, status === 'expired' && styles.statusToggleBtnActiveExp]}
              onPress={() => setStatus('expired')}
            >
              <Text style={[styles.statusToggleText, status === 'expired' && styles.statusToggleTextActiveWhite]}>Exp</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Full Name */}
        <View style={{ flex: 1.6, minWidth: 140, paddingRight: 6 }}>
          <View style={[styles.colSearchBox, colSearch.name && styles.colSearchBoxActive]}>
            <Feather name="search" size={10} color={colSearch.name ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
            <TextInput
              style={styles.colSearchInput}
              placeholder="Filter Name..."
              placeholderTextColor="#94a3b8"
              value={colSearch.name}
              onChangeText={(val) => setColSearch((f) => ({ ...f, name: val }))}
            />
            {colSearch.name ? (
              <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, name: '' }))}>
                <Feather name="x" size={10} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Mobile */}
        <View style={{ flex: 1.2, minWidth: 110, paddingRight: 6 }}>
          <View style={[styles.colSearchBox, colSearch.mobile && styles.colSearchBoxActive]}>
            <Feather name="search" size={10} color={colSearch.mobile ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
            <TextInput
              style={styles.colSearchInput}
              placeholder="Filter Mobile..."
              placeholderTextColor="#94a3b8"
              value={colSearch.mobile}
              onChangeText={(val) => setColSearch((f) => ({ ...f, mobile: val }))}
            />
            {colSearch.mobile ? (
              <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, mobile: '' }))}>
                <Feather name="x" size={10} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Operator */}
        {!isOperator ? (
          <View style={{ flex: 1.4, minWidth: 120, paddingRight: 6 }}>
            <View style={[styles.colSearchBox, colSearch.operator && styles.colSearchBoxActive]}>
              <Feather name="search" size={10} color={colSearch.operator ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
              <TextInput
                style={styles.colSearchInput}
                placeholder="Filter Operator..."
                placeholderTextColor="#94a3b8"
                value={colSearch.operator}
                onChangeText={(val) => setColSearch((f) => ({ ...f, operator: val }))}
              />
              {colSearch.operator ? (
                <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, operator: '' }))}>
                  <Feather name="x" size={10} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Package */}
        <View style={{ flex: 1.6, minWidth: 140, paddingRight: 6 }}>
          <View style={[styles.colSearchBox, colSearch.pkg && styles.colSearchBoxActive]}>
            <Feather name="search" size={10} color={colSearch.pkg ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
            <TextInput
              style={styles.colSearchInput}
              placeholder="Filter Package..."
              placeholderTextColor="#94a3b8"
              value={colSearch.pkg}
              onChangeText={(val) => setColSearch((f) => ({ ...f, pkg: val }))}
            />
            {colSearch.pkg ? (
              <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, pkg: '' }))}>
                <Feather name="x" size={10} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Expiry / Clear */}
        <View style={{ flex: 1.5, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.colSearchBox, { flex: 1 }, colSearch.expiry && styles.colSearchBoxActive]}>
            <Feather name="search" size={10} color={colSearch.expiry ? '#2563eb' : '#94a3b8'} style={{ marginRight: 3 }} />
            <TextInput
              style={styles.colSearchInput}
              placeholder="Filter Expiry..."
              placeholderTextColor="#94a3b8"
              value={colSearch.expiry}
              onChangeText={(val) => setColSearch((f) => ({ ...f, expiry: val }))}
            />
            {colSearch.expiry ? (
              <TouchableOpacity onPress={() => setColSearch((f) => ({ ...f, expiry: '' }))}>
                <Feather name="x" size={10} color="#64748b" />
              </TouchableOpacity>
            ) : null}
          </View>
          {hasActiveColSearch && (
            <TouchableOpacity style={styles.btnResetCol} onPress={resetColSearch} title="Clear column filters">
              <Feather name="x-circle" size={12} color="#dc2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Data Rows */}
      {error ? (
        <Text style={[styles.empty, { color: '#b91c1c' }]}>{error}</Text>
      ) : filteredRows.length === 0 ? (
        <View style={{ padding: 30, alignItems: 'center' }}>
          {loading ? <ActivityIndicator size="small" color={OTT} /> : <Text style={styles.empty}>No OTT subscribers match.</Text>}
        </View>
      ) : (
        filteredRows.map((r) => {
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

  // Excel Filter Row styles
  excelFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
  },
  colSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    height: 28,
    paddingHorizontal: 6,
  },
  colSearchBoxActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  colSearchInput: {
    flex: 1,
    fontSize: 11,
    color: '#0f172a',
    outlineStyle: 'none',
    padding: 0,
  },
  statusToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    padding: 2,
    height: 28,
    alignItems: 'center',
  },
  statusToggleBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    paddingHorizontal: 2,
  },
  statusToggleBtnActiveAll: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleBtnActiveAct: {
    backgroundColor: '#15803d',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleBtnActiveExp: {
    backgroundColor: '#b91c1c',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748b',
  },
  statusToggleTextActiveAll: {
    color: '#0ea5e9',
    fontWeight: '800',
  },
  statusToggleTextActiveWhite: {
    color: '#ffffff',
    fontWeight: '800',
  },
  btnResetCol: {
    padding: 4,
  },
});
