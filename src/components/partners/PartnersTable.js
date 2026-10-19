import React from 'react';
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

/**
 * The partners table, used for the main Partners page AND for "partners under this admin",
 * so every level shows the same columns. Admin rows show the counts of every operator below
 * them (partner.php sends subtree counts for admins).
 *
 * Props: list, loading, isMobile, emptyText,
 *        onOpen(p), onWallet(p), onToggleStatus(p) | null (hidden when null),
 *        onImpersonate(p) | null, impersonatingId, onResetPassword(p) | null
 */
export const PartnersTable = ({ list, loading, isMobile, emptyText, onOpen, onWallet, onToggleStatus, onImpersonate, impersonatingId, onResetPassword }) => {
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
        {list.map((p) => (
          <View key={p.partner_id} style={styles.mCard}>
            <TouchableOpacity style={styles.mHead} onPress={() => onOpen(p)}>
              <View style={styles.idBadge}><Text style={styles.idText}>#{p.partner_id}</Text></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>{p.partner_name}</Text>
                <Text style={styles.sub} numberOfLines={1}>{[p.company_name, p.partner_mobile].filter(Boolean).join(' · ')}</Text>
              </View>
              <LevelBadge partner={p} small />
            </TouchableOpacity>
            <View style={styles.mRow}>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_internet_accounts)}</Text><Text style={styles.mStatLbl}>Internet active</Text></View>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_iptv_accounts)}</Text><Text style={styles.mStatLbl}>IPTV active</Text></View>
              <View style={styles.mStat}><Text style={styles.mStatNum}>{n(p.active_ott_accounts)}</Text><Text style={styles.mStatLbl}>OTT active</Text></View>
            </View>
            <View style={[styles.mRow, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <TouchableOpacity onPress={() => onWallet && onWallet(p)}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>Wallet ₹{n(p.wallet_balance).toLocaleString('en-IN')}</Text>
              </TouchableOpacity>
              <StatusTag p={p} />
            </View>
            <View style={[styles.mRow, { gap: 6 }]}>
              <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => onOpen(p)}>
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
        ))}
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 1020, width: '100%' }}>
      <View style={{ width: '100%' }}>
        <View style={styles.thRow}>
          <Text style={[styles.th, { flex: 2.0, minWidth: 170 }]}>Partner</Text>
          <Text style={[styles.th, { flex: 1.0, minWidth: 95 }]}>Contact</Text>
          <Text style={[styles.th, { flex: 1.2, minWidth: 125 }]}>Level</Text>
          <Text style={[styles.th, { flex: 0.8, minWidth: 80 }]}>Wallet</Text>
          <Text style={[styles.th, { flex: 1.3, minWidth: 125 }]}>Internet</Text>
          <Text style={[styles.th, { flex: 0.8, minWidth: 75 }]}>IPTV</Text>
          <Text style={[styles.th, { flex: 0.8, minWidth: 75 }]}>OTT</Text>
          <Text style={[styles.th, { flex: 0.9, minWidth: 90 }]}>Status</Text>
          <Text style={[styles.th, { flex: 1.2, minWidth: 135 }]}>Actions</Text>
        </View>
        {list.map((p) => {
          const isAdmin = String(p.account_role || '').toLowerCase() === 'admin';
          return (
            <View key={p.partner_id} style={styles.tr}>
              <TouchableOpacity style={[styles.td, { flex: 2.0, minWidth: 170 }]} onPress={() => onOpen(p)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.idBadge}><Text style={styles.idText}>#{p.partner_id}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{p.partner_name}</Text>
                    <Text style={styles.sub} numberOfLines={1}>{[p.company_name, p.partner_region].filter(Boolean).join(' · ')}</Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={[styles.td, { flex: 1.0, minWidth: 95 }]}>
                <Text style={styles.cell}>{p.partner_mobile || '—'}</Text>
                {p.account_username ? <Text style={styles.sub}>{p.account_username}</Text> : null}
              </View>
              <View style={[styles.td, { flex: 1.2, minWidth: 125 }]}>
                <LevelBadge partner={p} />
                {isAdmin ? <Text style={[styles.sub, { marginTop: 3 }]}>{n(p.subtree_operators)} operator(s) · {n(p.subtree_admins)} admin(s) below</Text> : null}
              </View>
              <View style={[styles.td, { flex: 0.8, minWidth: 80 }]}>
                <TouchableOpacity onPress={() => onWallet && onWallet(p)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: n(p.wallet_balance) > 0 ? '#059669' : '#64748b' }}>₹{n(p.wallet_balance).toLocaleString('en-IN')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.td, { flex: 1.3, minWidth: 125 }]}><Counts p={p} /></View>
              <View style={[styles.td, { flex: 0.8, minWidth: 75 }]}>
                <Text style={styles.cell}><Text style={{ fontWeight: '800', color: '#7c3aed' }}>{n(p.active_iptv_accounts)}</Text> active</Text>
                <Text style={styles.sub}>{n(p.total_iptv_accounts)} total</Text>
              </View>
              <View style={[styles.td, { flex: 0.8, minWidth: 75 }]}>
                <Text style={styles.cell}><Text style={{ fontWeight: '800', color: '#0ea5e9' }}>{n(p.active_ott_accounts)}</Text> active</Text>
                <Text style={styles.sub}>{n(p.total_ott_accounts)} total</Text>
              </View>
              <View style={[styles.td, { flex: 0.9, minWidth: 90 }]}><StatusTag p={p} /></View>
              <View style={[styles.td, { flex: 1.2, minWidth: 135, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
                <TouchableOpacity style={styles.btn} onPress={() => onOpen(p)}>
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
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
  thRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12 },
  th: { fontSize: 12, fontWeight: '700', color: '#334155' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  td: { paddingRight: 8, justifyContent: 'center' },
  idBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(16,185,129,0.1)' },
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
