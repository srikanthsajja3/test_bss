// StatsBoard.js — dashboard "Expiry & Registration" + Complaints + Leads, as statistic cards.
// Each card: a title, a refresh button and rows of "label ........ count". Every row is a button
// that opens the matching list. Internet / IPTV / OTT cards show Expiry on the left and
// Registration on the right (stacked on phones).
//   Large screens:  Internet · IPTV in one row; OTT · Complaints · Leads in the next
//   Medium:         Internet / IPTV / OTT one per row (two columns inside), Complaints · Leads side by side
//   Phones:         everything stacked, Expiry above Registration
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { OneBssApi } from '../../services/oneBssApi';
import { tabAllowed } from '../../services/staffAccess';

const EXPIRY_KEYS = ['expires_today', 'expires_tomorrow', 'expiring_next_7_days', 'expired_yesterday', 'expired_last_7_days'];
const REG_KEYS = ['registered_today', 'registered_yesterday', 'registered_this_month', 'registered_last_month'];
const FALLBACK = {
  expires_today: 'Expires today', expires_tomorrow: 'Expires tomorrow', expiring_next_7_days: 'Expires in next 7 days',
  expired_yesterday: 'Expired yesterday', expired_last_7_days: 'Expired in last 7 days',
  registered_today: 'Registered today', registered_yesterday: 'Registered yesterday',
  registered_this_month: 'Registered this month', registered_last_month: 'Registered last month',
};
const TONE = { soon: '#b45309', gone: '#be123c', reg: '#0369a1', ok: '#15803d', muted: '#475569', violet: '#7c3aed' };
const toneOf = (key) => (key.startsWith('expired') ? TONE.gone : key.startsWith('exp') ? TONE.soon : TONE.reg);

const COMPLAINT_ROWS = [
  { key: 'open', id: 1, label: 'Open', color: '#dc2626' },
  { key: 'in_progress', id: 6, label: 'In progress', color: '#2563eb' },
  { key: 'reopened', id: 3, label: 'Re-opened', color: '#b45309' },
  { key: 'resolved', id: 4, label: 'Resolved', color: '#15803d' },
  { key: 'closed', id: 5, label: 'Closed', color: '#475569' },
];

const fmt = (n) => (n == null ? '…' : Number(n).toLocaleString('en-IN'));
const go = (hash) => { if (typeof window !== 'undefined') window.location.hash = hash; };

// one "label ...... value" button
const StatRow = ({ label, value, color, onPress, last, dim }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    style={({ hovered, pressed }) => [s.row, !last && s.rowLine, (hovered || pressed) && s.rowHover]}
  >
    {({ hovered }) => (
      <>
        <Text style={[s.rowLabel, hovered && { color: '#0f172a' }]} numberOfLines={1}>{label}</Text>
        <View style={s.rowRight}>
          <Text style={[s.rowValue, { color: dim ? '#94a3b8' : color }]}>{value}</Text>
          <Feather name="chevron-right" size={13} color={hovered ? color : '#cbd5e1'} />
        </View>
      </>
    )}
  </Pressable>
);

const Card = ({ title, icon, onRefresh, busy, children, style, right }) => (
  <View style={[s.card, style]}>
    <View style={s.cardHead}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {icon}
        <Text style={s.cardTitle} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      {onRefresh ? (
        <Pressable onPress={onRefresh} disabled={busy} accessibilityLabel={`Refresh ${title}`} style={({ hovered }) => [s.refresh, hovered && { backgroundColor: '#f1f5f9' }]}>
          {busy ? <ActivityIndicator size="small" color="#64748b" style={{ transform: [{ scale: 0.7 }] }} /> : <Feather name="refresh-cw" size={14} color="#475569" />}
        </Pressable>
      ) : null}
    </View>
    {children}
  </View>
);

const SubHead = ({ text, color }) => (
  <View style={s.subHead}>
    <View style={[s.subDot, { backgroundColor: color }]} />
    <Text style={s.subHeadText}>{text}</Text>
  </View>
);

export const StatsBoard = ({ user, summary, summaryError, onReloadSummary, onNavigateToCustomers, refreshSignal = 0 }) => {
  const [w, setW] = useState(0);
  const [reloading, setReloading] = useState(false);
  const showComplaints = tabAllowed(user, 'complaints');
  const showLeads = tabAllowed(user, 'leads');
  const [cmp, setCmp] = useState({ busy: false, counts: null, error: '', capped: [] });
  const [lead, setLead] = useState({ busy: false, stages: null, total: null, error: '' });

  const lg = w >= 1100;
  const sm = w > 0 && w < 640;

  const reloadDates = async () => {
    setReloading(true);
    try { await onReloadSummary?.(); } finally { setReloading(false); }
  };

  const loadComplaints = useCallback(async (fresh = false) => {
    if (!showComplaints) return;
    setCmp((c) => ({ ...c, busy: true }));
    const res = await OneBssApi.complaintsCounts(fresh);
    if (res.ok && res.data?.success) setCmp({ busy: false, counts: res.data.counts || {}, error: '', capped: res.data.capped || [] });
    else setCmp({ busy: false, counts: null, capped: [], error: res.data?.needs_operator ? 'Choose an operator on the Complaints page to see its tickets.' : (res.data?.message || 'Could not load complaints.') });
  }, [showComplaints]);

  const loadLeads = useCallback(async () => {
    if (!showLeads) return;
    setLead((l) => ({ ...l, busy: true }));
    const res = await OneBssApi.leadsList('');
    if (res.ok && res.data?.success) {
      const m = new Map();
      (res.data.leads || []).forEach((x) => {
        const k = String(x.lead_stage || '').trim() || 'No stage';
        m.set(k, { n: (m.get(k)?.n || 0) + 1, color: x.status_color || m.get(k)?.color });
      });
      setLead({ busy: false, stages: [...m.entries()].map(([k, v]) => ({ stage: k, ...v })), total: (res.data.leads || []).length, error: '' });
    } else {
      setLead({ busy: false, stages: null, total: null, error: res.data?.needs_operator ? 'Choose an operator on the Leads page to see its leads.' : (res.data?.message || 'Could not load leads.') });
    }
  }, [showLeads]);

  useEffect(() => { loadComplaints(); loadLeads(); }, [loadComplaints, loadLeads, refreshSignal]);

  const serviceCard = (type, title, icon, filterAll) => {
    const data = summary?.[type];
    const rows = (keys) => keys.map((key, i) => {
      const item = data?.[key];
      const count = summary ? (item?.count ?? 0) : null;
      return (
        <StatRow key={key} label={item?.label || FALLBACK[key]} value={fmt(count)} color={toneOf(key)} dim={count === 0}
          last={i === keys.length - 1} onPress={() => onNavigateToCustomers && onNavigateToCustomers(filterAll, key)} />
      );
    });
    const split = !sm; // two columns inside the card
    return (
      <Card key={type} title={title} icon={icon} onRefresh={reloadDates} busy={reloading}
        style={lg ? { flexBasis: 0, flexGrow: type === 'ott' && support.length ? 2 : 1, minWidth: 0 } : { width: '100%' }}>
        <View style={split ? s.cols : null}>
          <View style={split ? s.col : null}>
            <SubHead text="Expiry" color={TONE.soon} />
            {rows(EXPIRY_KEYS)}
          </View>
          {split ? <View style={s.colLine} /> : null}
          <View style={[split ? s.col : { marginTop: 12 }]}>
            <SubHead text="Registration" color={TONE.reg} />
            {rows(REG_KEYS)}
          </View>
        </View>
      </Card>
    );
  };

  const cmpCard = showComplaints ? (
    <Card key="cmp" title="Complaints" icon={<Feather name="alert-circle" size={17} color="#dc2626" />} onRefresh={() => loadComplaints(true)} busy={cmp.busy}
      style={sm ? { width: '100%' } : { flexBasis: 0, flexGrow: 1, minWidth: 0 }}>
      {cmp.error ? <Text style={s.note}>{cmp.error}</Text> : (
        <View>
          {COMPLAINT_ROWS.map((r, i) => {
            const n = cmp.counts ? cmp.counts[r.key] : null;
            return (
              <StatRow key={r.key} label={r.label} color={r.color} dim={n === 0} last={i === COMPLAINT_ROWS.length - 1}
                value={n == null ? '…' : `${fmt(n)}${cmp.capped.includes(r.key) ? '+' : ''}`} onPress={() => go(`complaints?status=${r.id}`)} />
            );
          })}
        </View>
      )}
    </Card>
  ) : null;

  const leadCard = showLeads ? (
    <Card key="lead" title="Leads" icon={<Feather name="user-plus" size={17} color="#7c3aed" />} onRefresh={loadLeads} busy={lead.busy}
      right={lead.total != null ? <Text style={s.cardCount}>{fmt(lead.total)}</Text> : null}
      style={sm ? { width: '100%' } : { flexBasis: 0, flexGrow: 1, minWidth: 0 }}>
      {lead.error ? <Text style={s.note}>{lead.error}</Text> : !lead.stages ? (
        <View style={{ paddingVertical: 18, alignItems: 'center' }}><ActivityIndicator size="small" color="#7c3aed" /></View>
      ) : !lead.stages.length ? <Text style={s.note}>No leads yet.</Text> : (
        <ScrollView style={{ maxHeight: 205 }} nestedScrollEnabled showsVerticalScrollIndicator>
          {lead.stages.map((st, i) => (
            <StatRow key={st.stage} label={st.stage} value={fmt(st.n)} color={st.color || TONE.violet} last={i === lead.stages.length - 1}
              onPress={() => go(`leads?stage=${encodeURIComponent(st.stage)}`)} />
          ))}
        </ScrollView>
      )}
    </Card>
  ) : null;

  const support = [cmpCard, leadCard].filter(Boolean);
  const inet = serviceCard('internet', 'Internet', <Feather name="wifi" size={17} color="#059669" />, 'all');
  const iptv = serviceCard('iptv', 'IPTV', <MaterialIcons name="live-tv" size={18} color="#7c3aed" />, 'iptv_all');
  const ott = serviceCard('ott', 'OTT', <Feather name="play-circle" size={17} color="#0284c7" />, 'ott');
  const row = (items, key) => <View key={key} style={[s.grid, { flexDirection: 'row', alignItems: 'stretch' }]}>{items}</View>;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ marginBottom: 20 }}>
      <View style={s.head}>
        <Text style={s.headTitle}>Expiry & Registration</Text>
        {summary?.generated_at ? <Text style={s.headSub}>As of {summary.generated_at} IST</Text> : null}
      </View>
      {summaryError ? <Text style={[s.note, { color: '#be123c', marginBottom: 10 }]}>{summaryError}</Text> : null}
      {lg ? (
        <View style={s.grid}>
          {row([inet, iptv], 'r1')}
          {row([ott, ...support], 'r2')}
        </View>
      ) : (
        <View style={s.grid}>
          {inet}{iptv}{ott}
          {support.length ? (sm ? support : row(support, 'sup')) : null}
        </View>
      )}
    </View>
  );
};

const web = Platform.OS === 'web';
const s = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  headTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  headSub: { fontSize: 11, color: '#64748b' },
  grid: { gap: 14 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, ...(web ? { boxShadow: '0 1px 2px rgba(15,23,42,0.04)' } : null) },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cardTitle: { fontSize: 14.5, fontWeight: '700', color: '#0f172a' },
  cardCount: { fontSize: 11.5, fontWeight: '700', color: '#64748b', backgroundColor: '#f1f5f9', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, overflow: 'hidden' },
  refresh: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  cols: { flexDirection: 'row', gap: 16 },
  col: { flex: 1, minWidth: 0 },
  colLine: { width: 1, backgroundColor: '#f1f5f9', marginTop: 8 },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 2 },
  subDot: { width: 6, height: 6, borderRadius: 3 },
  subHeadText: { fontSize: 10.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 6, ...(web ? { cursor: 'pointer' } : null) },
  rowLine: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowHover: { backgroundColor: '#f8fafc' },
  rowLabel: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: '#334155' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 14, fontWeight: '800', minWidth: 28, textAlign: 'right', ...(web ? { fontVariantNumeric: 'tabular-nums' } : null) },
  note: { fontSize: 12, color: '#64748b', paddingVertical: 12 },
});
