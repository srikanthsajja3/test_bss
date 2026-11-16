import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { can } from '../services/staffAccess';
import { ModalShell, Btn, Note, SearchSelect, sharedStyles, isSuperAdmin } from '../components/internet/shared';
import { CustomerPicker } from '../components/support/ComplaintParts';

/**
 * Leads (prospective customers) — kept in RADIUS (support/leads.php).
 * RADIUS returns every lead at once (no paging / search), so both happen here.
 */
const ACCENT = '#0d9488';
const PAGE = 50;
const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());
const BS = {
  primary: ['#1d4ed8', '#dbeafe'], success: ['#047857', '#d1fae5'], warning: ['#b45309', '#fef3c7'],
  danger: ['#b91c1c', '#fee2e2'], info: ['#0369a1', '#e0f2fe'], secondary: ['#475569', '#e2e8f0'], dark: ['#0f172a', '#e2e8f0'],
};
const StagePill = ({ stage, color }) => {
  const [fg, bg] = BS[clean(color)] || BS.secondary;
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color: fg }]}>{(clean(stage) || '—').toUpperCase()}</Text>
    </View>
  );
};

const EMPTY = {
  branch_id: '', connection_type: '1', customer_name: '', mobile: '', email: '', address: '', billing_address: '', same_billing: true,
  lead_source: '', referrer: null, notes: '', lead_description: '', lat: '', lng: '', alternate_mobile: '', alternate_email: '',
  area_id: '', colony_id: '', building_id: '', floor_id: '',
};

const AddLeadModal = ({ visible, opId, ownPartnerId, referralSource, onClose, onDone }) => {
  const [f, setF] = useState(EMPTY);
  const [sources, setSources] = useState([]);
  const [branches, setBranches] = useState([]);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!visible) return;
    setF(EMPTY);
    setMore(false);
    (async () => {
      const res = await OneBssApi.leadSources(opId);
      if (res.ok && res.data?.success !== false) setSources(res.data.results || []);
      else toast.error(res.data?.message || 'Could not load lead sources');
      const pid = opId || ownPartnerId;
      if (pid) {
        const br = await OneBssApi.getRadiusBranches(pid);
        const list = br.ok ? (br.data?.branches || []).filter((b) => b.selected !== false) : [];
        const ids = list.length ? list : (br.data?.selected || []).map((id) => ({ id, name: `Branch ${id}` }));
        setBranches(ids);
        if (ids.length === 1) setF((x) => ({ ...x, branch_id: String(ids[0].id) }));
      }
    })();
  }, [visible, opId, ownPartnerId]);

  const searchCustomers = useCallback((text) => OneBssApi.leadCustomers(opId, text), [opId]);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return toast.info('Location is not available in this browser');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })); },
      () => { setLocating(false); toast.warning('Could not get the location'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const save = async () => {
    if (f.customer_name.trim().length < 2) return toast.warning('Enter the customer name');
    if (!/^[6-9]\d{9}$/.test(f.mobile.trim())) return toast.warning('Enter a valid 10-digit mobile number');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.warning('Enter a valid email');
    if (!f.address.trim()) return toast.warning('Enter the installation address');
    if (!f.lead_source) return toast.warning('Choose the lead source');
    if (Number(f.lead_source) === referralSource && !f.referrer) return toast.warning('Choose the customer who referred this lead');
    if (branches.length > 1 && !f.branch_id) return toast.warning('Choose the branch');
    if (!(Number(f.connection_type) > 0)) return toast.warning('Enter the connection type');
    setSaving(true);
    const payload = {
      branch_id: f.branch_id, connection_type: Number(f.connection_type), customer_name: f.customer_name.trim(), mobile: f.mobile.trim(),
      email: f.email.trim(), address: f.address.trim(), billing_address: (f.same_billing ? f.address : f.billing_address).trim(),
      lead_source: Number(f.lead_source), notes: f.notes.trim(), lead_description: f.lead_description.trim(), lat: f.lat.trim(), lng: f.lng.trim(),
      alternate_mobile: f.alternate_mobile.trim(), alternate_email: f.alternate_email.trim(),
      area_id: f.area_id.trim(), colony_id: f.colony_id.trim(), building_id: f.building_id.trim(), floor_id: f.floor_id.trim(),
      ...(f.referrer ? { referrar_customer_id: f.referrer.id } : {}),
    };
    const res = await OneBssApi.addLead(opId, payload);
    setSaving(false);
    if (!res.ok || res.data?.success === false) return toast.error(res.data?.message || 'Could not add the lead');
    toast.success(res.data.message || 'Lead added');
    onDone?.();
  };

  const Field = ({ label, k, ph, kb, half }) => (
    <View style={[half ? s.half : null]}>
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>{label}</Text>
      <TextInput style={sharedStyles.input} value={f[k]} onChangeText={set(k)} placeholder={ph} placeholderTextColor="#94a3b8" keyboardType={kb} autoCapitalize={kb === 'email-address' ? 'none' : 'sentences'} />
    </View>
  );

  return (
    <ModalShell
      visible={visible}
      title="Add lead"
      icon="user-plus"
      iconColor={ACCENT}
      onClose={onClose}
      busy={saving}
      maxWidth={640}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Add lead" onPress={save} loading={saving} />
        </>
      }
    >
      <View style={s.grid}>
        <View style={s.half}>
          <Text style={sharedStyles.label}>CUSTOMER NAME *</Text>
          <TextInput style={sharedStyles.input} value={f.customer_name} onChangeText={set('customer_name')} placeholder="e.g. Ravi Kumar" placeholderTextColor="#94a3b8" />
        </View>
        <View style={s.half}>
          <Text style={sharedStyles.label}>MOBILE *</Text>
          <TextInput style={sharedStyles.input} value={f.mobile} onChangeText={(v) => set('mobile')(v.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" placeholderTextColor="#94a3b8" keyboardType="phone-pad" />
        </View>
      </View>
      <View style={s.grid}>
        {Field({ label: 'EMAIL *', k: 'email', ph: 'name@example.com', kb: 'email-address', half: true })}
        <View style={s.half}>
          <Text style={[sharedStyles.label, { marginTop: 12 }]}>LEAD SOURCE *</Text>
          <SearchSelect value={f.lead_source} options={sources.map((x) => ({ value: String(x.id), label: x.name }))} onChange={(v) => setF((x) => ({ ...x, lead_source: String(v || ''), referrer: null }))} placeholder="Choose a source" accent={ACCENT} />
        </View>
      </View>
      {Number(f.lead_source) === referralSource ? (
        <>
          <Text style={[sharedStyles.label, { marginTop: 12 }]}>REFERRED BY (CUSTOMER) *</Text>
          <CustomerPicker value={f.referrer} onChange={set('referrer')} search={searchCustomers} />
        </>
      ) : null}
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>INSTALLATION ADDRESS *</Text>
      <TextInput style={[sharedStyles.input, { height: 64, paddingTop: 8, textAlignVertical: 'top' }]} value={f.address} onChangeText={set('address')} multiline placeholder="House no, street, area, city" placeholderTextColor="#94a3b8" />
      <TouchableOpacity style={s.check} onPress={() => set('same_billing')(!f.same_billing)}>
        <Feather name={f.same_billing ? 'check-square' : 'square'} size={15} color={f.same_billing ? ACCENT : '#94a3b8'} />
        <Text style={s.checkText}>Billing address is the same</Text>
      </TouchableOpacity>
      {!f.same_billing ? (
        <TextInput style={[sharedStyles.input, { height: 64, paddingTop: 8, textAlignVertical: 'top', marginTop: 6 }]} value={f.billing_address} onChangeText={set('billing_address')} multiline placeholder="Billing address" placeholderTextColor="#94a3b8" />
      ) : null}
      <View style={s.grid}>
        {branches.length > 1 ? (
          <View style={s.half}>
            <Text style={[sharedStyles.label, { marginTop: 12 }]}>BRANCH *</Text>
            <SearchSelect value={f.branch_id} options={branches.map((b) => ({ value: String(b.id), label: b.name || `Branch ${b.id}`, sub: `#${b.id}` }))} onChange={(v) => set('branch_id')(String(v || ''))} placeholder="Choose a branch" accent={ACCENT} />
          </View>
        ) : null}
        <View style={s.half}>
          <Text style={[sharedStyles.label, { marginTop: 12 }]}>CONNECTION TYPE ID *</Text>
          <TextInput style={sharedStyles.input} value={f.connection_type} onChangeText={(v) => set('connection_type')(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="1" placeholderTextColor="#94a3b8" />
        </View>
      </View>

      <TouchableOpacity style={[s.check, { marginTop: 14 }]} onPress={() => setMore((m) => !m)}>
        <Feather name={more ? 'chevron-down' : 'chevron-right'} size={15} color={ACCENT} />
        <Text style={[s.checkText, { color: ACCENT, fontWeight: '700' }]}>More details (optional)</Text>
      </TouchableOpacity>
      {more ? (
        <>
          <View style={s.grid}>
            {Field({ label: 'ALTERNATE MOBILE', k: 'alternate_mobile', ph: '10-digit mobile', kb: 'phone-pad', half: true })}
            {Field({ label: 'ALTERNATE EMAIL', k: 'alternate_email', ph: 'name@example.com', kb: 'email-address', half: true })}
          </View>
          {Field({ label: 'WHAT THEY WANT', k: 'lead_description', ph: 'e.g. Interested in 100 Mbps plan' })}
          {Field({ label: 'NOTES', k: 'notes', ph: 'e.g. Call back after 6 PM' })}
          <View style={[s.grid, { alignItems: 'flex-end' }]}>
            {Field({ label: 'LATITUDE', k: 'lat', ph: '17.4399', kb: 'decimal-pad', half: true })}
            {Field({ label: 'LONGITUDE', k: 'lng', ph: '78.4436', kb: 'decimal-pad', half: true })}
          </View>
          <TouchableOpacity style={[s.check, { marginTop: 8 }]} onPress={locate} disabled={locating}>
            {locating ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="crosshair" size={14} color={ACCENT} />}
            <Text style={[s.checkText, { color: ACCENT, fontWeight: '700' }]}>Use my current location</Text>
          </TouchableOpacity>
          <View style={s.grid}>
            {['area_id', 'colony_id', 'building_id', 'floor_id'].map((k) => (
              <View key={k} style={s.quarter}>
                <Text style={[sharedStyles.label, { marginTop: 12 }]}>{k.replace('_id', '').toUpperCase()} ID</Text>
                <TextInput style={sharedStyles.input} value={f[k]} onChangeText={(v) => set(k)(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholderTextColor="#94a3b8" />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ModalShell>
  );
};

export const LeadsScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSuper = isSuperAdmin(user);
  const isOperator = user?.role === 'operator';

  const [ctx, setCtx] = useState(null);
  const [opId, setOpId] = useState('');
  const [leads, setLeads] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await OneBssApi.leadsContext(opId);
      setCtx(res.ok ? res.data : { operators: [], error: res.data?.message || 'Could not load' });
    })();
  }, [opId, refreshSignal]);

  const load = useCallback(async () => {
    if (!ctx || ctx.needs_operator || ctx.error) return;
    setLoading(true);
    setError('');
    const res = await OneBssApi.leadsList(opId);
    setLoading(false);
    if (!res.ok || res.data?.success === false) {
      setLeads(null);
      return setError(res.data?.message || `Could not load leads (HTTP ${res.status}).`);
    }
    setLeads(res.data.leads || []);
  }, [ctx, opId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => setShown(PAGE), [search, stage, opId]);

  const opOptions = useMemo(() => [
    ...(isSuper ? [{ value: '', label: 'All operators (super admin view)', sub: 'Every lead · super admin RADIUS login' }] : []),
    ...((ctx?.operators) || []).map((o) => ({ value: String(o.partner_id), label: o.name, sub: `#${o.partner_id}` })),
  ], [ctx, isSuper]);

  const stages = useMemo(() => {
    const m = new Map();
    (leads || []).forEach((l) => { const k = clean(l.lead_stage); if (k) m.set(k, { n: (m.get(k)?.n || 0) + 1, color: l.status_color }); });
    return [...m.entries()];
  }, [leads]);
  const needle = search.trim().toLowerCase();
  const filtered = (leads || []).filter((l) => (!stage || clean(l.lead_stage) === stage)
    && (!needle || [l.id, l.customer_name, l.mobile, l.partner_name, l.branch_name, l.lead_stage].some((v) => clean(v).toLowerCase().includes(needle))));
  const rows = filtered.slice(0, shown);
  const mayAdd = can(user, 'support.leads', 'add') && !ctx?.needs_operator && !ctx?.error;
  const addNeedsOp = !isOperator && !opId;
  const mapUrl = (l) => `https://www.google.com/maps?q=${encodeURIComponent(`${l.latitude},${l.longitude}`)}`;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 10, flex: 1, alignItems: isMobile ? 'stretch' : 'center' }}>
            {!isOperator ? (
              <View style={{ width: isMobile ? '100%' : 300 }}>
                <SearchSelect value={opId} options={opOptions} onChange={(v) => { setOpId(String(v || '')); setLeads(null); setStage(''); }} placeholder={isSuper ? 'All operators' : 'Choose an operator'} searchPlaceholder="Search operators…" accent={ACCENT} />
              </View>
            ) : null}
            <View style={[s.search, isMobile && { maxWidth: '100%' }]}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Name, mobile, branch…" placeholderTextColor="#94a3b8" />
              {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.iconBtn} onPress={load} disabled={loading} accessibilityLabel="Refresh">
              {loading ? <ActivityIndicator size="small" color={ACCENT} /> : <Feather name="refresh-cw" size={14} color={ACCENT} />}
            </TouchableOpacity>
            {mayAdd ? (
              <TouchableOpacity
                style={[s.primaryBtn, addNeedsOp && { opacity: 0.55 }]}
                onPress={() => (addNeedsOp ? toast.info('Choose the operator this lead is for first') : setAdding(true))}
              >
                <Feather name="plus" size={14} color="#fff" />
                <Text style={s.primaryBtnText}>Add lead</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {stages.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {[['', { n: (leads || []).length }], ...stages].map(([k, v]) => (
              <TouchableOpacity key={k || 'all'} style={[s.chip, stage === k && s.chipOn]} onPress={() => setStage(k)}>
                <Text style={[s.chipText, stage === k && { color: '#fff' }]}>{k || 'All'} · {v.n}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {ctx?.needs_operator ? <Note tone="info" text="Choose one of your operators to see its leads." /> : null}
        {ctx?.error && !ctx?.needs_operator ? <Note tone="error" text={ctx.error} /> : null}
        {error ? <Note tone="error" text={error} /> : null}

        {leads || loading ? (
          <View style={s.card}>
            {loading && !leads ? (
              <ActivityIndicator color={ACCENT} style={{ marginVertical: 30 }} />
            ) : isMobile ? (
              <View style={{ padding: 10, gap: 8 }}>
                {rows.map((l) => (
                  <View key={l.id} style={s.mCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[s.td, { fontWeight: '800' }]}>{clean(l.customer_name)}</Text>
                      <StagePill stage={l.lead_stage} color={l.status_color} />
                    </View>
                    <Text style={s.sub}>{clean(l.mobile)} · {clean(l.lead_started_date)}</Text>
                    <Text style={s.sub}>{[l.partner_name, l.branch_name].map(clean).filter(Boolean).join(' › ')}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
                <View style={{ minWidth: 960, flexGrow: 1, opacity: loading ? 0.5 : 1 }}>
                  <View style={[s.tr, s.thRow]}>
                    <Text style={[s.th, { width: 70 }]}>Lead</Text>
                    <Text style={[s.th, { width: 220 }]}>Customer</Text>
                    <Text style={[s.th, { width: 180 }]}>Started</Text>
                    <Text style={[s.th, { flex: 1, minWidth: 200 }]}>Partner › Branch</Text>
                    <Text style={[s.th, { width: 170 }]}>Stage</Text>
                    <Text style={[s.th, { width: 60 }]}>Map</Text>
                  </View>
                  {rows.map((l) => (
                    <View key={l.id} style={s.tr}>
                      <Text style={[s.td, { width: 70, fontWeight: '800' }]}>#{l.id}</Text>
                      <View style={{ width: 220, paddingRight: 8 }}>
                        <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{clean(l.customer_name) || '—'}</Text>
                        <Text style={s.sub} selectable>{clean(l.mobile)}</Text>
                      </View>
                      <Text style={[s.td, { width: 180 }]}>{clean(l.lead_started_date)}</Text>
                      <View style={{ flex: 1, minWidth: 200, paddingRight: 8 }}>
                        <Text style={s.td} numberOfLines={1}>{clean(l.partner_name) || '—'}</Text>
                        {clean(l.branch_name) ? <Text style={s.sub} numberOfLines={1}>{clean(l.branch_name)}</Text> : null}
                      </View>
                      <View style={{ width: 170 }}><StagePill stage={l.lead_stage} color={l.status_color} /></View>
                      <View style={{ width: 60 }}>
                        {clean(l.latitude) && clean(l.longitude) ? (
                          <TouchableOpacity onPress={() => Linking.openURL(mapUrl(l))} accessibilityLabel="Open in maps">
                            <Feather name="map-pin" size={15} color={ACCENT} />
                          </TouchableOpacity>
                        ) : <Text style={s.sub}>—</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
            {leads && !filtered.length ? (
              <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                <Feather name="inbox" size={22} color="#94a3b8" />
                <Text style={s.sub}>{leads.length ? 'No lead matches.' : 'No leads yet.'}</Text>
              </View>
            ) : null}
            {leads && filtered.length ? (
              <View style={s.foot}>
                <Text style={s.sub}>Showing {rows.length} of {filtered.length}{filtered.length !== leads.length ? ` (${leads.length} in all)` : ''} · newest first</Text>
                {rows.length < filtered.length ? (
                  <TouchableOpacity style={s.moreBtn} onPress={() => setShown((n) => n + PAGE)}>
                    <Text style={s.moreText}>Show {Math.min(PAGE, filtered.length - rows.length)} more</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <AddLeadModal
        visible={adding}
        opId={opId}
        ownPartnerId={isOperator ? user?.partner_id : ''}
        referralSource={Number(ctx?.referral_source || 4)}
        onClose={() => setAdding(false)}
        onDone={() => { setAdding(false); load(); }}
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
  chip: { paddingHorizontal: 12, height: 32, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  mCard: { borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, padding: 10 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, flexWrap: 'wrap', gap: 8 },
  moreBtn: { paddingHorizontal: 12, height: 32, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: '#99f6e4' },
  moreText: { fontSize: 12, fontWeight: '700', color: ACCENT },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 },
  half: { flexGrow: 1, flexBasis: 220 },
  quarter: { flexGrow: 1, flexBasis: 110 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  checkText: { fontSize: 12.5, color: '#334155' },
});
