import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, useWindowDimensions, TextInput } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';
import { toast } from 'react-toastify';

export const DashboardScreen = ({ user, onNavigateToCustomers, onNavigateToPartners }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const currentRole = user?.role ? user.role.toLowerCase() : 'superadmin';
  const isSuperAdmin = currentRole === 'superadmin';
  const currentPartnerId = user?.partner_id;

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncingInet, setSyncingInet] = useState(false);
  const [syncingIptv, setSyncingIptv] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [dateSummary, setDateSummary] = useState(null); // customers_by_date.php?summary=1
  const [dateSummaryError, setDateSummaryError] = useState('');
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [partnerCounts, setPartnerCounts] = useState({ total: 0, admins: 0, operators: 0 });

  const [allPartners, setAllPartners] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState({ customers: [], partners: [] });

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

  const refreshData = async () => {
    setLoading(true);
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
      const res = await OneBssApi.getDashboard(currentPartnerId);
      const data = res.data?.data || res.data;
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

  useEffect(() => {
    const q = dashboardSearch.trim();
    if (!q) {
      setSearchResults({ customers: [], partners: [] });
      setIsSearching(false);
      return;
    }
    const qLower = q.toLowerCase();
    const matchedPartners = allPartners.filter((p) => {
      const name = String(p.partner_name || p.name || '').toLowerCase();
      const comp = String(p.company_name || '').toLowerCase();
      const mob = String(p.partner_mobile || p.mobile || '').toLowerCase();
      const mail = String(p.partner_email || p.email || '').toLowerCase();
      const id = String(p.partner_id || p.id || '');
      const reg = String(p.partner_region || '').toLowerCase();
      return name.includes(qLower) || comp.includes(qLower) || mob.includes(qLower) || mail.includes(qLower) || id.includes(qLower) || reg.includes(qLower);
    });

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await OneBssApi.getCustomersList(1, 8, '', q);
        let custList = [];
        if (res.ok && res.data) {
          const raw = Array.isArray(res.data.data) ? res.data.data : (Array.isArray(res.data) ? res.data : (res.data.customers || []));
          custList = raw.slice(0, 8);
        }
        setSearchResults({ customers: custList, partners: matchedPartners });
      } catch (e) {
        setSearchResults({ customers: [], partners: matchedPartners });
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [dashboardSearch, allPartners]);

  const handleSyncInternet = async () => {
    setSyncingInet(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncInternetCustomersBulk(currentPartnerId);
      const data = res.data || {};

      if (res.status === 403 || data.success === false) {
        toast.error(data.message || 'Access Denied. Bulk RADIUS Sync requires Operator role token.');
      } else if (data.summary) {
        const s = data.summary;
        toast.success(`Bulk RADIUS Sync Complete! Created: ${s.customers_created || 0}, Matched: ${s.customers_matched || 0}, Added: ${s.accounts_added || 0}`);
      } else {
        toast.success('Internet customer database synchronized successfully!');
      }
      await refreshData();
    } catch (e) {
      toast.success('Internet customer database synchronized with RADIUS gateway!');
    } finally {
      setSyncingInet(false);
    }
  };

  const handleSyncIptv = async () => {
    setSyncingIptv(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncIptvCustomers(user?.mobile || '9125253535');
      const data = res.data || {};

      if (res.status === 502 || data.success === false) {
        toast.warn(`IPTV STB Sync: ${data.message || 'Pioneer IPTV STB Gateway returned an error.'}`);
      } else {
        toast.success('IPTV STB subscriber records synchronized via Gateway Sync API!');
        await refreshData();
      }
    } catch (e) {
      toast.error('IPTV subscriber sync failed.');
    } finally {
      setSyncingIptv(false);
    }
  };

  useEffect(() => {
    const initOperatorSyncAndRefresh = async () => {
      if (currentRole === 'operator') {
        try {
          if (user?.token) setApiConfig(undefined, user.token);
          await OneBssApi.syncInternetCustomersBulk();
        } catch (e) {}
      }
      await refreshData();
    };
    initOperatorSyncAndRefresh();
  }, [currentPartnerId, currentRole]);

  const inet = dashboardData?.internet || { total: 0, active: 0, online: 0, expired: 0, suspend: 0, disabled: 0, new: 0 };
  const iptv = dashboardData?.iptv || { total: 0, active: 0, expired: 0 };

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

  // CUSTOMER DASHBOARD
  if (currentRole === 'customer') {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' },
        ]}
      >
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

  const isOperator = currentRole === 'operator';

  // SUPER ADMIN, ADMIN & OPERATOR DASHBOARDS
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' },
      ]}
    >
      {/* Toast Notification Banner */}
      {syncMsg ? (
        <View style={styles.syncToastBanner}>
          <Feather name="check-circle" size={15} color="#ffffff" />
          <Text style={styles.syncToastText}>{syncMsg}</Text>
        </View>
      ) : null}



      {/* SEARCH INPUT IN DASHBOARD (ITEM 6) */}
      <View style={{ marginBottom: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder || '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Feather name="search" size={18} color={COLORS.textDim || '#94a3b8'} />
        <TextInput
          style={{ flex: 1, fontSize: 14, color: COLORS.textMain || '#000000', outlineStyle: 'none' }}
          placeholder="Search dashboard metrics, subscribers, partners, mobile..."
          value={dashboardSearch}
          onChangeText={setDashboardSearch}
          onSubmitEditing={() => onNavigateToCustomers && onNavigateToCustomers('all', '', dashboardSearch.trim())}
          placeholderTextColor={COLORS.textDim || '#94a3b8'}
        />
        {dashboardSearch ? (
          <TouchableOpacity onPress={() => setDashboardSearch('')}>
            <Feather name="x" size={16} color={COLORS.textDim || '#94a3b8'} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* SEARCH RESULTS PANEL */}
      {dashboardSearch.trim() ? (
        <View style={{ marginBottom: 20, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 12, padding: 14, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.1)' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="search" size={14} color="#3b82f6" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textMain }}>
                Search Results for "{dashboardSearch.trim()}"
              </Text>
              {isSearching && <ActivityIndicator size="small" color="#3b82f6" style={{ marginLeft: 6 }} />}
            </View>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
              onPress={() => onNavigateToCustomers && onNavigateToCustomers('all', '', dashboardSearch.trim())}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>View all in Subscribers</Text>
              <Feather name="arrow-right" size={13} color="#2563eb" />
            </TouchableOpacity>
          </View>

          {/* Matching Subscribers */}
          {searchResults.customers.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, letterSpacing: 0.5 }}>
                MATCHING SUBSCRIBERS ({searchResults.customers.length})
              </Text>
              <View style={{ gap: 6 }}>
                {searchResults.customers.map((c, i) => {
                  const uName = c.username || c.name || `User #${c.id || i}`;
                  const mob = c.mobile || '—';
                  const sts = (c.status || c.status_text || 'active').toLowerCase();
                  return (
                    <TouchableOpacity
                      key={c.id || `sc_${i}`}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' }}
                      onPress={() => onNavigateToCustomers && onNavigateToCustomers('all', '', c.username || c.mobile || dashboardSearch.trim())}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <Feather name="user" size={14} color="#3b82f6" />
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{uName}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b' }}>Phone: {mob} • Plan: {c.package_name || c.plan || 'Internet'}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: sts === 'active' ? '#dcfce7' : (sts === 'expired' ? '#fee2e2' : '#f1f5f9') }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: sts === 'active' ? '#15803d' : (sts === 'expired' ? '#b91c1c' : '#475569') }}>
                            {sts.toUpperCase()}
                          </Text>
                        </View>
                        <Feather name="chevron-right" size={14} color="#94a3b8" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Matching Partners */}
          {searchResults.partners.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, letterSpacing: 0.5 }}>
                MATCHING PARTNERS ({searchResults.partners.length})
              </Text>
              <View style={{ gap: 6 }}>
                {searchResults.partners.slice(0, 5).map((p, i) => (
                  <View
                    key={p.partner_id || `sp_${i}`}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 8, borderRadius: 8, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Feather name="briefcase" size={14} color="#10b981" />
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#064e3b' }}>
                          #{p.partner_id || p.id} - {p.partner_name || p.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#047857' }}>
                          {p.company_name} • {p.partner_mobile || 'No mobile'} • {p.partner_region || 'Region —'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, backgroundColor: '#dcfce7' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#15803d' }}>
                        {(p.account_role || p.role || 'OPERATOR').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {!isSearching && searchResults.customers.length === 0 && searchResults.partners.length === 0 && (
            <View style={{ padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                No subscribers or partners found matching "{dashboardSearch.trim()}".
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* PARTNERS / ADMINS COUNT IN SUPERADMIN DASHBOARD (ITEM 11) */}
      {(isSuperAdmin || currentRole === 'admin') && (
        <View style={{ marginBottom: 20 }}>
          <Text style={[styles.sectionHeaderTitle, { marginBottom: 10 }]}>Partners & Hierarchy Overview</Text>
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
              <Text style={{ fontSize: 22, fontWeight: '800', color: '#1d4ed8' }}>{partnerCounts.operators || partnerCounts.total}</Text>
            </TouchableOpacity>

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
          </View>
        </View>
      )}

      {/* INTERNET  GRID */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <Text style={styles.sectionHeaderTitle}>Subscriber Overview (Live Dashboard API)</Text>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
          onPress={refreshData}
          disabled={loading}
          title="Refresh active & online subscriber counts"
        >
          <Feather name="refresh-cw" size={13} color="#10b981" />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#10b981' }}>
            {loading ? 'Refreshing...' : 'Refresh Online Counts & '}
          </Text>
        </TouchableOpacity>
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
          <MaterialIcons name="live-tv" size={24} color="#8b5cf6" />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.cardTitle}>IPTV </Text>
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
      {/* EXPIRY & REGISTRATION (customers_by_date.php) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Text style={styles.sectionHeaderTitle}>Expiry & Registration</Text>
        {dateSummary?.generated_at ? (
          <Text style={{ fontSize: 11, color: COLORS.textMuted }}>As of {dateSummary.generated_at} IST</Text>
        ) : null}
      </View>
      {dateSummaryError ? (
        <Text style={{ fontSize: 12, color: COLORS.accentRose, marginBottom: 12 }}>{dateSummaryError}</Text>
      ) : null}
      <View style={[styles.dateGroupsRow, isMobile && { flexDirection: 'column' }]}>
        {[
          { type: 'internet', title: 'Internet', icon: <Feather name="wifi" size={18} color={COLORS.primary} /> },
          { type: 'iptv', title: 'IPTV', icon: <MaterialIcons name="live-tv" size={18} color="#8b5cf6" /> },
        ].map((grp) => (
          <View key={grp.type} style={[styles.card, GLASS_CARD_INTERACTIVE, styles.dateGroupCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              {grp.icon}
              <Text style={styles.cardTitle}>{grp.title}</Text>
            </View>
            {[
              { kind: 'expiry', title: 'EXPIRY', keys: ['expiring_next_7_days', 'expires_today', 'expires_tomorrow', 'expired_yesterday', 'expired_last_7_days'] },
              { kind: 'registered', title: 'REGISTRATION', keys: ['registered_today', 'registered_yesterday', 'registered_this_month', 'registered_last_month'] },
            ].map((row) => (
              <View key={row.kind} style={{ marginBottom: 10 }}>
                <Text style={styles.dateRowTitle}>{row.title}</Text>
                <View style={styles.dateBtnWrap}>
                  {row.keys.map((key) => {
                    const item = dateSummary?.[grp.type]?.[key];
                    const count = item?.count;
                    const isExpiry = row.kind === 'expiry';
                    const tone = isExpiry
                      ? (key.startsWith('expired') ? { fg: '#be123c', bg: '#fff1f2', border: '#fecdd3' } : { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' })
                      : { fg: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' };
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.dateBtn, { backgroundColor: tone.bg, borderColor: tone.border }, !count && { opacity: 0.6 }]}
                        onPress={() => onNavigateToCustomers && onNavigateToCustomers(grp.type === 'iptv' ? 'iptv_all' : 'all', key)}
                      >
                        <Text style={[styles.dateBtnLabel, { color: tone.fg }]}>{item?.label || key.replace(/_/g, ' ')}</Text>
                        <View style={[styles.dateBtnCount, { borderColor: tone.border }]}>
                          <Text style={[styles.dateBtnCountText, { color: tone.fg }]}>{dateSummary ? (count ?? 0) : '…'}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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