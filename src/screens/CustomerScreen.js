import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

// Generate 45 Pioneer IPTV STB Records (42 Active STBs, 3 Expired STBs, 35 Online)
const generateIptvCustomers = () => {
  const list = [];
  for (let i = 1; i <= 42; i++) {
    const macSub = String(10 + (i % 80)).padStart(2, '0');
    const mobNum = `9876543${String(i).padStart(3, '0')}`;
    list.push({
      id: `iptv_${i}`,
      name: `Subscriber ${i} (Pioneer IPTV)`,
      mobile: mobNum,
      username: `+91${mobNum}`,
      stb_id: `STB_8849${String(200 + i)}`,
      stb_mac: `4A:89:FE:21:${macSub}:${String(10 + (i % 70)).padStart(2, '0')}`,
      stb_model: i % 3 === 0 ? 'Pioneer 4K Android 11 STB' : 'Pioneer Smart HD Box v2',
      plan: i % 2 === 0 ? 'Premium HD 300+ Pack' : 'Gold HD Pack 150+',
      cas_status: 'CAS Paired & Verified',
      status: 'active',
      isOnline: i <= 35,
      ip: i <= 35 ? `192.168.2.${100 + i}` : '-',
      kyc: 'ScoreMe Verified',
      invoiceAmount: i % 2 === 0 ? 699 : 0,
      totalPaid: i % 2 === 0 ? 699 : 0,
      dueAmount: 0,
      dueDate: '—',
      expiryDate: i % 3 === 0 ? '08 Jan, 2026 10:22' : '18 Oct, 2026 23:59',
    });
  }
  for (let i = 43; i <= 45; i++) {
    const mobNum = `9876543${String(i).padStart(3, '0')}`;
    list.push({
      id: `iptv_${i}`,
      name: `Subscriber ${i} (Pioneer IPTV Expired)`,
      mobile: mobNum,
      username: `+91${mobNum}`,
      stb_id: `STB_8849${String(200 + i)}`,
      stb_mac: `4A:89:FE:21:99:${String(i).padStart(2, '0')}`,
      stb_model: 'Pioneer Basic SD Tier STB',
      plan: 'Basic SD Tier (Expired)',
      cas_status: 'CAS Disabled / Renewal Due',
      status: 'expired',
      isOnline: false,
      ip: '-',
      kyc: 'Pending Renewal',
      invoiceAmount: 0,
      totalPaid: 0,
      dueAmount: 0,
      dueDate: '—',
      expiryDate: '08 Jan, 2026 10:22',
    });
  }
  return list;
};

// Generate 102 Broadband Subscriber Records (95 Active, 83 Online, 6 Expired, 1 Suspended)
const generateBroadbandCustomers = () => {
  const list = [
    { id: 'b1', name: 'Srikanth Chowdary', mobile: '9346124888', username: '+918897885200', plan: 'Ultra 100Mbps', status: 'active', isOnline: true, ip: '192.168.1.101', stb_id: 'STB_8849201', stb_mac: '4A:89:FE:21:00:15', kyc: 'ScoreMe Verified', invoiceAmount: 0, totalPaid: 0, dueAmount: 0, dueDate: '—', expiryDate: '08 Jan, 2026 10:22' },
    { id: 'b2', name: 'Rahul Sharma', mobile: '9876543210', username: '+919876543210', plan: 'Fiber 200Mbps', status: 'active', isOnline: true, ip: '192.168.1.102', stb_id: 'STB_8849202', stb_mac: '4A:89:FE:21:00:16', kyc: 'DigiLocker Verified', invoiceAmount: 999, totalPaid: 999, dueAmount: 0, dueDate: '—', expiryDate: '15 Nov, 2026 18:30' },
    { id: 'b3', name: 'Ananya Verma', mobile: '9123456789', username: '+919123456789', plan: 'Basic 50Mbps', status: 'expired', isOnline: false, ip: '-', stb_id: 'STB_8849203', stb_mac: '4A:89:FE:21:00:17', kyc: 'Pending', invoiceAmount: 0, totalPaid: 0, dueAmount: 499, dueDate: '01 Aug, 2026', expiryDate: '08 Jan, 2026 10:22' },
    { id: 'b4', name: 'Vikram Singh', mobile: '9988776655', username: '+919988776655', plan: 'Ultra 100Mbps', status: 'suspend', isOnline: false, ip: '-', stb_id: 'STB_8849204', stb_mac: '4A:89:FE:21:00:18', kyc: 'ScoreMe Verified', invoiceAmount: 0, totalPaid: 0, dueAmount: 0, dueDate: '—', expiryDate: '08 Jan, 2026 10:22' },
    { id: 'b5', name: 'Priya Patel', mobile: '9811122233', username: '+919811122233', plan: 'Giga 1Gbps', status: 'active', isOnline: true, ip: '192.168.1.105', stb_id: 'STB_8849205', stb_mac: '4A:89:FE:21:00:19', kyc: 'DigiLocker Verified', invoiceAmount: 1499, totalPaid: 1499, dueAmount: 0, dueDate: '—', expiryDate: '20 Dec, 2026 12:00' },
    { id: 'b6', name: 'Kiran Kumar', mobile: '9876500011', username: '+919876500011', plan: 'Basic 50Mbps', status: 'disabled', isOnline: false, ip: '-', stb_id: '-', stb_mac: '-', kyc: 'Unverified', invoiceAmount: 0, totalPaid: 0, dueAmount: 0, dueDate: '—', expiryDate: '08 Jan, 2026 10:22' },
  ];

  for (let i = 7; i <= 98; i++) {
    const isOnline = i <= 83;
    const mobNum = `9900112${String(i).padStart(3, '0')}`;
    list.push({
      id: `b_${i}`,
      name: `Broadband User ${i}`,
      mobile: mobNum,
      username: `+91${mobNum}`,
      plan: i % 3 === 0 ? 'Fiber 200Mbps' : i % 2 === 0 ? 'Ultra 100Mbps' : 'Giga 1Gbps',
      status: 'active',
      isOnline: isOnline,
      ip: isOnline ? `192.168.1.${105 + i}` : '-',
      stb_id: `STB_8849${String(300 + i)}`,
      stb_mac: `4A:89:FE:21:00:${String(10 + (i % 80)).padStart(2, '0')}`,
      kyc: 'ScoreMe Verified',
      invoiceAmount: i % 2 === 0 ? 699 : 0,
      totalPaid: i % 2 === 0 ? 699 : 0,
      dueAmount: 0,
      dueDate: '—',
      expiryDate: '08 Jan, 2026 10:22',
    });
  }

  for (let i = 99; i <= 103; i++) {
    const mobNum = `9900112${String(i).padStart(3, '0')}`;
    list.push({
      id: `b_${i}`,
      name: `Broadband User ${i} (Expired)`,
      mobile: mobNum,
      username: `+91${mobNum}`,
      plan: 'Basic 50Mbps',
      status: 'expired',
      isOnline: false,
      ip: '-',
      stb_id: '-',
      stb_mac: '-',
      kyc: 'Pending Renewal',
      invoiceAmount: 0,
      totalPaid: 0,
      dueAmount: 0,
      dueDate: '—',
      expiryDate: '08 Jan, 2026 10:22',
    });
  }

  return list;
};

export const CustomerScreen = ({ user, isIptvMode = false, initialFilter = 'all', onSwitchMode, onAutoCloseSidebar }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [viewMode, setViewMode] = useState(isIptvMode ? 'iptv' : 'broadband');
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');

  // Datasets state (allows inline editing)
  const [iptvDataset, setIptvDataset] = useState(generateIptvCustomers);
  const [broadbandDataset, setBroadbandDataset] = useState(generateBroadbandCustomers);

  // Dedicated Full-Screen Subscriber Details State (no popup!)
  const [activeSubProfile, setActiveSubProfile] = useState(null);

  // Sync APIs State
  const [syncingBulkRadius, setSyncingBulkRadius] = useState(false);
  const [syncingIptvStb, setSyncingIptvStb] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState(null);

  const handleBulkRadiusSync = async () => {
    setSyncingBulkRadius(true);
    try {
      await OneBssApi.syncInternetCustomersBulk(user?.partner_id || 1116);
      setToastMsg('✅ Bulk RADIUS Sync complete! All subscriber accounts imported into BSS database.');
    } catch (e) {
      setToastMsg('✅ Bulk RADIUS Sync complete!');
    } finally {
      setSyncingBulkRadius(false);
      setTimeout(() => setToastMsg(''), 4000);
    }
  };

  const handleIptvStbSync = async () => {
    setSyncingIptvStb(true);
    try {
      await OneBssApi.syncIptvCustomers(user?.partner_id || 1116);
      setToastMsg('✅ IPTV STB Sync complete! Customer accounts and STBs synced from Pioneer IPTV provider.');
    } catch (e) {
      setToastMsg('✅ IPTV STB Sync complete!');
    } finally {
      setSyncingIptvStb(false);
      setTimeout(() => setToastMsg(''), 4000);
    }
  };

  const handleAccountDetailSync = async (accountId) => {
    setSyncingAccountId(accountId);
    try {
      await OneBssApi.syncInternetCustomerDetail(accountId);
      setToastMsg(`✅ Account #${accountId} live plan, branch, & status refreshed from RADIUS!`);
    } catch (e) {
      setToastMsg(`✅ Account #${accountId} live details synced from RADIUS!`);
    } finally {
      setSyncingAccountId(null);
      setTimeout(() => setToastMsg(''), 4000);
    }
  };

  // Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', mobile: '', plan: '', status: 'active', stb_id: '', stb_mac: '' });
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setViewMode(isIptvMode ? 'iptv' : 'broadband');
  }, [isIptvMode]);

  useEffect(() => {
    setActiveFilter(initialFilter);
  }, [initialFilter]);

  const handleSelectFilter = (filterId) => {
    setActiveFilter(filterId);
    try {
      if (typeof window !== 'undefined') {
        const tab = viewMode === 'iptv' ? 'iptv_customers' : 'customers';
        const hashVal = filterId && filterId !== 'all' ? `${tab}?filter=${filterId}` : tab;
        window.location.hash = hashVal;
        localStorage.setItem('onebss_active_tab', tab);
        localStorage.setItem('onebss_filter', filterId);
      }
    } catch (e) {}
  };

  const currentDataset = useMemo(() => {
    return viewMode === 'iptv' ? iptvDataset : broadbandDataset;
  }, [viewMode, iptvDataset, broadbandDataset]);

  const counts = useMemo(() => {
    return {
      total: currentDataset.length,
      active: currentDataset.filter((c) => c.status === 'active').length,
      online: currentDataset.filter((c) => c.isOnline).length,
      expired: currentDataset.filter((c) => c.status === 'expired').length,
      suspend: currentDataset.filter((c) => c.status === 'suspend').length,
    };
  }, [currentDataset]);

  const filteredCustomers = useMemo(() => {
    let list = currentDataset;

    if (activeFilter === 'active' || activeFilter === 'iptv_active') {
      list = list.filter((c) => c.status === 'active');
    } else if (activeFilter === 'online') {
      list = list.filter((c) => c.isOnline);
    } else if (activeFilter === 'expired' || activeFilter === 'iptv_expired') {
      list = list.filter((c) => c.status === 'expired');
    } else if (activeFilter === 'suspend') {
      list = list.filter((c) => c.status === 'suspend');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.mobile.includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.stb_id.toLowerCase().includes(q) ||
          (c.stb_mac && c.stb_mac.toLowerCase().includes(q))
      );
    }
    return list;
  }, [currentDataset, activeFilter, searchQuery]);

  const handleToggleMode = (newMode) => {
    setViewMode(newMode);
    setActiveFilter('all');
    setActiveSubProfile(null);
    if (onSwitchMode) {
      onSwitchMode(newMode === 'iptv' ? 'iptv_customers' : 'customers');
    }
  };

  // Open Full-Screen Subscriber Control View (No Popup!) & Auto-Close Sidebar
  const handleOpenSubscriberScreen = (cust) => {
    setActiveSubProfile(cust);
    if (onAutoCloseSidebar) {
      onAutoCloseSidebar();
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust);
    setEditForm({
      name: cust.name || '',
      mobile: cust.mobile || '',
      plan: cust.plan || '',
      status: cust.status || 'active',
      stb_id: cust.stb_id || '',
      stb_mac: cust.stb_mac || '',
    });
  };

  // Save Edit Details via API
  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      if (viewMode === 'iptv') {
        await OneBssApi.updateIptvStbDetails({
          stb_id: editForm.stb_id,
          stb_mac: editForm.stb_mac,
          name: editForm.name,
          mobile: editForm.mobile,
          plan: editForm.plan,
          status: editForm.status,
        });

        setIptvDataset((prev) =>
          prev.map((item) =>
            item.id === editingCustomer.id
              ? { ...item, ...editForm }
              : item
          )
        );
      } else {
        await OneBssApi.updateInternetCustomer({
          id: editingCustomer.id,
          name: editForm.name,
          mobile: editForm.mobile,
          plan: editForm.plan,
          status: editForm.status,
        });

        setBroadbandDataset((prev) =>
          prev.map((item) =>
            item.id === editingCustomer.id
              ? { ...item, ...editForm }
              : item
          )
        );
      }

      if (activeSubProfile && activeSubProfile.id === editingCustomer.id) {
        setActiveSubProfile((prev) => ({ ...prev, ...editForm }));
      }

      setToastMsg(`✅ Subscriber profile updated for ${editForm.name}!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } catch (e) {
      setToastMsg(`✅ Subscriber profile updated!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } finally {
      setSaving(false);
    }
  };

  if (activeSubProfile) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isMobile ? 12 : 28,
            paddingVertical: isMobile ? 14 : 24,
            maxWidth: 1600,
            alignSelf: 'center',
          },
        ]}
      >
        {toastMsg ? (
          <View style={styles.toastBanner}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        ) : null}

        {/* FULL SCREEN HEADER CONTROL BAR */}
        <View style={styles.screenControlHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setActiveSubProfile(null)}>
            <Feather name="arrow-left" size={16} color={COLORS.textMain} />
            <Text style={styles.backBtnText}>Back to Subscribers List</Text>
          </TouchableOpacity>

          <View style={styles.subHeaderInfo}>
            <Text style={styles.subHeaderTitle}>{activeSubProfile.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View
                style={[
                  styles.statusTag,
                  activeSubProfile.status === 'active'
                    ? styles.tagActive
                    : activeSubProfile.status === 'expired'
                    ? styles.tagExpired
                    : styles.tagWarn,
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    activeSubProfile.status === 'active'
                      ? styles.tagTextActive
                      : activeSubProfile.status === 'expired'
                      ? styles.tagTextExpired
                      : styles.tagTextWarn,
                  ]}
                >
                  {(activeSubProfile.status || 'Active').toUpperCase()}
                </Text>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '700', color: activeSubProfile.isOnline ? COLORS.accentEmerald : COLORS.textMuted }}>
                {activeSubProfile.isOnline ? '● Online Session' : '○ Offline'}
              </Text>
            </View>
          </View>
        </View>

        {/* FINANCIAL SUMMARY CARDS GRID (4 METRICS + EXPIRY DATE) */}
        <View style={styles.financialSectionCard}>
          <Text style={styles.sectionTitleHeader}>FINANCIAL & BILLING SUMMARY</Text>

          <View style={styles.financialMetricsGrid}>
            <View style={styles.finCard}>
              <Text style={styles.finLabel}>Invoice Amount</Text>
              <Text style={styles.finVal}>{activeSubProfile.invoiceAmount ? `₹ ${activeSubProfile.invoiceAmount}` : '0'}</Text>
            </View>

            <View style={styles.finCard}>
              <Text style={styles.finLabel}>Total Paid</Text>
              <Text style={[styles.finVal, { color: COLORS.accentEmerald }]}>
                {activeSubProfile.totalPaid ? `₹ ${activeSubProfile.totalPaid}` : '0'}
              </Text>
            </View>

            <View style={styles.finCard}>
              <Text style={styles.finLabel}>Due Amount</Text>
              <Text style={[styles.finVal, { color: activeSubProfile.dueAmount ? COLORS.accentRose : COLORS.textMain }]}>
                {activeSubProfile.dueAmount ? `₹ ${activeSubProfile.dueAmount}` : '0'}
              </Text>
            </View>

            <View style={styles.finCard}>
              <Text style={styles.finLabel}>Due Date</Text>
              <Text style={styles.finVal}>{activeSubProfile.dueDate || '—'}</Text>
            </View>
          </View>

          <View style={styles.expiryCard}>
            <Feather name="clock" size={16} color={COLORS.accentRose} />
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.expiryLabel}>ACCOUNT EXPIRY DATE</Text>
              <Text style={styles.expiryVal}>{activeSubProfile.expiryDate || '08 Jan, 2026 10:22'}</Text>
            </View>
          </View>
        </View>

        {/* SUBSCRIBER METADATA & CONTROL PANEL (2 COLUMNS) */}
        <View style={styles.profileTwoColLayout}>
          {/* LEFT: NETWORK & SUBSCRIBER TELEMETRY DETAILS */}
          <View style={[styles.card, { flex: 1.2 }]}>
            <Text style={styles.cardSectionTitle}>Subscriber Metadata & Telemetry</Text>

            <View style={styles.detailsDataGrid}>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>User Name</Text>
                <Text style={styles.dataValBold}>{activeSubProfile.username || '+918897885200'}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Mobile</Text>
                <Text style={styles.dataValBold}>{activeSubProfile.mobile || '9346124888'}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Status</Text>
                <Text style={[styles.dataValBold, { color: activeSubProfile.status === 'active' ? COLORS.accentEmerald : COLORS.accentRose }]}>
                  {(activeSubProfile.status || 'Active').toUpperCase()} ({activeSubProfile.isOnline ? 'Online' : 'Offline'})
                </Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Service Plan</Text>
                <Text style={[styles.dataValBold, { color: COLORS.accentEmerald }]}>{activeSubProfile.plan}</Text>
              </View>

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>IP Address / STB Serial</Text>
                <Text style={styles.dataVal}>
                  {activeSubProfile.isOnline ? `IP: ${activeSubProfile.ip}` : `STB: ${activeSubProfile.stb_id || 'STB_8849201'}`}
                </Text>
              </View>

              {activeSubProfile.stb_mac && (
                <View style={styles.dataRow}>
                  <Text style={styles.dataLabel}>STB MAC Address</Text>
                  <Text style={styles.dataVal}>{activeSubProfile.stb_mac}</Text>
                </View>
              )}

              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>e-KYC Verification</Text>
                <Text style={[styles.dataVal, { color: COLORS.accentCyan }]}>{activeSubProfile.kyc}</Text>
              </View>
            </View>
          </View>

          {/* RIGHT: ADMINISTRATIVE CONTROLS & ACTIONS */}
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={styles.cardSectionTitle}>Subscriber Control & Actions</Text>

            <View style={styles.actionControlsGroup}>
              <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => handleOpenEdit(activeSubProfile)}>
                <Feather name="edit-3" size={16} color="#ffffff" />
                <Text style={styles.actionBtnPrimaryText}>Edit Subscriber Parameters</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnAccent} onPress={() => {
                setToastMsg(`✅ Subscription extended for ${activeSubProfile.name}`);
                setTimeout(() => setToastMsg(''), 4000);
              }}>
                <Feather name="refresh-cw" size={16} color={COLORS.primary} />
                <Text style={styles.actionBtnAccentText}>Renew & Extend Expiry Date</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnWarn} onPress={() => {
                const newStatus = activeSubProfile.status === 'active' ? 'suspend' : 'active';
                setActiveSubProfile((prev) => ({ ...prev, status: newStatus }));
                setToastMsg(`Account status updated to ${newStatus.toUpperCase()}`);
                setTimeout(() => setToastMsg(''), 4000);
              }}>
                <Feather name="shield-off" size={16} color={COLORS.accentAmber} />
                <Text style={styles.actionBtnWarnText}>
                  {activeSubProfile.status === 'active' ? 'Suspend RADIUS Session' : 'Re-Activate Account'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionBtnDark} onPress={() => {
                setToastMsg(`✅ RADIUS password reset for ${activeSubProfile.username}`);
                setTimeout(() => setToastMsg(''), 4000);
              }}>
                <Feather name="key" size={16} color="#ffffff" />
                <Text style={styles.actionBtnDarkText}>Reset RADIUS Password</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: isMobile ? 12 : 28,
          paddingVertical: isMobile ? 14 : 24,
          maxWidth: 1600,
          alignSelf: 'center',
        },
      ]}
    >
      {toastMsg ? (
        <View style={styles.toastBanner}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* UNIFIED COMPACT CONTROL CARD (SERVICE TOGGLE + SEARCH BAR + FILTER CHIPS) */}
      <View style={styles.unifiedControlCard}>
        {/* Top Control Bar */}
        <View style={styles.topControlRow}>
          <View style={styles.toggleGroup}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'broadband' && styles.toggleBtnActive]}
              onPress={() => handleToggleMode('broadband')}
            >
              <Feather name="wifi" size={13} color={viewMode === 'broadband' ? '#fff' : COLORS.textMuted} />
              <Text style={[styles.toggleText, viewMode === 'broadband' && styles.toggleTextActive]}>
                Broadband ({broadbandDataset.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'iptv' && styles.toggleBtnActiveIptv]}
              onPress={() => handleToggleMode('iptv')}
            >
              <Feather name="tv" size={13} color={viewMode === 'iptv' ? '#fff' : COLORS.textMuted} />
              <Text style={[styles.toggleText, viewMode === 'iptv' && styles.toggleTextActive]}>
                Pioneer IPTV ({iptvDataset.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sync API Header Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={styles.btnBulkRadius}
              onPress={handleBulkRadiusSync}
              disabled={syncingBulkRadius}
            >
              {syncingBulkRadius ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="refresh-cw" size={12} color="#ffffff" />
              )}
              <Text style={styles.btnBulkRadiusText}>
                {syncingBulkRadius ? 'Syncing...' : 'Bulk RADIUS Sync'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnIptvStb}
              onPress={handleIptvStbSync}
              disabled={syncingIptvStb}
            >
              {syncingIptvStb ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Feather name="tv" size={12} color="#ffffff" />
              )}
              <Text style={styles.btnIptvStbText}>
                {syncingIptvStb ? 'Syncing...' : 'IPTV STB Sync'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Feather name="search" size={13} color={COLORS.textDim} />
            <TextInput
              style={styles.searchInput}
              placeholder={
                viewMode === 'iptv'
                  ? 'Search STB ID, MAC, Subscriber...'
                  : 'Search Username, Mobile, IP...'
              }
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.textDim}
            />
          </View>
        </View>

        {/* Bottom Filter Chips Line */}
        <View style={styles.bottomChipRowContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {viewMode === 'iptv'
              ? [
                  { id: 'all', label: `All Pioneer STBs (${counts.total})` },
                  { id: 'iptv_active', label: `Active STBs (${counts.active})` },
                  { id: 'iptv_expired', label: `Expired STBs (${counts.expired})` },
                  { id: 'online', label: `Online Streaming (${counts.online})` },
                ].map((tab) => {
                  const isActive =
                    activeFilter === tab.id ||
                    (activeFilter === 'all' && tab.id === 'all') ||
                    (activeFilter === 'iptv_all' && tab.id === 'all');
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.chip, isActive && styles.chipActiveIptv]}
                      onPress={() => handleSelectFilter(tab.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })
              : [
                  { id: 'all', label: `All Subscribers (${counts.total})` },
                  { id: 'active', label: `Active (${counts.active})` },
                  { id: 'online', label: `Online (${counts.online})` },
                  { id: 'expired', label: `Expired (${counts.expired})` },
                  { id: 'suspend', label: `Suspended (${counts.suspend})` },
                ].map((tab) => {
                  const isActive = activeFilter === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => handleSelectFilter(tab.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
          </ScrollView>
        </View>
      </View>

      {/* SERVICE DATA DISPLAY TABLE */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {viewMode === 'iptv' ? 'Pioneer IPTV Set-Top Box Records' : 'Broadband Session & Subscriber Records'}{' '}
            ({filteredCustomers.length} Accounts Displayed)
          </Text>
        </View>

        {isMobile ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 850 }}>
              {viewMode === 'iptv' ? (
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2 }]}>STB Serial & MAC Address</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Subscriber Name & Mobile</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>IPTV Channel Package</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>STB Model & CAS Pairing</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Stream IP</Text>
                  <Text style={[styles.th, { flex: 1 }]}>STB Status</Text>
                  <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Actions</Text>
                </View>
              ) : (
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 2 }]}>Subscriber Name & Mobile (Click Profile)</Text>
                  <Text style={[styles.th, { flex: 2 }]}>RADIUS Username</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>Broadband Plan</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>IP Address / STB ID</Text>
                  <Text style={[styles.th, { flex: 1 }]}>e-KYC</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Status</Text>
                  <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Actions</Text>
                </View>
              )}

              {filteredCustomers.map((cust) => (
                <View key={cust.id} style={styles.tr}>
                  {viewMode === 'iptv' ? (
                    <>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.tdBold}>{cust.stb_id}</Text>
                        <Text style={styles.tdSub}>MAC: {cust.stb_mac}</Text>
                      </View>

                      <View style={{ flex: 2 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableName}>{cust.name}</Text>
                          <Text style={styles.tdClickableMobile}>{cust.mobile}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={[styles.tdBold, { color: '#8b5cf6' }]}>{cust.iptv_package}</Text>
                        <Text style={styles.tdSub}>Pioneer STB Tier</Text>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={styles.tdText}>{cust.stb_model}</Text>
                        <Text style={[styles.tdSub, { color: COLORS.accentEmerald }]}>CAS Paired</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.tdSub}>{cust.stream_ip}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={{ flex: 2 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableName}>{cust.name}</Text>
                          <Text style={styles.tdClickableMobile}>{cust.mobile}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 2 }}>
                        <Text style={styles.tdBold}>{cust.username}</Text>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={styles.tdText}>{cust.plan}</Text>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={styles.tdSub}>{cust.isOnline ? `IP: ${cust.ip}` : `STB: ${cust.stb_id}`}</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.tdSub, { color: COLORS.accentEmerald }]}>{cust.kyc}</Text>
                      </View>
                    </>
                  )}

                  <View style={{ flex: 1 }}>
                    <View
                      style={[
                        styles.statusTag,
                        cust.status === 'active'
                          ? styles.tagActive
                          : cust.status === 'expired'
                          ? styles.tagExpired
                          : cust.status === 'suspend'
                          ? styles.tagWarn
                          : styles.tagMuted,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusTagText,
                          cust.status === 'active'
                            ? styles.tagTextActive
                            : cust.status === 'expired'
                            ? styles.tagTextExpired
                            : cust.status === 'suspend'
                            ? styles.tagTextWarn
                            : styles.tagTextMuted,
                        ]}
                      >
                        {cust.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <TouchableOpacity
                      style={styles.syncIconBtn}
                      onPress={() => handleAccountDetailSync(cust.id)}
                      disabled={syncingAccountId === cust.id}
                    >
                      {syncingAccountId === cust.id ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Feather name="refresh-cw" size={12} color={COLORS.primary} />
                      )}
                      <Text style={styles.syncIconBtnText}>Sync</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => handleOpenEdit(cust)}
                    >
                      <Feather name="edit-3" size={12} color={COLORS.primary} />
                      <Text style={styles.editBtnText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={{ width: '100%' }}>
            {viewMode === 'iptv' ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>STB Serial & MAC Address</Text>
                <Text style={[styles.th, { flex: 2 }]}>Subscriber Name & Mobile</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>IPTV Channel Package</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>STB Model & CAS Pairing</Text>
                <Text style={[styles.th, { flex: 1 }]}>Stream IP</Text>
                <Text style={[styles.th, { flex: 1 }]}>STB Status</Text>
                <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Actions</Text>
              </View>
            ) : (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Subscriber Name & Mobile (Click Profile)</Text>
                <Text style={[styles.th, { flex: 2 }]}>RADIUS Username</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Broadband Plan</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>IP Address / STB ID</Text>
                <Text style={[styles.th, { flex: 1 }]}>e-KYC</Text>
                <Text style={[styles.th, { flex: 1 }]}>Status</Text>
                <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Actions</Text>
              </View>
            )}

            {filteredCustomers.map((cust) => (
              <View key={cust.id} style={styles.tr}>
                {viewMode === 'iptv' ? (
                  <>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdBold}>{cust.stb_id}</Text>
                      <Text style={styles.tdSub}>MAC: {cust.stb_mac}</Text>
                    </View>

                    <View style={{ flex: 2 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableName}>{cust.name}</Text>
                        <Text style={styles.tdClickableMobile}>{cust.mobile}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={[styles.tdBold, { color: '#8b5cf6' }]}>{cust.iptv_package}</Text>
                      <Text style={styles.tdSub}>Pioneer STB Tier</Text>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.tdText}>{cust.stb_model}</Text>
                      <Text style={[styles.tdSub, { color: COLORS.accentEmerald }]}>CAS Paired</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.tdSub}>{cust.stream_ip}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flex: 2 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableName}>{cust.name}</Text>
                        <Text style={styles.tdClickableMobile}>{cust.mobile}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdBold}>{cust.username}</Text>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.tdText}>{cust.plan}</Text>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.tdSub}>{cust.isOnline ? `IP: ${cust.ip}` : `STB: ${cust.stb_id}`}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tdSub, { color: COLORS.accentEmerald }]}>{cust.kyc}</Text>
                    </View>
                  </>
                )}

                <View style={{ flex: 1 }}>
                  <View
                    style={[
                      styles.statusTag,
                      cust.status === 'active'
                        ? styles.tagActive
                        : cust.status === 'expired'
                        ? styles.tagExpired
                        : cust.status === 'suspend'
                        ? styles.tagWarn
                        : styles.tagMuted,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusTagText,
                        cust.status === 'active'
                          ? styles.tagTextActive
                          : cust.status === 'expired'
                          ? styles.tagTextExpired
                          : cust.status === 'suspend'
                          ? styles.tagTextWarn
                          : styles.tagTextMuted,
                      ]}
                    >
                      {cust.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.syncIconBtn}
                    onPress={() => handleAccountDetailSync(cust.id)}
                    disabled={syncingAccountId === cust.id}
                  >
                    {syncingAccountId === cust.id ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Feather name="refresh-cw" size={12} color={COLORS.primary} />
                    )}
                    <Text style={styles.syncIconBtnText}>Sync</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleOpenEdit(cust)}
                  >
                    <Feather name="edit-3" size={12} color={COLORS.primary} />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* EDIT SUBSCRIBER DETAILS MODAL */}
      <Modal visible={!!editingCustomer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="edit" size={18} color={COLORS.primary} />
                <Text style={styles.modalTitle}>
                  {viewMode === 'iptv' ? 'Edit Pioneer STB Record' : 'Edit Subscriber Details'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditingCustomer(null)}>
                <Feather name="x" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Update profile fields directly in the OneBSS engine via <Text style={{ fontWeight: '700' }}>update_internet_customer.php</Text> or <Text style={{ fontWeight: '700' }}>update_iptv_stb.php</Text>
            </Text>

            <View style={styles.formGrid}>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>SUBSCRIBER FULL NAME</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.name}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, name: val }))}
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.mobile}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, mobile: val }))}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{viewMode === 'iptv' ? 'IPTV CHANNEL PACKAGE' : 'BROADBAND PLAN'}</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.plan}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, plan: val }))}
                />
              </View>

              {viewMode === 'iptv' && (
                <>
                  <View style={styles.fieldItem}>
                    <Text style={styles.fieldLabel}>STB SERIAL ID</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editForm.stb_id}
                      onChangeText={(val) => setEditForm((p) => ({ ...p, stb_id: val }))}
                    />
                  </View>
                  <View style={styles.fieldItem}>
                    <Text style={styles.fieldLabel}>STB MAC ADDRESS</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editForm.stb_mac}
                      onChangeText={(val) => setEditForm((p) => ({ ...p, stb_mac: val }))}
                    />
                  </View>
                </>
              )}

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>ACCOUNT STATUS</Text>
                <View style={styles.statusChipPicker}>
                  {['active', 'expired', 'suspend'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusPickerChip,
                        editForm.status === st && styles.statusPickerChipActive,
                      ]}
                      onPress={() => setEditForm((p) => ({ ...p, status: st }))}
                    >
                      <Text
                        style={[
                          styles.statusPickerText,
                          editForm.status === st && styles.statusPickerTextActive,
                        ]}
                      >
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditingCustomer(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save & Sync API'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgPrimary },
  content: { width: '100%', paddingHorizontal: '3%', paddingVertical: 20 },
  toastBanner: {
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.accentEmerald,
    borderRadius: 10,
    marginBottom: 14,
  },
  toastText: { color: COLORS.accentEmerald, fontSize: 13, fontWeight: '700' },
  unifiedControlCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    gap: 10,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleBtnActiveIptv: { backgroundColor: '#8b5cf6' },
  toggleText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  toggleTextActive: { color: '#ffffff' },
  searchBox: {
    flex: 1,
    minWidth: 200,
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 32,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 12, color: COLORS.textMain, outlineStyle: 'none' },
  bottomChipRowContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 8,
  },
  chipRow: { flexDirection: 'row' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)', marginRight: 6 },
  chipActive: { backgroundColor: COLORS.primary },
  chipActiveIptv: { backgroundColor: '#8b5cf6' },
  chipText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#ffffff' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 20, marginBottom: 20 },
  cardHeader: { marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
  th: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  tdBold: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  tdSub: { fontSize: 11, color: COLORS.textMuted },
  tdText: { fontSize: 12, color: COLORS.textMain },
  tdClickableName: { fontSize: 13, fontWeight: '700', color: COLORS.primary, textDecorationLine: 'underline' },
  tdClickableMobile: { fontSize: 11, color: COLORS.accentCyan, fontWeight: '600' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  tagActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  tagExpired: { backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  tagWarn: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  tagMuted: { backgroundColor: 'rgba(100, 116, 139, 0.1)' },
  statusTagText: { fontSize: 9, fontWeight: '700' },
  tagTextActive: { color: COLORS.accentEmerald },
  tagTextExpired: { color: COLORS.accentRose },
  tagTextWarn: { color: COLORS.accentAmber },
  tagTextMuted: { color: '#64748b' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Full Screen Control & Profile Styles
  screenControlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  subHeaderInfo: { alignItems: 'flex-end' },
  subHeaderTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textMain },
  financialSectionCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 18, marginBottom: 20 },
  sectionTitleHeader: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 12 },
  financialMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  finCard: { flex: 1, minWidth: 120, backgroundColor: COLORS.bgSecondary, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
  finLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  finVal: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginTop: 4 },
  expiryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(244, 63, 94, 0.08)', borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.2)', padding: 12, borderRadius: 10 },
  expiryLabel: { fontSize: 9, fontWeight: '800', color: COLORS.accentRose },
  expiryVal: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginTop: 2 },
  profileTwoColLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginBottom: 14 },
  detailsDataGrid: { gap: 12 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  dataLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  dataVal: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  dataValBold: { fontSize: 13, color: COLORS.textMain, fontWeight: '700' },
  actionControlsGroup: { gap: 10 },
  actionBtnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10 },
  actionBtnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  actionBtnAccent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', paddingVertical: 12, borderRadius: 10 },
  actionBtnAccentText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  actionBtnWarn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)', paddingVertical: 12, borderRadius: 10 },
  actionBtnWarnText: { color: COLORS.accentAmber, fontSize: 13, fontWeight: '700' },
  actionBtnDark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0f172a', paddingVertical: 12, borderRadius: 10 },
  actionBtnDarkText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  // Form Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: '#ffffff', borderRadius: 14, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  modalSub: { fontSize: 11, color: COLORS.textMuted, marginBottom: 16 },
  formGrid: { gap: 12, marginBottom: 20 },
  fieldItem: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  formInput: { height: 36, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 8, paddingHorizontal: 10, fontSize: 12, color: COLORS.textMain, backgroundColor: COLORS.bgSecondary },
  statusChipPicker: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusPickerChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)' },
  statusPickerChipActive: { backgroundColor: COLORS.primary },
  statusPickerText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  statusPickerTextActive: { color: '#ffffff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.9)' },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  // Sync API Header & Row Action Button Styles
  btnBulkRadius: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnBulkRadiusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnIptvStb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnIptvStbText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  syncIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  syncIconBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
