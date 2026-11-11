import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { OneBssApi } from '../services/oneBssApi';
import { Note, Dropdown, SearchBox, sharedStyles } from '../components/internet/shared';

/**
 * Activity Log — every action of this login's scope (activity_log.php):
 *   super admin: everything · admin: its tree · operator: its account + staff · staff: own
 *   (or the whole account with the "Activity of the whole account" permission).
 */

const ROLE_COLOR = { superadmin: '#7c3aed', admin: '#2563eb', operator: '#059669' };
const ROLE_LABEL = { superadmin: 'Super admin', admin: 'Admin', operator: 'Operator' };
const SCOPE_TEXT = {
  all: 'Everything done by every login — super admin, admins, operators and their staff.',
  tree: 'Your actions and those of every partner below you, and their staff.',
  account: 'Your actions, your staff\'s, and changes made to your account by your admins.',
  own: 'Your own actions. Ask your admin for "Activity of the whole account" to see everyone\'s.',
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
const PRESETS = [
  { id: 'today', label: 'Today', from: () => ymd(new Date()) },
  { id: '7', label: '7 days', from: () => daysAgo(6) },
  { id: '30', label: '30 days', from: () => daysAgo(29) },
  { id: 'all', label: 'All', from: () => '' },
  { id: 'custom', label: 'Custom', from: null },
];

const fmtTime = (v) => {
  if (!v) return '—';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const deviceOf = (ua) => {
  if (!ua) return null;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' on ') || ua.slice(0, 60);
};
const actionIcon = (a) => {
  const x = String(a || '');
  if (/login_failed/.test(x)) return 'alert-octagon';
  if (/^login|impersonate/.test(x)) return 'log-in';
  if (/logout/.test(x)) return 'log-out';
  if (/recharge|renew/.test(x)) return 'refresh-cw';
  if (/wallet|payu|razorpay|pg_/.test(x)) return 'credit-card';
  if (/password/.test(x)) return 'key';
  if (/verif|aadhaar|kyc|digilocker|scoreme/.test(x)) return 'shield';
  if (/staff/.test(x)) return 'user-check';
  if (/partner|move|hierarchy/.test(x)) return 'briefcase';
  if (/delete|remove/.test(x)) return 'trash-2';
  if (/add|create|import/.test(x)) return 'plus-circle';
  return 'activity';
};

const Who = ({ actor, compact }) => (
  <View style={{ flexShrink: 1 }}>
    <Text style={s.who} numberOfLines={1}>{actor.name || actor.username || '—'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
      {actor.role ? (
        <View style={[s.tag, { backgroundColor: `${ROLE_COLOR[actor.role] || '#64748b'}14` }]}>
          <Text style={[s.tagText, { color: ROLE_COLOR[actor.role] || '#64748b' }]}>{actor.staff_name ? 'Staff' : (ROLE_LABEL[actor.role] || actor.role)}</Text>
        </View>
      ) : null}
      {actor.staff_name && actor.partner_name && !compact ? <Text style={s.whoSub} numberOfLines={1}>of {actor.partner_name}</Text> : null}
      {actor.login_as_by ? (
        <View style={[s.tag, { backgroundColor: '#fdf2f8' }]}><Text style={[s.tagText, { color: '#be185d' }]}>Login as · {actor.login_as_by}</Text></View>
      ) : null}
    </View>
  </View>
);

const Details = ({ r }) => {
  const req = r.request && typeof r.request === 'object' ? Object.entries(r.request) : [];
  const det = r.details && typeof r.details === 'object' ? Object.entries(r.details) : [];
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <View style={s.details}>
      {r.message ? <Text style={[s.detMsg, r.status === 'failure' && { color: '#b91c1c' }]}>{r.message}</Text> : null}
      <View style={s.detGrid}>
        {[
          ['Account', r.account?.partner_name ? `${r.account.partner_name} (#${r.account.partner_id})` : null],
          ['Target', r.target],
          ['Login', r.actor?.username],
          ['IP address', r.ip],
          ['Device', deviceOf(r.device)],
          ['Request', r.method && r.endpoint ? `${r.method} ${r.endpoint}${r.http_status ? ` → ${r.http_status}` : ''}` : null],
        ].filter(([, v]) => v).map(([k, v]) => (
          <View key={k} style={s.detItem}><Text style={s.detK}>{k}</Text><Text style={s.detV} selectable>{v}</Text></View>
        ))}
      </View>
      {req.length ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.detK}>Sent</Text>
          <View style={s.kvWrap}>
            {req.map(([k, v]) => <View key={k} style={s.kvChip}><Text style={s.kvChipText}><Text style={{ fontWeight: '700' }}>{k}</Text>: {show(v)}</Text></View>)}
          </View>
        </View>
      ) : null}
      {det.length ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.detK}>Details</Text>
          <View style={s.kvWrap}>
            {det.map(([k, v]) => <View key={k} style={s.kvChip}><Text style={s.kvChipText}><Text style={{ fontWeight: '700' }}>{k}</Text>: {show(v)}</Text></View>)}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export const ActivityLogScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 860;
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [syncs, setSyncs] = useState(false); // background provider syncs hidden by default
  const [who, setWho] = useState('');
  const [account, setAccount] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});

  // search as you type (short pause)
  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 400); return () => clearTimeout(t); }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await OneBssApi.getActivityLog({ page, limit: 50, from, to, status, kind, user: who, account, q: query, syncs: syncs ? 1 : '' });
    setLoading(false);
    if (!res.ok) { setError(res.data?.message || 'Could not load the activity log'); return; }
    setError('');
    setData(res.data);
  }, [page, from, to, status, kind, who, account, query, syncs]);
  useEffect(() => { load(); }, [load, refreshSignal]);

  const pickPreset = (p) => {
    setPreset(p.id);
    if (p.from) { setFrom(p.from()); setTo(''); }
    setPage(1);
  };
  const chip = (on, label, onPress, color = '#0f172a') => (
    <TouchableOpacity key={label} onPress={onPress} style={[s.chip, on && { backgroundColor: color, borderColor: color }]}>
      <Text style={[s.chipText, on && { color: '#ffffff' }]}>{label}</Text>
    </TouchableOpacity>
  );

  const rows = data?.rows || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const sum = data?.summary || { total: 0, failures: 0, logins: 0 };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
      {data?.scope ? <Note tone="info" text={SCOPE_TEXT[data.scope]} /> : null}

      {/* summary */}
      <View style={s.tiles}>
        {[
          { label: 'Actions', value: sum.total, icon: 'activity', color: '#0f172a', onPress: () => { setStatus(''); setKind(''); setPage(1); } },
          { label: 'Failed / refused', value: sum.failures, icon: 'alert-triangle', color: '#dc2626', onPress: () => { setStatus('failure'); setPage(1); } },
          { label: 'Logins', value: sum.logins, icon: 'log-in', color: '#2563eb', onPress: () => { setKind('logins'); setStatus(''); setPage(1); } },
        ].map((t) => (
          <TouchableOpacity key={t.label} style={s.tile} onPress={t.onPress}>
            <View style={[s.tileIcon, { backgroundColor: `${t.color}12` }]}><Feather name={t.icon} size={16} color={t.color} /></View>
            <View>
              <Text style={[s.tileVal, { color: t.color }]}>{t.value}</Text>
              <Text style={s.tileLbl}>{t.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* filters */}
      <View style={s.card}>
        <View style={s.filterRow}>
          <View style={s.chips}>{PRESETS.map((p) => chip(preset === p.id, p.label, () => pickPreset(p)))}</View>
          <View style={s.chips}>
            {chip(status === '' && kind === '', 'All', () => { setStatus(''); setKind(''); setPage(1); })}
            {chip(status === 'success', 'Success', () => { setStatus('success'); setKind(''); setPage(1); }, '#059669')}
            {chip(status === 'failure', 'Failed', () => { setStatus('failure'); setKind(''); setPage(1); }, '#dc2626')}
            {chip(kind === 'logins', 'Logins', () => { setKind('logins'); setStatus(''); setPage(1); }, '#2563eb')}
            {chip(syncs, syncs ? 'Syncs shown' : 'Show syncs', () => { setSyncs((v) => !v); setPage(1); }, '#64748b')}
          </View>
        </View>
        {preset === 'custom' ? (
          <View style={[s.filterRow, { marginTop: 10 }]}>
            <View style={{ width: 170 }}>
              <Text style={sharedStyles.label}>FROM (YYYY-MM-DD)</Text>
              <TextInput style={sharedStyles.input} value={from} onChangeText={(v) => { setFrom(v); setPage(1); }} placeholder="2026-11-01" />
            </View>
            <View style={{ width: 170 }}>
              <Text style={sharedStyles.label}>TO (YYYY-MM-DD)</Text>
              <TextInput style={sharedStyles.input} value={to} onChangeText={(v) => { setTo(v); setPage(1); }} placeholder="2026-11-11" />
            </View>
          </View>
        ) : null}
        <View style={[s.filterRow, { marginTop: 10 }]}>
          <View style={{ flex: 2, minWidth: 220 }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Search action, user, customer / target…" />
          </View>
          {data?.users?.length ? (
            <View style={{ flex: 1, minWidth: 200 }}>
              <Dropdown value={who} options={[{ value: '', label: 'Everyone' }, ...data.users]} onChange={(v) => { setWho(v); setPage(1); }} placeholder="Everyone" />
            </View>
          ) : null}
          {data?.accounts?.length > 1 ? (
            <View style={{ flex: 1, minWidth: 200 }}>
              <Dropdown value={account} options={[{ value: '', label: 'All accounts' }, ...data.accounts]} onChange={(v) => { setAccount(v); setPage(1); }} placeholder="All accounts" />
            </View>
          ) : null}
        </View>
      </View>

      {error ? <Note tone="error" text={error} /> : null}

      {/* list */}
      <View style={s.card0}>
        {!isMobile ? (
          <View style={[s.tr, s.th]}>
            <Text style={[s.thText, { width: 130 }]}>WHEN</Text>
            <Text style={[s.thText, { flex: 1.3 }]}>WHO</Text>
            <Text style={[s.thText, { flex: 1.6 }]}>ACTION</Text>
            <Text style={[s.thText, { flex: 1.3 }]}>ACCOUNT · TARGET</Text>
            <Text style={[s.thText, { width: 90 }]}>RESULT</Text>
          </View>
        ) : null}
        {loading && !rows.length ? <ActivityIndicator color="#10b981" style={{ marginVertical: 30 }} /> : null}
        {!loading && !rows.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 6 }}>
            <Feather name="inbox" size={26} color="#94a3b8" />
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>No activity for these filters</Text>
          </View>
        ) : null}
        {rows.map((r) => {
          const ok = r.status !== 'failure';
          const isOpen = !!open[r.id];
          return (
            <View key={r.id} style={[s.rowWrap, !ok && { backgroundColor: '#fffafa' }]}>
              <TouchableOpacity onPress={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} style={[s.tr, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
                {isMobile ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={s.time}>{fmtTime(r.at)}</Text>
                    <View style={[s.result, ok ? s.resOk : s.resBad]}><Text style={[s.resText, { color: ok ? '#047857' : '#b91c1c' }]}>{ok ? 'Success' : 'Failed'}</Text></View>
                  </View>
                ) : <Text style={[s.time, { width: 130 }]}>{fmtTime(r.at)}</Text>}
                <View style={{ flex: isMobile ? undefined : 1.3 }}><Who actor={r.actor} compact={isMobile} /></View>
                <View style={{ flex: isMobile ? undefined : 1.6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.actIcon, !ok && { backgroundColor: '#fee2e2' }]}><Feather name={actionIcon(r.action)} size={14} color={ok ? '#334155' : '#dc2626'} /></View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={s.act} numberOfLines={1}>{r.label}</Text>
                    {r.message && !ok ? <Text style={s.actMsg} numberOfLines={1}>{r.message}</Text> : null}
                  </View>
                </View>
                <View style={{ flex: isMobile ? undefined : 1.3 }}>
                  <Text style={s.acct} numberOfLines={1}>{r.account?.partner_name || '—'}</Text>
                  {r.target ? <Text style={s.target} numberOfLines={1}>{r.target}</Text> : null}
                </View>
                {!isMobile ? (
                  <View style={{ width: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={[s.result, ok ? s.resOk : s.resBad]}><Text style={[s.resText, { color: ok ? '#047857' : '#b91c1c' }]}>{ok ? 'Success' : 'Failed'}</Text></View>
                    <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#94a3b8" />
                  </View>
                ) : null}
              </TouchableOpacity>
              {isOpen ? <Details r={r} /> : null}
            </View>
          );
        })}
        {data && data.total > data.limit ? (
          <View style={s.pager}>
            <TouchableOpacity disabled={page <= 1} onPress={() => setPage((x) => x - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]}><Feather name="chevron-left" size={14} color="#334155" /></TouchableOpacity>
            <Text style={s.pageText}>Page {page} of {pages} · {data.total} actions</Text>
            <TouchableOpacity disabled={page >= pages} onPress={() => setPage((x) => x + 1)} style={[s.pageBtn, page >= pages && { opacity: 0.4 }]}><Feather name="chevron-right" size={14} color="#334155" /></TouchableOpacity>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tileVal: { fontSize: 20, fontWeight: '800' },
  tileLbl: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  card0: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  th: { backgroundColor: '#f8fafc', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  thText: { fontSize: 10.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.4 },
  rowWrap: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  time: { fontSize: 12, color: '#475569', fontVariant: ['tabular-nums'] },
  who: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  whoSub: { fontSize: 11, color: '#64748b' },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  tagText: { fontSize: 10, fontWeight: '800' },
  actIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  act: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  actMsg: { fontSize: 11, color: '#b91c1c', marginTop: 1 },
  acct: { fontSize: 12.5, color: '#0f172a' },
  target: { fontSize: 11, color: '#64748b', marginTop: 1 },
  result: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  resOk: { backgroundColor: '#d1fae5' },
  resBad: { backgroundColor: '#fee2e2' },
  resText: { fontSize: 11, fontWeight: '800' },
  details: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  detMsg: { fontSize: 12.5, fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  detGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  detItem: { minWidth: 150 },
  detK: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.3, marginBottom: 2 },
  detV: { fontSize: 12, color: '#0f172a' },
  kvWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  kvChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  kvChipText: { fontSize: 11, color: '#334155' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 12 },
  pageBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  pageText: { fontSize: 12, color: '#64748b' },
});
