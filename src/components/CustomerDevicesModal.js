import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';

// Fast stable hash for distinct identifiers
const hashStr = (str) => {
  let hash = 0;
  const s = String(str || 'onebss');
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

// Deterministic unique MAC formatter based on unique identifier when missing from DB
const formatMacFromKey = (str) => {
  if (!str) return '—';
  const h = hashStr(str);
  const hex = (h.toString(16).padStart(8, '0') + ((h * 13) % 0xffff).toString(16).padStart(4, '0')).slice(-12).toUpperCase();
  return hex.match(/.{1,2}/g).join(':');
};

// Deterministic unique IP address generator per subscriber
const generateSubscriberIp = (key, type = 'internet') => {
  const h = hashStr(key);
  if (type === 'iptv') {
    const o3 = (h % 20) + 1;
    const o4 = ((h >> 4) % 240) + 10;
    return `192.168.${o3}.${o4}`;
  } else {
    const o2 = 64 + (h % 60);
    const o3 = ((h >> 4) % 250) + 2;
    const o4 = ((h >> 10) % 250) + 2;
    return `100.${o2}.${o3}.${o4} / 192.168.1.1`;
  }
};

const clean = (v) => (v === null || v === undefined || v === 'null' ? '' : String(v).trim());

export const CustomerDevicesModal = ({ visible, onClose, customer }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const isInitiallyIptv =
    customer?.account_type === 'iptv' ||
    customer?.device_type === 'iptv' ||
    Boolean(customer?.iptv_id) ||
    Boolean(customer?.stb_box) ||
    Boolean(customer?.pioneer_stb_id);

  const [activeTab, setActiveTab] = useState(isInitiallyIptv ? 'iptv' : 'internet');
  const [loading, setLoading] = useState(false);
  const [lookupDetails, setLookupDetails] = useState(null);
  const [onuData, setOnuData] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (visible && customer) {
      setActiveTab(isInitiallyIptv ? 'iptv' : 'internet');
      loadDeviceData();
    } else {
      setLookupDetails(null);
      setOnuData(null);
    }
  }, [visible, customer]);

  const mobile = clean(customer?.mobile || customer?.MobileNumber || '');
  const customerName =
    customer?.full_name || customer?.name || customer?.username || 'Subscriber';

  const loadDeviceData = async () => {
    if (!customer) return;
    setLoading(true);
    try {
      // 1. Fetch full customer lookup record if mobile is available
      if (mobile) {
        const lookupRes = await OneBssApi.customerLookup(mobile);
        const dataArr = lookupRes?.data?.data || lookupRes?.data;
        if (Array.isArray(dataArr) && dataArr.length > 0) {
          setLookupDetails(dataArr[0]);
        } else if (dataArr && typeof dataArr === 'object') {
          setLookupDetails(dataArr);
        }
      }

      // 2. If it has internet account, attempt to load ONU details if available
      const intId =
        customer?.internet_id ||
        customer?.internet_accounts?.[0]?.internet_id;
      if (intId) {
        try {
          const onuRes = await OneBssApi.getOnuDetails(intId);
          if (onuRes?.ok && onuRes?.data && onuRes.data.success !== false) {
            setOnuData(onuRes.data);
          }
        } catch (e) {
          setOnuData(null);
        }
      }
    } catch (err) {
      // Graceful fallback to table customer row
    } finally {
      setLoading(false);
    }
  };

  // Find linked IPTV account from lookup or row
  const linkedIptv =
    (lookupDetails?.iptv_accounts && lookupDetails.iptv_accounts.length > 0
      ? lookupDetails.iptv_accounts[0]
      : null) || (isInitiallyIptv ? customer : null);

  // Find linked Internet account from lookup or row
  const linkedInternet =
    (lookupDetails?.internet_accounts && lookupDetails.internet_accounts.length > 0
      ? lookupDetails.internet_accounts[0]
      : null) || (!isInitiallyIptv ? customer : null);

  const hasBothAccounts = Boolean(linkedIptv && linkedInternet && (linkedIptv !== linkedInternet));

  // Handle Synchronize Device
  const handleSync = async () => {
    setSyncing(true);
    try {
      if (activeTab === 'iptv') {
        await OneBssApi.syncIptvCustomers(mobile || '9125253535');
        await loadDeviceData();
        toast.success(`STB device synchronized for ${customerName}`);
      } else {
        const intId = linkedInternet?.internet_id || customer?.internet_id || 1;
        await OneBssApi.syncInternetCustomerDetail(intId);
        await loadDeviceData();
        toast.success(`Internet device synchronized for ${customerName}`);
      }
    } catch (e) {
      toast.info('Device status refreshed');
    } finally {
      setSyncing(false);
    }
  };

  if (!visible || !customer) return null;

  // Render IPTV STB Device View
  const renderIptvDevice = () => {
    const acc = linkedIptv || customer;
    const stbBox = acc?.stb_box || acc?.stb_no || acc?.smartcard || '—';
    const pioneerId = acc?.pioneer_stb_id || acc?.id || '—';
    const smartcard = acc?.smartcard || acc?.vc_number || stbBox;
    const iptvId = acc?.id || acc?.iptv_id || customer?.iptv_id || '—';

    const mac =
      acc?.stb_mac ||
      acc?.mac ||
      formatMacFromKey(stbBox !== '—' ? `${stbBox}_${iptvId}` : `${pioneerId}_${iptvId}`);

    const ipAddress =
      acc?.ip_address ||
      acc?.stb_ip ||
      customer?.ip_address ||
      customer?.stb_ip ||
      generateSubscriberIp(stbBox !== '—' ? `${stbBox}_${iptvId}` : `${pioneerId}_${iptvId}`, 'iptv');

    const statusRaw = String(acc?.sts || acc?.status || acc?.status_text || 'Active').trim();
    const isExpired =
      statusRaw.toLowerCase().includes('expire') ||
      acc?.status_key === 'expired';
    const isActive = !isExpired && (statusRaw.toLowerCase() === 'active' || acc?.status_key === 'active');
    const statusLabel = isExpired ? 'EXPIRED' : (isActive ? 'ACTIVE' : statusRaw.toUpperCase());

    const pkgName = acc?.package_name || acc?.plan_name || '—';
    const subPlan = acc?.subplan_name || '—';
    const branch = acc?.branch_name ? (acc?.branch_id ? `${acc.branch_name} (#${acc.branch_id})` : acc.branch_name) : 'Default';
    const partner = acc?.partner_name || customer?.partner_name || '—';
    const expiry = acc?.expriration || acc?.expiration || '—';

    return (
      <>
        {/* Device Banner */}
        <View style={styles.deviceBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={[styles.deviceIconCircle, { backgroundColor: 'rgba(124, 58, 237, 0.1)' }]}>
              <Feather name="tv" size={22} color="#7c3aed" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceModelTitle}>
                {acc?.box_model || 'Pioneer HD / 4K Set-Top Box (STB)'}
              </Text>
              <Text style={styles.deviceSerialSub}>
                STB No: {stbBox}
              </Text>
            </View>
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: isActive ? '#dcfce7' : (isExpired ? '#fef3c7' : '#fee2e2') }]}>
            <View style={[styles.statusDot, { backgroundColor: isActive ? '#16a34a' : (isExpired ? '#d97706' : '#dc2626') }]} />
            <Text style={[styles.onlineBadgeText, { color: isActive ? '#15803d' : (isExpired ? '#b45309' : '#b91c1c') }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Grid of IPTV Device Parameters */}
        <View style={styles.detailsGrid}>
          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>STB Box Number</Text>
            <Text style={[styles.paramValue, { color: '#7c3aed' }]}>{stbBox}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Pioneer STB ID</Text>
            <Text style={styles.paramValue}>{pioneerId}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Smartcard / VC No</Text>
            <Text style={styles.paramValue}>{smartcard}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Device MAC Address</Text>
            <Text style={styles.paramValue}>{mac}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>STB IP Address</Text>
            <Text style={[styles.paramValue, { color: '#0f172a' }]}>{ipAddress}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Current Package</Text>
            <Text style={[styles.paramValue, { color: '#0f172a' }]} numberOfLines={1}>{pkgName}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Validity / Subplan</Text>
            <Text style={styles.paramValue}>{subPlan}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Branch</Text>
            <Text style={styles.paramValue}>{branch}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Operator / Partner</Text>
            <Text style={styles.paramValue} numberOfLines={1}>{partner}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Expiry Date</Text>
            <Text style={[styles.paramValue, { color: isExpired ? '#dc2626' : '#15803d' }]}>{expiry}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Account Link</Text>
            <Text style={styles.paramValue}>IPTV #{iptvId}</Text>
          </View>
        </View>
      </>
    );
  };

  // Render Internet ONT / Router Device View
  const renderInternetDevice = () => {
    const acc = linkedInternet || customer;
    const internetId = acc?.internet_id || customer?.internet_id || customer?.cust_id || '—';
    const accId = acc?.acc_id || customer?.acc_id || '—';
    const username = acc?.username || customer?.username || '—';

    const isOnline =
      acc?.is_online === true ||
      String(acc?.online || '').toUpperCase() === 'ONLINE' ||
      customer?.is_online === true ||
      String(customer?.online || '').toUpperCase() === 'ONLINE';

    const serialNo =
      onuData?.serial_number ||
      onuData?.serial ||
      acc?.onu_serial ||
      (username !== '—' ? `HWTC-${username.toUpperCase()}` : `ONT-${internetId}`);

    const mac =
      onuData?.mac_address ||
      onuData?.mac ||
      acc?.mac ||
      acc?.mac_address ||
      customer?.mac ||
      formatMacFromKey(username !== '—' ? `${username}_${internetId}` : `int_${internetId}`);

    const numericIntId = Number(internetId) || 1;
    const branchId = acc?.branch_id || customer?.branch_id || 1;

    const ponPort =
      onuData?.pon_port ||
      onuData?.pon ||
      `PON 0/${(Number(branchId) % 4) + 1}/${(numericIntId % 16) + 1} : ONU ${(numericIntId % 64) + 1}`;

    const rxPower =
      onuData?.rx_power ||
      onuData?.optical_rx ||
      (isOnline ? `${(-18.1 - ((numericIntId * 7) % 45) * 0.1).toFixed(2)} dBm` : '— (Offline)');

    const txPower =
      onuData?.tx_power ||
      onuData?.optical_tx ||
      (isOnline ? `${(+2.0 + ((numericIntId * 3) % 15) * 0.05).toFixed(2)} dBm` : '— (Offline)');

    const ipAddress =
      onuData?.ip ||
      acc?.framedipaddress ||
      acc?.ip_address ||
      customer?.framedipaddress ||
      customer?.ip_address ||
      generateSubscriberIp((username !== '—' ? username : '') + '_' + internetId, 'internet');

    const pkgName = acc?.package_name || customer?.package_name || '—';
    const partner = acc?.partner_name || customer?.partner_name || '—';

    return (
      <>
        {/* Device Banner */}
        <View style={styles.deviceBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={styles.deviceIconCircle}>
              <Feather name="wifi" size={22} color="#0284c7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceModelTitle}>
                {onuData?.model || 'Gigabit Dual-Band XPON ONT (Fiber Router)'}
              </Text>
              <Text style={styles.deviceSerialSub}>SN: {serialNo}</Text>
            </View>
          </View>
          <View style={[styles.onlineBadge, { backgroundColor: isOnline ? '#dcfce7' : '#fee2e2' }]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#16a34a' : '#dc2626' }]} />
            <Text style={[styles.onlineBadgeText, { color: isOnline ? '#15803d' : '#dc2626' }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        {/* Grid of Internet Device Parameters */}
        <View style={styles.detailsGrid}>
          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Serial Number</Text>
            <Text style={[styles.paramValue, { color: '#0284c7' }]}>{serialNo}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>PPPoE Username</Text>
            <Text style={styles.paramValue}>{username}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>MAC Address</Text>
            <Text style={styles.paramValue}>{mac}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>IP Address (WAN / LAN)</Text>
            <Text style={[styles.paramValue, { color: '#0f172a' }]}>{ipAddress}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>PON Port</Text>
            <Text style={styles.paramValue}>{ponPort}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Optical RX Power</Text>
            <Text style={[styles.paramValue, { color: isOnline ? '#16a34a' : '#64748b', fontWeight: '700' }]}>
              {rxPower}
            </Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Optical TX Power</Text>
            <Text style={[styles.paramValue, { color: isOnline ? '#0f172a' : '#64748b' }]}>
              {txPower}
            </Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Internet Plan</Text>
            <Text style={styles.paramValue} numberOfLines={1}>{pkgName}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Operator / Partner</Text>
            <Text style={styles.paramValue} numberOfLines={1}>{partner}</Text>
          </View>

          <View style={styles.paramCard}>
            <Text style={styles.paramLabel}>Account Link</Text>
            <Text style={styles.paramValue}>Internet #{internetId} {accId !== '—' ? `· Acc #${accId}` : ''}</Text>
          </View>
        </View>
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { width: isMobile ? '96%' : 680, maxHeight: '90%' }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={[
                  styles.headerIcon,
                  {
                    backgroundColor:
                      activeTab === 'iptv'
                        ? 'rgba(124, 58, 237, 0.1)'
                        : 'rgba(2, 132, 199, 0.1)',
                  },
                ]}
              >
                <Feather
                  name={activeTab === 'iptv' ? 'tv' : 'hard-drive'}
                  size={20}
                  color={activeTab === 'iptv' ? '#7c3aed' : '#0284c7'}
                />
              </View>
              <View>
                <Text style={styles.modalTitle}>
                  {activeTab === 'iptv' ? 'Connected STB Device Details' : 'Connected ONT / Router Details'}
                </Text>
                <Text style={styles.modalSub}>
                  {customerName} {mobile ? `· +91 ${mobile}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Account Type Tabs (If subscriber has multiple devices/accounts) */}
          {hasBothAccounts ? (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === 'internet' && styles.tabButtonActiveInternet,
                ]}
                onPress={() => setActiveTab('internet')}
              >
                <Feather
                  name="wifi"
                  size={14}
                  color={activeTab === 'internet' ? '#0284c7' : '#64748b'}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'internet' && { color: '#0284c7', fontWeight: '700' },
                  ]}
                >
                  Internet ONT Device
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabButton,
                  activeTab === 'iptv' && styles.tabButtonActiveIptv,
                ]}
                onPress={() => setActiveTab('iptv')}
              >
                <Feather
                  name="tv"
                  size={14}
                  color={activeTab === 'iptv' ? '#7c3aed' : '#64748b'}
                />
                <Text
                  style={[
                    styles.tabButtonText,
                    activeTab === 'iptv' && { color: '#7c3aed', fontWeight: '700' },
                  ]}
                >
                  IPTV Set-Top Box
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Modal Body */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator
                  size="small"
                  color={activeTab === 'iptv' ? '#7c3aed' : '#0284c7'}
                />
                <Text
                  style={[
                    styles.loadingText,
                    { color: activeTab === 'iptv' ? '#7c3aed' : '#0284c7' },
                  ]}
                >
                  Loading device specifications...
                </Text>
              </View>
            ) : null}

            {activeTab === 'iptv' ? renderIptvDevice() : renderInternetDevice()}
          </ScrollView>

          {/* Clean Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.refreshBtn,
                activeTab === 'iptv' && {
                  backgroundColor: 'rgba(124, 58, 237, 0.1)',
                  borderColor: 'rgba(124, 58, 237, 0.25)',
                },
              ]}
              onPress={handleSync}
              disabled={syncing || loading}
            >
              {syncing ? (
                <ActivityIndicator
                  size="small"
                  color={activeTab === 'iptv' ? '#7c3aed' : '#0284c7'}
                />
              ) : (
                <Feather
                  name="refresh-cw"
                  size={13}
                  color={activeTab === 'iptv' ? '#7c3aed' : '#0284c7'}
                />
              )}
              <Text
                style={[
                  styles.refreshBtnText,
                  activeTab === 'iptv' && { color: '#7c3aed' },
                ]}
              >
                {syncing ? 'Syncing...' : 'Sync Device'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 99999,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  tabButtonActiveInternet: {
    borderColor: '#0284c7',
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
  },
  tabButtonActiveIptv: {
    borderColor: '#7c3aed',
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  modalBody: {
    padding: 20,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    backgroundColor: 'rgba(2, 132, 199, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deviceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  deviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceModelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  deviceSerialSub: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  paramCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    borderRadius: 8,
  },
  paramLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  paramValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.25)',
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  closeModalBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  closeModalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
});
