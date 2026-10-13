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

export const CustomerDevicesModal = ({ visible, onClose, customer }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(false);
  const [onuData, setOnuData] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const clean = (v) => (v === null || v === undefined || v === 'null' ? '' : String(v));

  const internetId =
    customer?.internet_id ||
    customer?.internet_accounts?.[0]?.internet_id ||
    customer?.cust_id ||
    customer?.id;

  const customerName =
    customer?.full_name || customer?.name || customer?.username || (internetId ? `Subscriber #${internetId}` : 'Subscriber');
  const mobile = clean(customer?.mobile || customer?.MobileNumber || '');

  // Fetch only the device ONU details
  const fetchDeviceData = async () => {
    if (!visible || !internetId) return;
    setLoading(true);
    try {
      const res = await OneBssApi.getOnuDetails(internetId);
      if (res && res.ok && res.data) {
        setOnuData(res.data);
      } else {
        setOnuData(null);
      }
    } catch (err) {
      setOnuData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && internetId) {
      fetchDeviceData();
    }
  }, [visible, internetId]);

  // Clean sync button
  const handleSync = async () => {
    const devId = onuData?.switch?.device_id || onuData?.olt?.id || onuData?.data?.device_id || onuData?.device_id || customer?.device_id;
    if (!devId) {
      toast.info('No device ID available for sync');
      return;
    }
    setSyncing(true);
    try {
      const res = await OneBssApi.syncNmsDevice(devId, false);
      await fetchDeviceData();
      if (res && res.ok && res.data?.success) {
        toast.success('Device synchronized successfully');
      } else {
        toast.info('Device status refreshed');
      }
    } catch (e) {
      toast.info('Device status refreshed');
    } finally {
      setSyncing(false);
    }
  };

  const handleTerminal = async () => {
    const devId = onuData?.switch?.device_id || onuData?.olt?.id || onuData?.data?.device_id || onuData?.device_id || customer?.device_id;
    if (!devId) {
      toast.info('No device ID available for terminal');
      return;
    }
    try {
      const res = await OneBssApi.getNmsDeviceTerminal(devId);
      if (res && res.ok && (res.data?.url || res.data?.terminal_url)) {
        window.open(res.data.url || res.data.terminal_url, '_blank');
      } else {
        toast.info(res.data?.message || 'Terminal connection requested');
      }
    } catch (e) {
      toast.error('Failed to connect to device terminal');
    }
  };

  const handleWebUrl = async () => {
    const devId = onuData?.switch?.device_id || onuData?.olt?.id || onuData?.data?.device_id || onuData?.device_id || customer?.device_id;
    if (!devId) {
      toast.info('No device ID available for Web GUI');
      return;
    }
    try {
      const res = await OneBssApi.getNmsDeviceWebUrl(devId, mobile || '9125253535');
      if (res && res.ok && (res.data?.url || res.data?.web_url)) {
        window.open(res.data.url || res.data.web_url, '_blank');
      } else {
        toast.info(res.data?.message || 'Web GUI access requested');
      }
    } catch (e) {
      toast.error('Failed to fetch device Web GUI URL');
    }
  };

  if (!visible) return null;

  // Extract fields gracefully from live API response or subscriber profile
  const resData = onuData?.data || onuData || {};
  const onu = resData.onu || {};
  const optical = resData.optical || {};
  const olt = resData.olt || {};
  const sw = resData.switch || {};
  const freshness = resData.freshness || {};

  const serialNo = onu.serial || onu.physical_id || resData.serial_number || customer?.stb_sn || '—';
  const macAddress = resData.mac || onu.customer_mac || onu.onu_mac || customer?.stb_mac || customer?.mac || '—';
  const ponPort = onu.interface || onu.pon || (sw.device_name && sw.port ? `${sw.device_name} [${sw.port}]` : sw.port) || '—';
  const rxPower = optical.rx_power_dbm != null ? `${optical.rx_power_dbm} dBm` : (optical.rx_level || '—');
  const txPower = optical.tx_power_dbm != null ? `${optical.tx_power_dbm} dBm` : '—';
  const modelName = onu.type || olt.name || sw.device_name || 'ONU Device';
  const ipAddress = sw.device_ip || olt.ip || customer?.framedipaddress || '—';
  const firmware = onu.version || '—';
  const isOnline = resData.found ? (freshness.stale === false || onu.status === 'online' || onu.status === 'active' || customer?.isOnline) : false;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { width: isMobile ? '96%' : 680, maxHeight: '90%' }]}>
          {/* Clean Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={styles.headerIcon}>
                <Feather name="hard-drive" size={20} color="#0284c7" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Connected Device Details</Text>
                <Text style={styles.modalSub}>
                  {customerName} {mobile ? `· +91 ${mobile}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Modal Body: ONLY Clean Device Information */}
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#0284c7" />
                <Text style={styles.loadingText}>Fetching device details...</Text>
              </View>
            ) : null}

            {/* Device Overview Banner */}
            <View style={styles.deviceBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={styles.deviceIconCircle}>
                  <Feather name="wifi" size={22} color="#0284c7" />
                </View>
                <View>
                  <Text style={styles.deviceModelTitle}>{modelName}</Text>
                  <Text style={styles.deviceSerialSub}>SN: {serialNo}</Text>
                </View>
              </View>
              <View style={styles.onlineBadge}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? '#16a34a' : '#dc2626' }]} />
                <Text style={[styles.onlineBadgeText, { color: isOnline ? '#15803d' : '#dc2626' }]}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>

            {/* Grid of Clean Device Parameters */}
            <View style={styles.detailsGrid}>
              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>Serial Number</Text>
                <Text style={styles.paramValue}>{serialNo}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>MAC Address</Text>
                <Text style={styles.paramValue}>{macAddress}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>PON Port</Text>
                <Text style={styles.paramValue}>{ponPort}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>Optical RX Power</Text>
                <Text style={[styles.paramValue, { color: '#16a34a', fontWeight: '700' }]}>{rxPower}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>Optical TX Power</Text>
                <Text style={styles.paramValue}>{txPower}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>IP Address</Text>
                <Text style={styles.paramValue}>{ipAddress}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>Firmware Version</Text>
                <Text style={styles.paramValue}>{firmware}</Text>
              </View>

              <View style={styles.paramCard}>
                <Text style={styles.paramLabel}>Account Link</Text>
                <Text style={styles.paramValue}>Internet #{internetId}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Clean Footer */}
          <View style={styles.modalFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleSync}
                disabled={syncing || loading}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#0284c7" />
                ) : (
                  <Feather name="refresh-cw" size={13} color="#0284c7" />
                )}
                <Text style={styles.refreshBtnText}>{syncing ? 'Syncing...' : 'Sync Device'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionOutlineBtn}
                onPress={handleWebUrl}
                disabled={loading}
              >
                <Feather name="external-link" size={13} color="#334155" />
                <Text style={styles.actionOutlineBtnText}>Web GUI</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionOutlineBtn}
                onPress={handleTerminal}
                disabled={loading}
              >
                <Feather name="terminal" size={13} color="#334155" />
                <Text style={styles.actionOutlineBtnText}>Terminal</Text>
              </TouchableOpacity>
            </View>

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
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
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
    color: '#0284c7',
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
    backgroundColor: '#dcfce7',
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
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionOutlineBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
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
