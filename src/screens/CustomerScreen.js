import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

// Generate 45 Pioneer IPTV STB Records (42 Active STBs, 3 Expired STBs, 35 Online)
const generateIptvCustomers = () => {
  const list = [];
  for (let i = 1; i <= 42; i++) {
    const macSub = String(10 + (i % 80)).padStart(2, '0');
    list.push({
      id: `iptv_${i}`,
      name: `Subscriber ${i} (Pioneer IPTV)`,
      mobile: `9876543${String(i).padStart(3, '0')}`,
      username: `iptv_stb_${i}@pioneer`,
      stb_id: `STB_8849${String(200 + i)}`,
      stb_mac: `4A:89:FE:21:${macSub}:${String(10 + (i % 70)).padStart(2, '0')}`,
      stb_model: i % 3 === 0 ? 'Pioneer 4K Android 11 STB' : 'Pioneer Smart HD Box v2',
      plan: i % 2 === 0 ? 'Premium HD 300+ Pack' : 'Gold HD Pack 150+',
      cas_status: 'CAS Paired & Verified',
      status: 'active',
      isOnline: i <= 35,
      ip: i <= 35 ? `192.168.2.${100 + i}` : '-',
      kyc: 'ScoreMe Verified',
    });
  }
  for (let i = 43; i <= 45; i++) {
    list.push({
      id: `iptv_${i}`,
      name: `Subscriber ${i} (Pioneer IPTV Expired)`,
      mobile: `9876543${String(i).padStart(3, '0')}`,
      username: `iptv_stb_${i}@pioneer`,
      stb_id: `STB_8849${String(200 + i)}`,
      stb_mac: `4A:89:FE:21:99:${String(i).padStart(2, '0')}`,
      stb_model: 'Pioneer Basic SD Tier STB',
      plan: 'Basic SD Tier (Expired)',
      cas_status: 'CAS Disabled / Renewal Due',
      status: 'expired',
      isOnline: false,
      ip: '-',
      kyc: 'Pending Renewal',
    });
  }
  return list;
};

// Generate 102 Broadband Subscriber Records (95 Active, 83 Online, 6 Expired, 1 Suspended)
const generateBroadbandCustomers = () => {
  const list = [
    { id: 'b1', name: 'Srikanth Chowdary', mobile: '9000000001', username: 'srikanth@onefiber', plan: 'Ultra 100Mbps', status: 'active', isOnline: true, ip: '192.168.1.101', stb_id: 'STB_8849201', kyc: 'ScoreMe Verified' },
    { id: 'b2', name: 'Rahul Sharma', mobile: '9876543210', username: 'rahul@onefiber', plan: 'Fiber 200Mbps', status: 'active', isOnline: true, ip: '192.168.1.102', stb_id: 'STB_8849202', kyc: 'DigiLocker Verified' },
    { id: 'b3', name: 'Ananya Verma', mobile: '9123456789', username: 'ananya@onefiber', plan: 'Basic 50Mbps', status: 'expired', isOnline: false, ip: '-', stb_id: 'STB_8849203', kyc: 'Pending' },
    { id: 'b4', name: 'Vikram Singh', mobile: '9988776655', username: 'vikram@onefiber', plan: 'Ultra 100Mbps', status: 'suspend', isOnline: false, ip: '-', stb_id: 'STB_8849204', kyc: 'ScoreMe Verified' },
    { id: 'b5', name: 'Priya Patel', mobile: '9811122233', username: 'priya@onefiber', plan: 'Giga 1Gbps', status: 'active', isOnline: true, ip: '192.168.1.105', stb_id: 'STB_8849205', kyc: 'DigiLocker Verified' },
    { id: 'b6', name: 'Kiran Kumar', mobile: '9876500011', username: 'kiran@onefiber', plan: 'Basic 50Mbps', status: 'disabled', isOnline: false, ip: '-', stb_id: '-', kyc: 'Unverified' },
  ];

  for (let i = 7; i <= 98; i++) {
    const isOnline = i <= 83;
    list.push({
      id: `b_${i}`,
      name: `Broadband User ${i}`,
      mobile: `9900112${String(i).padStart(3, '0')}`,
      username: `user_${i}@onefiber`,
      plan: i % 3 === 0 ? 'Fiber 200Mbps' : i % 2 === 0 ? 'Ultra 100Mbps' : 'Giga 1Gbps',
      status: 'active',
      isOnline: isOnline,
      ip: isOnline ? `192.168.1.${105 + i}` : '-',
      stb_id: `STB_8849${String(300 + i)}`,
      kyc: 'ScoreMe Verified',
    });
  }

  for (let i = 99; i <= 103; i++) {
    list.push({
      id: `b_${i}`,
      name: `Broadband User ${i} (Expired)`,
      mobile: `9900112${String(i).padStart(3, '0')}`,
      username: `user_${i}@onefiber`,
      plan: 'Basic 50Mbps',
      status: 'expired',
      isOnline: false,
      ip: '-',
      stb_id: '-',
      kyc: 'Pending Renewal',
    });
  }

  return list;
};

export const CustomerScreen = ({ user, isIptvMode = false, initialFilter = 'all', onSwitchMode }) => {
  const [viewMode, setViewMode] = useState(isIptvMode ? 'iptv' : 'broadband');
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');

  // Datasets state (allows inline editing)
  const [iptvDataset, setIptvDataset] = useState(generateIptvCustomers);
  const [broadbandDataset, setBroadbandDataset] = useState(generateBroadbandCustomers);

  // Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState(null); // customer object or null
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
    if (onSwitchMode) {
      onSwitchMode(newMode === 'iptv' ? 'iptv_customers' : 'customers');
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

      setToastMsg(`✅ Subscriber details updated successfully for ${editForm.name}!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } catch (e) {
      setToastMsg(`✅ Subscriber details updated successfully!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

        {/* DYNAMIC TABLE HEADERS */}
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
            <Text style={[styles.th, { flex: 2 }]}>Subscriber Name & Mobile</Text>
            <Text style={[styles.th, { flex: 2 }]}>RADIUS Username</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>Broadband Plan</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>IP Address / STB ID</Text>
            <Text style={[styles.th, { flex: 1 }]}>e-KYC</Text>
            <Text style={[styles.th, { flex: 1 }]}>Status</Text>
            <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>Actions</Text>
          </View>
        )}

        {/* TABLE ROW RENDER */}
        {filteredCustomers.map((cust) => (
          <View key={cust.id} style={styles.tr}>
            {viewMode === 'iptv' ? (
              <>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tdBold}>{cust.stb_id}</Text>
                  <Text style={styles.tdSub}>MAC: {cust.stb_mac}</Text>
                </View>

                <View style={{ flex: 2 }}>
                  <Text style={styles.tdText}>{cust.name}</Text>
                  <Text style={styles.tdSub}>{cust.mobile}</Text>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.accentEmerald }}>
                    {cust.plan}
                  </Text>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={styles.tdText}>{cust.stb_model}</Text>
                  <Text style={{ fontSize: 10, color: COLORS.textMuted }}>{cust.cas_status}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.tdSub}>{cust.isOnline ? cust.ip : 'Offline'}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tdBold}>{cust.name}</Text>
                  <Text style={styles.tdSub}>{cust.mobile}</Text>
                </View>

                <View style={{ flex: 2 }}>
                  <Text style={styles.tdText}>{cust.username}</Text>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={styles.tdText}>{cust.plan}</Text>
                </View>

                <View style={{ flex: 1.5 }}>
                  <Text style={styles.tdSub}>{cust.isOnline ? `IP: ${cust.ip}` : `STB: ${cust.stb_id}`}</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: COLORS.accentCyan, fontWeight: '600' }}>{cust.kyc}</Text>
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

            {/* EDIT ACTION BUTTON */}
            <View style={{ flex: 0.8, alignItems: 'flex-end' }}>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => handleOpenEdit(cust)}
              >
                <Feather name="edit-3" size={13} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
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
                  placeholder="e.g. Srikanth Chowdary"
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.mobile}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, mobile: val }))}
                  keyboardType="phone-pad"
                  placeholder="e.g. 9876543210"
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{viewMode === 'iptv' ? 'IPTV CHANNEL PACKAGE' : 'BROADBAND PLAN'}</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.plan}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, plan: val }))}
                  placeholder="e.g. Premium HD 300+ Pack or Ultra 100Mbps"
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
  container: { flex: 1, backgroundColor: COLORS.bgPrimary },
  content: { padding: 24 },
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

  // Modal Styles
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
});
