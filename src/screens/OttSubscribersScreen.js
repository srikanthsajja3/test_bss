import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SubscriberCard, CardGrid, LayoutSwitch, useListLayout } from '../components/SubscriberCard';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { ListPager } from '../components/ListPager';
import { OneBssApi } from '../services/oneBssApi';
import { formatApiDate } from '../components/CustomerAccountsOverview';
import { ColSearch, ColSelect, ColDateRange, FilterCell, dateRangeParams } from '../components/ColumnFilters';

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
 * Props: user, refreshSignal, initialRange (a dashboard Expiry & Registration button, e.g. 'expires_today')
 */
const RANGE_LABEL = {
  expiring_next_7_days: 'Expires in next 7 days', expires_today: 'Expires today', expires_tomorrow: 'Expires tomorrow',
  expired_yesterday: 'Expired since yesterday', expired_last_7_days: 'Expired in last 7 days',
  registered_today: 'Registered today', registered_yesterday: 'Registered yesterday',
  registered_this_month: 'Registered this month', registered_last_month: 'Registered last month',
};
export const OttSubscribersScreen = ({ user, refreshSignal = 0, initialRange = '' }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isOperator = String(user?.role || user?.account_role || '').toLowerCase() === 'operator';
  // cards or table, remembered per login (first visit: list) — shared with the Internet / IPTV lists
  const [layoutMode, setLayoutMode] = useListLayout(user);
  const [range, setRange] = useState(RANGE_LABEL[initialRange] ? initialRange : '');
  useEffect(() => { setRange(RANGE_LABEL[initialRange] ? initialRange : ''); }, [initialRange]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  // Filter row under the header. Sent to customers_list.php, so it filters every page.
  const EMPTY = { subId: '', name: '', mobile: '', partner: '', operator: '', pkg: '', expiry: null };
  const [cf, setCf] = useState(EMPTY);
  const [cfText, setCfText] = useState({ subId: '', name: '', mobile: '', partner: '' });
  const [facets, setFacets] = useState({ plans: [], operators: [], partners: [] });
  const setCol = (k, v) => setCf((f) => ({ ...f, [k]: v }));
  const hasActiveColSearch = useMemo(
    () => Object.values(cf).some((v) => (v && typeof v === 'object' ? !!v.preset : String(v ?? '').trim() !== '')) || status !== 'all',
    [cf, status]
  );
  const resetColSearch = () => {
    setCf(EMPTY);
    setCfText({ subId: '', name: '', mobile: '', partner: '' });
    setStatus('all');
  };
  useEffect(() => {
    const t = setTimeout(() => setCfText({ subId: cf.subId.trim(), name: cf.name.trim(), mobile: cf.mobile.trim(), partner: cf.partner.trim() }), 400);
    return () => clearTimeout(t);
  }, [cf.subId, cf.name, cf.mobile, cf.partner]);
  const colQuery = {
    range: range || undefined,
    partner_id: cf.operator || undefined,
    f_subid: cfText.subId, f_name: cfText.name, f_mobile: cfText.mobile, f_partner: cf.partner || undefined, f_plan: cf.pkg,
    ...dateRangeParams(cf.expiry),
  };
  const colKey = JSON.stringify(colQuery);
  useEffect(() => {
    let live = true;
    OneBssApi.getListFacets('ott', cf.operator)
      .then((res) => { if (live && res?.ok && res.data?.success) setFacets({ plans: res.data.plans || [], operators: res.data.operators || [], partners: res.data.partners || [] }); })
      .catch(() => {});
    return () => { live = false; };
  }, [cf.operator, refreshSignal]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, status, colKey, pageSize]);

  const load = async () => {
    const my = ++seq.current;
    setLoading(true);
    const res = await OneBssApi.getCustomersList(page, pageSize, 'ott', debounced, { status, ...colQuery });
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
  }, [page, pageSize, debounced, status, colKey, refreshSignal]);

  const open = (row) => {
    if (!row.cust_id) return;
    if (typeof window !== 'undefined') window.location.hash = `customers?sub_id=${row.cust_id}&from=ott`;
  };

  const filteredRows = rows; // the server already applied every filter

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const table = (
    <View style={{ flex: 1 }}>
      {/* Table Header */}
      <View style={[styles.tr, styles.thRow]}>
        <Text style={[styles.th, { flex: 1.4, minWidth: 130 }]}>Subscriber ID</Text>
        <Text style={[styles.th, { flex: 1, minWidth: 115 }]}>Status</Text>
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Full Name</Text>
        <Text style={[styles.th, { flex: 1.2, minWidth: 110 }]}>Mobile</Text>
        {!isOperator ? <Text style={[styles.th, { flex: 1.4, minWidth: 120 }]}>Operator</Text> : null}
        {!isOperator ? <Text style={[styles.th, { flex: 1, minWidth: 110 }]}>Partner</Text> : null}
        <Text style={[styles.th, { flex: 1.6, minWidth: 140 }]}>Package</Text>
        <Text style={[styles.th, { flex: 1.5, minWidth: 140 }]}>Expiry</Text>
      </View>

      {/* Filter row: one control per column, filters the whole list on the server */}
      <View style={styles.excelFilterRow}>
        <FilterCell flex={1.4} minWidth={130}>
          <ColSearch value={cf.subId} onChange={(v) => setCol('subId', v)} placeholder="Subscriber ID" />
        </FilterCell>
        <FilterCell flex={1} minWidth={115}>
          <ColSelect value={status === 'all' ? '' : status} options={CHIPS.filter((c) => c.id !== 'all').map((c) => ({ value: c.id, label: c.label }))} onChange={(v) => setStatus(v || 'all')} placeholder="Status" />
        </FilterCell>
        <FilterCell flex={1.6} minWidth={140}>
          <ColSearch value={cf.name} onChange={(v) => setCol('name', v)} placeholder="Full name" />
        </FilterCell>
        <FilterCell flex={1.2} minWidth={110}>
          <ColSearch value={cf.mobile} onChange={(v) => setCol('mobile', v.replace(/[^\d]/g, ''))} placeholder="Mobile" />
        </FilterCell>
        {!isOperator ? (
          <FilterCell flex={1.4} minWidth={120}>
            <ColSelect value={cf.operator} options={facets.operators} onChange={(v) => setCol('operator', v ? String(v) : '')} placeholder="Operator" allLabel="All operators" />
          </FilterCell>
        ) : null}
        {!isOperator ? (
          <FilterCell flex={1} minWidth={110}>
            <ColSelect value={cf.partner} options={facets.partners} onChange={(v) => setCol('partner', v ? String(v) : '')} placeholder="Partner" allLabel="All partners" searchable />
          </FilterCell>
        ) : null}
        <FilterCell flex={1.6} minWidth={140}>
          <ColSelect value={cf.pkg} options={facets.plans} onChange={(v) => setCol('pkg', v)} placeholder="Package" allLabel="All packages" />
        </FilterCell>
        <View style={{ flex: 1.5, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ColDateRange value={cf.expiry} onChange={(v) => setCol('expiry', v)} placeholder="Expiry date" />
          </View>
          {hasActiveColSearch ? (
            <TouchableOpacity style={styles.btnResetCol} onPress={resetColSearch} title="Clear filters">
              <Feather name="x-circle" size={14} color="#dc2626" />
            </TouchableOpacity>
          ) : null}
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
              {!isOperator ? <Text style={[styles.td, { flex: 1.4, minWidth: 120 }]} numberOfLines={1}>{r.company_name || r.partner_name || '—'}</Text> : null}
              {!isOperator ? <Text style={[styles.td, { flex: 1, minWidth: 110, color: '#475569' }]} numberOfLines={1}>{r.partner_username || '—'}</Text> : null}
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
        {range ? (
          <View style={styles.rangeChip}>
            <Feather name="calendar" size={13} color={OTT} />
            <Text style={styles.rangeChipText}>{RANGE_LABEL[range]}</Text>
            <TouchableOpacity onPress={() => setRange('')} accessibilityLabel="Show all OTT subscribers"><Feather name="x" size={14} color="#64748b" /></TouchableOpacity>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            {CHIPS.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.chip, status === c.id && styles.chipOn]} onPress={() => setStatus(c.id)}>
                <Text style={[styles.chipText, status === c.id && { color: '#ffffff' }]}>
                  {c.label} ({c.id === 'all' ? counts.total ?? 0 : counts[c.id] ?? 0})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <LayoutSwitch value={layoutMode} onChange={setLayoutMode} compact={isMobile} />
        </View>
      </View>

      <View style={[
        styles.card,
        layoutMode === 'cards' ? { padding: 0, backgroundColor: 'transparent', borderWidth: 0, marginTop: 14 } : { padding: 0, marginTop: 14 }
      ]}>
        <View style={[layoutMode === 'cards' && { borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden', marginBottom: 12, backgroundColor: '#ffffff' }]}>
          <ListPager
            isMobile={isMobile}
            loading={loading}
            total={total}
            shown={rows.length}
            page={page}
            pages={pages}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
            noun={total === 1 ? 'OTT subscriber' : 'OTT subscribers'}
          />
        </View>

        {layoutMode === 'cards' ? (
          <View style={{ width: '100%', gap: 12 }}>
            {error ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={[styles.empty, { color: '#b91c1c' }]}>{error}</Text>
              </View>
            ) : filteredRows.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center' }}>
                {loading ? <ActivityIndicator size="small" color={OTT} /> : <Text style={styles.empty}>No OTT subscribers match.</Text>}
              </View>
            ) : (
              <CardGrid>
                {filteredRows.map((r) => {
                  const b = BADGE[r.status_key] || BADGE.disabled;
                  const label = r.status_key === 'disabled' ? 'Deactivated' : r.status_key === 'new' ? 'New' : String(r.status || '—');
                  const exp = r.expiration ? String(r.expiration) : '';
                  const left = exp ? Math.ceil((new Date(exp.replace(' ', 'T')).getTime() - Date.now()) / 86400000) : null;
                  const tag = left === null || Number.isNaN(left) ? null
                    : left < 0 ? { text: `Expired ${-left} day${left === -1 ? '' : 's'} ago`, tone: 'bad' }
                      : left === 0 ? { text: 'Expires today', tone: 'warn' }
                        : { text: `${left} day${left === 1 ? '' : 's'} left`, tone: left <= 3 ? 'warn' : 'ok' };
                  const mobileNum = String(r.mobile || '').replace(/[^\d+]/g, '');
                  return (
                    <SubscriberCard
                      key={r.ott_id}
                      title={r.subscriber_id || `OTT #${r.ott_id}`}
                      titleColor={OTT}
                      subtitle={r.full_name}
                      accent={OTT}
                      status={{ label, bg: b.bg, fg: b.fg }}
                      onOpen={r.cust_id ? () => open(r) : undefined}
                      openLabel="View"
                      cells={[
                        { label: 'Plan', value: r.package_name, sub: r.subplan_name || null },
                        { label: 'Expires', value: exp ? formatApiDate(exp) : '—', tag },
                        { label: 'Mobile', value: r.mobile, valueColor: '#1d4ed8' },
                        !isOperator ? { label: 'Operator', value: r.company_name || r.partner_name, sub: r.partner_username || null } : null,
                      ]}
                      actions={[
                        mobileNum ? { icon: 'phone', label: 'Call', color: '#2563eb', onPress: () => { if (typeof window !== 'undefined') window.location.href = `tel:${mobileNum}`; } } : null,
                      ]}
                    />
                  );
                })}
              </CardGrid>
            )}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: isMobile ? (isOperator ? 880 : 1000) : '100%', flexGrow: 1 }}>
            {table}
          </ScrollView>
        )}
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
  rangeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  rangeChipText: { fontSize: 12, fontWeight: '700', color: '#0369a1' },
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
