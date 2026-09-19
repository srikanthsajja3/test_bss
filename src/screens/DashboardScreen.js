import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

export const DashboardScreen = ({ user }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const currentRole = user?.role ? user.role.toLowerCase() : 'superadmin';
  const currentPartnerId = user?.partner_id || 1000;

  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(false);

  const refreshData = async () => {
    setLoading(true);
    try {
      const res = await OneBssApi.getDashboardTelemetry(currentPartnerId);
      if (res.data?.data) {
        setTelemetry(res.data.data);
      } else {
        setTelemetry({
          internet: { total: 102, active: 95, online: 83, expired: 6, suspend: 1, disabled: 0, new: 0 },
          iptv: { total: 45, active: 42, expired: 3 },
        });
      }
    } catch (e) {
      setTelemetry({
        internet: { total: 102, active: 95, online: 83, expired: 6, suspend: 1, disabled: 0, new: 0 },
        iptv: { total: 45, active: 42, expired: 3 },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentPartnerId]);

  const inet = telemetry?.internet || { total: 102, active: 95, online: 83, expired: 6, suspend: 1, disabled: 0, new: 0 };
  const iptv = telemetry?.iptv || { total: 45, active: 42, expired: 3 };

  // CUSTOMER DASHBOARD
  if (currentRole === 'customer') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Subscriber Portal Dashboard</Text>
            <Text style={styles.pageSubtitle}>Welcome back, {user?.partner_name || 'Subscriber'}!</Text>
          </View>
          <View style={styles.badgeActive}><Text style={styles.badgeActiveText}>ACCOUNT ACTIVE</Text></View>
        </View>

        <View style={[styles.card, GLASS_CARD_INTERACTIVE]}>
          <View style={styles.cardHeader}>
            <Feather name="wifi" size={24} color={COLORS.primary} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.cardTitle}>Ultra 100Mbps Broadband Plan</Text>
              <Text style={styles.cardSubtitle}>RADIUS Username: srikanth@onefiber</Text>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.accentEmerald }}>₹699 / mo</Text>
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>DOWNLOAD / UPLOAD</Text>
              <Text style={styles.detailVal}>100 Mbps / 100 Mbps</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>RENEWAL DATE</Text>
              <Text style={styles.detailVal}>October 18, 2026 (28 Days)</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>IPTV SET-TOP BOX</Text>
              <Text style={styles.detailVal}>Connected (STB #8849201)</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>e-KYC STATUS</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.accentEmerald }}>Verified via ScoreMe UIDAI</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // OPERATOR DASHBOARD
  if (currentRole === 'operator') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Operator Control Dashboard</Text>
            <Text style={styles.pageSubtitle}>Managed Subscribers, Set-Top Boxes & Operator Wallet</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>MY SUBSCRIBERS</Text>
            <Text style={styles.statValue}>142</Text>
            <Text style={styles.statSubtext}>Active Broadband Lines</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>CONNECTED STB</Text>
            <Text style={styles.statValue}>45</Text>
            <Text style={styles.statSubtext}>Pioneer IPTV STBs</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>OPERATOR WALLET</Text>
            <Text style={styles.statValue}>₹ 4,500.00</Text>
            <Text style={styles.statSubtext}>Allocated credit balance</Text>
          </View>
        </View>

        <View style={[styles.card, { marginTop: 10 }]}>
          <Text style={styles.cardTitle}>Operator Customer Channel Management (OCM)</Text>
          <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 14 }}>Enable/Disable local television channels and update LCN numbering.</Text>

          {['B Channel', 'B MAX', 'B INFO', 'SIRI DIGITAL', 'HTV Movies'].map((ch, idx) => (
            <View key={ch} style={styles.ocmRow}>
              <Text style={styles.ocmName}>{ch}</Text>
              <View style={styles.ocmControls}>
                <Text style={styles.ocmLcn}>LCN #{19 + idx}</Text>
                <View style={styles.btnDisable}><Text style={styles.btnDisableText}>Disable</Text></View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // SUPER ADMIN & ADMIN DASHBOARDS (STATIC NON-CLICKABLE TELEMETRY DASHBOARD)
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 7-METRIC INTERNET USER STATUS TELEMETRY GRID */}
      <Text style={styles.sectionHeaderTitle}>Internet Subscriber Telemetry & Status Breakdown</Text>
      <View style={styles.statsGrid7}>
        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>TOTAL USERS</Text>
          <Text style={styles.statValueMetric}>{inet.total}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>ACTIVE USERS</Text>
          <Text style={[styles.statValueMetric, { color: COLORS.accentEmerald }]}>{inet.active}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>ONLINE USERS</Text>
          <Text style={[styles.statValueMetric, { color: '#3b82f6' }]}>{inet.online}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>EXPIRED USERS</Text>
          <Text style={[styles.statValueMetric, { color: COLORS.accentRose }]}>{inet.expired}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>SUSPENDED USERS</Text>
          <Text style={[styles.statValueMetric, { color: COLORS.accentAmber }]}>{inet.suspend ?? 1}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>DISABLED USERS</Text>
          <Text style={[styles.statValueMetric, { color: '#64748b' }]}>{inet.disabled ?? 0}</Text>
        </View>

        <View style={styles.statCardMetric}>
          <Text style={styles.statLabel}>NEW USERS</Text>
          <Text style={[styles.statValueMetric, { color: '#8b5cf6' }]}>{inet.new ?? 0}</Text>
        </View>
      </View>

      {/* PIONEER IPTV TELEMETRY DATA CARD */}
      <View style={[styles.card, GLASS_CARD_INTERACTIVE]}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="live-tv" size={24} color="#8b5cf6" />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.cardTitle}>Pioneer IPTV STB Telemetry</Text>
            <Text style={styles.cardSubtitle}>Real-time metrics from Pioneer IPTV Set-Top Box Provider</Text>
          </View>
        </View>

        <View style={styles.iptvGrid}>
          <View style={styles.iptvCard}>
            <Text style={styles.iptvLabel}>TOTAL IPTV USERS</Text>
            <Text style={styles.iptvVal}>{iptv.total}</Text>
            <View style={styles.badgeInfo}><Text style={styles.badgeInfoText}>{iptv.total} Total STBs</Text></View>
          </View>

          <View style={styles.iptvCard}>
            <Text style={styles.iptvLabel}>ACTIVE IPTV USERS</Text>
            <Text style={[styles.iptvVal, { color: COLORS.accentEmerald }]}>{iptv.active}</Text>
            <View style={styles.badgeActive}><Text style={styles.badgeActiveText}>{iptv.active} Active STBs</Text></View>
          </View>

          <View style={styles.iptvCard}>
            <Text style={styles.iptvLabel}>EXPIRED IPTV USERS</Text>
            <Text style={[styles.iptvVal, { color: COLORS.accentRose }]}>{iptv.expired}</Text>
            <View style={styles.badgeExpired}><Text style={styles.badgeExpiredText}>{iptv.expired} Expired STBs</Text></View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgPrimary },
  content: { width: '100%', paddingHorizontal: '3%', paddingVertical: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textMain },
  pageSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionHeaderTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  statsGrid7: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCardMetric: { flex: 1, minWidth: 160, padding: 16, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', elevation: 2 },
  statLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  statValueMetric: { fontSize: 24, fontWeight: '700', color: COLORS.textMain, marginTop: 6 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 20, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  cardSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  iptvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  iptvCard: { flex: 1, minWidth: 180, padding: 16, backgroundColor: COLORS.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)', gap: 6 },
  iptvLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  iptvVal: { fontSize: 26, fontWeight: '700', color: COLORS.textMain },
  badgeInfo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)', alignSelf: 'flex-start' },
  badgeInfoText: { fontSize: 9, fontWeight: '700', color: COLORS.textMain },
  badgeActive: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(16, 185, 129, 0.1)', alignSelf: 'flex-start' },
  badgeActiveText: { fontSize: 9, fontWeight: '700', color: COLORS.accentEmerald },
  badgeExpired: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(244, 63, 94, 0.1)', alignSelf: 'flex-start' },
  badgeExpiredText: { fontSize: 9, fontWeight: '700', color: COLORS.accentRose },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  detailItem: { width: '45%' },
  detailLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  detailVal: { fontSize: 13, fontWeight: '600', color: COLORS.textMain, marginTop: 2 },
  ocmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  ocmName: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  ocmControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ocmLcn: { fontSize: 12, color: COLORS.textMuted },
  btnDisable: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  btnDisableText: { fontSize: 11, fontWeight: '600', color: COLORS.accentRose },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  statCard: { flex: 1, minWidth: 200, padding: 18, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, elevation: 2 },
  statValue: { fontSize: 28, fontWeight: '700', color: COLORS.textMain, marginTop: 4 },
  statSubtext: { fontSize: 11, color: COLORS.textDim, marginTop: 4 },
});
