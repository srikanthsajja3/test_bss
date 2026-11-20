import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';

/**
 * The customers assigned to one staff member with a "Show users" / "Show user by search" role
 * (staff_customers.php). A customer here means all of their internet, IPTV and OTT accounts.
 */
export const SCOPE_LABELS = {
  all: 'All customers',
  mapped: 'Show users',
  search: 'Show user by search',
};

const accountLine = (c) => [
  c.mobile,
  c.usernames && c.usernames.length ? c.usernames.join(', ') : '',
  c.iptv_count ? `${c.iptv_count} IPTV` : '',
  c.ott_count ? `${c.ott_count} OTT` : '',
].filter(Boolean).join(' · ');

export const StaffCustomersModal = ({ visible, staff, canEdit = true, onClose, onChanged }) => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null); // { staff, customers }
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    if (!staff?.id) return;
    setLoading(true);
    const res = await OneBssApi.staffCustomers(staff.id);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not load the assigned customers');
      return;
    }
    setInfo(res.data);
  };

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setResults([]);
    setInfo(null);
    load();
  }, [visible, staff?.id]);

  // search the partner's customers (waits for typing to pause)
  useEffect(() => {
    if (!visible || !staff?.id) return undefined;
    const text = q.trim();
    if (text.length < 2) {
      setResults([]);
      return undefined;
    }
    let live = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await OneBssApi.staffCustomers(staff.id, text);
      if (!live) return;
      setSearching(false);
      setResults(res.ok ? res.data.results || [] : []);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [q, visible, staff?.id]);

  const change = async (custId, add) => {
    setBusyId(custId);
    const res = await OneBssApi.staffCustomersUpdate(staff.id, add ? { add: [custId] } : { remove: [custId] });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not update the assigned customers');
      return;
    }
    setResults((rs) => rs.map((r) => (r.cust_id === custId ? { ...r, mapped: add } : r)));
    await load();
    onChanged && onChanged();
  };

  const assigned = info?.customers || [];
  const scope = info?.staff?.customer_scope || 'all';

  return (
    <ModalShell
      visible={visible}
      title={`Assigned customers · ${staff?.staff_name || ''}`}
      icon="user-check"
      iconColor="#0891b2"
      onClose={onClose}
      maxWidth={760}
      footer={<Btn label="Done" onPress={onClose} />}
    >
      <View style={{ gap: 12 }}>
        <Note
          tone={scope === 'all' ? 'warning' : 'info'}
          text={scope === 'search'
            ? `${staff?.staff_name || 'This staff member'} finds these customers only by searching their full mobile, email or username, or 3+ letters of the name. They can view details and reset MAC — nothing else.`
            : scope === 'mapped'
              ? `${staff?.staff_name || 'This staff member'} sees only these customers (all their internet, IPTV and OTT accounts). They can view details and reset MAC — nothing else.`
              : 'This staff member\'s role shows all customers, so this list is not used until the role is changed to "Show users" or "Show user by search".'}
        />

        {canEdit ? (
          <View>
            <Text style={s.label}>Add a customer</Text>
            <View style={s.searchBox}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                style={s.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder="Name, mobile, email or username"
                placeholderTextColor="#94a3b8"
              />
              {searching ? <ActivityIndicator size="small" color="#0891b2" /> : null}
            </View>
            {q.trim().length >= 2 ? (
              <View style={s.results}>
                {!searching && results.length === 0 ? <Text style={[s.sub, { padding: 10 }]}>No customer matches.</Text> : null}
                {results.map((c) => (
                  <View key={c.cust_id} style={s.row}>
                    <Feather name="user" size={15} color="#64748b" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name} numberOfLines={1}>{c.name || `Customer #${c.cust_id}`}</Text>
                      <Text style={s.sub} numberOfLines={1}>{accountLine(c)}</Text>
                    </View>
                    {c.mapped ? (
                      <View style={s.doneTag}><Feather name="check" size={12} color="#047857" /><Text style={s.doneText}>Assigned</Text></View>
                    ) : (
                      <TouchableOpacity style={s.addBtn} disabled={busyId === c.cust_id} onPress={() => change(c.cust_id, true)}>
                        {busyId === c.cust_id ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={13} color="#fff" />}
                        <Text style={s.addText}>Assign</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={s.label}>Assigned ({assigned.length})</Text>
        {loading ? <ActivityIndicator color="#0891b2" style={{ marginVertical: 16 }} /> : null}
        {!loading && assigned.length === 0 ? (
          <View style={s.empty}>
            <Feather name="users" size={22} color="#94a3b8" />
            <Text style={s.sub}>No customers assigned yet{canEdit ? ' — search above to add one.' : '.'}</Text>
          </View>
        ) : null}
        <ScrollView style={{ maxHeight: 320 }}>
          {assigned.map((c) => (
            <View key={c.cust_id} style={s.row}>
              <Feather name="user-check" size={15} color="#0891b2" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>{c.name || `Customer #${c.cust_id}`}</Text>
                <Text style={s.sub} numberOfLines={1}>{accountLine(c)}</Text>
              </View>
              {canEdit ? (
                <TouchableOpacity style={s.removeBtn} disabled={busyId === c.cust_id} onPress={() => change(c.cust_id, false)}>
                  {busyId === c.cust_id ? <ActivityIndicator size="small" color="#b91c1c" /> : <Feather name="x" size={13} color="#b91c1c" />}
                  <Text style={s.removeText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </View>
    </ModalShell>
  );
};

const s = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, height: 40, backgroundColor: '#fff' },
  searchInput: { flex: 1, fontSize: 13.5, color: '#0f172a', outlineStyle: 'none' },
  results: { marginTop: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  name: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0891b2', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8 },
  addText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  doneTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#ecfdf5' },
  doneText: { color: '#047857', fontSize: 12, fontWeight: '700' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff' },
  removeText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 6, padding: 18 },
});
