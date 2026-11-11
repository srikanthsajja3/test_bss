import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { SafeSelect } from './SafeSelect';

export const AddDeviceView = ({
  vendors = [],
  allModels = [],
  onReload,
  onBack,
  onSwitchToBulkScan,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [vendorId, setVendorId] = useState(vendors[0]?.id ? String(vendors[0].id) : '');
  const [modelId, setModelId] = useState('');
  const [serialNo, setSerialNo] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [status, setStatus] = useState('not_configured');
  const [purchaseDate, setPurchaseDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [submitting, setSubmitting] = useState(false);

  // Available models for selected vendor
  const availableModels = useMemo(() => {
    if (!vendorId) return allModels;
    return allModels.filter((m) => String(m.vendor_id) === String(vendorId));
  }, [vendorId, allModels]);

  const handleSubmit = async (addAnother = false) => {
    if (!modelId) {
      return toast.warn('Please select a hardware model');
    }
    if (!serialNo.trim() && !macAddress.trim()) {
      return toast.warn('Please enter either a Serial Number or MAC address');
    }

    setSubmitting(true);
    try {
      const res = await OneBssApi.addInventoryOnu({
        model_id: Number(modelId),
        serial_no: serialNo.trim() || null,
        mac_address: macAddress.trim() || null,
        status: status,
        purchase_date: purchaseDate || null,
      });

      if (res.ok && res.data?.success) {
        toast.success(res.data?.message || 'Device added to inventory successfully!');
        setSerialNo('');
        setMacAddress('');
        if (onReload) onReload();

        if (!addAnother && onBack) {
          onBack();
        }
      } else {
        toast.error(res.data?.message || 'Failed to add device');
      }
    } catch (e) {
      toast.error('Network error adding device');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.headIconCircle}>
            <Feather name="plus-circle" size={20} color="#047857" />
          </View>
          <View>
            <Text style={styles.title}>Add Physical Device</Text>
            <Text style={styles.subtitle}>Register a single ONU unit directly into master inventory</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onSwitchToBulkScan && (
            <TouchableOpacity style={styles.scanSwitchBtn} onPress={onSwitchToBulkScan}>
              <Feather name="maximize" size={14} color="#0284c7" />
              <Text style={styles.scanSwitchBtnText}>Switch to Bulk Scan</Text>
            </TouchableOpacity>
          )}

          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={14} color="#0284c7" />
              <Text style={styles.backBtnText}>Back to Devices</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Form Content */}
      <ScrollView style={{ padding: 24 }}>
        <View style={{ maxWidth: 640 }}>
          {/* Vendor */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Hardware Vendor <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <SafeSelect
              value={vendorId}
              onChange={(v) => {
                setVendorId(v);
                setModelId('');
              }}
              options={vendors.map((v) => ({ value: v.id, label: v.name }))}
              placeholder="Select Vendor"
              title="Select Vendor"
            />
          </View>

          {/* Model */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Hardware Model <Text style={{ color: '#dc2626' }}>*</Text></Text>
            <SafeSelect
              value={modelId}
              onChange={setModelId}
              options={availableModels.map((m) => ({ value: m.id, label: `${m.name} (${m.type})` }))}
              placeholder={availableModels.length === 0 ? 'No models for selected vendor' : 'Select Model'}
              title="Select Model"
            />
          </View>

          {/* Serial Number */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Serial Number (S/N)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. HWTC1A2B3C4D"
              placeholderTextColor="#94a3b8"
              value={serialNo}
              onChangeText={setSerialNo}
              autoCapitalize="characters"
            />
          </View>

          {/* MAC Address */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>MAC Address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 48:57:02:1A:3B:10"
              placeholderTextColor="#94a3b8"
              value={macAddress}
              onChangeText={setMacAddress}
              autoCapitalize="characters"
            />
          </View>

          {/* Status */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Initial Status</Text>
            <SafeSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: 'not_configured', label: 'Not Configured' },
                { value: 'configured', label: 'Configured' },
                { value: 'reserved', label: 'Reserved' },
                { value: 'assigned', label: 'Assigned' },
                { value: 'faulty', label: 'Faulty' },
                { value: 'in_repair', label: 'In Repair' },
                { value: 'retired', label: 'Retired' },
              ]}
              title="Select Status"
            />
          </View>

          {/* Purchase Date */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Purchase / Inward Date</Text>
            <TextInput
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
              value={purchaseDate}
              onChangeText={setPurchaseDate}
            />
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onBack}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, submitting && { opacity: 0.6 }]}
              onPress={() => handleSubmit(false)}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
              ) : (
                <Feather name="check" size={14} color="#ffffff" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.saveBtnText}>Save Device</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveAnotherBtn, submitting && { opacity: 0.6 }]}
              onPress={() => handleSubmit(true)}
              disabled={submitting}
            >
              <Feather name="plus" size={14} color="#047857" style={{ marginRight: 6 }} />
              <Text style={styles.saveAnotherBtnText}>Save & Add Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    flex: 1,
    marginBottom: 24,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: 12,
  },
  headIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  scanSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanSwitchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#0f172a',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  saveAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveAnotherBtnText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: '700',
  },
});
