import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { can } from '../../services/staffAccess';
import { ModalShell, Btn, Note, SearchSelect, sharedStyles } from '../internet/shared';

/**
 * Complaint tickets (RADIUS) — pieces shared by the Complaints page and the customer page.
 * Status: 1 Open · 6 In Progress · 3 Reopened · 4 Resolved · 5 Closed
 */
export const ACCENT = '#e11d48';
export const STATUS = {
  1: { label: 'Open', fg: '#1d4ed8', bg: '#dbeafe', icon: 'circle' },
  6: { label: 'In Progress', fg: '#b45309', bg: '#fef3c7', icon: 'loader' },
  3: { label: 'Reopened', fg: '#7c3aed', bg: '#ede9fe', icon: 'rotate-ccw' },
  4: { label: 'Resolved', fg: '#047857', bg: '#d1fae5', icon: 'check-circle' },
  5: { label: 'Closed', fg: '#475569', bg: '#e2e8f0', icon: 'lock' },
};
export const STATUS_ORDER = [1, 6, 3, 4, 5];

const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
const ok = (res) => res?.ok && res.data?.success !== false;
const errOf = (res, fb) => res?.data?.message || (res?.status === 0 ? 'No connection to the server.' : fb);

export const StatusPill = ({ status, text }) => {
  const st = STATUS[Number(status)] || { label: clean(text) || '—', fg: '#475569', bg: '#f1f5f9', icon: 'circle' };
  return (
    <View style={[s.pill, { backgroundColor: st.bg }]}>
      <Feather name={st.icon} size={10} color={st.fg} />
      <Text style={[s.pillText, { color: st.fg }]}>{(clean(text) || st.label).toUpperCase()}</Text>
    </View>
  );
};

/** Searchable customer picker (the operator's own customers, or RADIUS's list in the super admin view). */
export const CustomerPicker = ({ value, onChange, search, disabled, placeholder = 'Search username or account no.' }) => {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const t = useRef(null);
  const seq = useRef(0);

  const run = useCallback(async (text) => {
    const id = ++seq.current;
    setLoading(true);
    const res = await search(text);
    if (id !== seq.current) return;
    setLoading(false);
    setList(ok(res) && Array.isArray(res.data?.results) ? res.data.results : []);
  }, [search]);

  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(t.current);
    t.current = setTimeout(() => run(q.trim()), 300);
    return () => clearTimeout(t.current);
  }, [q, open, run]);

  if (value) {
    return (
      <View style={[sharedStyles.input, s.picked]}>
        <Feather name="user" size={14} color={ACCENT} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain }} numberOfLines={1}>
          {value.name} <Text style={{ color: '#64748b', fontWeight: '500' }}>#{value.id}</Text>
        </Text>
        {!disabled ? (
          <TouchableOpacity onPress={() => { onChange(null); setOpen(true); }} accessibilityLabel="Change customer">
            <Feather name="x" size={15} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  return (
    <View>
      <View style={[sharedStyles.input, s.picked]}>
        <Feather name="search" size={14} color="#94a3b8" />
        <TextInput
          style={{ flex: 1, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' }}
          value={q}
          onChangeText={setQ}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          editable={!disabled}
        />
        {loading ? <ActivityIndicator size="small" color={ACCENT} /> : null}
      </View>
      {open ? (
        <View style={s.dropList}>
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {list.map((c) => (
              <TouchableOpacity key={c.id} style={s.dropItem} onPress={() => { onChange(c); setOpen(false); setQ(''); }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.textMain }} numberOfLines={1}>{c.name}</Text>
                <Text style={{ fontSize: 11.5, color: '#64748b' }}>Account #{c.id}</Text>
              </TouchableOpacity>
            ))}
            {!loading && !list.length ? <Text style={[s.sub, { padding: 10 }]}>{q.trim() ? 'No customer matches.' : 'Type to search.'}</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
};

/** Raise a ticket. presetCustomer: {id: acc_id, name} (customer page). */
export const RaiseComplaintModal = ({ visible, opId, user, presetCustomer, onClose, onDone }) => {
  const [types, setTypes] = useState([]);
  const [subs, setSubs] = useState([]);
  const [typeId, setTypeId] = useState('');
  const [subId, setSubId] = useState('');
  const [customer, setCustomer] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTypeId('');
    setSubId('');
    setSubs([]);
    setNotes('');
    setError('');
    setCustomer(presetCustomer || null);
    (async () => {
      setLoading(true);
      const res = await OneBssApi.complaintsMeta(opId, 'types');
      setLoading(false);
      if (!ok(res)) return setError(errOf(res, 'Could not load complaint types'));
      const list = res.data.results || [];
      setTypes(list);
      if (list.length === 1) setTypeId(String(list[0].id));
    })();
  }, [visible, opId, presetCustomer]);

  useEffect(() => {
    setSubId('');
    setSubs([]);
    if (!typeId) return;
    (async () => {
      const res = await OneBssApi.complaintsMeta(opId, 'subtypes', { type_id: typeId });
      if (!ok(res)) return toast.error(errOf(res, 'Could not load sub-types'));
      const list = res.data.results || [];
      setSubs(list);
      if (list.length === 1) setSubId(String(list[0].id));
    })();
  }, [typeId, opId]);

  const search = useCallback((text) => OneBssApi.complaintsMeta(opId, 'customers', { q: text }), [opId]);

  const save = async () => {
    if (!customer) return toast.warning('Choose the customer');
    if (!typeId || !subId) return toast.warning('Choose the complaint type and sub-type');
    setSaving(true);
    const res = await OneBssApi.complaintAction(opId, 'create', { type_id: Number(typeId), sup_type_id: Number(subId), customer_id: customer.id, notes: notes.trim() });
    setSaving(false);
    if (!ok(res)) return toast.error(errOf(res, 'Could not raise the ticket'));
    toast.success(res.data.message || 'Ticket raised');
    onDone?.(res.data.complaint_id);
  };

  const opts = (list) => list.map((x) => ({ value: String(x.id), label: x.name || `#${x.id}` }));
  return (
    <ModalShell
      visible={visible}
      title="Raise complaint"
      icon="alert-circle"
      iconColor={ACCENT}
      onClose={onClose}
      busy={saving}
      maxWidth={520}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Raise ticket" onPress={save} loading={saving} disabled={!can(user, 'support.complaints', 'add')} />
        </>
      }
    >
      {error ? <Note tone="error" text={error} /> : null}
      <Text style={sharedStyles.label}>CUSTOMER *</Text>
      <CustomerPicker value={customer} onChange={setCustomer} search={search} disabled={!!presetCustomer} />
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>COMPLAINT TYPE *</Text>
      <SearchSelect value={typeId} options={opts(types)} onChange={(v) => setTypeId(String(v || ''))} placeholder={loading ? 'Loading…' : 'Choose a type'} accent={ACCENT} disabled={loading} />
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>SUB-TYPE *</Text>
      <SearchSelect value={subId} options={opts(subs)} onChange={(v) => setSubId(String(v || ''))} placeholder={typeId ? (subs.length ? 'Choose a sub-type' : 'No sub-types for this type') : 'Choose a type first'} accent={ACCENT} disabled={!typeId || !subs.length} />
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>PROBLEM (OPTIONAL)</Text>
      <TextInput
        style={[sharedStyles.input, { height: 90, paddingTop: 10, textAlignVertical: 'top' }]}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={1000}
        placeholder="e.g. Internet not working since morning"
        placeholderTextColor="#94a3b8"
      />
    </ModalShell>
  );
};

const Step = ({ icon, color, title, time, by, to, notes, duration, last }) => (
  <View style={{ flexDirection: 'row', gap: 12 }}>
    <View style={{ alignItems: 'center' }}>
      <View style={[s.stepDot, { backgroundColor: color }]}><Feather name={icon} size={12} color="#fff" /></View>
      {!last ? <View style={s.stepLine} /> : null}
    </View>
    <View style={{ flex: 1, paddingBottom: last ? 0 : 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textMain }}>{title}</Text>
        <Text style={s.sub}>{clean(time)}</Text>
      </View>
      {by || to ? (
        <Text style={s.sub}>
          {by ? `by ${by}` : ''}{by && to ? ' · ' : ''}{to ? `to ${to}` : ''}{duration ? ` · after ${clean(duration)}` : ''}
        </Text>
      ) : duration ? <Text style={s.sub}>after {clean(duration)}</Text> : null}
      {notes ? <Text style={s.notes}>{notes}</Text> : null}
    </View>
  </View>
);

/** One ticket: details, timeline and the actions allowed now. */
export const TicketModal = ({ visible, opId, ticketId, user, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // assign | resolve | close | reopen
  const [notes, setNotes] = useState('');
  const [depts, setDepts] = useState([]);
  const [dept, setDept] = useState('');
  const [users, setUsers] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError('');
    const res = await OneBssApi.complaintTicket(opId, ticketId);
    setLoading(false);
    if (!ok(res)) {
      setData(null);
      return setError(errOf(res, 'Could not load the ticket'));
    }
    setData(res.data);
  }, [opId, ticketId]);

  useEffect(() => {
    if (visible) {
      setMode(null);
      setData(null);
      load();
    }
  }, [visible, load]);

  const startMode = async (m) => {
    setMode(m);
    setNotes('');
    if (m === 'assign') {
      setDept('');
      setAssignee('');
      setUsers([]);
      const res = await OneBssApi.complaintsMeta(opId, 'departments');
      if (!ok(res)) return toast.error(errOf(res, 'Could not load departments'));
      setDepts(res.data.results || []);
    }
  };

  useEffect(() => {
    setAssignee('');
    setUsers([]);
    if (!dept) return;
    (async () => {
      const res = await OneBssApi.complaintsMeta(opId, 'users', { department_id: dept });
      if (!ok(res)) return toast.error(errOf(res, 'Could not load people'));
      const list = res.data.results || [];
      setUsers(list);
      if (list.length === 1) setAssignee(String(list[0].id));
    })();
  }, [dept, opId]);

  const submit = async () => {
    const payload = { complaint_id: Number(ticketId) };
    if (mode === 'assign') {
      if (!dept || !assignee) return toast.warning('Choose the department and the person');
      payload.department_id = Number(dept);
      payload.assigned_user_id = Number(assignee);
    }
    if (mode === 'resolve' && !notes.trim()) return toast.warning('Write what was done to resolve it');
    if (mode === 'resolve' || mode === 'close') payload.notes = notes.trim();
    setBusy(true);
    const res = await OneBssApi.complaintAction(opId, mode, payload);
    setBusy(false);
    if (!ok(res)) return toast.error(errOf(res, 'Could not update the ticket'));
    toast.success(res.data.message || 'Updated');
    setMode(null);
    await load();
    onChanged?.();
  };

  const t = data?.ticket || {};
  const acts = data?.actions || {};
  const allowed = {
    assign: acts.assign && can(user, 'support.complaint_assign'),
    resolve: acts.resolve && can(user, 'support.complaint_resolve'),
    close: acts.close && can(user, 'support.complaint_close'),
    reopen: acts.reopen && can(user, 'support.complaint_reopen'),
  };
  const ACTIONS = [
    ['assign', clean(t.assign_to) ? 'Reassign' : 'Assign', 'user-check', '#2563eb'],
    ['resolve', 'Resolve', 'check-circle', '#059669'],
    ['reopen', 'Reopen', 'rotate-ccw', '#7c3aed'],
    ['close', 'Close', 'lock', '#475569'],
  ].filter(([k]) => allowed[k]);
  const info = [
    ['Account', t.account_number ? `#${t.account_number}` : ''],
    ['Mobile', t.mobile],
    ['Account status', t.account_status],
    ['Online', t.online_status],
    ['Branch', t.branch],
    ['Area', [t.area, t.colony].map(clean).filter(Boolean).join(', ')],
    ['Address', t.installation_address],
    ['Source', t.source],
    ['Raised by', t.created_by],
    ['Open for', t.ticket_time],
  ].filter(([, v]) => clean(v));

  return (
    <ModalShell
      visible={visible}
      title={`Ticket #${ticketId || ''}`}
      icon="alert-circle"
      iconColor={ACCENT}
      onClose={onClose}
      busy={busy}
      maxWidth={720}
      footer={
        mode ? (
          <>
            <Btn label="Back" kind="ghost" onPress={() => setMode(null)} disabled={busy} />
            <Btn
              label={mode === 'assign' ? 'Assign' : mode === 'resolve' ? 'Mark resolved' : mode === 'close' ? 'Close ticket' : 'Reopen ticket'}
              onPress={submit}
              loading={busy}
            />
          </>
        ) : (
          <>
            <Btn label="Refresh" icon="refresh-cw" kind="ghost" onPress={load} disabled={loading} />
            <Btn label="Done" onPress={onClose} />
          </>
        )
      }
    >
      {error ? <Note tone="error" text={error} /> : null}
      {loading && !data ? <ActivityIndicator color={ACCENT} style={{ marginVertical: 30 }} /> : null}
      {data ? (
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textMain }}>{clean(t.username) || '—'}</Text>
              <Text style={s.sub}>{[t.type, t.sub_type].map(clean).filter(Boolean).join(' › ') || 'Complaint'}</Text>
            </View>
            <StatusPill status={t.status} text={t.status_text} />
          </View>

          <View style={s.infoGrid}>
            {info.map(([k, v]) => (
              <View key={k} style={s.infoCell}>
                <Text style={s.infoKey}>{k.toUpperCase()}</Text>
                <Text style={s.infoVal} selectable>{clean(v)}</Text>
              </View>
            ))}
          </View>

          {!mode && ACTIONS.length ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {ACTIONS.map(([k, label, icon, color]) => (
                <TouchableOpacity key={k} style={[s.actBtn, { borderColor: color }]} onPress={() => startMode(k)}>
                  <Feather name={icon} size={14} color={color} />
                  <Text style={[s.actText, { color }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {mode ? (
            <View style={s.modeBox}>
              {mode === 'assign' ? (
                <>
                  <Text style={sharedStyles.label}>DEPARTMENT *</Text>
                  <SearchSelect value={dept} options={depts.map((d) => ({ value: String(d.id), label: d.name }))} onChange={(v) => setDept(String(v || ''))} placeholder="Choose a department" accent={ACCENT} />
                  <Text style={[sharedStyles.label, { marginTop: 12 }]}>ASSIGN TO *</Text>
                  <SearchSelect value={assignee} options={users.map((u) => ({ value: String(u.id), label: u.name }))} onChange={(v) => setAssignee(String(v || ''))} placeholder={dept ? (users.length ? 'Choose a person' : 'Nobody in this department') : 'Choose a department first'} accent={ACCENT} disabled={!dept || !users.length} />
                </>
              ) : mode === 'reopen' ? (
                <Text style={{ fontSize: 13, color: COLORS.textMain }}>The ticket goes back to <Text style={{ fontWeight: '800' }}>Reopened</Text> and can be assigned and resolved again.</Text>
              ) : (
                <>
                  <Text style={sharedStyles.label}>{mode === 'resolve' ? 'WHAT WAS DONE *' : 'CLOSING NOTE (OPTIONAL)'}</Text>
                  <TextInput
                    style={[sharedStyles.input, { height: 90, paddingTop: 10, textAlignVertical: 'top' }]}
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    maxLength={1000}
                    placeholder={mode === 'resolve' ? 'e.g. Router rebooted; connectivity restored' : 'e.g. Confirmed working with customer'}
                    placeholderTextColor="#94a3b8"
                    autoFocus
                  />
                </>
              )}
            </View>
          ) : null}

          <View style={s.timeline}>
            <Text style={[sharedStyles.label, { marginBottom: 10 }]}>TIMELINE</Text>
            {(() => {
              const steps = [
                { icon: 'alert-circle', color: '#2563eb', title: 'Opened', time: t.open_time, by: clean(t.created_by), notes: clean(t.open_notes) },
                clean(t.assigned_time) ? { icon: 'user-check', color: '#d97706', title: 'Assigned', time: t.assigned_time, by: clean(t.assigned_by), to: clean(t.assign_to), notes: clean(t.assigned_notes), duration: t.assigned_duration } : null,
                clean(t.resolved_time) ? { icon: 'check-circle', color: '#059669', title: 'Resolved', time: t.resolved_time, by: clean(t.resolved_by), notes: clean(t.resolved_notes), duration: t.resolved_duration } : null,
                clean(t.closed_time) ? { icon: 'lock', color: '#475569', title: 'Closed', time: t.closed_time, by: clean(t.closed_by), notes: clean(t.closed_notes) } : null,
              ].filter(Boolean);
              return steps.map((st, i) => <Step key={st.title} {...st} last={i === steps.length - 1} />);
            })()}
          </View>
        </View>
      ) : null}
    </ModalShell>
  );
};

/** Customer page › Complaints tab: that account's tickets + raise one for it. */
export const CustomerComplaintsPanel = ({ internetId, username, user }) => {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null); // { acc_id, operator_id }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [raise, setRaise] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await OneBssApi.customerComplaints(internetId);
    setLoading(false);
    if (!ok(res)) return setError(errOf(res, 'Could not load complaints'));
    setRows(res.data.complaints || []);
    setMeta({ acc_id: res.data.acc_id, operator_id: res.data.operator_id });
  }, [internetId]);

  useEffect(() => { load(); }, [load]);

  const opId = user?.role === 'operator' ? '' : meta?.operator_id || '';
  const mayAdd = can(user, 'support.complaints', 'add') && !!meta?.acc_id;
  const preset = meta?.acc_id ? { id: meta.acc_id, name: username || `#${meta.acc_id}` } : null;

  return (
    <View style={s.card}>
      <View style={s.panelHead}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textMain }}>Complaints</Text>
          <Text style={s.sub}>Tickets of {username || 'this account'}{meta?.acc_id ? ` · account #${meta.acc_id}` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.iconBtn} onPress={load} disabled={loading} accessibilityLabel="Refresh">
            {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="refresh-cw" size={14} color={ACCENT} />}
          </TouchableOpacity>
          {mayAdd ? (
            <TouchableOpacity style={s.primaryBtn} onPress={() => setRaise(true)}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={s.primaryBtnText}>Raise complaint</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {error ? <View style={{ padding: 12 }}><Note tone="error" text={error} /></View> : null}
      {rows.map((r) => (
        <TouchableOpacity key={r.id} style={s.row} onPress={() => setOpenId(r.id)}>
          <View style={{ width: 70 }}><Text style={[s.td, { fontWeight: '800' }]}>#{r.id}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.td, { fontWeight: '600' }]} numberOfLines={1}>{[r.ctype_name, r.complaint_sub_type].map(clean).filter(Boolean).join(' › ') || 'Complaint'}</Text>
            <Text style={s.sub} numberOfLines={1}>{clean(r.medium)}{clean(r.assigned_user) ? ` · ${clean(r.department_name)} › ${clean(r.assigned_user)}` : ''}</Text>
          </View>
          <StatusPill status={r.status} text={r.status_text} />
          <Feather name="chevron-right" size={16} color="#cbd5e1" />
        </TouchableOpacity>
      ))}
      {!loading && !error && !rows.length ? (
        <View style={{ padding: 26, alignItems: 'center', gap: 6 }}>
          <Feather name="smile" size={22} color="#94a3b8" />
          <Text style={s.sub}>No complaints from this customer.</Text>
        </View>
      ) : null}

      <TicketModal visible={!!openId} opId={opId} ticketId={openId} user={user} onClose={() => setOpenId(null)} onChanged={load} />
      <RaiseComplaintModal
        visible={raise}
        opId={opId}
        user={user}
        presetCustomer={preset}
        onClose={() => setRaise(false)}
        onDone={(id) => { setRaise(false); load(); if (id) setOpenId(id); }}
      />
    </View>
  );
};

export const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  td: { fontSize: 13, color: COLORS.textMain },
  notes: { marginTop: 6, fontSize: 12.5, color: '#334155', backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dropList: { marginTop: 4, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#fff' },
  dropItem: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, width: 2, backgroundColor: '#e2e8f0', marginVertical: 2 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoCell: { minWidth: 150, flexGrow: 1, flexBasis: 150, padding: 8, borderRadius: 8, backgroundColor: '#f8fafc' },
  infoKey: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.4 },
  infoVal: { fontSize: 13, color: COLORS.textMain, marginTop: 2 },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, backgroundColor: '#fff' },
  actText: { fontSize: 13, fontWeight: '700' },
  modeBox: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#fecdd3', backgroundColor: '#fff1f2' },
  timeline: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iconBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 8, backgroundColor: ACCENT },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
});
