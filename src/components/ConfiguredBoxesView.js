import React, { useState, useMemo, useEffect } from 'react';
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

export const ConfiguredBoxesView = ({
  user,
  vendors = [],
  allModels = [],
  assignablePartners = [],
  onReload,
  onBack,
  onOpenAssignModal,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [partnerFilter, setPartnerFilter] = useState('all');

  // Quick Configure Bar states
  const [quickScanInput, setQuickScanInput] = useState('');
  const [quickConfigNotes, setQuickConfigNotes] = useState('');
  const [searchingDevice, setSearchingDevice] = useState(false);
  const [foundDevice, setFoundDevice] = useState(null);

  // Selection for bulk action
  const [selectedIds, setSelectedIds] = useState([]);

  // Fetch all configured ONUs
  const loadConfiguredDevices = async () => {
    setLoading(true);
    try {
      const res = await OneBssApi.getInventoryOnus({
        status: 'configured',
        limit: 500,
      });
      if (res.ok && res.data) {
        setDevices(res.data.onus || []);
      } else {
        setDevices([]);
      }
    } catch (err) {
      console.error('Failed to load configured devices:', err);
      toast.error('Could not load configured boxes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfiguredDevices();
  }, []);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (vendorFilter !== 'all') {
        const vName = String(d.vendor_name || '').toLowerCase();
        if (vName !== vendorFilter.toLowerCase()) return false;
      }
      if (partnerFilter !== 'all') {
        if (partnerFilter === 'master') {
          if (d.assigned_partner_id && d.assigned_partner_id > 0) return false;
        } else {
          const pName = String(d.assigned_partner_name || '').toLowerCase();
          if (pName !== partnerFilter.toLowerCase()) return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const sMatch = String(d.serial_no || '').toLowerCase().includes(q);
        const mMatch = String(d.mac_address || '').toLowerCase().includes(q);
        const modMatch = String(d.model_name || '').toLowerCase().includes(q);
        if (!sMatch && !mMatch && !modMatch) return false;
      }
      return true;
    });
  }, [devices, vendorFilter, partnerFilter, searchQuery]);

  // Summary counts
  const summary = useMemo(() => {
    const total = devices.length;
    const masterStock = devices.filter((d) => !d.assigned_partner_id || d.assigned_partner_id === 0).length;
    const assigned = devices.filter((d) => d.assigned_partner_id && d.assigned_partner_id > 0).length;
    return { total, masterStock, assigned };
  }, [devices]);

  // Search device by Serial/MAC to quickly configure
  const handleLookupDevice = async () => {
    const query = quickScanInput.trim();
    if (!query) {
      return toast.warn('Please enter a Serial Number or MAC Address');
    }
    setSearchingDevice(true);
    setFoundDevice(null);
    try {
      const res = await OneBssApi.getInventoryOnus({
        search: query,
        limit: 10,
      });
      if (res.ok && res.data && res.data.onus && res.data.onus.length > 0) {
        const match = res.data.onus.find(
          (o) =>
            String(o.serial_no || '').toLowerCase() === query.toLowerCase() ||
            String(o.mac_address || '').toLowerCase().replace(/[^a-f0-9]/g, '') === query.toLowerCase().replace(/[^a-f0-9]/g, '')
        ) || res.data.onus[0];
        setFoundDevice(match);
      } else {
        toast.error(`No device found matching "${query}"`);
      }
    } catch (e) {
      toast.error('Lookup failed');
    } finally {
      setSearchingDevice(false);
    }
  };

  // Mark single device as configured
  const handleMarkAsConfigured = async (deviceToMark) => {
    const target = deviceToMark || foundDevice;
    if (!target) return;
    setActionLoading(true);
    try {
      const res = await OneBssApi.updateInventoryOnu(target.id, {
        status: 'configured',
      });
      if (res.ok) {
        toast.success(`Device ${target.serial_no || target.mac_address} marked as Configured!`);
        setQuickScanInput('');
        setFoundDevice(null);
        setQuickConfigNotes('');
        await loadConfiguredDevices();
        if (onReload) onReload();
      } else {
        toast.error(res.data?.message || 'Failed to update device status');
      }
    } catch (err) {
      toast.error('Failed to configure device');
    } finally {
      setActionLoading(false);
    }
  };

  // Revert device back to Not Configured
  const handleResetToInStock = async (deviceId, serialNo) => {
    setActionLoading(true);
    try {
      const res = await OneBssApi.updateInventoryOnu(deviceId, {
        status: 'not_configured',
      });
      if (res.ok) {
        toast.success(`Device ${serialNo || ''} returned to Not Configured`);
        await loadConfiguredDevices();
        if (onReload) onReload();
      } else {
        toast.error(res.data?.message || 'Failed to reset status');
      }
    } catch (err) {
      toast.error('Failed to update device');
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Revert to Not Configured
  const handleBulkResetToInStock = async () => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        const res = await OneBssApi.updateInventoryOnu(id, { status: 'not_configured' });
        if (res.ok) successCount++;
      }
      toast.success(`${successCount} device(s) returned to Not Configured`);
      setSelectedIds([]);
      await loadConfiguredDevices();
      if (onReload) onReload();
    } catch (err) {
      toast.error('Bulk update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDevices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDevices.map((d) => d.id));
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Header Bar */}
      <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={16} color="#0f172a" />
          </TouchableOpacity>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={20} color="#0284c7" />
              <Text style={styles.title}>Configured Boxes</Text>
            </View>
            <Text style={styles.subtitle}>
              Pre-provisioned and configured ONUs ready for field dispatch and customer deployment
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.refreshBtn} onPress={loadConfiguredDevices} disabled={loading}>
          <Feather name="rotate-cw" size={13} color="#334155" />
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* 2. KPI Metrics Bar */}
      <View style={[styles.statsGrid, isMobile && styles.statsGridMobile]}>
        <View style={styles.statCard}>
          <View style={styles.statCardHead}>
            <Text style={styles.statLabel}>TOTAL CONFIGURED</Text>
            <View style={[styles.statIconBox, { backgroundColor: '#e0f2fe' }]}>
              <MaterialCommunityIcons name="router-wireless" size={16} color="#0284c7" />
            </View>
          </View>
          <Text style={[styles.statVal, { color: '#0284c7' }]}>{summary.total}</Text>
          <Text style={styles.statSub}>Ready for installation</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statCardHead}>
            <Text style={styles.statLabel}>IN MASTER STOCK</Text>
            <View style={[styles.statIconBox, { backgroundColor: '#dcfce7' }]}>
              <Feather name="box" size={15} color="#10b981" />
            </View>
          </View>
          <Text style={[styles.statVal, { color: '#047857' }]}>{summary.masterStock}</Text>
          <Text style={styles.statSub}>Available to dispatch</Text>
        </View>

        <View style={styles.statCard}>
          <View style={styles.statCardHead}>
            <Text style={styles.statLabel}>WITH OPERATORS</Text>
            <View style={[styles.statIconBox, { backgroundColor: '#ede9fe' }]}>
              <Feather name="users" size={15} color="#7c3aed" />
            </View>
          </View>
          <Text style={[styles.statVal, { color: '#6d28d9' }]}>{summary.assigned}</Text>
          <Text style={styles.statSub}>Assigned to branch/LCO</Text>
        </View>
      </View>

      {/* 3. Quick Configure Workbench */}
      <View style={styles.workbenchCard}>
        <View style={styles.workbenchHead}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="tool" size={14} color="#0284c7" />
            <Text style={styles.workbenchTitle}>Quick Configure Device</Text>
          </View>
          <Text style={styles.workbenchSub}>
            Scan barcode or enter Serial / MAC of an In-Stock device to mark it as Configured
          </Text>
        </View>

        <View style={[styles.workbenchRow, isMobile && styles.workbenchRowMobile]}>
          <View style={[styles.inputBox, { flex: 1.5 }]}>
            <Feather name="maximize" size={14} color="#0284c7" />
            <TextInput
              style={styles.textInput}
              placeholder="Scan Barcode or enter Serial / MAC (e.g. HWTC8A19001)..."
              placeholderTextColor="#94a3b8"
              value={quickScanInput}
              onChangeText={setQuickScanInput}
              onSubmitEditing={handleLookupDevice}
            />
            {quickScanInput ? (
              <TouchableOpacity onPress={() => { setQuickScanInput(''); setFoundDevice(null); }}>
                <Feather name="x" size={14} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.lookupBtn}
            onPress={handleLookupDevice}
            disabled={searchingDevice || !quickScanInput.trim()}
          >
            {searchingDevice ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Feather name="search" size={13} color="#ffffff" />
                <Text style={styles.lookupBtnText}>Find Box</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Found Device Preview Card */}
        {foundDevice && (
          <View style={styles.foundCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={styles.foundSerial}>{foundDevice.serial_no || foundDevice.mac_address}</Text>
                <View style={styles.currentStatusBadge}>
                  <Text style={styles.currentStatusText}>Current: {(foundDevice.status || 'unknown').toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.foundDetails}>
                {foundDevice.vendor_name} {foundDevice.model_name} • {foundDevice.pon_type} • Location:{' '}
                {foundDevice.assigned_partner_name || 'Master Stock'}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.markConfiguredBtn,
                foundDevice.status === 'configured' && { backgroundColor: '#10b981' },
              ]}
              onPress={() => handleMarkAsConfigured(foundDevice)}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="check" size={14} color="#ffffff" />
                  <Text style={styles.markConfiguredBtnText}>
                    {foundDevice.status === 'configured' ? 'Already Configured' : 'Mark as Configured'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 4. Controls & Filters Row */}
      <View style={[styles.controlRow, isMobile && styles.controlRowMobile]}>
        <View style={[styles.searchBox, isMobile && { width: '100%' }]}>
          <Feather name="search" size={14} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search configured boxes by Serial, MAC..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={14} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Vendor Filter */}
          <View style={{ width: 140 }}>
            <SafeSelect
              value={vendorFilter}
              onChange={setVendorFilter}
              options={[
                { value: 'all', label: 'All Vendors' },
                ...vendors.map((v) => ({ value: v.vendor_name || v.name, label: v.vendor_name || v.name })),
              ]}
              placeholder="Vendor"
            />
          </View>

          {/* Location Filter */}
          <View style={{ width: 160 }}>
            <SafeSelect
              value={partnerFilter}
              onChange={setPartnerFilter}
              options={[
                { value: 'all', label: 'All Locations' },
                { value: 'master', label: 'Master Stock Only' },
                ...assignablePartners.map((p) => ({
                  value: p.partner_name || p.name,
                  label: p.partner_name || p.name,
                })),
              ]}
              placeholder="Location"
            />
          </View>

          {/* Clear Filters */}
          {(vendorFilter !== 'all' || partnerFilter !== 'all' || searchQuery) && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                setVendorFilter('all');
                setPartnerFilter('all');
                setSearchQuery('');
              }}
            >
              <Feather name="x" size={12} color="#dc2626" />
              <Text style={styles.clearBtnText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <View style={styles.bulkActionBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={styles.bulkBadge}>
              <Text style={styles.bulkBadgeText}>{selectedIds.length}</Text>
            </View>
            <Text style={styles.bulkActionText}>box(es) selected</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.bulkActionBtn}
              onPress={() => handleBulkResetToInStock()}
              disabled={actionLoading}
            >
              <Feather name="rotate-ccw" size={12} color="#ffffff" />
              <Text style={styles.bulkActionBtnText}>Revert to Not Configured</Text>
            </TouchableOpacity>

            {onOpenAssignModal && (
              <TouchableOpacity
                style={[styles.bulkActionBtn, { backgroundColor: '#2563eb' }]}
                onPress={() => onOpenAssignModal(selectedIds)}
              >
                <Feather name="send" size={12} color="#ffffff" />
                <Text style={styles.bulkActionBtnText}>Dispatch to Operator</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* 5. Configured Devices Table */}
      <View style={styles.tableCard}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.loadingText}>Loading configured boxes...</Text>
          </View>
        ) : filteredDevices.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="router-wireless-off" size={44} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Configured Boxes Found</Text>
            <Text style={styles.emptySub}>
              {searchQuery || vendorFilter !== 'all' || partnerFilter !== 'all'
                ? 'No configured boxes match your filters.'
                : 'No boxes are marked as configured yet. Use the Quick Configure bar above to configure devices.'}
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true}>
            <View style={{ minWidth: 1050, width: '100%' }}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <View style={{ width: 36, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[
                      styles.checkboxBtn,
                      selectedIds.length === filteredDevices.length && styles.checkboxBtnActive,
                    ]}
                    onPress={toggleSelectAll}
                  >
                    {selectedIds.length === filteredDevices.length && (
                      <Feather name="check" size={11} color="#ffffff" />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={{ width: 45 }}><Text style={styles.th}>#</Text></View>
                <View style={{ flex: 1.4, minWidth: 140 }}><Text style={styles.th}>SERIAL NUMBER</Text></View>
                <View style={{ flex: 1.3, minWidth: 130 }}><Text style={styles.th}>MAC ADDRESS</Text></View>
                <View style={{ flex: 1.5, minWidth: 140 }}><Text style={styles.th}>VENDOR & MODEL</Text></View>
                <View style={{ width: 85 }}><Text style={styles.th}>PON TYPE</Text></View>
                <View style={{ width: 95 }}><Text style={styles.th}>BATCH</Text></View>
                <View style={{ width: 125 }}><Text style={styles.th}>STATUS</Text></View>
                <View style={{ flex: 1.4, minWidth: 140 }}><Text style={styles.th}>ASSIGNED LOCATION</Text></View>
                <View style={{ width: 140, alignItems: 'flex-end' }}><Text style={[styles.th, { textAlign: 'right' }]}>ACTIONS</Text></View>
              </View>

              {/* Table Rows */}
              {filteredDevices.map((item, idx) => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.tr,
                      idx % 2 === 1 && styles.trEven,
                      isSelected && { backgroundColor: '#f0f9ff' },
                    ]}
                  >
                    {/* Checkbox */}
                    <View style={{ width: 36, alignItems: 'center' }}>
                      <TouchableOpacity
                        style={[styles.checkboxBtn, isSelected && styles.checkboxBtnActive]}
                        onPress={() => toggleSelect(item.id)}
                      >
                        {isSelected && <Feather name="check" size={11} color="#ffffff" />}
                      </TouchableOpacity>
                    </View>

                    {/* ID */}
                    <View style={{ width: 45 }}>
                      <Text style={{ fontSize: 11, color: '#94a3b8' }}>{item.id}</Text>
                    </View>

                    {/* Serial Number */}
                    <View style={{ flex: 1.4, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.codeText} selectable>{item.serial_no || '—'}</Text>
                    </View>

                    {/* MAC */}
                    <View style={{ flex: 1.3, minWidth: 130 }}>
                      <Text style={[styles.codeText, { color: '#475569' }]} selectable>{item.mac_address || '—'}</Text>
                    </View>

                    {/* Vendor & Model */}
                    <View style={{ flex: 1.5, minWidth: 140 }}>
                      <Text style={styles.vendorText}>{item.vendor_name || '—'}</Text>
                      <Text style={styles.modelSubText}>{item.model_name || '—'}</Text>
                    </View>

                    {/* PON Type */}
                    <View style={{ width: 85 }}>
                      <View style={styles.ponBadge}>
                        <Text style={styles.ponBadgeText}>{item.pon_type || 'GPON'}</Text>
                      </View>
                    </View>

                    {/* Batch */}
                    <View style={{ width: 95 }}>
                      <Text style={styles.batchText}>{item.batch_id ? `#${item.batch_id}` : '—'}</Text>
                    </View>

                    {/* Status: Configured Pill */}
                    <View style={{ width: 125 }}>
                      <View style={styles.configuredPill}>
                        <Feather name="check-circle" size={11} color="#0284c7" />
                        <Text style={styles.configuredPillText}>CONFIGURED</Text>
                      </View>
                    </View>

                    {/* Assigned Location */}
                    <View style={{ flex: 1.4, minWidth: 140 }}>
                      {item.assigned_partner_name ? (
                        <Text style={styles.locationPartnerText} numberOfLines={1}>
                          {item.assigned_partner_name}
                        </Text>
                      ) : (
                        <Text style={styles.locationMasterText}>Master Stock</Text>
                      )}
                    </View>

                    {/* Row Actions */}
                    <View style={{ width: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      {onOpenAssignModal && (
                        <TouchableOpacity
                          style={styles.rowBtnAssign}
                          onPress={() => onOpenAssignModal([item.id])}
                          title="Dispatch to Operator"
                        >
                          <Feather name="send" size={12} color="#2563eb" />
                          <Text style={styles.rowBtnAssignText}>Dispatch</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.rowBtnReset}
                        onPress={() => handleResetToInStock(item.id, item.serial_no)}
                        title="Revert to Not Configured"
                      >
                        <Feather name="rotate-ccw" size={12} color="#475569" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 2,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statsGridMobile: {
    flexDirection: 'column',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  statCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statVal: {
    fontSize: 26,
    fontWeight: '900',
    marginVertical: 4,
  },
  statSub: {
    fontSize: 11.5,
    color: '#94a3b8',
  },
  workbenchCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  workbenchHead: {
    gap: 2,
  },
  workbenchTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369a1',
  },
  workbenchSub: {
    fontSize: 12,
    color: '#64748b',
  },
  workbenchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  workbenchRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#7dd3fc',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    outlineStyle: 'none',
  },
  lookupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 42,
  },
  lookupBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  foundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    borderRadius: 8,
    padding: 12,
    gap: 12,
    flexWrap: 'wrap',
  },
  foundSerial: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0369a1',
    fontFamily: 'monospace',
  },
  currentStatusBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  foundDetails: {
    fontSize: 12,
    color: '#475569',
  },
  markConfiguredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  markConfiguredBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  controlRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
    minWidth: 280,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
    outlineStyle: 'none',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
  bulkActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  bulkBadge: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bulkBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  bulkActionText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '600',
  },
  bulkActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bulkActionBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyBox: {
    padding: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 420,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1.5,
    borderBottomColor: '#e2e8f0',
  },
  th: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  trEven: {
    backgroundColor: '#fafbfc',
  },
  checkboxBtn: {
    width: 17,
    height: 17,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  codeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  vendorText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  modelSubText: {
    fontSize: 11,
    color: '#64748b',
  },
  ponBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  ponBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  batchText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0369a1',
  },
  configuredPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  configuredPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.3,
  },
  locationMasterText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  locationPartnerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowBtnAssign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rowBtnAssignText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  rowBtnReset: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
});
