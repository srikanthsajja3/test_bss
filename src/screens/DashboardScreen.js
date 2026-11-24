import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, TextInput } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { AddCustomerScreen } from './AddCustomerScreen';
import { can } from '../services/staffAccess';
import { StatsBoard } from '../components/dashboard/StatsBoard';

export const DashboardScreen = ({ user, onNavigateToCustomers, onNavigateToPartners, refreshSignal = 0 }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const currentRole = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
  const isSuperAdmin = currentRole === 'superadmin';
  const currentPartnerId = user?.partner_id;

  const [dashboardData, setDashboardData] = useState(null);
  const [internetNote, setInternetNote] = useState(''); // live gateway unavailable -> saved counts
  const [loading, setLoading] = useState(true);
  const [dateSummary, setDateSummary] = useState(null); // customers_by_date.php?summary=1
  const [dateSummaryError, setDateSummaryError] = useState('');
  // super admin: transfers to the RADIUS / IPTV provider wallets that failed and need a retry
  const [providerSyncOpen, setProviderSyncOpen] = useState(0);
  useEffect(() => {
    if (!isSuperAdmin) return;
    OneBssApi.getProviderWalletSync({ status: 'open', limit: 5 }).then((r) => {
      if (r.ok) setProviderSyncOpen(Number(r.data?.counts?.open || 0));
    });
  }, [isSuperAdmin, refreshSignal]);
  const [showAddCustomer, setShowAddCustomer] = useState(false); // operator: Add Customer from the dashboard
  const [partnerCounts, setPartnerCounts] = useState({ total: 0, admins: 0, operators: 0 });

  const [allPartners, setAllPartners] = useState([]);

  const loadDateSummary = async () => {
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.getCustomersByDateSummary();
      if (res.ok && res.data?.success !== false) {
        setDateSummary(res.data);
        setDateSummaryError('');
      } else {
        setDateSummaryError(res.data?.message || 'Could not load expiry / registration counts.');
      }
    } catch (e) {
      setDateSummaryError('Could not load expiry / registration counts.');
    }
  };

  const refreshData = async (quiet = false) => {
    if (!quiet) setLoading(true);
    loadDateSummary();
    try {
      if (isSuperAdmin || currentRole === 'admin') {
        OneBssApi.getPartners().then((res) => {
          const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
          setAllPartners(list);
          const total = list.length;
          const admins = list.filter((p) => (p.account_role || p.role || '').toLowerCase() === 'admin').length;
          const operators = list.filter((p) => (p.account_role || p.role || '').toLowerCase() === 'operator').length;
          setPartnerCounts({ total, admins, operators });
        }).catch(() => {});
      }
      // "My own" overview: the server scopes it by role (all / my operators / me)
      const res = await OneBssApi.getDashboard();
      if (!res.ok) {
        toast.error(res.data?.message || 'Could not load dashboard figures.');
      }
      const data = res.ok ? (res.data?.data || res.data) : null;
      setInternetNote(res.ok && res.data?.internet_error ? res.data.internet_error : '');
      if (data && (data.internet || data.iptv)) {
        setDashboardData(data);
      } else {
        setDashboardData({
          internet: { total: 0, active: 0, online: 0, expired: 0, suspend: 0, disabled: 0, new: 0 },
          iptv: { total: 0, active: 0, expired: 0 },
        });
      }
    } catch (e) {
      setDashboardData({
        internet: { total: 0, active: 0, online: 0, expired: 0, suspend: 0, disabled: 0, new: 0 },
        iptv: { total: 0, active: 0, expired: 0 },
      });
    } finally {
      setLoading(false);
    }
  };


  // ---- Operator login: show the saved numbers first, then sync in the background ----
  // Internet (RADIUS bulk list) and IPTV (Pioneer, per customer) syncs run without blocking the
  // page. At most once every 30 minutes per operator in this browser; the server also refuses
  // to start a second run for the same operator while one is going.
  const [bgSync, setBgSync] = useState({ state: 'idle', at: null, notes: [] });
  const SYNC_EVERY_MS = 30 * 60 * 1000;
  const runBackgroundSync = async (force = false) => {
    if (currentRole !== 'operator' || !currentPartnerId) return;
    const key = `onebss_bg_sync_${currentPartnerId}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key)) || 0; } catch (e) {}
    if (!force && Date.now() - last < SYNC_EVERY_MS) {
      setBgSync({ state: 'done', at: new Date(last), notes: [] });
      return;
    }
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    setBgSync({ state: 'syncing', at: null, notes: [] });
    const notes = [];
    const [inetRes, iptvRes] = await Promise.all([
      OneBssApi.syncInternetCustomersBulk(),
      OneBssApi.syncIptvBulkCustomers(currentPartnerId),
    ]);
    if (!inetRes.ok && !inetRes.data?.already_running) notes.push(`Internet: ${inetRes.data?.message || 'sync failed'}`);
    if (!iptvRes.ok && !iptvRes.data?.already_running) notes.push(`IPTV: ${iptvRes.data?.message || 'sync failed'}`);
    // the IPTV sync keeps running on the server after it replies: wait for it before "done"
    if (iptvRes.data?.background || iptvRes.data?.already_running) {
      refreshData(true);
      const done = await OneBssApi.waitIptvBulkSync(currentPartnerId);
      const last = done.data?.last;
      if (last?.error) notes.push(`IPTV: ${last.error}`);
      else if (!done.ok) notes.push(`IPTV: ${done.data?.message || 'could not get the sync result'}`);
    }
    setBgSync({ state: notes.length ? 'failed' : 'done', at: new Date(), notes });
    refreshData(true);
  };

  useEffect(() => {
    refreshData();
    runBackgroundSync(false);
  }, [currentPartnerId, currentRole]);

  // Top-bar Refresh: reload the numbers (operators also re-run the provider sync)
  const firstSignal = React.useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    refreshData();
    if (currentRole === 'operator') runBackgroundSync(true);
  }, [refreshSignal]);

  const inet = dashboardData?.internet || { total: 0, active: 0, online: 0, expired: 0, suspend: 0, disabled: 0, new: 0 };
  const iptv = dashboardData?.iptv || { total: 0, active: 0, expired: 0 };
  const ott = dashboardData?.ott || null; // null until the OTT tables exist on the server

  const handleCardClick = (filterKey) => {
    if (onNavigateToCustomers) {
      onNavigateToCustomers(filterKey);
    }
  };

  if (loading && !dashboardData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 40 }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const isOperator = currentRole === 'operator';

  if (showAddCustomer) {
    return (
      <AddCustomerScreen
        user={user}
        operatorId={user?.partner_id || user?.operator_id}
        isIptvMode={false}
        onCancel={() => setShowAddCustomer(false)}
        onSuccess={() => setShowAddCustomer(false)}
      />
    );
  }

  // SUPER ADMIN, ADMIN & OPERATOR DASHBOARDS
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' },
      ]}
    >
      {isSuperAdmin && providerSyncOpen > 0 ? (
        <TouchableOpacity
          style={[styles.bgSyncBar, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}
          onPress={() => {
            try {
              if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.hash = 'payu_payments?view=sync';
            } catch (e) {}
          }}
        >
          <Feather name="alert-triangle" size={14} color="#b91c1c" />
          <Text style={[styles.bgSyncText, { color: '#991b1b' }]} numberOfLines={2}>
            {providerSyncOpen} wallet transfer{providerSyncOpen === 1 ? '' : 's'} to the RADIUS / IPTV provider wallets failed — the OneBSS wallet changed but the provider's did not. Tap to retry.
          </Text>
          <Feather name="chevron-right" size={14} color="#b91c1c" />
        </TouchableOpacity>
      ) : null}

      {/* Background provider sync status (operators) */}
      {isOperator && bgSync.state !== 'idle' ? (
        <View style={[styles.bgSyncBar, bgSync.state === 'failed' && styles.bgSyncBarWarn]}>
          {bgSync.state === 'syncing' ? (
            <ActivityIndicator size="small" color="#2563eb" />
          ) : (
            <Feather name={bgSync.state === 'failed' ? 'alert-triangle' : 'check-circle'} size={14} color={bgSync.state === 'failed' ? '#b45309' : '#047857'} />
          )}
          <Text style={[styles.bgSyncText, bgSync.state === 'failed' && { color: '#92400e' }, bgSync.state === 'done' && { color: '#047857' }]} numberOfLines={2}>
            {bgSync.state === 'syncing'
              ? 'Syncing your Internet and IPTV customers in the background — figures update when it finishes.'
              : bgSync.state === 'failed'
              ? `Some customers could not be synced (${bgSync.notes.join(' · ')}). Showing saved data.`
              : `Customers synced${bgSync.at ? ` at ${bgSync.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}.`}
          </Text>
        </View>
      ) : null}



      {/* Add Customer (operators add customers; the same form as on the customers list) */}
      {isOperator && can(user, 'internet.customers', 'add') ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => setShowAddCustomer(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary || '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
          >
            <Feather name="user-plus" size={16} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Add Customer</Text>
          </TouchableOpacity>
        </View>
      ) : null}


      {/* PARTNERS / ADMINS COUNT IN SUPERADMIN DASHBOARD (ITEM 11) */}
      {(isSuperAdmin || currentRole === 'admin') && (
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.sectionHeaderTitle, { marginBottom: 10 }]}>Partners</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={{ flex: 1, minWidth: 160, backgroundColor: 'rgba(59, 130, 246, 0.08)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.25)', borderRadius: 12, padding: 14 }}
              onPress={() => onNavigateToPartners && onNavigateToPartners('operator')}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="briefcase" size={14} color="#3b82f6" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6' }}>TOTAL OPERATORS</Text>
                </View>
                <Feather name="arrow-up-right" size={13} color="#3b82f6" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#1d4ed8' }}>{partnerCounts.operators}</Text>
            </TouchableOpacity>

            {isSuperAdmin ? (
            <TouchableOpacity
              style={{ flex: 1, minWidth: 160, backgroundColor: 'rgba(16, 185, 129, 0.08)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', borderRadius: 12, padding: 14 }}
              onPress={() => onNavigateToPartners && onNavigateToPartners('admin')}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="shield" size={14} color="#10b981" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>TOTAL ADMINS</Text>
                </View>
                <Feather name="arrow-up-right" size={13} color="#10b981" />
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#047857' }}>{partnerCounts.admins}</Text>
            </TouchableOpacity>
            ) : null}
          </View>
        </View>
      )}


      {/* INTERNET GRID */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <Feather name="wifi" size={18} color={COLORS.primary} />
        <Text style={styles.sectionHeaderTitle}>Internet</Text>
        {internetNote ? (
          <Text style={{ fontSize: 11, color: '#b45309', flex: 1 }} numberOfLines={1}>
            Live RADIUS figures unavailable ({internetNote}) — showing last synced counts
          </Text>
        ) : null}
      </View>

      <View style={styles.statsGrid7}>
        {/* TOTAL USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('all')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="users" size={14} color={COLORS.primary} />
              <Text style={styles.statLabel}>TOTAL USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color={COLORS.primary} />
          </View>
          <Text style={styles.statValueMetric}>{inet.total ?? 0}</Text>
        </TouchableOpacity>

        {/* ACTIVE USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('active')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="check-circle" size={14} color={COLORS.accentEmerald} />
              <Text style={styles.statLabel}>ACTIVE USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color={COLORS.accentEmerald} />
          </View>
          <Text style={[styles.statValueMetric, { color: COLORS.accentEmerald }]}>{inet.active ?? 0}</Text>
        </TouchableOpacity>

        {/* ONLINE USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('online')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="wifi" size={14} color="#3b82f6" />
              <Text style={styles.statLabel}>ONLINE USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color="#3b82f6" />
          </View>
          <Text style={[styles.statValueMetric, { color: '#3b82f6' }]}>{inet.online ?? 0}</Text>
        </TouchableOpacity>

        {/* EXPIRED USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('expired')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="clock" size={14} color={COLORS.accentRose} />
              <Text style={styles.statLabel}>EXPIRED USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color={COLORS.accentRose} />
          </View>
          <Text style={[styles.statValueMetric, { color: COLORS.accentRose }]}>{inet.expired ?? 0}</Text>
        </TouchableOpacity>

        {/* SUSPENDED USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('suspended')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="alert-triangle" size={14} color={COLORS.accentAmber} />
              <Text style={styles.statLabel}>SUSPENDED USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color={COLORS.accentAmber} />
          </View>
          <Text style={[styles.statValueMetric, { color: COLORS.accentAmber }]}>{inet.suspend ?? 0}</Text>
        </TouchableOpacity>

        {/* DISABLED USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('disabled')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="slash" size={14} color="#64748b" />
              <Text style={styles.statLabel}>DISABLED USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color="#64748b" />
          </View>
          <Text style={[styles.statValueMetric, { color: '#64748b' }]}>{inet.disabled ?? 0}</Text>
        </TouchableOpacity>

        {/* NEW USERS */}
        <TouchableOpacity style={[styles.statCardMetric, styles.statCardMetricClickable]} onPress={() => handleCardClick('new')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="user-plus" size={14} color="#8b5cf6" />
              <Text style={styles.statLabel}>NEW USERS</Text>
            </View>
            <Feather name="arrow-up-right" size={13} color="#8b5cf6" />
          </View>
          <Text style={[styles.statValueMetric, { color: '#8b5cf6' }]}>{inet.new ?? 0}</Text>
        </TouchableOpacity>
      </View>

      {/* IPTV  DATA CARD */}
      <View style={[styles.card, GLASS_CARD_INTERACTIVE]}>
        <View style={styles.cardHeader}>
          <MaterialIcons name="live-tv" size={22} color="#8b5cf6" />
          <View style={{ marginLeft: 8, flex: 1 }}>
            <Text style={styles.cardTitle}>IPTV</Text>
          </View>
        </View>

        <View style={styles.iptvGrid}>
          {/* TOTAL IPTV USERS */}
          <TouchableOpacity style={[styles.iptvCard, styles.iptvCardClickable]} onPress={() => handleCardClick('iptv_all')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.iptvLabel}>TOTAL IPTV USERS</Text>
              <Feather name="arrow-up-right" size={13} color="#8b5cf6" />
            </View>
            <Text style={styles.iptvVal}>{iptv.total}</Text>
          </TouchableOpacity>

          {/* ACTIVE IPTV USERS */}
          <TouchableOpacity style={[styles.iptvCard, styles.iptvCardClickable]} onPress={() => handleCardClick('iptv_active')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.iptvLabel}>ACTIVE IPTV USERS</Text>
              <Feather name="arrow-up-right" size={13} color={COLORS.accentEmerald} />
            </View>
            <Text style={[styles.iptvVal, { color: COLORS.accentEmerald }]}>{iptv.active}</Text>
          </TouchableOpacity>

          {/* EXPIRED IPTV USERS */}
          <TouchableOpacity style={[styles.iptvCard, styles.iptvCardClickable]} onPress={() => handleCardClick('iptv_expired')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.iptvLabel}>EXPIRED IPTV USERS</Text>
              <Feather name="arrow-up-right" size={13} color={COLORS.accentRose} />
            </View>
            <Text style={[styles.iptvVal, { color: COLORS.accentRose }]}>{iptv.expired}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* OTT DATA CARD */}
      {ott ? (
        <View style={[styles.card, GLASS_CARD_INTERACTIVE]}>
          <View style={styles.cardHeader}>
            <Feather name="play-circle" size={22} color="#0ea5e9" />
            <View style={{ marginLeft: 8, flex: 1 }}>
              <Text style={styles.cardTitle}>OTT</Text>
            </View>
          </View>
          <View style={styles.iptvGrid}>
            {[
              { key: 'total', label: 'TOTAL OTT USERS', color: '#0ea5e9' },
              { key: 'active', label: 'ACTIVE OTT USERS', color: COLORS.accentEmerald },
              { key: 'expired', label: 'EXPIRED OTT USERS', color: COLORS.accentRose },
              { key: 'new', label: 'NOT ACTIVATED', color: '#8b5cf6' },
            ].map((c) => (
              <TouchableOpacity key={c.key} style={[styles.iptvCard, styles.iptvCardClickable]} onPress={() => handleCardClick('ott')}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.iptvLabel}>{c.label}</Text>
                  <Feather name="arrow-up-right" size={13} color={c.color} />
                </View>
                <Text style={[styles.iptvVal, { color: c.color }]}>{ott[c.key] ?? 0}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {/* EXPIRY & REGISTRATION (customers_by_date.php) + complaints / leads */}
      <StatsBoard
        user={user}
        summary={dateSummary}
        summaryError={dateSummaryError}
        onReloadSummary={loadDateSummary}
        onNavigateToCustomers={onNavigateToCustomers}
        refreshSignal={refreshSignal}
      />

    </ScrollView>
  );
};

const styles = StyleSheet.create({

  bgSyncBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(37,99,235,0.06)', borderWidth: 1, borderColor: 'rgba(37,99,235,0.2)', marginBottom: 16 },
  bgSyncBarWarn: { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' },
  bgSyncText: { flex: 1, fontSize: 12, color: '#1e3a8a', fontWeight: '600' },
  dateGroupsRow: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  dateGroupCard: { flex: 1, marginBottom: 16 },
  dateRowTitle: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  dateBtnWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  dateBtnLabel: { fontSize: 12, fontWeight: '600' },
  dateBtnCount: { minWidth: 26, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, alignItems: 'center' },
  dateBtnCountText: { fontSize: 12, fontWeight: '700' },
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgPrimary },
  content: { width: '100%', paddingHorizontal: '3%', paddingVertical: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
  pageTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textMain },
  pageSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  sectionHeaderTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  statsGrid7: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCardMetric: { flex: 1, minWidth: 160, padding: 16, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', elevation: 2 },
  statCardMetricClickable: {
    borderColor: COLORS.primary,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 10px rgba(16, 185, 129, 0.08)',
    elevation: 2,
  },
  statLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
  statValueMetric: { fontSize: 24, fontWeight: '700', color: COLORS.textMain, marginTop: 6 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 20, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  cardSubtitle: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  iptvGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  iptvCard: { flex: 1, minWidth: 180, padding: 16, backgroundColor: COLORS.bgSecondary, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.2)', gap: 6 },
  iptvCardClickable: {
    borderColor: '#8b5cf6',
    backgroundColor: '#ffffff',
  },
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

  // Sync Toast Banner & Header Card Styles
  syncToastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accentEmerald,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  syncToastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  operatorHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 18,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.08)',
    elevation: 3,
  },
  operatorHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  operatorHeaderSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  badgeOperatorRole: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeAdminRole: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOperatorRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accentEmerald,
  },
  badgeAdminRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8b5cf6',
  },
  syncBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  syncBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncBtnPurple: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtnSecondaryText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});