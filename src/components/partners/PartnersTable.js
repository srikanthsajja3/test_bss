import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

// Level badge colours: Super Distributor / Distributor / Sub Distributor / Operator
const LEVEL_TONE = {
  'super distributor': { bg: 'rgba(37,99,235,0.12)', fg: '#1d4ed8' },
  distributor: { bg: 'rgba(124,58,237,0.12)', fg: '#6d28d9' },
  'sub distributor': { bg: 'rgba(219,39,119,0.12)', fg: '#be185d' },
  operator: { bg: 'rgba(16,185,129,0.12)', fg: '#047857' },
};

/** "Super Distributor" | "Distributor" | "Sub Distributor" | "Operator" (from partner.php). */
export const levelLabelOf = (p) =>
  p?.hierarchy_label || (String(p?.account_role || '').toLowerCase() === 'admin' ? 'Admin' : 'Operator');

export const LevelBadge = ({ partner, small }) => {
  const label = levelLabelOf(partner);
  const tone = LEVEL_TONE[label.toLowerCase()] || LEVEL_TONE.operator;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, small && { paddingHorizontal: 6 }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]} numberOfLines={1}>{label.toUpperCase()}</Text>
    </View>
  );
};

const n = (v) => Number(v ?? 0);

const WALLET_COLORS = { Internet: '#059669', IPTV: '#7c3aed', OTT: '#0284c7' };
const isSplit = (p) => p.wallet_mode === 'split' && Array.isArray(p.wallets) && p.wallets.length > 0;

/** Separate Internet / IPTV / OTT wallets: one line each (inline = one row for the mobile card). */
const SplitWallets = ({ p, inline = false }) => (
  <View style={inline ? { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } : null}>
    {p.wallets.map((w) => (
      <Text key={w.type} style={{ fontSize: 12, color: '#475569' }} numberOfLines={1}>
        <Text style={{ fontWeight: '800', color: WALLET_COLORS[w.type] || '#475569' }}>{w.type}</Text>
        {' '}<Text style={{ fontWeight: '700', color: n(w.balance) < 0 ? '#dc2626' : '#0f172a' }}>₹{n(w.balance).toLocaleString('en-IN')}</Text>
      </Text>
    ))}
  </View>
);

/**
 * The partners table, used for the main Partners page AND for "partners under this admin",
 * so every level shows the same columns. Admin rows show the counts of every operator below
 * them (partner.php sends subtree counts for admins).
 *
 * Props: list, loading, isMobile, emptyText,
 *        onOpen(p), onWallet(p), onToggleStatus(p) | null (hidden when null),
 *        onImpersonate(p) | null, impersonatingId, onResetPassword(p) | null,
 *        fetchChildren(adminId) -> Promise<{ok, data: []}> | null
 *
 * With fetchChildren, every admin row with partners below it gets a +/− button that opens
 * the partners it created right under the row (any depth). onOpen then gets a second
 * argument: the expanded admins above the clicked row, top first (for the Back trail).
 */
const TREE_TONES = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899'];

// One width per column, used by the header AND every row (same box, same padding), so each
// value starts exactly under its heading. basis = the column's width; extra screen width is
// shared out by grow.
const COLS = {
  partner:  { flexBasis: 200, flexGrow: 2.2 },
  contact:  { flexBasis: 125, flexGrow: 1 },
  level:    { flexBasis: 135, flexGrow: 1 },
  wallet:   { flexBasis: 110, flexGrow: 0.8 },
  internet: { flexBasis: 135, flexGrow: 1 },
  iptv:     { flexBasis: 90,  flexGrow: 0.7 },
  ott:      { flexBasis: 90,  flexGrow: 0.7 },
  status:   { flexBasis: 100, flexGrow: 0.6 },
  actions:  { flexBasis: 140, flexGrow: 0.8 },
};
const TABLE_MIN = Object.values(COLS).reduce((t, c) => t + c.flexBasis, 0) + 32; // + row padding
const col = (k) => [styles.col, COLS[k]];

/** "Under Super Admin" / "Under Ravi Networks" (showParent: flat lists of one level). */
const parentLine = (p) => {
  const superParent = String(p.created_by_role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'superadmin';
  if (superParent) return 'Under Super Admin';
  return p.created_by_name ? `Under ${p.created_by_name}` : '';
};

export const PartnersTable = ({ list, loading, isMobile, emptyText, onOpen, onWallet, onToggleStatus, onImpersonate, impersonatingId, onResetPassword, fetchChildren, showParent = false }) => {
  const [open, setOpen] = useState({}); // partner_id -> true
  const [kids, setKids] = useState({}); // partner_id -> { loading, list, error }

  const hasKids = (p) => !!fetchChildren && String(p.account_role || '').toLowerCase() === 'admin'
    && (n(p.subtree_operators) + n(p.subtree_admins)) > 0;

  const toggle = async (p) => {
    const id = String(p.partner_id);
    if (open[id]) { setOpen((o) => ({ ...o, [id]: false })); return; }
    setOpen((o) => ({ ...o, [id]: true }));
    if (kids[id]?.list) return;
    setKids((k) => ({ ...k, [id]: { loading: true } }));
    const res = await fetchChildren(p.partner_id);
    setKids((k) => ({ ...k, [id]: res.ok ? { list: res.data || [] } : { list: [], error: res.data?.message || 'Could not load' } }));
  };

  // rows in display order: [{ p, depth, ancestors }] plus loading/empty markers
  const flatten = (rows, depth, ancestors, out) => {
    rows.forEach((p) => {
      out.push({ p, depth, ancestors });
      const id = String(p.partner_id);
      if (open[id]) {
        const k = kids[id];
        if (!k || k.loading) out.push({ marker: 'loading', depth: depth + 1, key: `l${id}` });
        else if (k.error || !k.list.length) out.push({ marker: k.error || 'No partners under it', depth: depth + 1, key: `e${id}` });
        else flatten(k.list, depth + 1, [...ancestors, p], out);
      }
    });
    return out;
  };

  const Expander = ({ p }) => {
    if (!fetchChildren) return null;
    if (!hasKids(p)) return isMobile ? null : <View style={styles.expSpacer} />;
    const on = !!open[String(p.partner_id)];
    return (
      <TouchableOpacity style={[styles.exp, on && styles.expOn]} onPress={() => toggle(p)} title={on ? 'Hide partners below' : 'Show partners below'} accessibilityLabel={on ? 'Hide partners below' : 'Show partners below'}>
        <Feather name={on ? 'minus' : 'plus'} size={13} color={on ? '#fff' : '#334155'} />
      </TouchableOpacity>
    );
  };
  const treeStyle = (depth) => (depth > 0 ? {
    borderLeftWidth: 3,
    borderLeftColor: TREE_TONES[(depth - 1) % TREE_TONES.length],
    backgroundColor: depth % 2 ? '#f5f7ff' : '#f0fdfa',
  } : null);

  if (loading) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />;
  }
  if (!list || list.length === 0) {
    return (
      <View style={styles.empty}>
        <Feather name="info" size={22} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>{emptyText || 'No partner records matched your filter criteria.'}</Text>
      </View>
    );
  }

  const StatusTag = ({ p }) => {
    const on = p.status === 'enabled';
    const tag = (
      <View style={[styles.status, on ? styles.statusOn : styles.statusOff]}>
        <View style={[styles.dot, { backgroundColor: on ? '#10b981' : '#ef4444' }]} />
        <Text style={[styles.statusText, { color: on ? '#047857' : '#b91c1c' }]}>{on ? 'ENABLED' : 'DISABLED'}</Text>
      </View>
    );
    return onToggleStatus ? <TouchableOpacity onPress={() => onToggleStatus(p)}>{tag}</TouchableOpacity> : tag;
  };

  const Counts = ({ p }) => (
    <>
      <Text style={styles.cell}>
        <Text style={{ fontWeight: '800', color: '#059669' }}>{n(p.active_internet_accounts)}</Text> active · <Text style={{ fontWeight: '800', color: '#2563eb' }}>{n(p.online_internet_accounts)}</Text> online
      </Text>
      <Text style={styles.sub}>{n(p.total_internet_accounts)} total</Text>
    </>
  );

  if (isMobile) {
    return (
      <View style={{ padding: 12, gap: 12 }}>
        {flatten(list, 0, [], []).map((row) => row.marker ? (
          <View key={row.key} style={[styles.markerRow, { marginLeft: row.depth * 14 }]}>
            {row.marker === 'loading' ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.sub}>{row.marker}</Text>}
          </View>
        ) : (() => { const { p, depth, ancestors } = row; return (
          <View key={p.partner_id} style={[styles.mCard, depth > 0 && { marginLeft: depth * 14 }, treeStyle(depth)]}>
            <View style={styles.mHead}>
            <Expander p={p} />
            <TouchableOpacity style={[styles.mHead, { flex: 1 }]} onPress={() => onOpen(p, ancestors)}>
              <View style={styles.idBadge}><Text style={styles.idText}>#{p.partner_id}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{p.partner_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[p.company_name, p.partner_mobile].filter(Boolean).join(' · ')}</Text>
              </View>
              <LevelBadge partner={p} small />
            </TouchableOpacity>
            </View>
            {showParent && depth === 0 && parentLine(p) ? (
              <View style={styles.mParent}>
                <Feather name="corner-left-up" size={12} color="#64748b" />
                <Text style={styles.mParentText} numberOfLines={1}>{parentLine(p)}</Text>
              </View>
            ) : null}
            <View style={styles.mRow}>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_internet_accounts)}</Text><Text style={styles.mStatLbl}>Internet active</Text></View>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_iptv_accounts)}</Text><Text style={styles.mStatLbl}>IPTV active</Text></View>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_ott_accounts)}</Text><Text style={styles.mStatLbl}>OTT active</Text></View>
            </View>
            <View style={[styles.mRow, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <TouchableOpacity onPress={() => onWallet && onWallet(p)}>
                {isSplit(p) ? <SplitWallets p={p} inline /> : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>Wallet ₹{n(p.wallet_balance).toLocaleString('en-IN')}</Text>
                )}
              </TouchableOpacity>
              <StatusTag p={p} />
            </View>
            <View style={[styles.mRow, { gap: 6 }]}>
              <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => onOpen(p, ancestors)}>
                <Feather name="eye" size={12} color="#2563eb" />
                <Text style={[styles.btnText, { color: '#2563eb' }]}>View</Text>
              </TouchableOpacity>
              {onResetPassword ? (
                <TouchableOpacity style={[styles.btn, styles.btnAmber, { flex: 1 }]} onPress={() => onResetPassword(p)}>
                  <Feather name="key" size={12} color="#d97706" />
                  <Text style={[styles.btnText, { color: '#d97706' }]}>Reset Pass</Text>
                </TouchableOpacity>
              ) : null}
              {onImpersonate ? (
                <TouchableOpacity style={[styles.btn, styles.btnPink, { flex: 1 }]} onPress={() => onImpersonate(p)} disabled={impersonatingId === p.partner_id}>
                  <Feather name="log-in" size={12} color="#db2777" />
                  <Text style={[styles.btnText, { color: '#db2777' }]}>{impersonatingId === p.partner_id ? 'Wait…' : 'Login'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ); })())}
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TABLE_MIN, width: '100%' }}>
      <View style={{ width: '100%' }}>
        <View style={styles.thRow}>
          <View style={[col('partner'), fetchChildren && { paddingLeft: 30 }]}><Text style={styles.th}>Partner</Text></View>
          <View style={col('contact')}><Text style={styles.th}>Contact</Text></View>
          <View style={col('level')}><Text style={styles.th}>Level</Text></View>
          <View style={col('wallet')}><Text style={styles.th}>Wallet</Text></View>
          <View style={col('internet')}><Text style={styles.th}>Internet</Text></View>
          <View style={col('iptv')}><Text style={styles.th}>IPTV</Text></View>
          <View style={col('ott')}><Text style={styles.th}>OTT</Text></View>
          <View style={col('status')}><Text style={styles.th}>Status</Text></View>
          <View style={col('actions')}><Text style={styles.th}>Actions</Text></View>
        </View>
        {flatten(list, 0, [], []).map((row) => {
          if (row.marker) {
            return (
              <View key={row.key} style={[styles.tr, styles.markerRow, treeStyle(row.depth), { paddingLeft: 16 + row.depth * 22 }]}>
                {row.marker === 'loading' ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Text style={styles.sub}>{row.marker}</Text>}
              </View>
            );
          }
          const { p, depth, ancestors } = row;
          const isAdmin = String(p.account_role || '').toLowerCase() === 'admin';
          return (
            <View key={p.partner_id} style={[styles.tr, treeStyle(depth)]}>
              <View style={[col('partner'), { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: depth * 22 }]}>
              <Expander p={p} />
              <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => onOpen(p, ancestors)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.idBadge}><Text style={styles.idText}>#{p.partner_id}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{p.partner_name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{p.company_name || ''}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              </View>
              <View style={col('contact')}>
                <Text style={styles.cell} numberOfLines={1}>{p.partner_mobile || '—'}</Text>
                {p.account_username ? <Text style={styles.sub} numberOfLines={1}>{p.account_username}</Text> : null}
              </View>
              <View style={col('level')}>
                <LevelBadge partner={p} />
                {showParent && depth === 0 && parentLine(p) ? <Text style={[styles.sub, { marginTop: 3, color: '#334155', fontWeight: '600' }]} numberOfLines={1}>{parentLine(p)}</Text> : null}
                {isAdmin ? <Text style={[styles.sub, { marginTop: 3 }]} numberOfLines={2}>{n(p.subtree_operators)} operator(s) · {n(p.subtree_admins)} admin(s) below</Text> : null}
              </View>
              <View style={col('wallet')}>
                <TouchableOpacity onPress={() => onWallet && onWallet(p)} style={{ alignSelf: 'flex-start' }}>
                  {isSplit(p) ? <SplitWallets p={p} /> : (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: n(p.wallet_balance) > 0 ? '#059669' : '#64748b' }}>₹{n(p.wallet_balance).toLocaleString('en-IN')}</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={col('internet')}><Counts p={p} /></View>
              <View style={col('iptv')}>
                <Text style={styles.cell}><Text style={{ fontWeight: '800', color: '#7c3aed' }}>{n(p.active_iptv_accounts)}</Text> active</Text>
                <Text style={styles.sub}>{n(p.total_iptv_accounts)} total</Text>
              </View>
              <View style={col('ott')}>
                <Text style={styles.cell}><Text style={{ fontWeight: '800', color: '#0ea5e9' }}>{n(p.active_ott_accounts)}</Text> active</Text>
                <Text style={styles.sub}>{n(p.total_ott_accounts)} total</Text>
              </View>
              <View style={col('status')}><StatusTag p={p} /></View>
              <View style={[col('actions'), { flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                <TouchableOpacity style={styles.btn} onPress={() => onOpen(p, ancestors)}>
                  <Feather name="eye" size={12} color="#2563eb" />
                  <Text style={[styles.btnText, { color: '#2563eb' }]}>View</Text>
                </TouchableOpacity>
                {onImpersonate ? (
                  <TouchableOpacity style={[styles.btn, styles.btnPink]} onPress={() => onImpersonate(p)} disabled={impersonatingId === p.partner_id}>
                    <Feather name="log-in" size={12} color="#db2777" />
                    <Text style={[styles.btnText, { color: '#db2777' }]}>{impersonatingId === p.partner_id ? 'Wait…' : 'Login'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  mParent: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -4 },
  mParentText: { fontSize: 12, fontWeight: '600', color: '#475569', flexShrink: 1 },
  exp: { width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  expOn: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  expSpacer: { width: 22 },
  markerRow: { paddingVertical: 10, alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  thRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12 },
  th: { fontSize: 12, fontWeight: '700', color: '#334155' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  td: { paddingRight: 8, justifyContent: 'center' },
  // a table column: fixed basis, never shrinks below it, nothing spills out of it
  col: { flexShrink: 0, minWidth: 0, paddingRight: 12, justifyContent: 'center', overflow: 'hidden' },
  // same width for #53 and #1020 so the names line up
  idBadge: { minWidth: 52, alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(16,185,129,0.1)' },
  idText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  name: { fontSize: 13.5, fontWeight: '700', color: COLORS.textMain },
  sub: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  cell: { fontSize: 12.5, color: COLORS.textMain },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusOn: { backgroundColor: 'rgba(16,185,129,0.12)' },
  statusOff: { backgroundColor: 'rgba(239,68,68,0.12)' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', backgroundColor: 'rgba(37,99,235,0.06)' },
  btnPink: { borderColor: 'rgba(219,39,119,0.3)', backgroundColor: 'rgba(219,39,119,0.06)' },
  btnAmber: { borderColor: 'rgba(217,119,6,0.3)', backgroundColor: 'rgba(217,119,6,0.06)' },
  btnText: { fontSize: 11, fontWeight: '700' },
  mCard: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 10 },
  mHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mRow: { flexDirection: 'row', gap: 8 },
  mStat: { flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#f8fafc' },
  mStatNum: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  mStatLbl: { fontSize: 10.5, color: COLORS.textMuted },
});
