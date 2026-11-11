import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { SafeSelect } from './SafeSelect';

const PON_COLORS = {
  GPON: { fg: '#0284c7', bg: '#e0f2fe' },
  EPON: { fg: '#d97706', bg: '#fef3c7' },
  XPON: { fg: '#7c3aed', bg: '#ede9fe' },
};

export const HardwareCatalogView = ({
  vendors = [],
  allModels = [],
  onReload,
  onBack,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Add Vendor Modal
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [vendorLoading, setVendorLoading] = useState(false);

  // Add Model Modal
  const [showAddModel, setShowAddModel] = useState(false);
  const [modelVendorId, setModelVendorId] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('GPON');
  const [modelDesc, setModelDesc] = useState('');
  const [modelLoading, setModelLoading] = useState(false);

  const handleCreateVendor = async () => {
    if (!newVendorName.trim()) {
      return toast.warn('Please enter a vendor name');
    }
    setVendorLoading(true);
    try {
      const res = await OneBssApi.addInventoryVendor({ name: newVendorName.trim() });
      if (res.ok) {
        toast.success(`Vendor "${newVendorName.trim()}" added!`);
        setShowAddVendor(false);
        setNewVendorName('');
        if (onReload) onReload();
      } else {
        toast.error(res.data?.message || 'Failed to add vendor');
      }
    } catch (e) {
      toast.error('Network error creating vendor');
    } finally {
      setVendorLoading(false);
    }
  };

  const handleCreateModel = async () => {
    if (!modelVendorId) {
      return toast.warn('Please select a vendor');
    }
    if (!modelName.trim()) {
      return toast.warn('Please enter a model name');
    }
    setModelLoading(true);
    try {
      const res = await OneBssApi.addInventoryModel({
        vendor_id: Number(modelVendorId),
        name: modelName.trim(),
        type: modelType,
        description: modelDesc.trim() || null,
      });
      if (res.ok) {
        toast.success(`Model "${modelName.trim()}" created!`);
        setShowAddModel(false);
        setModelName('');
        setModelDesc('');
        if (onReload) onReload();
      } else {
        toast.error(res.data?.message || 'Failed to create model');
      }
    } catch (e) {
      toast.error('Network error creating model');
    } finally {
      setModelLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      {/* Full Page Header */}
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.headIconCircle}>
            <Feather name="layers" size={20} color="#0f172a" />
          </View>
          <View>
            <Text style={styles.title}>Hardware Catalog: Vendors & Models</Text>
            <Text style={styles.subtitle}>
              {vendors.length} Vendors Registered · {allModels.length} Models Active
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#0f172a' }]}
            onPress={() => {
              setNewVendorName('');
              setShowAddVendor(true);
            }}
          >
            <Feather name="plus" size={13} color="#ffffff" />
            <Text style={styles.actionBtnText}>Add Vendor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
            onPress={() => {
              setModelVendorId(vendors[0]?.id ? String(vendors[0].id) : '');
              setModelName('');
              setModelType('GPON');
              setModelDesc('');
              setShowAddModel(true);
            }}
          >
            <Feather name="plus" size={13} color="#ffffff" />
            <Text style={styles.actionBtnText}>Add Model</Text>
          </TouchableOpacity>

          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Feather name="arrow-left" size={14} color="#0284c7" />
              <Text style={styles.backBtnText}>Back to Devices</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Full Page Body */}
      <ScrollView style={{ padding: 20 }}>
        {vendors.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="layers" size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No Hardware Vendors Registered</Text>
            <Text style={styles.emptySub}>
              Register hardware vendors like Huawei, TP-Link, Syrotech and add models.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#0f172a', marginTop: 16 }]}
              onPress={() => setShowAddVendor(true)}
            >
              <Feather name="plus" size={13} color="#ffffff" />
              <Text style={styles.actionBtnText}>Add First Vendor</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 16, paddingBottom: 20 }}>
            {vendors.map((vendor) => {
              const vendorModels = vendor.models || [];
              return (
                <View key={vendor.id} style={styles.vendorCard}>
                  <View style={styles.vendorHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={styles.vendorIconBox}>
                        <Feather name="cpu" size={16} color="#0f172a" />
                      </View>
                      <Text style={styles.vendorName}>{vendor.name}</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{vendorModels.length} models</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.addModelPill}
                      onPress={() => {
                        setModelVendorId(String(vendor.id));
                        setModelName('');
                        setModelType('GPON');
                        setModelDesc('');
                        setShowAddModel(true);
                      }}
                    >
                      <Feather name="plus" size={12} color={COLORS.primary} />
                      <Text style={styles.addModelPillText}>Add Model</Text>
                    </TouchableOpacity>
                  </View>

                  {vendorModels.length === 0 ? (
                    <Text style={styles.noModelsText}>No models registered under this vendor yet.</Text>
                  ) : (
                    <View style={styles.modelsGrid}>
                      {vendorModels.map((m) => {
                        const pon = PON_COLORS[m.type] || { fg: '#334155', bg: '#f1f5f9' };
                        return (
                          <View key={m.id} style={styles.modelItem}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <Text style={styles.modelName}>{m.name}</Text>
                              <View style={[styles.ponBadge, { backgroundColor: pon.bg }]}>
                                <Text style={[styles.ponBadgeText, { color: pon.fg }]}>{m.type}</Text>
                              </View>
                            </View>
                            {m.description ? (
                              <Text style={styles.modelDesc} numberOfLines={2}>
                                {m.description}
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add Vendor Dialog */}
      {showAddVendor && (
        <Modal transparent animationType="fade" visible={showAddVendor} onRequestClose={() => setShowAddVendor(false)}>
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogBox}>
              <View style={styles.dialogHeader}>
                <Text style={styles.dialogTitle}>+ Add Hardware Vendor</Text>
                <TouchableOpacity onPress={() => setShowAddVendor(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={styles.dialogLabel}>Vendor Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Huawei, Syrotech, TP-Link, D-Link"
                  placeholderTextColor="#94a3b8"
                  value={newVendorName}
                  onChangeText={setNewVendorName}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setShowAddVendor(false)}>
                    <Text style={styles.dialogCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dialogSaveBtn, vendorLoading && { opacity: 0.6 }]}
                    onPress={handleCreateVendor}
                    disabled={vendorLoading}
                  >
                    {vendorLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.dialogSaveText}>Save Vendor</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Model Dialog */}
      {showAddModel && (
        <Modal transparent animationType="fade" visible={showAddModel} onRequestClose={() => setShowAddModel(false)}>
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogBox}>
              <View style={styles.dialogHeader}>
                <Text style={styles.dialogTitle}>+ Add Hardware Model</Text>
                <TouchableOpacity onPress={() => setShowAddModel(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={styles.dialogLabel}>Vendor <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <SafeSelect
                  value={modelVendorId}
                  onChange={setModelVendorId}
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                  placeholder="Select Vendor"
                  title="Select Vendor"
                />

                <Text style={[styles.dialogLabel, { marginTop: 12 }]}>Model Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. HG8145V5, XC220-G3v"
                  placeholderTextColor="#94a3b8"
                  value={modelName}
                  onChangeText={setModelName}
                />

                <Text style={[styles.dialogLabel, { marginTop: 12 }]}>PON Technology <Text style={{ color: '#dc2626' }}>*</Text></Text>
                <SafeSelect
                  value={modelType}
                  onChange={setModelType}
                  options={['GPON', 'EPON', 'XPON']}
                  title="Select PON Type"
                />

                <Text style={[styles.dialogLabel, { marginTop: 12 }]}>Description (Optional)</Text>
                <TextInput
                  style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="e.g. 1 GE + 3 FE + Wi-Fi Dual Band"
                  placeholderTextColor="#94a3b8"
                  value={modelDesc}
                  onChangeText={setModelDesc}
                  multiline
                />

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setShowAddModel(false)}>
                    <Text style={styles.dialogCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.dialogSaveBtn, modelLoading && { opacity: 0.6 }]}
                    onPress={handleCreateModel}
                    disabled={modelLoading}
                  >
                    {modelLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.dialogSaveText}>Save Model</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
    backgroundColor: '#f1f5f9',
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
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
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
  emptyBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  vendorCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  vendorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  vendorIconBox: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vendorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  countBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  addModelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addModelPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  noModelsText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  modelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modelItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    minWidth: 220,
    flex: 1,
  },
  modelName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  ponBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ponBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modelDesc: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 4,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10000,
  },
  dialogBox: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dialogTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  dialogLabel: {
    fontSize: 12,
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
  dialogCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dialogCancelText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  dialogSaveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 6,
  },
  dialogSaveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
