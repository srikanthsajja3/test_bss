import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { can } from '../services/staffAccess';
import { Note, SearchSelect, isSuperAdmin } from '../components/internet/shared';
import { ACCENT, STATUS, STATUS_ORDER, StatusPill, TicketModal, RaiseComplaintModal } from '../components/support/ComplaintParts';

/**
 * Complaints (tickets) — kept in RADIUS (support/complaints.php).
 *   operator    → its own customers' tickets
 *   admin       → chooses one of its operators
 *   super admin → every ticket (super admin RADIUS login), or one operator's view
 */
const PAGE_SIZE = 25;
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());

export const ComplaintsScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSuper = isSuperAdmin(user);
  const isOperator = user?.role === 'operator';

  const [ctx, setCtx] = useState(null);
  const [opId, setOpId] = useState('');
  const [status, setStatus] = useState(0); // 0 = all
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [raise, setRaise] = useState(false);
  const seq = useRef(0);

  // whose view
  useEffect(() => {
    (async () => {
      const res = await OneBssApi.complaintsContext(opId);
      if (!res.ok) {
        setCtx({ operators: [], needs_operator: false, error: res.data?.message || 'Could not load' });
        return;
      }
      setCtx(res.data);
    })();
  }, [opId, refreshSignal]);

  const load = useCallback(async (p = page, st = status) => {
    if (!ctx || ctx.needs_operator || ctx.error) return;
    const id = ++seq.current;
    setLoading(true);
    setError('');
    const res = await OneBssApi.complaintsList(opId, { status: st || '', page: p, pageSize: PAGE_SIZE });
    if (id !== seq.current) return;
    setLoading(false);
    if (!res.ok || res.data?.success === false) {
      setData(null);
      setError(res.data?.message || `Could not load complaints (HTTP ${res.status}).`);
      return;
    }
    setData(res.data);
  }, [ctx, opId, page, status]);

  useEffect(() => {
    setPage(0);
    load(0, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, status]);

  const goPage = (p) => {
    setPage(p);
    load(p, status);
  };

  const opOptions = useMemo(() => [
    ...(isSuper ? [{ value: '', label: 'All operators (super admin view)', sub: 'Every ticket · super admin RADIUS login' }] : []),
    ...((ctx?.operators) || []).map((o) => ({ value: String(o.partner_id), label: o.name, sub: `#${o.partner_id} · its customers only` })),
  ], [ctx, isSuper]);

  const needle = search.trim().toLowerCase();
  const rows = (data?.complaints || []).filter((r) => !needle || [r.id, r.username_org, r.acc_id, r.mobile, r.complaint_type_name, r.complaint_sub_type, r.assigned_user, r.department_name]
    .some((v) => clean(v).toLowerCase().includes(needle)));
  const canAdd = can(user, 'support.complaints', 'add') && !ctx?.needs_operator && !ctx?.error;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, flex: 1, alignItems: isMobile ? 'stretch' : 'center' }}>
            {!isOperator ? (
              <View style={{ width: isMobile ? '100%' : 300 }}>
                <SearchSelect
                  value={opId}
                  options={opOptions}
                  onChange={(v) => { setOpId(String(v || '')); setData(null); }}
                  placeholder={isSuper ? 'All operators' : 'Choose an operator'}
                  searchPlaceholder="Search operators…"
                  accent={ACCENT}
                />
              </View>
            ) : null}
            <View style={[s.search, isMobile && { maxWidth: '100%' }]}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Ticket, customer, mobile, type…" placeholderTextColor="#94a3b8" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.iconBtn} onPress={() => load(page, status)} disabled={loading} accessibilityLabel="Refresh">
              {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="refresh-cw" size={14} color={ACCENT} />}
            </TouchableOpacity>
            {canAdd ? (
              <TouchableOpacity style={s.primaryBtn} onPress={() => setRaise(true)}>
                <Feather name="plus" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>Raise complaint</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[0, ...STATUS_ORDER].map((k) => {
            const on = status === k;
            const st = STATUS[k];
            return (
              <TouchableOpacity key={k} style={[s.chip, on && { backgroundColor: st ? st.fg : '#0f172a', borderColor: st ? st.fg : '#0f172a' }]} onPress={() => setStatus(k)}>
                {st ? <Feather name={st.icon} size={11} color={on ? '#fff' : st.fg} /> : null}
                <Text style={[s.chipText, on && { color: '#fff' }]}>{st ? st.label : 'All'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {ctx?.needs_operator ? <Note tone="info" text="Choose one of your operators to see its customers' complaints." /> : null}
        {ctx?.error && !ctx?.needs_operator ? <Note tone="error" text={ctx.error} /> : null}
        {error ? <Note tone="error" text={error} /> : null}

        {data || loading ? (
          <View style={s.card}>
            {loading && !data ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 30 }} />
            ) : isMobile ? (
              <View style={{ padding: 10, gap: 8, opacity: loading ? 0.5 : 1 }}>
                {rows.map((r) => (
                  <TouchableOpacity key={r.id} style={s.mCard} onPress={() => setOpenId(r.id)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[s.td, { fontWeight: '800' }]}>#{r.id}</Text>
                      <StatusPill status={r.status} text={r.status_text} />
                    </View>
                    <Text style={[s.td, { fontWeight: '700', marginTop: 6 }]}>{clean(r.username_org) || `Account #${r.acc_id}`}</Text>
                    <Text style={s.sub}>{[r.complaint_type_name, r.complaint_sub_type].map(clean).filter(Boolean).join(' › ')}</Text>
                    <Text style={s.sub}>{clean(r.date)}{clean(r.assigned_user) ? ` · ${clean(r.assigned_user)}` : ' · not assigned'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
                <View style={{ minWidth: 1000, flexGrow: 1, opacity: loading ? 0.5 : 1 }}>
                  <View style={[s.tr, s.thRow]}>
                    <Text style={[s.th, { width: 80 }]}>Ticket</Text>
                    <Text style={[s.th, { width: 170 }]}>Raised</Text>
                    <Text style={[s.th, { width: 210 }]}>Customer</Text>
                    <Text style={[s.th, { flex: 1, minWidth: 180 }]}>Type</Text>
                    <Text style={[s.th, { width: 190 }]}>Assigned to</Text>
                    <Text style={[s.th, { width: 130 }]}>Status</Text>
                  </View>
                  {rows.map((r) => (
                    <TouchableOpacity key={r.id} style={s.tr} onPress={() => setOpenId(r.id)}>
                      <Text style={[s.td, { width: 80, fontWeight: '800' }]}>#{r.id}</Text>
                      <Text style={[s.td, { width: 170 }]}>{clean(r.date)}</Text>
                      <View style={{ width: 210, paddingRight: 8 }}>
                        <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{clean(r.username_org) || '—'}</Text>
                        <Text style={s.sub} numberOfLines={1}>#{clean(r.acc_id)}{clean(r.mobile) ? ` · ${clean(r.mobile)}` : ''}{r.online_status === 'ONLINE' ? ' · online' : ''}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 180, paddingRight: 8 }}>
                        <Text style={s.td} numberOfLines={1}>{clean(r.complaint_type_name) || '—'}</Text>
                        {clean(r.complaint_sub_type) ? <Text style={s.sub} numberOfLines={1}>{clean(r.complaint_sub_type)}</Text> : null}
                      </View>
                      <View style={{ width: 190, paddingRight: 8 }}>
                        <Text style={[s.td, !clean(r.assigned_user) && { color: '#94a3b8' }]} numberOfLines={1}>{clean(r.assigned_user) || 'Not assigned'}</Text>
                        {clean(r.department_name) ? <Text style={s.sub} numberOfLines={1}>{clean(r.department_name)}</Text> : null}
                      </View>
                      <View style={{ width: 130 }}><StatusPill status={r.status} text={r.status_text} /></View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {data && !rows.length ? (
              <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                <Feather name="inbox" size={22} color="#94a3b8" />
                <Text style={s.sub}>{needle ? 'No ticket on this page matches the search.' : status ? `No ${STATUS[status].label.toLowerCase()} tickets${page ? ' on this page' : ''}.` : 'No complaints yet.'}</Text>
              </View>
            ) : null}
            {data && (page > 0 || data.has_more) ? (
              <View style={s.foot}>
                <Text style={s.sub}>Newest first · {PAGE_SIZE} per page</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity style={[s.pgBtn, page <= 0 && s.pgOff]} disabled={page <= 0 || loading} onPress={() => goPage(page - 1)}>
                    <Feather name="chevron-left" size={14} color={page <= 0 ? '#cbd5e1' : '#334155'} />
                    <Text style={[s.pgText, page <= 0 && { color: '#cbd5e1' }]}>Newer</Text>
                  </TouchableOpacity>
                  <Text style={s.pgInfo}>Page {page + 1}</Text>
                  <TouchableOpacity style={[s.pgBtn, !data.has_more && s.pgOff]} disabled={!data.has_more || loading} onPress={() => goPage(page + 1)}>
                    <Text style={[s.pgText, !data.has_more && { color: '#cbd5e1' }]}>Older</Text>
                    <Feather name="chevron-right" size={14} color={!data.has_more ? '#cbd5e1' : '#334155'} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <TicketModal visible={!!openId} opId={opId} ticketId={openId} user={user} onClose={() => setOpenId(null)} onChanged={() => load(page, status)} />
      <RaiseComplaintModal
        visible={raise}
        opId={opId}
        user={user}
        onClose={() => setRaise(false)}
        onDone={(id) => { setRaise(false); load(0, status); setPage(0); if (id) setOpenId(id); }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, minWidth: 220, flexGrow: 1, maxWidth: 380, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  iconBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 8, backgroundColor: ACCENT },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  mCard: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, padding: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, flexWrap: 'wrap', gap: 8 },
  pgBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  pgOff: { backgroundColor: '#f8fafc' },
  pgText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  pgInfo: { fontSize: 12, fontWeight: '700', color: '#0f172a', paddingHorizontal: 6 },
});
