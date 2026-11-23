import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { Btn, Note } from '../internet/shared';
import { RadiusKeyImportModal } from './RadiusKeyImportModal';

// the lists in the panels keep a fixed height and scroll inside (the page itself stays put)
const LIST_MAX = Platform.OS === 'web' ? 'calc(100vh - 320px)' : 520;

// ---------------------------------------------------------------------------------------------
// Partners › Bulk operations: every sync / import / setting that works on many partners at once,
// on one page. Pick a card; its activity (progress, results, the settings table) shows right
// below the cards — no pop-up windows.
// ---------------------------------------------------------------------------------------------

// runs over the operators one by one on the server (partners_bulk_sync.php)
const RUNS = {
  internet: { title: 'Sync Internet customers', icon: 'wifi', color: '#3f8f6b', noun: 'customers',
    about: 'Every enabled operator\'s internet customers from RADIUS, one operator after another — the same as each partner\'s own "Sync Internet Users".' },
  iptv: { title: 'Sync IPTV customers', icon: 'tv', color: '#6b5fa8', noun: 'customers',
    about: 'Every customer mobile of every enabled operator is checked with Pioneer, one operator after another. This can take a long time on a big network.' },
  ott: { title: 'Sync OTT customers', icon: 'play-circle', color: '#3d7f99', noun: 'customers',
    about: 'OTTAggre has no customer list, so every customer mobile of every OTT-enabled operator is looked up one by one, one operator after another — the same as each partner\'s own "Sync OTT Users". Operators without an OTTAggre franchise id are skipped.' },
  branches: { title: 'Sync Partner branches', icon: 'git-branch', color: '#4f5b93', sa: true,
    about: 'Each operator\'s RADIUS branches brought in line with RADIUS: new branches of its RADIUS partner are added, branches RADIUS no longer lists are removed (one always stays). A new branch of a RADIUS partner shared by several operators is only reported.' },
  plans: { title: 'Sync Internet plans', icon: 'list', color: '#b7774a', sa: true,
    about: 'Each operator\'s RADIUS packages into the plan catalog, one operator after another. Sync only — no plan is assigned to any operator; assign them in the partner\'s Internet Plans as before.' },
};
// the same catalog for every operator: one call
const SINGLES = {
  iptv_plans: { title: 'Sync IPTV plans', icon: 'tv', color: '#a35d7a', call: () => OneBssApi.syncAllIptvPlans(),
    about: 'Pioneer\'s packs and their channels into the IPTV catalog (the same for every operator). Sync only — nothing is assigned.' },
  ott_plans: { title: 'Sync OTT plans', icon: 'play-circle', color: '#3d8597', call: () => OneBssApi.syncAllOttPlans(),
    about: 'OTTAggre\'s packages into the OTT catalog (the same for every operator). Sync only — nothing is assigned.' },
};

const STATE = {
  pending: { icon: 'clock', color: '#94a3b8', text: 'Waiting' },
  running: { icon: 'loader', color: '#2563eb', text: 'Running' },
  done: { icon: 'check-circle', color: '#16a34a', text: 'Done' },
  failed: { icon: 'x-circle', color: '#dc2626', text: 'Failed' },
  skipped: { icon: 'slash', color: '#b45309', text: 'Skipped' },
};
const finishedCount = (c) => (c ? c.done + c.failed + c.skipped : 0);

// ---------------------------------------------------------------------------------------------
// one run's activity: progress + every operator's result, Start / Stop / Continue
// ---------------------------------------------------------------------------------------------
// the numbers of one operator's finished run, as small tags
const Tag = ({ text, color, strong }) => (
  <Text style={[s.tag, { color, borderColor: `${color}55` }, strong && { backgroundColor: `${color}14`, fontWeight: '800' }]}>{text}</Text>
);
const ItemDetail = ({ type, it }) => {
  const [open, setOpen] = useState(false);
  const sm = it.summary;
  if (!sm || it.state === 'running') return null;
  if (type === 'iptv') {
    if (!sm.customers_found) return <Text style={s.small}>{it.message || 'No customers with a mobile number'}</Text>;
    return (
      <View style={s.tagRow}>
        <Tag text={`${sm.customers_found || 0} checked`} color="#475569" />
        <Tag text={`${sm.synced_ok || 0} in IPTV`} color="#16a34a" strong={sm.synced_ok > 0} />
        <Tag text={`${sm.not_on_iptv || 0} not in IPTV`} color="#64748b" />
        {sm.failed ? <Tag text={`${sm.failed} failed`} color="#dc2626" strong /> : null}
        {sm.stbs_added ? <Tag text={`${sm.stbs_added} STB(s) added`} color="#7c3aed" /> : null}
        {sm.customers_created ? <Tag text={`${sm.customers_created} new customer(s)`} color="#0284c7" /> : null}
      </View>
    );
  }
  if (type === 'ott') {
    if (!sm.customers_found) return <Text style={s.small}>{it.message || 'No customers with a mobile number'}</Text>;
    return (
      <View style={s.tagRow}>
        <Tag text={`${sm.customers_found || 0} checked`} color="#475569" />
        <Tag text={`${sm.synced_ok || 0} in OTT`} color="#16a34a" strong={sm.synced_ok > 0} />
        <Tag text={`${sm.not_on_ott || 0} not in OTT`} color="#64748b" />
        {sm.failed ? <Tag text={`${sm.failed} failed`} color="#dc2626" strong /> : null}
        {sm.created ? <Tag text={`${sm.created} new OTT account(s)`} color="#0284c7" /> : null}
      </View>
    );
  }
  if (type !== 'internet') return null;
  const rows = sm.failed_rows || [];
  const notSaved = (sm.rows_failed || 0) + (sm.accounts_update_failed || 0);
  return (
    <View>
      <View style={s.tagRow}>
        {sm.radius_rows != null ? <Tag text={`${sm.radius_rows} in RADIUS`} color="#475569" /> : null}
        <Tag text={`${sm.accounts_added || 0} added`} color="#16a34a" strong={sm.accounts_added > 0} />
        <Tag text={`${sm.accounts_updated || 0} updated`} color="#0284c7" />
        {sm.customers_created ? <Tag text={`${sm.customers_created} new customer(s)`} color="#7c3aed" /> : null}
        {sm.rows_skipped_no_mobile ? <Tag text={`${sm.rows_skipped_no_mobile} without mobile`} color="#d97706" /> : null}
        {notSaved ? <Tag text={`${notSaved} not saved`} color="#dc2626" strong /> : null}
        {rows.length ? (
          <TouchableOpacity onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={[s.small, { color: '#1d4ed8', fontWeight: '700' }]}>{open ? 'Hide' : 'Show'} accounts ({rows.length})</Text>
            <Feather name={open ? 'chevron-up' : 'chevron-down'} size={13} color="#1d4ed8" />
          </TouchableOpacity>
        ) : null}
      </View>
      {open ? (
        <View style={s.failList}>
          {rows.map((f, i) => (
            <Text key={`${f.acc_id}-${i}`} style={s.failRow} numberOfLines={3}>
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>{f.username || '—'}</Text>
              <Text style={{ color: '#64748b' }}>{`  acc ${f.acc_id || '—'}  ·  `}</Text>
              <Text style={{ color: f.error === 'No mobile number in RADIUS' ? '#b45309' : '#b91c1c' }}>{f.error}</Text>
            </Text>
          ))}
          {notSaved + (sm.rows_skipped_no_mobile || 0) > rows.length ? <Text style={[s.small, { marginTop: 4 }]}>First {rows.length} shown — the rest are in internet_customer_sync.log</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

const RunActivity = ({ type, st, busy, onAct, scopeLabel }) => {
  const meta = RUNS[type];
  const counts = st?.counts;
  const total = counts?.total || 0;
  const finished = finishedCount(counts);
  const pct = total ? Math.round((finished / total) * 100) : 0;
  const leftover = counts ? counts.pending + counts.running : 0;
  const [filter, setFilter] = useState('');
  // "No customer in IPTV / OTT": every customer of the operator checked, none has the service
  const svc = type === 'ott' ? 'OTT' : 'IPTV';
  const isNoIptv = (it) => it.state === 'done' && ((type === 'iptv' && !!it.summary?.no_iptv) || (type === 'ott' && !!it.summary?.no_ott));
  const noIptvCount = (st?.items || []).filter(isNoIptv).length;
  const items = (st?.items || []).filter((it) => !filter || (filter === 'noiptv' ? isNoIptv(it) : it.state === filter));
  return (
    <View>
      <Text style={s.about}>{meta.about}{scopeLabel ? ` (${scopeLabel})` : ''} It runs on the server: you can leave this page and come back.</Text>
      <View style={s.actRow}>
        {st?.running ? (
          <Btn label="Stop" icon="square" kind="danger" onPress={() => onAct('stop')} loading={busy} />
        ) : (
          <>
            <Btn label={st?.items?.length ? 'Run again from the start' : 'Start'} icon="refresh-cw" onPress={() => onAct('start')} loading={busy} />
            {leftover > 0 ? <Btn label={`Continue (${leftover} left)`} icon="play" kind="ghost" onPress={() => onAct('resume')} loading={busy} /> : null}
          </>
        )}
      </View>
      {st?.interrupted ? <View style={{ marginTop: 10 }}><Note tone="warn" text="The server stopped this run before it finished. Continue goes on with the operators that are left." /></View> : null}
      {counts ? (
        <View style={{ marginTop: 14 }}>
          <View style={s.rowBetween}>
            <Text style={s.big}>{st.running ? 'Running' : st.stopped ? 'Stopped' : st.interrupted ? 'Interrupted' : 'Last run'} · {finished}/{total} operators</Text>
            <Text style={s.small}>{st.running ? `started ${st.started_at || ''}` : st.finished_at ? `finished ${st.finished_at}` : ''}{st.started_by ? ` · by ${st.started_by}` : ''}</Text>
          </View>
          <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: meta.color }]} /></View>
          <View style={s.chips}>
            {['done', 'failed', 'skipped', 'pending'].map((k) => (counts[k] ? (
              <TouchableOpacity key={k} onPress={() => setFilter(filter === k ? '' : k)} style={[s.chip, { borderColor: STATE[k].color }, filter === k && { backgroundColor: `${STATE[k].color}18` }]}>
                <Feather name={STATE[k].icon} size={11} color={STATE[k].color} />
                <Text style={[s.chipText, { color: STATE[k].color }]}>{counts[k]} {STATE[k].text.toLowerCase()}</Text>
              </TouchableOpacity>
            ) : null))}
            {noIptvCount ? (
              <TouchableOpacity onPress={() => setFilter(filter === 'noiptv' ? '' : 'noiptv')} style={[s.chip, { borderColor: '#d97706' }, filter === 'noiptv' && { backgroundColor: '#d9770618' }]}>
                <Feather name={type === 'ott' ? 'play-circle' : 'tv'} size={11} color="#d97706" />
                <Text style={[s.chipText, { color: '#d97706' }]}>{noIptvCount} no customer in {svc}</Text>
              </TouchableOpacity>
            ) : null}
            {filter ? <Text style={s.small}>· showing only these (tap again for all)</Text> : null}
          </View>
          <ScrollView style={[s.list, { maxHeight: LIST_MAX, minHeight: Math.min(items.length, 4) * 56 }]} nestedScrollEnabled showsVerticalScrollIndicator>
            {items.map((it) => {
              const sm = STATE[it.state] || STATE.pending;
              return (
                <View key={it.partner_id} style={s.item}>
                  {it.state === 'running' ? <ActivityIndicator size="small" color={sm.color} /> : <Feather name={sm.icon} size={15} color={sm.color} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={s.itemName} numberOfLines={1}>{it.name} <Text style={s.small}>#{it.partner_id}</Text></Text>
                      {isNoIptv(it) ? <Text style={s.noIptv}>No customer in {svc}</Text> : null}
                    </View>
                    {it.state === 'running' && it.progress ? (
                      <Text style={s.small}>{it.progress.done}/{it.progress.total} {meta.noun || 'items'}…</Text>
                    ) : it.summary && (type === 'iptv' || type === 'ott' || type === 'internet') ? (
                      <>
                        <ItemDetail type={type} it={it} />
                        {it.summary.failures?.length ? <Text style={[s.small, { color: '#b91c1c', marginTop: 3 }]} numberOfLines={2}>{it.summary.failures[0].mobile}: {it.summary.failures[0].message}</Text> : null}
                      </>
                    ) : it.message ? (
                      <Text style={[s.small, it.state === 'failed' && { color: '#b91c1c' }]} numberOfLines={3}>{it.message}</Text>
                    ) : null}
                  </View>
                  <Text style={[s.stateText, { color: sm.color }]}>{sm.text}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : (
        <Text style={[s.small, { marginTop: 14 }]}>Not run yet.</Text>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------------------------
// one-call catalog syncs (IPTV / OTT plans)
// ---------------------------------------------------------------------------------------------
// IPTV: the channel lists of every pack are read on the server after the reply
const ChannelRun = ({ ch }) => {
  if (!ch) return null;
  const running = ch.state === 'running';
  const pct = ch.packs_total ? Math.min(100, Math.round(((ch.packs_synced + ch.packs_failed) / ch.packs_total) * 100)) : 0;
  const when = (t) => (t ? new Date(t * 1000).toLocaleString() : '');
  return (
    <View style={[s.resultBox, { borderColor: running ? '#ddd6fe' : ch.state === 'failed' ? '#fecaca' : '#e2e8f0' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {running ? <ActivityIndicator size="small" color="#7c3aed" /> : <Feather name={ch.state === 'failed' ? 'x-circle' : 'check-circle'} size={14} color={ch.state === 'failed' ? '#dc2626' : '#16a34a'} />}
        <Text style={[s.big, { fontSize: 13 }]}>
          Channel lists · {running ? `reading… ${ch.packs_synced + ch.packs_failed}/${ch.packs_total || '?'} pack(s)` : ch.state === 'failed' ? 'failed' : 'done'}
        </Text>
      </View>
      {running ? <View style={{ height: 6, borderRadius: 3, backgroundColor: '#ede9fe', marginTop: 8 }}><View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: '#7c3aed' }} /></View> : null}
      <Text style={[s.small, { marginTop: 6 }]}>
        {ch.packs_synced || 0} pack(s) read · {ch.channels || 0} channel(s){ch.packs_failed ? ` · ${ch.packs_failed} failed (see iptv_plan_sync.log)` : ''}
        {ch.error ? ` · ${ch.error}` : ''}
        {` · started ${when(ch.started)}${ch.by ? ` by ${ch.by}` : ''}${ch.finished ? ` · finished ${when(ch.finished)}` : ''}`}
      </Text>
      {running ? <Text style={[s.small, { marginTop: 4 }]}>Runs on the server — you can leave this page.</Text> : null}
    </View>
  );
};

const SingleActivity = ({ id, last, onRun, busy, channels }) => {
  const meta = SINGLES[id];
  return (
    <View>
      <Text style={s.about}>{meta.about}</Text>
      <View style={s.actRow}><Btn label={last ? 'Sync again' : 'Sync now'} icon="refresh-cw" onPress={onRun} loading={busy} /></View>
      {busy ? (
        <View style={[s.resultBox, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <ActivityIndicator size="small" color={meta.color} />
          <Text style={s.small}>Syncing… this can take a minute.</Text>
        </View>
      ) : last ? (
        <View style={[s.resultBox, { borderColor: last.ok ? '#bbf7d0' : '#fecaca', backgroundColor: last.ok ? '#f0fdf4' : '#fef2f2' }]}>
          <Text style={[s.big, { color: last.ok ? '#166534' : '#991b1b', fontSize: 13 }]}>{last.ok ? 'Done' : 'Failed'} · {last.at}</Text>
          <Text style={[s.small, { marginTop: 4, color: '#334155' }]}>{last.message}</Text>
        </View>
      ) : null}
      {id === 'iptv_plans' ? <ChannelRun ch={channels} /> : null}
    </View>
  );
};

// ---------------------------------------------------------------------------------------------
// Partner settings: every partner's switches in one table (partner_bulk_settings.php)
// ---------------------------------------------------------------------------------------------
const KYC_LABEL = { digilocker: 'DigiLocker', scoreme: 'ScoreMe', quickekyc: 'QuickeKYC', manual: 'Manual' };
const LEVELS = [['', 'All'], ['operator', 'Operators'], ['admin', 'Distributors']];
const PAGE = 50;

const Toggle = ({ on, partial, onPress, disabled, color = '#16a34a' }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="switch" accessibilityState={{ checked: !!on }}
    style={{ width: 34, height: 20, borderRadius: 10, padding: 2, backgroundColor: on ? color : partial ? '#fcd34d' : '#cbd5e1', alignItems: on ? 'flex-end' : partial ? 'center' : 'flex-start', opacity: disabled ? 0.45 : 1 }}>
    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' }} />
  </TouchableOpacity>
);

// the four settings, each its own card / table
const SETTINGS = {
  set_kyc: { key: 'kyc', title: 'KYC methods', icon: 'shield', color: '#8a5a9e', opsOnly: true,
    about: 'Which Aadhaar verification methods each operator can use. Click a method on a row to add / remove it, or tick operators and add / remove a method for all of them.' },
  set_pg: { key: 'pg', title: 'Payment gateways', icon: 'credit-card', color: '#46689c', opsOnly: true,
    about: 'Gateways per wallet, the same as the partner\'s Payment Gateways: a one-wallet operator has one row of gateways, a split-wallet operator one row each for its Internet, IPTV and OTT wallets. Click a gateway to switch it, or tick operators and switch one gateway on one wallet for all of them (operators without that wallet are skipped).' },
  set_aadhaar: { key: 'aadhaar', title: 'Aadhaar for recharge', icon: 'user-check', color: '#4c8a5a', opsOnly: true,
    about: 'Whether an operator\'s customers must be Aadhaar verified before a recharge.' },
  set_profile: { key: 'profile', title: 'One-time details edit', icon: 'edit-3', color: '#3e7c78', opsOnly: false,
    about: 'Open a one-time edit for a partner: on next login they can update their name, company, mobile, email and region once; saving closes it again.' },
};
const WALLET_LABEL = { Single: 'Wallet', Internet: 'Internet', IPTV: 'IPTV', OTT: 'OTT' };
const WALLET_COLOR = { Single: '#475569', Internet: '#059669', IPTV: '#7c3aed', OTT: '#0284c7' };

const PartnerSettings = ({ isMobile, mode }) => {
  const meta = SETTINGS[mode];
  const kind = meta.key;
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [level, setLevel] = useState(meta.opsOnly ? 'operator' : '');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [bulk, setBulk] = useState({ kycWhat: 'kyc_add', kyc: 'quickekyc', wallet: 'Single', gateway: 'payu', gwOn: '1', flag: '1' });

  const load = useCallback(async () => {
    const res = await OneBssApi.getPartnerBulkSettings();
    if (res.ok && res.data?.success) { setData(res.data); setErr(''); } else setErr(res.data?.message || 'Could not load the partners');
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSel({}); setLevel(meta.opsOnly ? 'operator' : ''); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const all = data?.partners || [];
    const t = q.trim().toLowerCase();
    return all.filter((p) => (meta.opsOnly ? p.role === 'operator' : (!level || p.role === level))
      && (!t || [p.partner_name, p.company_name, p.username, String(p.partner_id)].some((v) => String(v || '').toLowerCase().includes(t))));
  }, [data, q, level, meta.opsOnly]);
  useEffect(() => setPage(1), [q, level, mode]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice((page - 1) * PAGE, page * PAGE);
  const selIds = Object.keys(sel).filter((k) => sel[k]).map(Number);

  const save = async (action, ids, extra, key) => {
    setBusyKey(key || action);
    const res = await OneBssApi.savePartnerBulkSettings(action, ids, extra);
    setBusyKey('');
    if (!res.ok || res.data?.success === false) { toast.error(res.data?.message || 'Could not save'); return false; }
    const fresh = {};
    (res.data.partners || []).forEach((p) => { fresh[p.partner_id] = p; });
    setData((d) => (d ? { ...d, partners: d.partners.map((p) => fresh[p.partner_id] || p) } : d));
    toast.success(res.data.message || 'Saved');
    return true;
  };

  const applyBulk = async () => {
    if (!selIds.length) return;
    let ok = false;
    if (kind === 'kyc') ok = await save(bulk.kycWhat, selIds, { providers: [bulk.kyc] }, 'bulk');
    else if (kind === 'pg') ok = await save('gateway', selIds, { gateway: bulk.gateway, wallet: bulk.wallet, on: bulk.gwOn === '1' }, 'bulk');
    else if (kind === 'aadhaar') ok = await save('aadhaar_recharge', selIds, { required: bulk.flag === '1' }, 'bulk');
    else ok = await save('profile_edit', selIds, { allow: bulk.flag === '1' }, 'bulk');
    if (ok) setSel({});
  };

  if (err) return <Note tone="error" text={err} />;
  if (!data) return <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={meta.color} /></View>;
  const gws = (data.gateways || []).filter((g) => !g.coming_soon);
  const webSelect = (value, onChange, options, width) => (Platform.OS === 'web' && typeof document !== 'undefined' ? (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ height: 34, padding: '0 8px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#0f172a', width }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  ) : null);
  const setB = (k) => (v) => setBulk((b) => ({ ...b, [k]: v }));
  const allOnPage = view.length > 0 && view.every((p) => sel[p.partner_id]);
  const notReady = (kind === 'pg' && !data.ready?.gateways) ? 'Payment gateways per partner need migrations/partner_pg_mapping.sql on the server.'
    : (kind === 'aadhaar' && !data.ready?.aadhaar_recharge) ? 'The Aadhaar-for-recharge column is not on this server yet.'
      : (kind === 'profile' && !data.ready?.profile_edit) ? 'Run migrations/partner_profile_edit.sql on the server first.' : '';

  const cell = (p) => {
    const id = p.partner_id;
    if (kind === 'kyc') {
      return (
        <View style={s.chipCell}>
          {(data.kyc_providers || []).map((k) => {
            const on = (p.kyc || []).includes(k);
            const key = `kyc-${id}-${k}`;
            return (
              <TouchableOpacity key={k} disabled={!!busyKey} onPress={() => save(on ? 'kyc_remove' : 'kyc_add', [id], { providers: [k] }, key)} style={[s.opt, on && s.optOn]}>
                {busyKey === key ? <ActivityIndicator size="small" color="#7c3aed" /> : <Feather name={on ? 'check' : 'plus'} size={11} color={on ? '#6d28d9' : '#94a3b8'} />}
                <Text style={[s.optText, on && { color: '#6d28d9' }]}>{KYC_LABEL[k] || k}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    if (kind === 'pg') {
      return (
        <View style={{ gap: 6 }}>
          {Object.keys(p.pg || {}).map((w) => (
            <View key={w} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[s.walletTag, { color: WALLET_COLOR[w], borderColor: `${WALLET_COLOR[w]}55` }]}>{WALLET_LABEL[w] || w}</Text>
              {gws.map((g) => {
                const on = !!p.pg[w][g.id];
                const key = `gw-${id}-${w}-${g.id}`;
                return (
                  <TouchableOpacity key={g.id} disabled={!!busyKey} onPress={() => save('gateway', [id], { gateway: g.id, wallet: w, on: !on }, key)} style={[s.opt, on && s.optOnBlue]}>
                    {busyKey === key ? <ActivityIndicator size="small" color="#0284c7" /> : <Feather name={on ? 'check' : 'plus'} size={11} color={on ? '#0369a1' : '#94a3b8'} />}
                    <Text style={[s.optText, on && { color: '#0369a1' }]}>{g.label}{!g.configured ? ' (no keys)' : ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      );
    }
    if (kind === 'aadhaar') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Toggle on={!!p.aadhaar_required_for_recharge} disabled={!!busyKey} onPress={() => save('aadhaar_recharge', [id], { required: !p.aadhaar_required_for_recharge }, `aad-${id}`)} />
          <Text style={s.small}>{busyKey === `aad-${id}` ? 'Saving…' : p.aadhaar_required_for_recharge ? 'Required' : 'Not required'}</Text>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Toggle on={!!p.profile_edit_allowed} color="#0f766e" disabled={!!busyKey} onPress={() => save('profile_edit', [id], { allow: !p.profile_edit_allowed }, `pe-${id}`)} />
        <Text style={s.small} numberOfLines={2}>{busyKey === `pe-${id}` ? 'Saving…' : p.profile_edit_allowed ? 'Open — partner can edit once' : p.profile_updated_at ? `Closed · last updated ${String(p.profile_updated_at).slice(0, 10)}` : 'Closed'}</Text>
      </View>
    );
  };

  const colLabel = kind === 'kyc' ? 'KYC methods' : kind === 'pg' ? 'Payment gateways (per wallet)' : kind === 'aadhaar' ? 'Aadhaar for recharge' : 'One-time details edit';

  return (
    <View>
      <Text style={s.about}>{meta.about}</Text>
      {notReady ? <View style={{ marginTop: 8 }}><Note tone="warn" text={notReady} /></View> : null}

      <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[s.search, isMobile ? null : { flex: 1 }]}>
          <Feather name="search" size={14} color="#94a3b8" />
          <TextInput value={q} onChangeText={setQ} placeholder={meta.opsOnly ? 'Search operator, company, username or ID' : 'Search partner, company, username or ID'} placeholderTextColor="#94a3b8" style={s.searchInput} />
        </View>
        {!meta.opsOnly ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {LEVELS.map(([v, l]) => (
              <TouchableOpacity key={v} onPress={() => setLevel(v)} style={[s.seg, level === v && s.segOn]}>
                <Text style={[s.segText, level === v && { color: '#ffffff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      {selIds.length ? (
        <View style={[s.bulkBar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={[s.big, { fontSize: 13 }]}>{selIds.length} ticked</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', flex: 1 }}>
            {kind === 'kyc' ? (
              <>
                {webSelect(bulk.kycWhat, setB('kycWhat'), [['kyc_add', 'Add'], ['kyc_remove', 'Remove']], 110)}
                {webSelect(bulk.kyc, setB('kyc'), (data.kyc_providers || []).map((k) => [k, KYC_LABEL[k] || k]), 140)}
              </>
            ) : kind === 'pg' ? (
              <>
                {webSelect(bulk.gwOn, setB('gwOn'), [['1', 'Switch ON'], ['0', 'Switch OFF']], 120)}
                {webSelect(bulk.gateway, setB('gateway'), gws.map((g) => [g.id, g.label]), 170)}
                <Text style={s.small}>on the</Text>
                {webSelect(bulk.wallet, setB('wallet'), [['Single', 'Single wallet (one-wallet operators)'], ['Internet', 'Internet wallet'], ['IPTV', 'IPTV wallet'], ['OTT', 'OTT wallet']], 240)}
              </>
            ) : kind === 'aadhaar' ? (
              webSelect(bulk.flag, setB('flag'), [['1', 'Required'], ['0', 'Not required']], 150)
            ) : (
              webSelect(bulk.flag, setB('flag'), [['1', 'Open the one-time edit'], ['0', 'Close it']], 190)
            )}
            <Btn label="Apply to ticked" icon="check" onPress={applyBulk} loading={busyKey === 'bulk'} />
            <Btn label="Clear" kind="ghost" onPress={() => setSel({})} />
          </View>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator scrollEnabled={!isMobile} contentContainerStyle={{ minWidth: isMobile ? 0 : kind === 'pg' ? 900 : 700, width: '100%' }}>
        <View style={{ width: '100%' }}>
          <View style={[s.tr, s.thRow]}>
            <TouchableOpacity style={s.cCheck} onPress={() => setSel((cur) => { const n = { ...cur }; view.forEach((p) => { if (allOnPage) delete n[p.partner_id]; else n[p.partner_id] = true; }); return n; })}>
              <Feather name={allOnPage ? 'check-square' : 'square'} size={16} color="#1d4ed8" />
            </TouchableOpacity>
            <View style={[s.cPartner, isMobile && { flexBasis: 0, flexGrow: 1 }]}><Text style={s.th}>{meta.opsOnly ? 'Operator' : 'Partner'}{isMobile ? ` · ${colLabel}` : ''}</Text></View>
            {!isMobile ? <View style={s.cSetting}><Text style={s.th}>{colLabel}</Text></View> : null}
          </View>
          <ScrollView style={{ maxHeight: LIST_MAX }} nestedScrollEnabled showsVerticalScrollIndicator>
          {view.map((p) => {
            const id = p.partner_id;
            return (
              <View key={id} style={[s.tr, sel[id] && { backgroundColor: '#eff6ff' }]}>
                <TouchableOpacity style={s.cCheck} onPress={() => setSel((cur) => ({ ...cur, [id]: !cur[id] }))}>
                  <Feather name={sel[id] ? 'check-square' : 'square'} size={16} color={sel[id] ? '#1d4ed8' : '#94a3b8'} />
                </TouchableOpacity>
                <View style={[s.cPartner, isMobile && { flexBasis: 0, flexGrow: 1 }]}>
                  <Text style={s.itemName} numberOfLines={1}>{p.company_name || p.partner_name}</Text>
                  <Text style={s.small} numberOfLines={1}>#{id} · {p.username}{!meta.opsOnly ? ` · ${p.role === 'operator' ? 'Operator' : 'Distributor'}` : ''}{p.status && p.status !== 'enabled' ? ` · ${p.status}` : ''}{kind === 'pg' && p.wallet_mode === 'split' ? ' · split wallets' : ''}</Text>
                  {isMobile ? <View style={{ marginTop: 8 }}>{notReady ? <Text style={s.small}>—</Text> : cell(p)}</View> : null}
                </View>
                {!isMobile ? <View style={s.cSetting}>{notReady ? <Text style={s.small}>—</Text> : cell(p)}</View> : null}
              </View>
            );
          })}
          {!view.length ? <Text style={[s.small, { padding: 16 }]}>No partners match.</Text> : null}
          </ScrollView>
        </View>
      </ScrollView>
      <View style={[s.rowBetween, { marginTop: 10 }]}>
        <Text style={s.small}>{rows.length} {meta.opsOnly ? 'operator(s)' : 'partner(s)'}{selIds.length ? ` · ${selIds.length} ticked` : ''}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity style={[s.pg, page <= 1 && { opacity: 0.4 }]} disabled={page <= 1} onPress={() => setPage(page - 1)}><Feather name="chevron-left" size={15} color="#0f172a" /></TouchableOpacity>
          <Text style={[s.small, { fontWeight: '700', color: '#0f172a' }]}>{page} / {pages}</Text>
          <TouchableOpacity style={[s.pg, page >= pages && { opacity: 0.4 }]} disabled={page >= pages} onPress={() => setPage(page + 1)}><Feather name="chevron-right" size={15} color="#0f172a" /></TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------------------------
// allowed(cardId): staff see only the buttons their role has (Staff roles › Partner Bulk Operations)
export const PartnersBulkPage = ({ isMobile, isSuperAdmin, allowed = () => true, onBack }) => {
  const runTypes = Object.keys(RUNS).filter((t) => (!RUNS[t].sa || isSuperAdmin) && allowed(t));
  const firstAllowed = ['internet', 'iptv', 'ott', 'branches', 'plans', 'iptv_plans', 'ott_plans', 'set_kyc', 'set_pg', 'set_aadhaar', 'set_profile', 'keys']
    .find((id) => (RUNS[id] ? runTypes.includes(id) : isSuperAdmin && allowed(id)));
  const [active, setActive] = useState(firstAllowed);
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState({}); // id -> { ok, message, at }
  const [singleBusy, setSingleBusy] = useState('');
  const timer = useRef(null);
  const panelRef = useRef(null);
  // a card picked: bring its activity into view (on a phone it is below all the cards)
  const pick = (id) => {
    setActive(id);
    setTimeout(() => {
      const el = panelRef.current;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const load = useCallback(async (type) => {
    const res = await OneBssApi.partnersBulkSyncStatus(type);
    if (res.ok && res.data?.success) setStatus((x) => ({ ...x, [type]: res.data }));
  }, []);
  useEffect(() => { runTypes.forEach((t) => load(t)); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // refresh every 4 s: the open run, and any other run that is going
  const anyRunning = runTypes.some((t) => status[t]?.running);
  const activeIsRun = !!RUNS[active];
  useEffect(() => {
    if (!anyRunning && !activeIsRun) return undefined;
    timer.current = setInterval(() => {
      runTypes.forEach((t) => { if (t === active || status[t]?.running) load(t); });
    }, 4000);
    return () => clearInterval(timer.current);
  }, [anyRunning, active, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (type, action) => {
    setBusy(true);
    // the run is on the server within a moment: show it even while the reply is still on its way
    const early = action !== 'stop' ? setTimeout(() => load(type), 2500) : null;
    const res = await OneBssApi.partnersBulkSync(type, action);
    if (early) clearTimeout(early);
    setBusy(false);
    if (res.data && res.data.items) setStatus((x) => ({ ...x, [type]: res.data }));
    load(type); // show the run right away (also when the reply said nothing useful)
    if (res.data?.already_running) { toast.info(res.data.message || 'This sync is already running.'); return; }
    if (!res.ok || res.data?.success === false) { toast.error(res.data?.message || 'Could not start'); return; }
    toast.success(res.data?.message || 'Done');
    setTimeout(() => load(type), 1500);
  };

  // IPTV channel-list run (after the reply): read on opening the card, then every 4 s while it runs
  const [iptvChannels, setIptvChannels] = useState(null);
  const pollChannels = useCallback(async () => {
    const res = await OneBssApi.getIptvPlanSyncStatus();
    if (res.ok && res.data?.success) setIptvChannels(res.data.channels || null);
  }, []);
  useEffect(() => { if (active === 'iptv_plans') pollChannels(); }, [active, pollChannels]);
  useEffect(() => {
    if (active !== 'iptv_plans' || iptvChannels?.state !== 'running') return undefined;
    const t = setTimeout(pollChannels, 4000);
    return () => clearTimeout(t);
  }, [active, iptvChannels, pollChannels]);

  const runSingle = async (id) => {
    setSingleBusy(id);
    const res = await SINGLES[id].call();
    setSingleBusy('');
    if (id === 'iptv_plans' && res.data?.channels) setIptvChannels(res.data.channels);
    if (id === 'iptv_plans') setTimeout(pollChannels, 1500);
    const ok = res.ok && res.data?.success !== false;
    const d = res.data || {};
    const msg = d.message || (ok ? 'Synced' : 'Sync failed');
    const extra = d.summary ? ` · ${Object.entries(d.summary).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')}` : '';
    setSingle((x) => ({ ...x, [id]: { ok, message: msg + extra, at: new Date().toLocaleTimeString() } }));
    if (ok) toast.success(msg); else toast.error(msg);
  };

  const cards = [
    { group: 'Sync customers & setup', items: runTypes.map((t) => ({ id: t, ...RUNS[t] })) },
    ...(isSuperAdmin ? [
      { group: 'Sync plan catalogs', items: [
        ...(runTypes.includes('plans') ? [{ id: 'plans', ...RUNS.plans }] : []),
        ...Object.entries(SINGLES).filter(([id]) => allowed(id)).map(([id, m]) => ({ id, ...m })),
      ] },
      { group: 'Partner settings', items: Object.entries(SETTINGS).filter(([id]) => allowed(id)).map(([id, m]) => ({ id, ...m })) },
      { group: 'Imports', items: allowed('keys') ? [
        { id: 'keys', title: 'Import RADIUS keys', icon: 'key', color: '#9a7344', about: 'CSV / Excel: Internet Partner ID + API Key.' },
      ] : [] },
    ] : []),
  ].filter((g) => g.items.length);
  // "Sync Internet plans" sits with the plan catalogs
  cards.forEach((g) => { if (g.group === 'Sync customers & setup') g.items = g.items.filter((c) => c.id !== 'plans'); });
  const shown = cards.filter((g) => g.items.length);

  const cardBadge = (id) => {
    if (RUNS[id]) {
      const st = status[id];
      if (st?.running) return { text: `${finishedCount(st.counts)}/${st.counts?.total || 0}`, color: '#2563eb', spin: true };
      if (st?.interrupted) return { text: 'Interrupted', color: '#b45309' };
      if (st?.finished_at) return { text: `Last ${String(st.finished_at).slice(5, 16)}`, color: '#64748b' };
      return null;
    }
    if (singleBusy === id) return { text: 'Syncing', color: '#2563eb', spin: true };
    if (single[id]) return { text: single[id].ok ? 'Done' : 'Failed', color: single[id].ok ? '#16a34a' : '#dc2626' };
    return null;
  };

  const visibleIds = shown.flatMap((g) => g.items.map((c) => c.id));
  const meta = visibleIds.includes(active) ? (RUNS[active] || SINGLES[active] || shown.flatMap((g) => g.items).find((c) => c.id === active)) : null;

  return (
    <View style={{ gap: 14 }}>
      <View style={s.head}>
        {onBack ? (
        <TouchableOpacity onPress={onBack} style={s.back} accessibilityLabel="Back to partners">
          <Feather name="arrow-left" size={16} color="#0f172a" />
          {!isMobile ? <Text style={s.backText}>Partners</Text> : null}
        </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.title}>Bulk operations</Text>
          <Text style={s.small} numberOfLines={2}>Syncs, imports and settings for {isSuperAdmin ? 'all partners' : 'all partners under you'}.</Text>
        </View>
      </View>

      {!shown.length ? <View style={{ marginTop: 16 }}><Note tone="info" text="Your staff role has no Bulk Operations buttons. Ask your admin (Staff & Roles › Partner Bulk Operations)." /></View> : null}
      {shown.map((g) => (
        <View key={g.group}>
          <Text style={s.group}>{g.group.toUpperCase()}</Text>
          <View style={s.grid}>
            {g.items.map((c) => {
              const b = cardBadge(c.id);
              const on = active === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => pick(c.id)}
                  style={[s.card, isMobile && { flexBasis: '100%' },
                    { borderLeftColor: c.color },
                    on && { borderColor: `${c.color}80`, borderLeftColor: c.color, backgroundColor: `${c.color}0a` }]}
                >
                  <View style={[s.cardIcon, { backgroundColor: `${c.color}${on ? '1f' : '14'}` }]}><Feather name={c.icon} size={17} color={c.color} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.cardTitle} numberOfLines={1}>{c.title}</Text>
                    {b ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        {b.spin ? <ActivityIndicator size="small" color={b.color} style={{ transform: [{ scale: 0.7 }] }} /> : null}
                        <Text style={[s.small, { color: b.color, fontWeight: '700' }]} numberOfLines={1}>{b.text}</Text>
                      </View>
                    ) : <Text style={s.small} numberOfLines={1}>{RUNS[c.id] ? 'Not run yet' : 'Open'}</Text>}
                  </View>
                  <Feather name={on ? 'chevron-down' : 'chevron-right'} size={16} color={on ? c.color : '#94a3b8'} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {/* the activity of the picked card, right below */}
      {meta ? (
        <View ref={panelRef} style={[s.panel, { borderTopColor: meta.color }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Feather name={meta.icon} size={17} color={meta.color} />
            <Text style={s.panelTitle}>{meta.title}</Text>
          </View>
          {RUNS[active] ? (
            <RunActivity key={active} type={active} st={status[active]} busy={busy} onAct={(a) => act(active, a)} scopeLabel={isSuperAdmin ? '' : 'operators under you'} />
          ) : SINGLES[active] ? (
            <SingleActivity id={active} last={single[active]} busy={singleBusy === active} onRun={() => runSingle(active)} channels={iptvChannels} />
          ) : active === 'keys' ? (
            <RadiusKeyImportModal visible inline onClose={() => {}} />
          ) : SETTINGS[active] ? (
            <PartnerSettings key={active} isMobile={isMobile} mode={active} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  backText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  group: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexBasis: 250, flexGrow: 1, maxWidth: 420, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  panel: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderTopWidth: 3, padding: 16 },
  panelTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  about: { fontSize: 12.5, color: '#475569', lineHeight: 18 },
  actRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  resultBox: { marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  big: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  small: { fontSize: 11.5, color: '#64748b' },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: 8 },
  barFill: { height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, fontWeight: '700' },
  list: { marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  itemName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  stateText: { fontSize: 11, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#ffffff' },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
  seg: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  segOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  segText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  bulkBar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 10 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', borderBottomColor: '#e2e8f0', borderBottomWidth: 2 },
  th: { fontSize: 10.5, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  cCheck: { width: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cPartner: { flexBasis: 230, flexGrow: 1.4, flexShrink: 0, minWidth: 0, paddingRight: 12 },
  cKyc: { flexBasis: 300, flexGrow: 1.4, flexShrink: 0, minWidth: 0, paddingRight: 12 },
  cPg: { flexBasis: 280, flexGrow: 1.2, flexShrink: 0, minWidth: 0, paddingRight: 12 },
  cSw: { flexBasis: 150, flexGrow: 0.6, flexShrink: 0, minWidth: 0, paddingRight: 12 },
  cSetting: { flexBasis: 420, flexGrow: 3, flexShrink: 0, minWidth: 0, paddingRight: 12 },
  tag: { fontSize: 10.5, fontWeight: '700', borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 5 },
  noIptv: { fontSize: 10.5, fontWeight: '800', color: '#b45309', backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  failList: { marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fee2e2', gap: 3 },
  failRow: { fontSize: 11.5 },
  walletTag: { minWidth: 64, textAlign: 'center', fontSize: 10.5, fontWeight: '800', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, letterSpacing: 0.3 },
  chipCell: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  optOn: { borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' },
  optOnBlue: { borderColor: '#7dd3fc', backgroundColor: '#f0f9ff' },
  optSome: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  optText: { fontSize: 11.5, fontWeight: '700', color: '#64748b' },
  pg: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
