import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note, SearchSelect } from '../internet/shared';

/**
 * "Not linked" IPTV accounts (iptv_link.php): STBs whose mobile matched no internet customer
 * in the CSV import / IPTV sync. Pick one, find the internet customer it belongs to, Link.
 * Everything else (import, syncs) works as before; a linked STB keeps syncing by the mobile
 * it is registered on at Pioneer.
 */
const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const stbLabel = (it) => it.device_name || it.stb_box || it.pioneer_stb_id || `IPTV #${it.iptv_id}`;

export const IptvLinkModal = ({ visible, user, operators = [], initialOperatorId = '', canLink = true, onClose, onLinked }) => {
  const isOperator = String(user?.role || '').toLowerCase() === 'operator';
  const [operatorId, setOperatorId] = useState(isOperator ? String(user?.partner_id || '') : String(initialOperatorId || ''));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page_size: 25 });
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(null); // the STB being linked
  const [withGroup, setWithGroup] = useState(true);
  const [custQuery, setCustQuery] = useState('');
  const [custResults, setCustResults] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [target, setTarget] = useState(null); // the chosen internet customer
  const [linking, setLinking] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (visible && !isOperator && initialOperatorId) setOperatorId(String(initialOperatorId));
  }, [visible, initialOperatorId]);

  const load = useCallback(async (pg = page) => {
    const my = ++reqId.current;
    setLoading(true);
    const res = await OneBssApi.iptvUnlinked({ partnerId: operatorId || 0, q: search.trim(), page: pg });
    if (my !== reqId.current) return;
    setLoading(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not load the IPTV accounts.');
      return;
    }
    setData({ items: res.data.items || [], total: res.data.total || 0, page_size: res.data.page_size || 25 });
  }, [operatorId, search, page]);

  // list: reload on open / operator / page; the search box waits for typing to pause
  useEffect(() => {
    if (!visible) return undefined;
    const t = setTimeout(() => load(page), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [visible, operatorId, search, page]);

  // customer search for the picked STB (its own operator)
  useEffect(() => {
    if (!picked) return undefined;
    const qtext = custQuery.trim();
    if (qtext.length < 2) {
      setCustResults([]);
      return undefined;
    }
    let live = true;
    const t = setTimeout(async () => {
      setCustLoading(true);
      const res = await OneBssApi.iptvLinkCustomers(picked.partner_id, qtext);
      if (!live) return;
      setCustLoading(false);
      setCustResults(res.ok ? res.data.customers || [] : []);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [picked, custQuery]);

  const startLink = (it) => {
    setPicked(it);
    setWithGroup(true);
    setTarget(null);
    setCustResults([]);
    setCustQuery('');
  };
  const backToList = () => { setPicked(null); setTarget(null); };

  const doLink = async () => {
    if (!picked || !target) return;
    setLinking(true);
    const res = await OneBssApi.iptvLink([picked.iptv_id], target.cust_id, withGroup && picked.group_size > 1);
    setLinking(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not link the IPTV account.');
      return;
    }
    toast.success(`${res.data.message || 'Linked.'} Now on ${target.name || `customer #${target.cust_id}`}.`);
    setPicked(null);
    setTarget(null);
    onLinked && onLinked();
    load(page);
  };

  const opOptions = [
    { value: '', label: 'All operators' },
    ...operators.map((o) => ({ value: String(o.value), label: o.label, search: o.label })),
  ];
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.page_size || 25)));

  return (
    <ModalShell
      visible={visible}
      title={picked ? 'Link IPTV account' : 'IPTV accounts not linked'}
      icon="link"
      iconColor="#7c3aed"
      onClose={onClose}
      maxWidth={820}
      busy={linking}
      footer={picked ? (
        <>
          <Btn label="Back" kind="ghost" onPress={backToList} disabled={linking} />
          <Btn label={linking ? 'Linking…' : 'Link'} icon="link" onPress={doLink} disabled={!target || linking} />
        </>
      ) : (
        <Btn label="Close" kind="ghost" onPress={onClose} />
      )}
    >
      {!picked ? (
        <View style={{ gap: 12 }}>
          <Note tone="info" text="These IPTV accounts are on a mobile that matched no internet customer (CSV import or IPTV sync). Link each one to the internet customer it belongs to — it keeps syncing with its own IPTV mobile." />
          <View style={s.filters}>
            {!isOperator ? (
              <View style={{ flex: 1, minWidth: 200 }}>
                <SearchSelect value={operatorId} options={opOptions} onChange={(v) => { setOperatorId(String(v)); setPage(1); }} placeholder="All operators" searchPlaceholder="Search operators…" accent="#7c3aed" />
              </View>
            ) : null}
            <View style={[s.searchBox, { flex: 2, minWidth: 220 }]}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={(t) => { setSearch(t); setPage(1); }}
                placeholder="STB, name or mobile"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <Text style={s.count}>{loading ? 'Loading…' : `${data.total} IPTV account${data.total === 1 ? '' : 's'} not linked`}</Text>

          <ScrollView style={{ maxHeight: 440 }}>
            {!loading && data.items.length === 0 ? (
              <View style={s.empty}>
                <Feather name="check-circle" size={22} color="#16a34a" />
                <Text style={s.emptyText}>{search ? 'Nothing matches the search.' : 'Every IPTV account is linked to an internet customer.'}</Text>
              </View>
            ) : null}
            {data.items.map((it) => (
              <View key={it.iptv_id} style={s.row}>
                <View style={s.rowIcon}><Feather name="tv" size={16} color="#7c3aed" /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.stb} numberOfLines={1}>{stbLabel(it)}{it.device_name && it.stb_box ? <Text style={s.sub}>  {it.stb_box}</Text> : null}</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {it.customer_name || 'No customer'}{it.iptv_mobile ? ` · ${it.iptv_mobile}` : ''}
                    {it.group_size > 1 ? ` · ${it.group_size} STBs` : ''}
                    {!operatorId && it.partner_name ? ` · ${it.partner_name}` : ''}
                  </Text>
                  <Text style={s.meta} numberOfLines={1}>
                    {[it.plan_name, it.status, `Expiry ${fmtDate(it.expiry)}`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {canLink ? (
                  <TouchableOpacity style={s.linkBtn} onPress={() => startLink(it)}>
                    <Feather name="link" size={13} color="#ffffff" />
                    <Text style={s.linkBtnText}>Link</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </ScrollView>

          {totalPages > 1 ? (
            <View style={s.pager}>
              <TouchableOpacity disabled={page <= 1} onPress={() => setPage(page - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]}>
                <Feather name="chevron-left" size={16} color="#334155" />
              </TouchableOpacity>
              <Text style={s.sub}>Page {page} of {totalPages}</Text>
              <TouchableOpacity disabled={page >= totalPages} onPress={() => setPage(page + 1)} style={[s.pageBtn, page >= totalPages && { opacity: 0.4 }]}>
                <Feather name="chevron-right" size={16} color="#334155" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={s.pickedBox}>
            <Feather name="tv" size={18} color="#7c3aed" />
            <View style={{ flex: 1 }}>
              <Text style={s.stb}>{stbLabel(picked)}</Text>
              <Text style={s.sub}>{picked.customer_name || 'No customer'}{picked.iptv_mobile ? ` · IPTV mobile ${picked.iptv_mobile}` : ''}{picked.partner_name ? ` · ${picked.partner_name}` : ''}</Text>
            </View>
          </View>
          {picked.group_size > 1 ? (
            <TouchableOpacity style={s.checkRow} onPress={() => setWithGroup(!withGroup)}>
              <Feather name={withGroup ? 'check-square' : 'square'} size={16} color={withGroup ? '#7c3aed' : '#94a3b8'} />
              <Text style={s.checkText}>Also link the other {picked.group_size - 1} STB{picked.group_size - 1 === 1 ? '' : 's'} of {picked.customer_name || 'this IPTV customer'}</Text>
            </TouchableOpacity>
          ) : null}

          <View>
            <Text style={s.label}>Link to the internet customer</Text>
            <View style={s.searchBox}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                style={s.searchInput}
                value={custQuery}
                onChangeText={(t) => { setCustQuery(t); setTarget(null); }}
                placeholder="Name, mobile or internet username"
                placeholderTextColor="#94a3b8"
                autoFocus
              />
              {custLoading ? <ActivityIndicator size="small" color="#7c3aed" /> : null}
            </View>
          </View>

          <ScrollView style={{ maxHeight: 300 }}>
            {custQuery.trim().length >= 2 && !custLoading && custResults.length === 0 ? (
              <Text style={[s.sub, { padding: 8 }]}>No internet customer of this operator matches.</Text>
            ) : null}
            {custResults.map((c) => {
              const on = target && target.cust_id === c.cust_id;
              return (
                <TouchableOpacity key={c.cust_id} style={[s.custRow, on && s.custRowOn]} onPress={() => setTarget(c)}>
                  <Feather name={on ? 'check-circle' : 'user'} size={16} color={on ? '#7c3aed' : '#64748b'} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.custName} numberOfLines={1}>{c.name || `Customer #${c.cust_id}`}</Text>
                    <Text style={s.sub} numberOfLines={1}>{[c.mobile, (c.usernames || []).join(', ')].filter(Boolean).join(' · ')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {target ? (
            <Note tone="info" text={`${withGroup && picked.group_size > 1 ? `${picked.group_size} STBs` : `STB ${stbLabel(picked)}`} will show under ${target.name || `customer #${target.cust_id}`} with their internet account(s).`} />
          ) : null}
        </View>
      )}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, height: 40, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#0f172a', outlineStyle: 'none' },
  count: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  empty: { alignItems: 'center', gap: 8, padding: 28 },
  emptyText: { fontSize: 13, color: '#475569' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f3ff', alignItems: 'center', justifyContent: 'center' },
  stb: { fontSize: 13.5, fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' },
  sub: { fontSize: 12, color: '#475569', fontFamily: undefined },
  meta: { fontSize: 11.5, color: '#94a3b8', marginTop: 1 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#7c3aed', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  linkBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  pageBtn: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  pickedBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#ddd6fe' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 13, color: '#334155' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  custRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  custRowOn: { backgroundColor: '#f5f3ff', borderColor: '#c4b5fd' },
  custName: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
});
