import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Modal, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { parseApiDate, formatApiDate } from '../components/CustomerAccountsOverview';

/**
 * Super admin › IPTV Auto-Renewals: the already-paid IPTV months the hourly cron renews on
 * Pioneer (cron/iptv_scheduled_renewals.php).
 *   Customers — one row per customer (STB); click a row for the details: the recharges and
 *               their packs, every paid month with its status, each try, Retry now / Cancel.
 *   Cron runs — every hourly run and what it did.
 */
const IPTV = '#7c3aed';

const CUSTOMER_STATE = {
  failed: { label: 'FAILED', fg: '#b91c1c', bg: '#fee2e2', icon: 'x-circle' },
  retrying: { label: 'RETRYING', fg: '#b45309', bg: '#fef3c7', icon: 'rotate-cw' },
  active: { label: 'ACTIVE', fg: '#6d28d9', bg: '#ede9fe', icon: 'clock' },
  completed: { label: 'COMPLETED', fg: '#047857', bg: '#dcfce7', icon: 'check-circle' },
};
const MONTH_STATE = {
  waiting: { label: 'UPCOMING', fg: '#475569', bg: '#f1f5f9', icon: 'clock' },
  retrying: { label: 'RETRYING', fg: '#b45309', bg: '#fef3c7', icon: 'rotate-cw' },
  done: { label: 'RENEWED', fg: '#047857', bg: '#dcfce7', icon: 'check-circle' },
  failed: { label: 'FAILED', fg: '#b91c1c', bg: '#fee2e2', icon: 'x-circle' },
  cancelled: { label: 'CANCELLED', fg: '#64748b', bg: '#f1f5f9', icon: 'slash' },
  check: { label: 'CHECK', fg: '#b45309', bg: '#fef3c7', icon: 'help-circle' },
};
const ACTION = {
  renewed: { label: 'Renewed', fg: '#047857', icon: 'check-circle' },
  already_renewed: { label: 'Already renewed — not sent again', fg: '#047857', icon: 'check-circle' },
  retry_later: { label: 'Failed — retry in 1 h', fg: '#b45309', icon: 'rotate-cw' },
  failed: { label: 'Failed — gave up', fg: '#b91c1c', icon: 'x-circle' },
  cancelled: { label: 'Cancelled', fg: '#64748b', icon: 'slash' },
  skipped: { label: 'Skipped — STB still active', fg: '#475569', icon: 'skip-forward' },
  error: { label: 'Error', fg: '#b91c1c', icon: 'alert-triangle' },
};
const RUN = {
  running: { label: 'RUNNING', fg: '#1d4ed8', bg: '#dbeafe' },
  ok: { label: 'OK', fg: '#047857', bg: '#dcfce7' },
  errors: { label: 'WITH ERRORS', fg: '#b45309', bg: '#fef3c7' },
  crashed: { label: 'CRASHED', fg: '#b91c1c', bg: '#fee2e2' },
  skipped: { label: 'SKIPPED', fg: '#64748b', bg: '#f1f5f9' },
};
const FILTERS = [
  { id: '', label: 'All' },
  { id: 'problems', label: 'Problems' },
  { id: 'retrying', label: 'Retrying' },
  { id: 'failed', label: 'Failed' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Completed' },
];
const fmt = (d) => (parseApiDate(d) ? formatApiDate(d) : '—');
const fmtDay = (d) => (parseApiDate(d) ? formatApiDate(d, false) : '—');
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KIND = { iptv: 'IPTV recharge', combo: 'Combo recharge', internet: 'Recharge' };

const Pill = ({ conf, small }) => (
  <View style={[s.pill, { backgroundColor: conf.bg }, small && { paddingHorizontal: 6, paddingVertical: 2 }]}>
    {conf.icon ? <Feather name={conf.icon} size={small ? 10 : 11} color={conf.fg} /> : null}
    <Text style={[s.pillText, { color: conf.fg }, small && { fontSize: 10 }]}>{conf.label}</Text>
  </View>
);

/* ------------------------------------------------------------------ */
/* Customer details                                                     */
/* ------------------------------------------------------------------ */
const CustomerDetails = ({ iptvId, onClose, onChanged, isMobile }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('months');
  const [open, setOpen] = useState({}); // month id -> tries shown
  const [showCancelled, setShowCancelled] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await OneBssApi.getIptvRenewalCustomer(iptvId);
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || 'Could not load this customer.');
      return;
    }
    setError('');
    setData(res.data);
  }, [iptvId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action, m) => {
    if (action === 'cancel' && typeof window !== 'undefined' && !window.confirm(`Cancel month ${m.month_no} (${fmtDay(m.start_date)} → ${fmtDay(m.end_date)}) and the later months of the same recharge? No refund is made.`)) return;
    setBusy(m.id);
    const res = await OneBssApi.iptvRenewalAction(action, m.id);
    setBusy(null);
    const msg = res.data?.message || (res.ok ? 'Done.' : 'Failed.');
    if (res.ok && res.data?.success !== false) toast.success(msg);
    else toast.error(msg);
    load();
    if (onChanged) onChanged();
  };

  const c = data?.customer;
  const months = data?.months || [];
  const tries = data?.tries || [];
  const triesByMonth = useMemo(() => {
    const map = {};
    tries.forEach((t) => {
      (map[t.schedule_id] = map[t.schedule_id] || []).push(t);
    });
    return map;
  }, [tries]);
  const live = months.filter((m) => m.status !== 'cancelled');
  const renewed = live.filter((m) => m.status === 'done').length;
  const next = live.filter((m) => m.status === 'waiting').sort((a, b) => String(a.next_try_at).localeCompare(String(b.next_try_at)))[0];
  const cancelledCount = months.length - live.length;

  // months grouped by recharge, newest recharge first
  const groups = useMemo(() => {
    const byLog = {};
    months.forEach((m) => {
      if (m.status === 'cancelled' && !showCancelled) return;
      (byLog[m.log_id] = byLog[m.log_id] || []).push(m);
    });
    const info = {};
    (data?.recharges || []).forEach((r) => {
      info[r.log_id] = r;
    });
    return Object.keys(byLog)
      .map((id) => ({ logId: Number(id), info: info[id] || {}, months: byLog[id] }))
      .sort((a, b) => b.logId - a.logId);
  }, [months, data, showCancelled]);

  const monthRow = (m) => {
    const conf = MONTH_STATE[m.state] || MONTH_STATE.waiting;
    const canAct = ['waiting', 'failed', 'check'].includes(m.status);
    const due = parseApiDate(m.due_at) && parseApiDate(m.due_at).getTime() <= Date.now();
    const mt = triesByMonth[m.id] || [];
    const isOpen = !!open[m.id];
    const note = m.status === 'done'
      ? `Renewed ${fmt(m.done_at)}${m.invoice_no ? ` · Invoice ${m.invoice_no}` : ''}`
      : m.status === 'waiting'
        ? `${m.tries ? 'Next try' : 'Renews'} ${fmt(m.next_try_at)}`
        : m.status === 'cancelled'
          ? (m.last_error || 'Cancelled')
          : m.last_tried_at ? `Last try ${fmt(m.last_tried_at)}` : '';
    return (
      <View key={m.id} style={s.monthWrap}>
        <TouchableOpacity style={[s.monthRow, isMobile && { flexWrap: 'wrap' }]} onPress={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))} activeOpacity={0.7}>
          <View style={[s.dot, { backgroundColor: conf.fg }]} />
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={s.monthTitle}>Month {m.month_no} · {fmtDay(m.start_date)} → {fmtDay(m.end_date)}</Text>
            <Text style={s.sub} numberOfLines={2}>{note}</Text>
            {m.last_error && ['waiting', 'failed', 'check'].includes(m.status) ? <Text style={[s.sub, { color: '#b91c1c' }]} numberOfLines={3}>{m.last_error}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Pill conf={conf} small />
            {m.tries ? <Text style={[s.sub, { color: m.status === 'done' ? '#64748b' : '#b45309' }]}>{m.tries}/{m.max_tries} tries</Text> : null}
          </View>
          <View style={s.monthActions}>
            {canAct && due ? (
              <TouchableOpacity style={[s.smallBtn, { borderColor: `${IPTV}66` }]} onPress={() => act('retry_now', m)} disabled={busy === m.id}>
                {busy === m.id ? <ActivityIndicator size="small" color={IPTV} /> : <Feather name="refresh-cw" size={12} color={IPTV} />}
                <Text style={[s.smallBtnText, { color: IPTV }]}>Retry now</Text>
              </TouchableOpacity>
            ) : null}
            {canAct ? (
              <TouchableOpacity style={[s.smallBtn, { borderColor: '#fca5a5' }]} onPress={() => act('cancel', m)} disabled={busy === m.id}>
                <Feather name="slash" size={12} color="#dc2626" />
                <Text style={[s.smallBtnText, { color: '#dc2626' }]}>Cancel</Text>
              </TouchableOpacity>
            ) : null}
            <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
          </View>
        </TouchableOpacity>
        {isOpen ? (
          <View style={s.triesBox}>
            {mt.length ? mt.map((a) => {
              const ac = ACTION[a.action] || ACTION.error;
              return (
                <View key={a.id} style={s.tryRow}>
                  <Feather name={ac.icon} size={13} color={ac.fg} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tryTitle, { color: ac.fg }]}>{ac.label} <Text style={s.sub}>· {fmt(a.tried_at)}{a.run_id ? ` · cron run #${a.run_id}` : ' · by hand'}</Text></Text>
                    <Text style={s.tryMsg}>{a.message}</Text>
                    <Text style={s.sub}>{a.real_expiry ? `Real expiry before: ${fmt(a.real_expiry)}` : 'Real expiry: not read'}{a.http ? ` · HTTP ${a.http}` : ''}{a.invoice_no ? ` · Invoice ${a.invoice_no}` : ''}</Text>
                  </View>
                </View>
              );
            }) : <Text style={s.sub}>{m.status === 'waiting' ? 'Not tried yet — it is sent after the previous month expires.' : 'No tries recorded.'}</Text>}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.backdrop, !isMobile && { alignItems: 'flex-end', padding: 0 }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[s.panel, isMobile ? s.panelMobile : s.panelSide]}>
          {/* head */}
          <View style={s.panelHead}>
            <View style={s.avatar}><Feather name="tv" size={18} color={IPTV} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.panelTitle} numberOfLines={1}>{c?.customer || (c ? `STB ${c.stb}` : 'Customer')}</Text>
              {c ? <Text style={s.sub} numberOfLines={2}>STB {c.stb}{c.mobile ? ` · ${c.mobile}` : ''}{c.operator ? ` · ${c.operator}` : ''}{c.cust_id ? ` · Cust #${c.cust_id}` : ''}</Text> : null}
            </View>
            <TouchableOpacity onPress={load} style={s.iconBtn} accessibilityLabel="Reload">
              {loading ? <ActivityIndicator size="small" color={IPTV} /> : <Feather name="refresh-cw" size={14} color={IPTV} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={s.iconBtn} accessibilityLabel="Close"><Feather name="x" size={16} color="#334155" /></TouchableOpacity>
          </View>

          {error ? <Text style={[s.error, { padding: 16 }]}>{error}</Text> : null}
          {!data && loading ? <ActivityIndicator size="large" color={IPTV} style={{ marginVertical: 40 }} /> : null}

          {data ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
              <View style={s.facts}>
                {[
                  { label: 'Real expiry (Pioneer)', value: fmt(c.real_expiry) },
                  { label: 'Paid till', value: fmt(c.paid_till) },
                  { label: 'Months renewed', value: `${renewed} of ${live.length}` },
                  { label: 'Next renewal', value: next ? fmt(next.next_try_at) : '—' },
                ].map((f) => (
                  <View key={f.label} style={s.fact}>
                    <Text style={s.factLabel}>{f.label}</Text>
                    <Text style={s.factValue}>{f.value}</Text>
                  </View>
                ))}
              </View>

              <View style={s.switchRow}>
                {[
                  { id: 'months', label: 'Months', icon: 'calendar' },
                  { id: 'activity', label: `Activity (${tries.length})`, icon: 'activity' },
                ].map((v) => (
                  <TouchableOpacity key={v.id} style={[s.switchBtn, tab === v.id && s.switchOn]} onPress={() => setTab(v.id)}>
                    <Feather name={v.icon} size={13} color={tab === v.id ? '#ffffff' : '#475569'} />
                    <Text style={[s.switchText, tab === v.id && { color: '#ffffff' }]}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {tab === 'months' ? (
                <>
                  {groups.map((g) => (
                    <View key={g.logId} style={s.group}>
                      <View style={s.groupHead}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.groupTitle}>
                            {KIND[g.info.kind] || 'Recharge'} #{g.logId}{g.info.renewal === 'advance' ? ' · advance' : ''}
                          </Text>
                          <Text style={s.sub}>{g.info.created_at ? `Paid ${fmt(g.info.created_at)}` : ''}{g.info.amount ? ` · ${money(g.info.amount)}` : ''}</Text>
                        </View>
                      </View>
                      {g.info.packs && g.info.packs.length ? (
                        <View style={s.packs}>
                          {g.info.packs.map((p, i) => (
                            <View key={i} style={s.pack}><Text style={s.packText}>{p.name}{p.type ? ` · ${p.type}` : ''}</Text></View>
                          ))}
                        </View>
                      ) : null}
                      {g.months.map(monthRow)}
                    </View>
                  ))}
                  {!groups.length ? <Text style={[s.sub, { textAlign: 'center', padding: 16 }]}>No months to show.</Text> : null}
                  {cancelledCount ? (
                    <TouchableOpacity onPress={() => setShowCancelled((v) => !v)} style={{ alignSelf: 'center', padding: 6 }}>
                      <Text style={[s.sub, { color: IPTV, fontWeight: '700' }]}>{showCancelled ? 'Hide' : 'Show'} {cancelledCount} cancelled month{cancelledCount > 1 ? 's' : ''}</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <View style={s.group}>
                  {tries.length ? tries.map((a) => {
                    const ac = ACTION[a.action] || ACTION.error;
                    return (
                      <View key={a.id} style={[s.tryRow, { paddingHorizontal: 12 }]}>
                        <Feather name={ac.icon} size={13} color={ac.fg} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.tryTitle, { color: ac.fg }]}>{ac.label} <Text style={s.sub}>· month {a.month_no} · {fmt(a.tried_at)}{a.run_id ? ` · run #${a.run_id}` : ' · by hand'}</Text></Text>
                          <Text style={s.tryMsg}>{a.message}</Text>
                        </View>
                      </View>
                    );
                  }) : <Text style={[s.sub, { padding: 16 }]}>Nothing has been tried for this customer yet.</Text>}
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Screen                                                               */
/* ------------------------------------------------------------------ */
export const IptvRenewalsScreen = ({ refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [view, setView] = useState('customers');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // iptv_id
  const [tries, setTries] = useState(null); // cron run tries

  const load = useCallback(async () => {
    setLoading(true);
    const res = await OneBssApi.getIptvRenewalMonitor({ view: 'customers', status: filter, q: query, page, limit: 50 });
    setLoading(false);
    if (!res.ok || res.data?.success === false) {
      setError(res.data?.message || `Could not load (HTTP ${res.status}).`);
      return;
    }
    setError('');
    setData(res.data);
  }, [filter, query, page]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const openRunTries = async (run) => {
    const title = `Cron run #${run.run_id} · ${fmt(run.started_at)}`;
    setTries({ title, rows: [], loading: true });
    const res = await OneBssApi.getIptvRenewalTries({ runId: run.run_id });
    setTries({ title, rows: res.data?.data || [], loading: false, error: res.ok ? '' : res.data?.message || 'Could not load' });
  };

  const sum = data?.summary;
  const counts = sum?.counts || {};
  const lastRun = sum?.last_run;
  const pick = (f) => () => { setView('customers'); setFilter(f); setPage(1); };
  const tiles = [
    { label: 'Renewed today', value: sum?.done_today, color: '#047857', icon: 'check-circle' },
    { label: 'Retrying now', value: counts.retrying, color: '#b45309', icon: 'rotate-cw', onPress: pick('retrying') },
    { label: 'Failed', value: counts.failed, color: '#b91c1c', icon: 'x-circle', onPress: pick('failed') },
    { label: 'Due in 24 h', value: sum?.due_next_24h, color: IPTV, icon: 'calendar', onPress: pick('upcoming') },
    { label: 'Months waiting', value: counts.waiting, color: '#475569', icon: 'clock' },
    { label: 'Errors today', value: sum?.errors_today, color: '#b91c1c', icon: 'alert-triangle' },
  ];
  const customers = data?.customers || [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  const customersTable = (
    <View style={s.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
        <View style={{ minWidth: 1100, flexGrow: 1 }}>
          <View style={[s.tr, s.thRow]}>
            <Text style={[s.th, { width: 210 }]}>Customer</Text>
            <Text style={[s.th, { width: 110 }]}>STB</Text>
            <Text style={[s.th, { width: 140 }]}>Operator</Text>
            <Text style={[s.th, { width: 120 }]}>Status</Text>
            <Text style={[s.th, { width: 150 }]}>Months renewed</Text>
            <Text style={[s.th, { width: 120 }]}>Paid till</Text>
            <Text style={[s.th, { width: 150 }]}>Next renewal</Text>
            <Text style={[s.th, { flex: 1, minWidth: 200 }]}>Last issue</Text>
            <View style={{ width: 20 }} />
          </View>
          {customers.map((c) => {
            const conf = CUSTOMER_STATE[c.state] || CUSTOMER_STATE.active;
            const live = c.months_total - c.cancelled;
            const pct = live ? Math.round((c.done / live) * 100) : 0;
            return (
              <TouchableOpacity key={c.iptv_id} style={s.tr} onPress={() => setSelected(c.iptv_id)} activeOpacity={0.7}>
                <View style={{ width: 210, paddingRight: 8 }}>
                  <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={1}>{c.customer || '—'}</Text>
                  <Text style={s.sub} numberOfLines={1}>{c.mobile || ''}{c.cust_id ? ` · #${c.cust_id}` : ''}</Text>
                </View>
                <Text style={[s.td, { width: 110 }]} numberOfLines={1}>{c.stb || `#${c.iptv_id}`}</Text>
                <Text style={[s.td, { width: 140, paddingRight: 8 }]} numberOfLines={1}>{c.operator || `#${c.partner_id}`}</Text>
                <View style={{ width: 120 }}><Pill conf={conf} /></View>
                <View style={{ width: 150, paddingRight: 16 }}>
                  <Text style={s.td}>{c.done} of {live}{c.failed ? <Text style={{ color: '#b91c1c' }}> · {c.failed} failed</Text> : null}</Text>
                  <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: c.failed ? '#ef4444' : '#10b981' }]} /></View>
                </View>
                <Text style={[s.td, { width: 120 }]}>{fmtDay(c.paid_till)}</Text>
                <Text style={[s.td, { width: 150, color: c.retrying ? '#b45309' : COLORS.textMain }]}>{c.next_try ? fmt(c.next_try) : '—'}</Text>
                <Text style={[s.td, { flex: 1, minWidth: 200, fontSize: 12, color: c.last_error ? '#b91c1c' : '#94a3b8' }]} numberOfLines={2}>{c.last_error || 'No issues'}</Text>
                <Feather name="chevron-right" size={16} color="#94a3b8" style={{ width: 20 }} />
              </TouchableOpacity>
            );
          })}
          {!loading && !customers.length ? <Text style={[s.sub, { padding: 24, textAlign: 'center' }]}>No customers here.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );

  const runsTable = (
    <View style={s.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
        <View style={{ minWidth: 1000, flexGrow: 1 }}>
          <View style={[s.tr, s.thRow]}>
            <Text style={[s.th, { width: 70 }]}>Run</Text>
            <Text style={[s.th, { width: 170 }]}>Started</Text>
            <Text style={[s.th, { width: 80 }]}>Took</Text>
            <Text style={[s.th, { width: 120 }]}>Status</Text>
            {['Due', 'Renewed', 'Already', 'Retry', 'Failed', 'Cancelled'].map((h) => (
              <Text key={h} style={[s.th, { width: 78, textAlign: 'center' }]}>{h}</Text>
            ))}
            <Text style={[s.th, { flex: 1, minWidth: 120, paddingLeft: 12 }]}>Note</Text>
          </View>
          {(data?.runs || []).map((r) => {
            const started = parseApiDate(r.started_at);
            const finished = parseApiDate(r.finished_at);
            const took = started && finished ? Math.max(0, Math.round((finished - started) / 1000)) : null;
            return (
              <TouchableOpacity key={r.run_id} style={s.tr} onPress={() => openRunTries(r)}>
                <Text style={[s.td, { width: 70, color: '#64748b' }]}>#{r.run_id}</Text>
                <Text style={[s.td, { width: 170 }]}>{fmt(r.started_at)}</Text>
                <Text style={[s.td, { width: 80 }]}>{took === null ? '—' : `${took}s`}</Text>
                <View style={{ width: 120 }}><Pill conf={RUN[r.status] || RUN.ok} /></View>
                {[r.due, r.renewed, r.already_done, r.retry_later, r.failed, r.cancelled].map((v, i) => (
                  <Text key={i} style={[s.td, { width: 78, textAlign: 'center', fontWeight: v ? '700' : '400', color: v ? ['#334155', '#047857', '#047857', '#b45309', '#b91c1c', '#64748b'][i] : '#cbd5e1' }]}>{v}</Text>
                ))}
                <Text style={[s.sub, { flex: 1, minWidth: 120, paddingLeft: 12 }]} numberOfLines={2}>{r.message || ''}</Text>
              </TouchableOpacity>
            );
          })}
          {!loading && !(data?.runs || []).length ? <Text style={[s.sub, { padding: 24, textAlign: 'center' }]}>The cron has not run yet.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 14 }}>
        {/* {sum ? (
          <View style={[s.health, sum.cron_healthy ? s.healthOk : s.healthBad]}>
            <Feather name={sum.cron_healthy ? 'activity' : 'alert-octagon'} size={16} color={sum.cron_healthy ? '#047857' : '#b91c1c'} />
            <Text style={[s.healthText, { color: sum.cron_healthy ? '#065f46' : '#991b1b' }]}>
              {sum.cron_healthy
                ? `Cron is running · last run finished ${fmt(sum.last_finished)}`
                : sum.last_finished
                  ? `No cron run since ${fmt(sum.last_finished)} — it should run every hour. Check the hPanel cron job.`
                  : 'The cron has never run — add the hourly cron job in hPanel (2 * * * *).'}
              {lastRun && lastRun.status === 'crashed' ? ` · Last run crashed: ${lastRun.message || ''}` : ''}
            </Text>
            <TouchableOpacity onPress={load} style={s.iconBtn} accessibilityLabel="Refresh">
              {loading ? <ActivityIndicator size="small" color={IPTV} /> : <Feather name="refresh-cw" size={14} color={IPTV} />}
            </TouchableOpacity>
          </View>
        ) : null} */}
        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.tiles}>
          {tiles.map((t) => (
            <TouchableOpacity key={t.label} style={[s.tile, isMobile && { minWidth: '46%' }]} onPress={t.onPress} disabled={!t.onPress}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name={t.icon} size={13} color={t.color} />
                <Text style={[s.tileLabel, { color: t.color }]}>{t.label}</Text>
              </View>
              <Text style={[s.tileValue, { color: t.color }]}>{t.value ?? (loading ? '…' : 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.switchRow}>
          {[
            { id: 'customers', label: 'Customers', icon: 'users' },
            { id: 'runs', label: 'Cron runs', icon: 'terminal' },
          ].map((v) => (
            <TouchableOpacity key={v.id} style={[s.switchBtn, view === v.id && s.switchOn]} onPress={() => setView(v.id)}>
              <Feather name={v.icon} size={13} color={view === v.id ? '#ffffff' : '#475569'} />
              <Text style={[s.switchText, view === v.id && { color: '#ffffff' }]}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {view === 'customers' ? (
          <>
            <View style={[s.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {FILTERS.map((f) => (
                  <TouchableOpacity key={f.id || 'all'} style={[s.chip, filter === f.id && s.chipOn]} onPress={() => { setFilter(f.id); setPage(1); }}>
                    <Text style={[s.chipText, filter === f.id && { color: '#ffffff' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={[s.search, isMobile && { width: '100%', maxWidth: '100%' }]}>
                <Feather name="search" size={14} color="#94a3b8" />
                <TextInput
                  style={s.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  onSubmitEditing={() => { setQuery(search.trim()); setPage(1); }}
                  placeholder="Customer, mobile, STB, operator…"
                  placeholderTextColor="#94a3b8"
                />
                {search ? <TouchableOpacity onPress={() => { setSearch(''); setQuery(''); setPage(1); }}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
              </View>
            </View>
            {loading && !data ? <ActivityIndicator size="large" color={IPTV} style={{ marginVertical: 30 }} /> : customersTable}
            {data && data.total > data.limit ? (
              <View style={s.pager}>
                <TouchableOpacity disabled={page <= 1} onPress={() => setPage((p) => p - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]}><Feather name="chevron-left" size={14} color="#334155" /></TouchableOpacity>
                <Text style={s.sub}>Page {page} of {pages} · {data.total} customers</Text>
                <TouchableOpacity disabled={page >= pages} onPress={() => setPage((p) => p + 1)} style={[s.pageBtn, page >= pages && { opacity: 0.4 }]}><Feather name="chevron-right" size={14} color="#334155" /></TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          runsTable
        )}
        {/* <Text style={s.foot}>
          The cron runs every hour. A month is sent after the previous month expires; if Pioneer refuses it or doesn't answer, it is tried again every hour, up to {sum?.max_tries || 5} times. Every try first reads the STB's real expiry from Pioneer, so a month that already went through is never sent twice. Click a customer to see every month and try.
        </Text> */}
      </ScrollView>

      {selected ? <CustomerDetails iptvId={selected} isMobile={isMobile} onClose={() => setSelected(null)} onChanged={load} /> : null}

      <Modal visible={!!tries} transparent animationType="fade" onRequestClose={() => setTries(null)}>
        <View style={s.backdrop}>
          <View style={[s.modal, isMobile && { width: '100%' }]}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle} numberOfLines={2}>{tries?.title}</Text>
              <TouchableOpacity onPress={() => setTries(null)}><Feather name="x" size={18} color="#334155" /></TouchableOpacity>
            </View>
            {tries?.loading ? (
              <ActivityIndicator size="small" color={IPTV} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 460 }}>
                {(tries?.rows || []).map((a) => {
                  const ac = ACTION[a.action] || ACTION.error;
                  return (
                    <View key={a.id} style={s.tryRow}>
                      <Feather name={ac.icon} size={13} color={ac.fg} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tryTitle, { color: ac.fg }]}>{ac.label} <Text style={s.sub}>· STB {a.stb} · month {a.month_no} · {fmt(a.tried_at)}</Text></Text>
                        <Text style={s.tryMsg}>{a.message}</Text>
                        <Text style={s.sub}>{a.real_expiry ? `Real expiry before: ${fmt(a.real_expiry)}` : 'Real expiry: not read'}{a.http ? ` · HTTP ${a.http}` : ''}{a.invoice_no ? ` · Invoice ${a.invoice_no}` : ''}</Text>
                      </View>
                    </View>
                  );
                })}
                {!(tries?.rows || []).length ? <Text style={[s.sub, { padding: 16 }]}>{tries?.error || 'Nothing was due in this run.'}</Text> : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  health: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  healthOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  healthBad: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  healthText: { flex: 1, fontSize: 13, fontWeight: '600' },
  iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 13, color: '#b91c1c' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, minWidth: 150, padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  tileLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  tileValue: { fontSize: 24, fontWeight: '800' },
  switchRow: { flexDirection: 'row', gap: 6, alignSelf: 'flex-start', padding: 4, borderRadius: 10, backgroundColor: '#f1f5f9' },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  switchOn: { backgroundColor: IPTV },
  switchText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, minWidth: 240, maxWidth: 340, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 9 },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  bar: { height: 5, borderRadius: 3, backgroundColor: '#f1f5f9', marginTop: 5, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 10.5, fontWeight: '800' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  pageBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  foot: { fontSize: 11.5, color: '#94a3b8' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { width: 680, maxWidth: '100%', backgroundColor: '#ffffff', borderRadius: 14, padding: 16 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: COLORS.textMain },
  // details panel
  panel: { backgroundColor: '#f8fafc', overflow: 'hidden' },
  panelSide: { width: 680, maxWidth: '100%', height: '100%', boxShadow: '-12px 0 30px rgba(15,23,42,0.18)' },
  panelMobile: { width: '100%', maxHeight: '94%', marginTop: 'auto', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, flexBasis: 130, minWidth: 130, padding: 12, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  factLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 },
  factValue: { fontSize: 13.5, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  group: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  groupTitle: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  pack: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe' },
  packText: { fontSize: 11, fontWeight: '600', color: '#5b21b6' },
  monthWrap: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  monthTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  monthActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 28, borderRadius: 7, borderWidth: 1, backgroundColor: '#ffffff' },
  smallBtnText: { fontSize: 11.5, fontWeight: '700' },
  triesBox: { marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef2f7' },
  tryRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tryTitle: { fontSize: 12.5, fontWeight: '700' },
  tryMsg: { fontSize: 12, color: '#334155', marginTop: 2 },
});
