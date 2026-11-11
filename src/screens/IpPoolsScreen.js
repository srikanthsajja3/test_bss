import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { ModalShell, Btn, Note, Dropdown, SearchSelect, sharedStyles } from '../components/internet/shared';
import { s, NasStatusPill } from './NasScreen';

/**
 * Super admin › Networking › IP Pools (networking/ip_pools.php, networking/pool_operators.php).
 * A pool is an IPv4 range on one NAS. Pools on the same NAS can't overlap. A pool is given to
 * one or more operators; their customers then pick a free IP from it (Networking tab →
 * Static IP / IP Login / IP Bind). An IP belongs to one customer only.
 */
const INDIGO = '#4f46e5';
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const ipNum = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
const EMPTY = { ippool_id: null, nas_id: '', ip_start: '', ip_end: '', partner_ids: [] };
const opName = (p) => `${p.partner_name || p.company_name || `#${p.partner_id}`}${p.status === 'disabled' ? ' (disabled)' : ''}`;

const UsageBar = ({ used, total }) => {
  const pct = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : INDIGO;
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: '#eef2ff', overflow: 'hidden', marginTop: 4, width: 120 }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
};

export const IpPoolsScreen = ({ refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState([]);
  const [nasList, setNasList] = useState([]);
  const [operators, setOperators] = useState([]);
  const [error, setError] = useState('');
  const [nasFilter, setNasFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState(null);
  const [opSearch, setOpSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(null); // 'del:<id>' | 'unmap:<ipopid>' | 'map'
  const [mapFor, setMapFor] = useState(null); // pool row
  const [mapPick, setMapPick] = useState('');
  const [detail, setDetail] = useState(null); // { loading } | data

  const load = useCallback(async () => {
    setLoading(true);
    const [p, n] = await Promise.all([OneBssApi.getIpPools(), OneBssApi.getNasList()]);
    setLoading(false);
    if (!p.ok) {
      setError(p.data?.message || `Could not load IP pools (HTTP ${p.status}).`);
      return;
    }
    setError('');
    setPools(Array.isArray(p.data?.data) ? p.data.data : []);
    if (n.ok) setNasList(Array.isArray(n.data?.data) ? n.data.data : []);
    setOperators(Array.isArray(p.data?.operators) ? p.data.operators : []);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const nasById = useMemo(() => Object.fromEntries(nasList.map((n) => [n.nas_id, n])), [nasList]);
  const qx = search.trim().toLowerCase();
  const shown = pools.filter((p) => (nasFilter === 'all' || p.nas_id === nasFilter)
    && (!qx || [p.ip_start, p.ip_end, p.nas_name, p.nas_ip, p.area, ...(p.operators || []).map((o) => o.name)].join(' ').toLowerCase().includes(qx)));

  const totals = pools.reduce((a, p) => ({ total: a.total + p.total, assigned: a.assigned + p.assigned }), { total: 0, assigned: 0 });
  const tiles = [
    { label: 'IP pools', value: pools.length, color: '#0f172a', icon: 'layers' },
    { label: 'Total IPs', value: totals.total.toLocaleString('en-IN'), color: INDIGO, icon: 'hash' },
    { label: 'Given to customers', value: totals.assigned.toLocaleString('en-IN'), color: '#b45309', icon: 'user-check' },
    { label: 'Free', value: (totals.total - totals.assigned).toLocaleString('en-IN'), color: '#047857', icon: 'check-circle' },
  ];

  // ---- add / edit ----
  const rangeError = (() => {
    if (!form) return '';
    const a = form.ip_start.trim();
    const b = form.ip_end.trim();
    if (!a || !b) return '';
    if (!IPV4.test(a)) return 'Start IP is not a valid IPv4 address';
    if (!IPV4.test(b)) return 'End IP is not a valid IPv4 address';
    if (ipNum(b) < ipNum(a)) return 'End IP must be the same as or after the start IP';
    if (ipNum(b) - ipNum(a) + 1 > 65536) return 'A pool can hold at most 65,536 addresses';
    return '';
  })();
  const rangeSize = form && !rangeError && IPV4.test(form.ip_start.trim()) && IPV4.test(form.ip_end.trim())
    ? ipNum(form.ip_end.trim()) - ipNum(form.ip_start.trim()) + 1 : 0;

  const save = async () => {
    if (!form.nas_id) return toast.warning('Choose a NAS');
    if (!form.ip_start.trim() || !form.ip_end.trim()) return toast.warning('Enter the start and end IP');
    if (rangeError) return toast.warning(rangeError);
    setSaving(true);
    const payload = { ippool_id: form.ippool_id, nas_id: form.nas_id, ip_start: form.ip_start.trim(), ip_end: form.ip_end.trim(), partner_ids: form.partner_ids };
    const res = form.ippool_id ? await OneBssApi.updateIpPool(payload) : await OneBssApi.createIpPool(payload);
    setSaving(false);
    if (!res.ok) return toast.error(res.data?.message || 'Could not save the pool');
    toast.success(res.data?.message || 'Saved');
    setForm(null);
    load();
  };

  const remove = async (p) => {
    setBusy(`del:${p.ippool_id}`);
    const res = await OneBssApi.deleteIpPool(p.ippool_id);
    setBusy(null);
    setConfirmDel(null);
    if (!res.ok) return toast.error(res.data?.message || 'Could not delete the pool');
    toast.success(res.data?.message || 'Pool deleted');
    load();
  };

  // ---- operators on a pool ----
  const unmap = async (o) => {
    setBusy(`unmap:${o.ipopid}`);
    const res = await OneBssApi.removePoolOperator(o.ipopid);
    setBusy(null);
    if (!res.ok) return toast.error(res.data?.message || 'Could not remove the operator');
    toast.success(res.data?.message || 'Operator removed');
    load();
  };
  const map = async () => {
    if (!mapPick) return toast.warning('Choose an operator');
    setBusy('map');
    const res = await OneBssApi.addPoolOperator(mapFor.ippool_id, mapPick);
    setBusy(null);
    if (!res.ok) return toast.error(res.data?.message || 'Could not give the pool');
    toast.success(res.data?.message || 'Pool given to operator');
    setMapFor(null);
    setMapPick('');
    load();
  };

  const openDetail = async (p) => {
    setDetail({ loading: true, ...p });
    const res = await OneBssApi.getIpPoolDetail(p.ippool_id);
    if (!res.ok) {
      setDetail(null);
      return toast.error(res.data?.message || 'Could not load the pool');
    }
    setDetail(res.data.data);
  };

  const opsForForm = operators.filter((o) => !opSearch.trim() || opName(o).toLowerCase().includes(opSearch.trim().toLowerCase()) || String(o.partner_id).includes(opSearch.trim()));
  const togglePid = (pid) => setForm((f) => ({ ...f, partner_ids: f.partner_ids.includes(pid) ? f.partner_ids.filter((x) => x !== pid) : [...f.partner_ids, pid] }));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {error ? <Note tone="error" text={error} /> : null}

        <View style={s.tiles}>
          {tiles.map((t) => (
            <View key={t.label} style={[s.tile, isMobile && { minWidth: '46%' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name={t.icon} size={13} color={t.color} />
                <Text style={[s.tileLabel, { color: t.color }]}>{t.label}</Text>
              </View>
              <Text style={[s.tileValue, { color: t.color }]}>{loading && !pools.length ? '…' : t.value}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[{ id: 'all', label: 'All NAS' }, ...nasList.map((n) => ({ id: n.nas_id, label: `${n.nas_name || `NAS #${n.nas_id}`} · ${n.nas_ip}` }))].map((c) => (
            <TouchableOpacity key={String(c.id)} style={[chip.base, nasFilter === c.id && chip.on]} onPress={() => setNasFilter(c.id)}>
              <Text style={[chip.text, nasFilter === c.id && { color: '#ffffff' }]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={[s.search, isMobile && { maxWidth: '100%' }]}>
            <Feather name="search" size={14} color="#94a3b8" />
            <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="IP, NAS, operator…" placeholderTextColor="#94a3b8" />
            {search ? <TouchableOpacity onPress={() => setSearch('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={s.ghostBtn} onPress={load} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color={INDIGO} /> : <Feather name="refresh-cw" size={14} color={INDIGO} />}
              <Text style={s.ghostBtnText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, !nasList.length && { opacity: 0.5 }]}
              disabled={!nasList.length}
              onPress={() => { setOpSearch(''); setForm({ ...EMPTY, nas_id: nasFilter !== 'all' ? nasFilter : (nasList.length === 1 ? nasList[0].nas_id : '') }); }}
            >
              <Feather name="plus" size={14} color="#ffffff" />
              <Text style={s.primaryBtnText}>Add IP Pool</Text>
            </TouchableOpacity>
          </View>
        </View>
        {!loading && !nasList.length ? <Note tone="info" text="Add a NAS first (Networking › NAS) — every pool belongs to one NAS." /> : null}

        {loading && !pools.length ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginVertical: 30 }} />
        ) : (
          <View style={s.card}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
              <View style={{ minWidth: 1060, flexGrow: 1 }}>
                <View style={[s.tr, s.thRow]}>
                  <Text style={[s.th, { width: 200 }]}>NAS</Text>
                  <Text style={[s.th, { width: 250 }]}>Range</Text>
                  <Text style={[s.th, { width: 160 }]}>Used</Text>
                  <Text style={[s.th, { flex: 1, minWidth: 240 }]}>Given to operators</Text>
                  <Text style={[s.th, { width: 150, textAlign: 'right' }]}> </Text>
                </View>
                {shown.map((p) => {
                  const nas = nasById[p.nas_id];
                  return (
                    <View key={p.ippool_id} style={s.tr}>
                      <View style={{ width: 200, paddingRight: 8, gap: 2 }}>
                        <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{p.nas_name || `NAS #${p.nas_id}`}</Text>
                        <Text style={[s.sub, s.mono]}>{p.nas_ip}</Text>
                        {nas ? <NasStatusPill status={nas.last_status} latency={nas.last_latency_ms} /> : null}
                      </View>
                      <View style={{ width: 250, paddingRight: 8 }}>
                        <Text style={[s.td, s.mono, { fontWeight: '700' }]} selectable>{p.ip_start} – {p.ip_end}</Text>
                        <Text style={s.sub}>Pool #{p.ippool_id} · {p.total.toLocaleString('en-IN')} address{p.total === 1 ? '' : 'es'}</Text>
                      </View>
                      <TouchableOpacity style={{ width: 160, paddingRight: 8 }} onPress={() => openDetail(p)}>
                        <Text style={s.td}><Text style={{ fontWeight: '800' }}>{p.assigned}</Text> / {p.total} · <Text style={{ color: '#047857', fontWeight: '700' }}>{p.free} free</Text></Text>
                        <UsageBar used={p.assigned} total={p.total} />
                      </TouchableOpacity>
                      <View style={{ flex: 1, minWidth: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center', paddingRight: 8 }}>
                        {(p.operators || []).map((o) => (
                          <View key={o.ipopid} style={[s.opChip, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                            <Text style={s.opChipText} numberOfLines={1}>{o.name}{o.assigned ? ` · ${o.assigned}` : ''}</Text>
                            {o.assigned ? null : (
                              <TouchableOpacity onPress={() => unmap(o)} disabled={busy === `unmap:${o.ipopid}`} accessibilityLabel={`Remove ${o.name}`} title="Remove this operator from the pool">
                                {busy === `unmap:${o.ipopid}` ? <ActivityIndicator size={10} color="#3730a3" /> : <Feather name="x" size={12} color="#3730a3" />}
                              </TouchableOpacity>
                            )}
                          </View>
                        ))}
                        <TouchableOpacity style={chip.add} onPress={() => { setMapPick(''); setMapFor(p); }}>
                          <Feather name="plus" size={11} color={INDIGO} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: INDIGO }}>Operator</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ width: 150, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>
                        {confirmDel === p.ippool_id ? (
                          <>
                            <TouchableOpacity style={s.smallGhost} onPress={() => setConfirmDel(null)}><Text style={s.smallGhostText}>No</Text></TouchableOpacity>
                            <TouchableOpacity style={s.smallDanger} onPress={() => remove(p)} disabled={busy === `del:${p.ippool_id}`}>
                              {busy === `del:${p.ippool_id}` ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.smallDangerText}>Delete</Text>}
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity style={s.iconBtn} onPress={() => openDetail(p)} accessibilityLabel="Assigned IPs" title="Assigned IPs">
                              <Feather name="list" size={14} color={INDIGO} />
                            </TouchableOpacity>
                            <TouchableOpacity style={s.iconBtn} onPress={() => setForm({ ...EMPTY, ippool_id: p.ippool_id, nas_id: p.nas_id, ip_start: p.ip_start, ip_end: p.ip_end, assigned: p.assigned })} accessibilityLabel="Edit" title="Edit range">
                              <Feather name="edit-2" size={14} color="#334155" />
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.iconBtn, { borderColor: '#fecaca' }]} onPress={() => setConfirmDel(p.ippool_id)} disabled={p.assigned > 0} accessibilityLabel="Delete" title={p.assigned ? 'IPs of this pool are given to customers' : 'Delete'}>
                              <Feather name="trash-2" size={14} color={p.assigned > 0 ? '#cbd5e1' : '#dc2626'} />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })}
                {!loading && !shown.length ? (
                  <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                    <Feather name="layers" size={22} color="#94a3b8" />
                    <Text style={s.sub}>{pools.length ? 'No pool matches.' : 'No IP pools yet.'}</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* add / edit pool */}
      <ModalShell
        visible={!!form}
        title={form?.ippool_id ? `Edit IP Pool #${form.ippool_id}` : 'Add IP Pool'}
        icon="layers"
        iconColor={INDIGO}
        onClose={() => setForm(null)}
        busy={saving}
        maxWidth={520}
        footer={
          <>
            <Btn label="Cancel" kind="ghost" onPress={() => setForm(null)} disabled={saving} />
            <Btn label={form?.ippool_id ? 'Save changes' : 'Add pool'} onPress={save} loading={saving} disabled={!!rangeError} />
          </>
        }
      >
        {form ? (
          <>
            <Text style={sharedStyles.label}>NAS *</Text>
            <Dropdown
              value={form.nas_id}
              options={nasList.map((n) => ({ value: n.nas_id, label: `${n.nas_name || `NAS #${n.nas_id}`} — ${n.nas_ip} (${n.area})` }))}
              onChange={(v) => setForm((f) => ({ ...f, nas_id: Number(v) }))}
              disabled={saving || (form.ippool_id && form.assigned > 0)}
              placeholder="Choose the NAS"
            />
            {form.ippool_id && form.assigned > 0 ? <Text style={[s.sub, { marginTop: 4 }]}>IPs of this pool are in use, so it stays on this NAS.</Text> : null}
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={sharedStyles.label}>START IP *</Text>
                <TextInput style={sharedStyles.input} value={form.ip_start} onChangeText={(v) => setForm((f) => ({ ...f, ip_start: v }))} placeholder="10.10.1.2" placeholderTextColor="#94a3b8" autoCapitalize="none" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sharedStyles.label}>END IP *</Text>
                <TextInput style={sharedStyles.input} value={form.ip_end} onChangeText={(v) => setForm((f) => ({ ...f, ip_end: v }))} placeholder="10.10.1.254" placeholderTextColor="#94a3b8" autoCapitalize="none" onSubmitEditing={save} />
              </View>
            </View>
            {rangeError ? <Text style={{ fontSize: 11.5, color: '#dc2626', marginTop: 6 }}>{rangeError}</Text> : null}
            {rangeSize ? <Text style={[s.sub, { marginTop: 6 }]}>{rangeSize.toLocaleString('en-IN')} addresses. The NAS's own IP is never handed out.</Text> : null}

            {!form.ippool_id ? (
              <>
                <Text style={[sharedStyles.label, { marginTop: 14 }]}>GIVE TO OPERATORS ({form.partner_ids.length} selected)</Text>
                <TextInput style={[sharedStyles.input, { height: 36 }]} value={opSearch} onChangeText={setOpSearch} placeholder="Search operators…" placeholderTextColor="#94a3b8" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, maxHeight: 160, overflow: 'scroll' }}>
                  {opsForForm.map((o) => {
                    const on = form.partner_ids.includes(Number(o.partner_id));
                    return (
                      <TouchableOpacity key={o.partner_id} style={[chip.base, on && chip.on]} onPress={() => togglePid(Number(o.partner_id))}>
                        <Text style={[chip.text, on && { color: '#fff' }]}>{on ? '✓ ' : ''}{opName(o)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {!opsForForm.length ? <Text style={s.sub}>No operators found.</Text> : null}
                </View>
                <Text style={[s.sub, { marginTop: 6 }]}>Optional — you can give the pool to operators later too.</Text>
              </>
            ) : form.assigned > 0 ? (
              <Note tone="info" text={`${form.assigned} IP(s) are in use — the new range must still include them.`} />
            ) : null}
          </>
        ) : null}
      </ModalShell>

      {/* give pool to an operator */}
      <ModalShell
        visible={!!mapFor}
        title="Give pool to an operator"
        icon="user-plus"
        iconColor={INDIGO}
        onClose={() => setMapFor(null)}
        busy={busy === 'map'}
        footer={
          <>
            <Btn label="Cancel" kind="ghost" onPress={() => setMapFor(null)} disabled={busy === 'map'} />
            <Btn label="Give pool" onPress={map} loading={busy === 'map'} disabled={!mapPick} />
          </>
        }
      >
        {mapFor ? (
          <>
            <Text style={[s.td, s.mono, { fontWeight: '700', marginBottom: 12 }]}>{mapFor.ip_start} – {mapFor.ip_end} · {mapFor.nas_name || `NAS #${mapFor.nas_id}`}</Text>
            <Text style={sharedStyles.label}>OPERATOR</Text>
            <SearchSelect
              value={mapPick}
              onChange={(v) => setMapPick(v)}
              options={operators
                .filter((o) => !(mapFor.operators || []).some((m) => m.partner_id === Number(o.partner_id)))
                .map((o) => ({ value: Number(o.partner_id), label: opName(o), sub: `#${o.partner_id}${o.company_name && o.company_name !== o.partner_name ? ` · ${o.company_name}` : ''}` }))}
              placeholder="Choose an operator"
              searchPlaceholder="Search operators…"
              accent={INDIGO}
            />
          </>
        ) : null}
      </ModalShell>

      {/* assigned IPs of a pool */}
      <ModalShell
        visible={!!detail}
        title={detail ? `Pool ${detail.ip_start} – ${detail.ip_end}` : ''}
        icon="list"
        iconColor={INDIGO}
        onClose={() => setDetail(null)}
        maxWidth={640}
        footer={<Btn label="Close" kind="ghost" onPress={() => setDetail(null)} />}
      >
        {detail?.loading ? (
          <ActivityIndicator size="small" color={INDIGO} style={{ marginVertical: 16 }} />
        ) : detail ? (
          <>
            <Text style={s.sub}>{detail.nas_name || `NAS #${detail.nas_id}`} · {detail.nas_ip} · {detail.assigned} of {detail.total} in use</Text>
            <View style={[s.card, { marginTop: 12 }]}>
              <View style={[s.tr, s.thRow]}>
                <Text style={[s.th, { width: 130 }]}>IP</Text>
                <Text style={[s.th, { flex: 1 }]}>Customer</Text>
                <Text style={[s.th, { flex: 1 }]}>Operator</Text>
              </View>
              {(detail.ips || []).map((r) => (
                <View key={r.ipaddress} style={s.tr}>
                  <Text style={[s.td, s.mono, { width: 130, fontWeight: '700' }]} selectable>{r.ipaddress}</Text>
                  <Text style={[s.td, { flex: 1 }]} numberOfLines={1}>{r.username || `#${r.internet_id}`}</Text>
                  <Text style={[s.td, { flex: 1 }]} numberOfLines={1}>{r.operator}</Text>
                </View>
              ))}
              {!(detail.ips || []).length ? <Text style={[s.sub, { padding: 18, textAlign: 'center' }]}>No IP of this pool is given to a customer yet.</Text> : null}
            </View>
          </>
        ) : null}
      </ModalShell>
    </View>
  );
};

const chip = {
  base: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  on: { backgroundColor: INDIGO, borderColor: INDIGO },
  text: { fontSize: 12, fontWeight: '700', color: '#475569' },
  add: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: '#a5b4fc' },
};
