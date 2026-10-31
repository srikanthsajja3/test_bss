import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { isSuperAdmin } from '../components/internet/shared';
import { BulkInventoryScannerModal } from '../components/BulkInventoryScannerModal';

// Status styling configuration matching OneBSS WCAG high-contrast standards
const STATUS_CONFIG = {
  in_stock:  { label: 'IN STOCK',  fg: '#047857', bg: '#dcfce7', border: '#86efac', icon: 'check-circle' },
  assigned:  { label: 'ASSIGNED',  fg: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', icon: 'user-check' },
  reserved:  { label: 'RESERVED',  fg: '#b45309', bg: '#fef3c7', border: '#fcd34d', icon: 'clock' },
  faulty:    { label: 'FAULTY',    fg: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', icon: 'alert-triangle' },
  in_repair: { label: 'IN REPAIR', fg: '#7e22ce', bg: '#f3e8ff', border: '#d8b4fe', icon: 'tool' },
  retired:   { label: 'RETIRED',   fg: '#475569', bg: '#f1f5f9', border: '#cbd5e1', icon: 'archive' },
};

const getStatusStyle = (status) => STATUS_CONFIG[status] || {
  label: String(status || 'UNKNOWN').toUpperCase(),
  fg: '#475569',
  bg: '#f1f5f9',
  border: '#cbd5e1',
  icon: 'help-circle',
};

const PON_COLORS = {
  GPON: { fg: '#0284c7', bg: '#e0f2fe' },
  EPON: { fg: '#d97706', bg: '#fef3c7' },
  XPON: { fg: '#7c3aed', bg: '#ede9fe' },
};

// Unified Table Column Dimensions ensuring pixel-perfect alignment between header and rows
const TABLE_COLS = {
  id:       { width: 45, paddingRight: 6 },
  serial:   { flex: 1.6, minWidth: 165, paddingRight: 10 },
  mac:      { flex: 1.4, minWidth: 145, paddingRight: 10 },
  vendor:   { flex: 1.8, minWidth: 175, paddingRight: 10 },
  pon:      { width: 90, paddingRight: 8 },
  status:   { width: 135, paddingRight: 8 },
  purchase: { width: 105, paddingRight: 8 },
  actions:  { width: 85, alignItems: 'flex-end' },
};

export const InventoryScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const isSuper = isSuperAdmin(user);

  // Dynamic Data states (loaded live from database)
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onus, setOnus] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    in_stock: 0,
    assigned: 0,
    reserved: 0,
    faulty: 0,
    in_repair: 0,
    retired: 0,
    by_type: [],
    by_vendor: [],
  });
  const [vendors, setVendors] = useState([]);
  const [allModels, setAllModels] = useState([]);

  // Filtering & Pagination states
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState('table'); // 'table' (default) or 'cards' on mobile

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkScannerModal, setShowBulkScannerModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Vendor & Model management states
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showAddVendorModal, setShowAddVendorModal] = useState(false);
  const [showAddModelModal, setShowAddModelModal] = useState(false);

  // New Vendor form fields
  const [newVendorName, setNewVendorName] = useState('');

  // New Model form fields
  const [modelVendorId, setModelVendorId] = useState('');
  const [modelName, setModelName] = useState('');
  const [modelType, setModelType] = useState('GPON');
  const [modelDesc, setModelDesc] = useState('');

  // Add form fields
  const [newVendorId, setNewVendorId] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newSerialNo, setNewSerialNo] = useState('');
  const [newMacAddress, setNewMacAddress] = useState('');
  const [newStatus, setNewStatus] = useState('in_stock');
  const [newPurchaseDate, setNewPurchaseDate] = useState('');

  // Edit form fields
  const [editStatus, setEditStatus] = useState('in_stock');
  const [editMac, setEditMac] = useState('');
  const [editSerial, setEditSerial] = useState('');

  // 1. Fetch live Stats & Vendors from DB
  const loadStatsAndVendors = async () => {
    try {
      const [statsRes, vendorsRes] = await Promise.all([
        OneBssApi.getInventoryStats(),
        OneBssApi.getInventoryVendorsAndModels(),
      ]);
      if (statsRes.ok && statsRes.data?.stats) {
        setStats(statsRes.data.stats);
      }
      if (vendorsRes.ok && vendorsRes.data?.vendors) {
        setVendors(vendorsRes.data.vendors);
        setAllModels(vendorsRes.data.all_models || []);
      }
    } catch (e) {
      console.error('Error loading inventory metadata:', e);
    }
  };

  // 2. Fetch live ONUs list with active filters
  const loadOnus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedVendor !== 'all') params.vendor_id = selectedVendor;
      if (selectedType !== 'all') params.type = selectedType;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await OneBssApi.getInventoryOnus(params);
      if (res.ok && res.data) {
        setOnus(res.data.data || []);
        setTotalCount(res.data.total || 0);
      } else {
        toast.error(res.data?.message || 'Failed to load ONU inventory');
      }
    } catch (err) {
      toast.error('Network error loading ONUs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pageSize, page, selectedStatus, selectedVendor, selectedType, searchQuery]);

  useEffect(() => {
    loadStatsAndVendors();
  }, [refreshSignal]);

  useEffect(() => {
    loadOnus();
  }, [loadOnus, refreshSignal]);

  // Copy helper
  const copyToClipboard = (text, label) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.info(`Copied ${label} to clipboard!`);
    }
  };

  // Filtered models in Add Modal depending on selected vendor
  const availableModelsInAdd = useMemo(() => {
    if (!newVendorId) return allModels;
    return allModels.filter((m) => String(m.vendor_id) === String(newVendorId));
  }, [newVendorId, allModels]);

  // Handle Add ONU Submission
  const handleAddSubmit = async () => {
    if (!newModelId) {
      toast.warn('Please select an ONU model');
      return;
    }

    setActionLoading(true);
    const res = await OneBssApi.addInventoryOnu({
      model_id: Number(newModelId),
      serial_no: newSerialNo.trim() || null,
      mac_address: newMacAddress.trim() || null,
      status: newStatus,
      purchase_date: newPurchaseDate.trim() || null,
    });
    setActionLoading(false);

    if (res.ok) {
      toast.success(res.data?.message || 'ONU added to inventory!');
      setShowAddModal(false);
      setNewVendorId('');
      setNewModelId('');
      setNewSerialNo('');
      setNewMacAddress('');
      setNewStatus('in_stock');
      setNewPurchaseDate('');
      loadStatsAndVendors();
      loadOnus();
    } else {
      toast.error(res.data?.message || 'Failed to add ONU');
    }
  };

  // Handle Edit/Status Update Submission
  const handleEditSubmit = async () => {
    if (!editItem) return;
    setActionLoading(true);
    const res = await OneBssApi.updateInventoryOnu(editItem.id, {
      status: editStatus,
      mac_address: editMac.trim() || null,
      serial_no: editSerial.trim() || editItem.serial_no,
    });
    setActionLoading(false);

    if (res.ok) {
      toast.success(res.data?.message || 'ONU updated successfully!');
      setEditItem(null);
      loadStatsAndVendors();
      loadOnus();
    } else {
      toast.error(res.data?.message || 'Failed to update ONU');
    }
  };

  // Handle Delete Submission
  const handleDeleteSubmit = async () => {
    if (!deleteItem) return;
    setActionLoading(true);
    const res = await OneBssApi.deleteInventoryOnu(deleteItem.id);
    setActionLoading(false);

    if (res.ok) {
      toast.success(res.data?.message || 'ONU removed from inventory');
      setDeleteItem(null);
      loadStatsAndVendors();
      loadOnus();
    } else {
      toast.error(res.data?.message || 'Failed to delete ONU');
    }
  };

  // Handle Add Vendor Submission
  const handleAddVendorSubmit = async () => {
    const trimmed = newVendorName.trim();
    if (!trimmed) {
      toast.warn('Please enter a vendor name');
      return;
    }
    setActionLoading(true);
    const res = await OneBssApi.addInventoryVendor({ name: trimmed });
    setActionLoading(false);

    if (res.ok && res.data?.vendor) {
      toast.success(res.data.message || `Vendor '${trimmed}' created!`);
      const created = res.data.vendor;
      setNewVendorName('');
      setShowAddVendorModal(false);
      await loadStatsAndVendors();
      // Auto-select in Add Device modal if open
      setNewVendorId(String(created.id));
      setNewModelId('');
    } else {
      toast.error(res.data?.message || 'Failed to create vendor');
    }
  };

  // Handle Add Model Submission
  const handleAddModelSubmit = async () => {
    const vId = Number(modelVendorId);
    const mName = modelName.trim();
    if (!vId) {
      toast.warn('Please select a vendor');
      return;
    }
    if (!mName) {
      toast.warn('Please enter a model name');
      return;
    }
    setActionLoading(true);
    const res = await OneBssApi.addInventoryModel({
      vendor_id: vId,
      name: mName,
      type: modelType,
      description: modelDesc.trim(),
      status: 'active',
    });
    setActionLoading(false);

    if (res.ok && res.data?.model) {
      toast.success(res.data.message || `Model '${mName}' created!`);
      const created = res.data.model;
      setModelName('');
      setModelDesc('');
      setModelType('GPON');
      setShowAddModelModal(false);
      await loadStatsAndVendors();
      // Auto-select in Add Device modal if open
      setNewVendorId(String(vId));
      setNewModelId(String(created.id));
    } else {
      toast.error(res.data?.message || 'Failed to create model');
    }
  };

  // Access Denied screen for non-superadmin
  if (!isSuper) {
    return (
      <View style={styles.centerContainer}>
        <Feather name="shield-off" size={48} color={COLORS.accentRose} />
        <Text style={styles.deniedTitle}>Access Restricted</Text>
        <Text style={styles.deniedSub}>
          Only Super Administrator accounts have permission to access Hardware Inventory Management.
        </Text>
      </View>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.container, isMobile && styles.containerMobile]} showsVerticalScrollIndicator={false}>
        
        {/* ======================================================== */}
        {/* 1. Header Actions Bar                                    */}
        {/* ======================================================== */}
        <View style={[styles.headerRow, { justifyContent: 'flex-end' }, isMobile && styles.headerRowMobile]}>
          <View style={[styles.headerActions, isMobile && styles.headerActionsMobile]}>
            <TouchableOpacity
              style={[styles.catalogBtn, isMobile && { flex: 1, justifyContent: 'center' }]}
              onPress={() => setShowCatalogModal(true)}
            >
              <Feather name="layers" size={13} color="#334155" />
              <Text style={styles.catalogBtnText}>Vendors & Models</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.scanBtn, isMobile && { flex: 1.2, justifyContent: 'center' }]}
              onPress={() => setShowBulkScannerModal(true)}
            >
              <Feather name="maximize" size={14} color="#ffffff" />
              <Text style={styles.scanBtnText}>Bulk Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.addBtn, isMobile && { flex: 1.1, justifyContent: 'center' }]} onPress={() => setShowAddModal(true)}>
              <Feather name="plus-circle" size={14} color="#ffffff" />
              <Text style={styles.addBtnText}>Add Device</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ======================================================== */}
        {/* 2. KPI Metrics Cards (Responsive 2x2 grid on mobile)     */}
        {/* ======================================================== */}
        <View style={[styles.metricsGrid, isMobile && styles.metricsGridMobile]}>
          {/* Card: Total */}
          <TouchableOpacity
            style={[styles.metricCard, isMobile && styles.metricCardMobile, selectedStatus === 'all' && styles.metricCardActive]}
            onPress={() => { setSelectedStatus('all'); setPage(1); }}
          >
            <View style={styles.metricCardHead}>
              <Text style={styles.metricCardLabel}>TOTAL ONUS</Text>
              <View style={[styles.metricIconBox, { backgroundColor: '#f1f5f9' }]}>
                <Feather name="package" size={14} color="#0f172a" />
              </View>
            </View>
            <Text style={[styles.metricCardVal, isMobile && { fontSize: 20 }]}>{stats.total}</Text>
          </TouchableOpacity>

          {/* Card: In Stock */}
          <TouchableOpacity
            style={[styles.metricCard, isMobile && styles.metricCardMobile, selectedStatus === 'in_stock' && styles.metricCardActive]}
            onPress={() => { setSelectedStatus('in_stock'); setPage(1); }}
          >
            <View style={styles.metricCardHead}>
              <Text style={[styles.metricCardLabel, { color: '#047857' }]}>IN STOCK</Text>
              <View style={[styles.metricIconBox, { backgroundColor: '#dcfce7' }]}>
                <Feather name="check-circle" size={14} color="#10b981" />
              </View>
            </View>
            <Text style={[styles.metricCardVal, { color: '#047857' }, isMobile && { fontSize: 20 }]}>{stats.in_stock}</Text>
          </TouchableOpacity>

          {/* Card: Assigned */}
          <TouchableOpacity
            style={[styles.metricCard, isMobile && styles.metricCardMobile, selectedStatus === 'assigned' && styles.metricCardActive]}
            onPress={() => { setSelectedStatus('assigned'); setPage(1); }}
          >
            <View style={styles.metricCardHead}>
              <Text style={[styles.metricCardLabel, { color: '#1d4ed8' }]}>ASSIGNED</Text>
              <View style={[styles.metricIconBox, { backgroundColor: '#dbeafe' }]}>
                <Feather name="wifi" size={14} color="#2563eb" />
              </View>
            </View>
            <Text style={[styles.metricCardVal, { color: '#1d4ed8' }, isMobile && { fontSize: 20 }]}>{stats.assigned}</Text>
          </TouchableOpacity>

          {/* Card: Faulty & In Repair */}
          <TouchableOpacity
            style={[styles.metricCard, isMobile && styles.metricCardMobile, (selectedStatus === 'faulty' || selectedStatus === 'in_repair') && styles.metricCardActive]}
            onPress={() => { setSelectedStatus('faulty'); setPage(1); }}
          >
            <View style={styles.metricCardHead}>
              <Text style={[styles.metricCardLabel, { color: '#b91c1c' }]}>FAULTY / REPAIR</Text>
              <View style={[styles.metricIconBox, { backgroundColor: '#fee2e2' }]}>
                <Feather name="alert-triangle" size={14} color="#dc2626" />
              </View>
            </View>
            <Text style={[styles.metricCardVal, { color: '#b91c1c' }, isMobile && { fontSize: 20 }]}>
              {(stats.faulty || 0) + (stats.in_repair || 0)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ======================================================== */}
        {/* 3. Filter Chips Line (Horizontal Swipeable)              */}
        {/* ======================================================== */}
        <View style={styles.chipRowWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {[
              { id: 'all', label: 'All ONUs', count: stats.total },
              { id: 'in_stock', label: 'In Stock', count: stats.in_stock },
              { id: 'assigned', label: 'Assigned', count: stats.assigned },
              { id: 'reserved', label: 'Reserved', count: stats.reserved },
              { id: 'faulty', label: 'Faulty', count: stats.faulty },
              { id: 'in_repair', label: 'In Repair', count: stats.in_repair },
              { id: 'retired', label: 'Retired', count: stats.retired },
            ].map((chip) => {
              const active = selectedStatus === chip.id;
              return (
                <TouchableOpacity
                  key={chip.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => { setSelectedStatus(chip.id); setPage(1); }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {chip.label}
                  </Text>
                  <View style={[styles.chipBadge, active && styles.chipBadgeActive]}>
                    <Text style={[styles.chipBadgeText, active && styles.chipBadgeTextActive]}>
                      {chip.count ?? 0}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ======================================================== */}
        {/* 4. Search & Controls Bar                                 */}
        {/* ======================================================== */}
        <View style={[styles.controlBar, isMobile && styles.controlBarMobile]}>
          {/* Live Search */}
          <View style={[styles.searchInputContainer, isMobile && { width: '100%' }]}>
            <Feather name="search" size={15} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Serial Number, MAC Address..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={(txt) => { setSearchQuery(txt); setPage(1); }}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setPage(1); }}>
                <Feather name="x" size={15} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Dropdown Filters (Vendor & PON Type) */}
          <View style={[styles.dropdownFiltersRow, isMobile && { width: '100%', gap: 8 }]}>
            {/* Vendor Filter */}
            <View style={[styles.selectWrap, isMobile && { flex: 1 }]}>
              <Text style={styles.selectLabel}>Vendor:</Text>
              <select
                style={styles.nativeSelect}
                value={selectedVendor}
                onChange={(e) => { setSelectedVendor(e.target.value); setPage(1); }}
              >
                <option value="all">All</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </View>

            {/* PON Type Filter */}
            <View style={[styles.selectWrap, isMobile && { flex: 1 }]}>
              <Text style={styles.selectLabel}>Type:</Text>
              <select
                style={styles.nativeSelect}
                value={selectedType}
                onChange={(e) => { setSelectedType(e.target.value); setPage(1); }}
              >
                <option value="all">All</option>
                <option value="GPON">GPON</option>
                <option value="XPON">XPON</option>
                <option value="EPON">EPON</option>
              </select>
            </View>

            {/* Mobile View Toggle */}
            {isMobile && (
              <View style={styles.viewModeToggleRow}>
                <TouchableOpacity
                  style={[styles.viewModeBtn, viewMode === 'table' && styles.viewModeBtnActive]}
                  onPress={() => setViewMode('table')}
                >
                  <Feather name="grid" size={12} color={viewMode === 'table' ? '#ffffff' : '#475569'} />
                  <Text style={[styles.viewModeBtnText, viewMode === 'table' && styles.viewModeBtnTextActive]}>Table</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.viewModeBtn, viewMode === 'cards' && styles.viewModeBtnActive]}
                  onPress={() => setViewMode('cards')}
                >
                  <Feather name="list" size={12} color={viewMode === 'cards' ? '#ffffff' : '#475569'} />
                  <Text style={[styles.viewModeBtnText, viewMode === 'cards' && styles.viewModeBtnTextActive]}>Cards</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ======================================================== */}
        {/* 5. ONU Data Presentation: Table (Mobile & Desktop)       */}
        {/* ======================================================== */}
        <View style={styles.tableCard}>
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : onus.length === 0 ? (
            <View style={styles.emptyBox}>
              <Feather name="inbox" size={36} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No ONUs Found</Text>
              <Text style={styles.emptySub}>
                {searchQuery || selectedStatus !== 'all' || selectedVendor !== 'all'
                  ? 'No devices match your filters.'
                  : 'No devices found.'}
              </Text>
              <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddModal(true)}>
                <Feather name="plus" size={14} color="#ffffff" />
                <Text style={styles.emptyAddBtnText}>Add Device</Text>
              </TouchableOpacity>
            </View>
          ) : isMobile && viewMode === 'cards' ? (
            /* ===================================================== */
            /* MOBILE VIEW: Touch-Friendly Card List                 */
            /* ===================================================== */
            <View style={styles.mobileListContainer}>
              {onus.map((item) => {
                const st = getStatusStyle(item.status);
                const pon = PON_COLORS[item.pon_type] || { fg: '#334155', bg: '#f1f5f9' };
                return (
                  <View key={item.id} style={styles.mCard}>
                    {/* Card Header: Vendor & Model + Status Badge */}
                    <View style={styles.mCardHead}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={styles.mVendorText}>{item.vendor_name}</Text>
                          <View style={[styles.ponBadge, { backgroundColor: pon.bg, paddingHorizontal: 6, paddingVertical: 1 }]}>
                            <Text style={[styles.ponBadgeText, { color: pon.fg, fontSize: 9.5 }]}>{item.pon_type}</Text>
                          </View>
                        </View>
                        <Text style={styles.mModelText} numberOfLines={1}>{item.model_name}</Text>
                      </View>

                      {/* Clickable Status Pill */}
                      <TouchableOpacity
                        style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}
                        onPress={() => {
                          setEditItem(item);
                          setEditStatus(item.status);
                          setEditMac(item.mac_address || '');
                          setEditSerial(item.serial_no);
                        }}
                      >
                        <Feather name={st.icon} size={11} color={st.fg} />
                        <Text style={[styles.statusBadgeText, { color: st.fg }]}>{st.label}</Text>
                        <Feather name="chevron-down" size={10} color={st.fg} />
                      </TouchableOpacity>
                    </View>

                    {/* Card Body: Identifiers */}
                    <View style={styles.mCardBody}>
                      {/* Serial Number Row */}
                      <View style={styles.mCardDataRow}>
                        <Text style={styles.mLabel}>SN:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.mSerialText} selectable>{item.serial_no || '—'}</Text>
                          {item.serial_no ? (
                            <TouchableOpacity
                              style={styles.iconCopyBtn}
                              onPress={() => copyToClipboard(item.serial_no, 'Serial Number')}
                            >
                              <Feather name="copy" size={11} color="#64748b" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      {/* MAC Address Row */}
                      <View style={styles.mCardDataRow}>
                        <Text style={styles.mLabel}>MAC:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.mMacText} selectable>{item.mac_address || '—'}</Text>
                          {item.mac_address ? (
                            <TouchableOpacity
                              style={styles.iconCopyBtn}
                              onPress={() => copyToClipboard(item.mac_address, 'MAC Address')}
                            >
                              <Feather name="copy" size={11} color="#64748b" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      {/* Purchase Date Row */}
                      <View style={styles.mCardDataRow}>
                        <Text style={styles.mLabel}>Purchased:</Text>
                        <Text style={styles.mValText}>{item.purchase_date || '—'}</Text>
                      </View>
                    </View>

                    {/* Card Footer: Quick Actions */}
                    <View style={styles.mCardFooter}>
                      <TouchableOpacity
                        style={[styles.mActionBtn, { borderColor: '#cbd5e1' }]}
                        onPress={() => {
                          setEditItem(item);
                          setEditStatus(item.status);
                          setEditMac(item.mac_address || '');
                          setEditSerial(item.serial_no);
                        }}
                      >
                        <Feather name="edit-2" size={13} color="#2563eb" />
                        <Text style={[styles.mActionBtnText, { color: '#2563eb' }]}>Edit / Status</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.mActionBtn, { borderColor: '#fee2e2', backgroundColor: '#fff5f5' }]}
                        onPress={() => setDeleteItem(item)}
                      >
                        <Feather name="trash-2" size={13} color="#dc2626" />
                        <Text style={[styles.mActionBtnText, { color: '#dc2626' }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* ===================================================== */
            /* TABLE VIEW: Available on BOTH Mobile & Desktop        */
            /* ===================================================== */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={{ minWidth: 960, width: isMobile ? undefined : '100%' }}
            >
              <View style={[styles.tableContainer, { minWidth: 960, width: '100%' }]}>
                {/* Table Header */}
                <View style={styles.tableHeaderRow}>
                  <View style={TABLE_COLS.id}>
                    <Text style={styles.th}>#</Text>
                  </View>
                  <View style={TABLE_COLS.serial}>
                    <Text style={styles.th}>SERIAL NUMBER</Text>
                  </View>
                  <View style={TABLE_COLS.mac}>
                    <Text style={styles.th}>MAC ADDRESS</Text>
                  </View>
                  <View style={TABLE_COLS.vendor}>
                    <Text style={styles.th}>VENDOR & MODEL</Text>
                  </View>
                  <View style={TABLE_COLS.pon}>
                    <Text style={styles.th}>PON TYPE</Text>
                  </View>
                  <View style={TABLE_COLS.status}>
                    <Text style={styles.th}>STATUS</Text>
                  </View>
                  <View style={TABLE_COLS.purchase}>
                    <Text style={styles.th}>PURCHASED</Text>
                  </View>
                  <View style={TABLE_COLS.actions}>
                    <Text style={[styles.th, { textAlign: 'right' }]}>ACTIONS</Text>
                  </View>
                </View>

                {/* Table Rows */}
                {onus.map((item, idx) => {
                  const st = getStatusStyle(item.status);
                  const pon = PON_COLORS[item.pon_type] || { fg: '#334155', bg: '#f1f5f9' };
                  return (
                    <View key={item.id} style={[styles.tr, idx % 2 === 1 && styles.trEven]}>
                      {/* ID */}
                      <View style={TABLE_COLS.id}>
                        <Text style={[styles.td, { color: '#94a3b8', fontSize: 11 }]}>
                          {item.id}
                        </Text>
                      </View>

                      {/* Serial Number with Copy */}
                      <View style={[TABLE_COLS.serial, styles.tdCell]}>
                        {item.serial_no ? (
                          <>
                            <Text style={styles.serialText} selectable>{item.serial_no}</Text>
                            <TouchableOpacity
                              style={styles.iconCopyBtn}
                              onPress={() => copyToClipboard(item.serial_no, 'Serial Number')}
                              title="Copy Serial Number"
                            >
                              <Feather name="copy" size={11} color="#64748b" />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text style={{ color: '#cbd5e1', fontSize: 12 }}>—</Text>
                        )}
                      </View>

                      {/* MAC Address with Copy */}
                      <View style={[TABLE_COLS.mac, styles.tdCell]}>
                        {item.mac_address ? (
                          <>
                            <Text style={styles.macText} selectable>{item.mac_address}</Text>
                            <TouchableOpacity
                              style={styles.iconCopyBtn}
                              onPress={() => copyToClipboard(item.mac_address, 'MAC Address')}
                              title="Copy MAC"
                            >
                              <Feather name="copy" size={11} color="#64748b" />
                            </TouchableOpacity>
                          </>
                        ) : (
                          <Text style={{ color: '#cbd5e1', fontSize: 12 }}>—</Text>
                        )}
                      </View>

                      {/* Vendor & Model */}
                      <View style={[TABLE_COLS.vendor, { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }]}>
                        <Text style={styles.vendorNameText} numberOfLines={1}>{item.vendor_name}</Text>
                        <Text style={styles.modelNameText} numberOfLines={1}>{item.model_name}</Text>
                      </View>

                      {/* PON Type Badge */}
                      <View style={TABLE_COLS.pon}>
                        <View style={[styles.ponBadge, { backgroundColor: pon.bg }]}>
                          <Text style={[styles.ponBadgeText, { color: pon.fg }]}>{item.pon_type}</Text>
                        </View>
                      </View>

                      {/* Status Badge */}
                      <View style={TABLE_COLS.status}>
                        <TouchableOpacity
                          style={[styles.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}
                          onPress={() => {
                            setEditItem(item);
                            setEditStatus(item.status);
                            setEditMac(item.mac_address || '');
                            setEditSerial(item.serial_no);
                          }}
                          title="Click to change status"
                        >
                          <Feather name={st.icon} size={11} color={st.fg} />
                          <Text style={[styles.statusBadgeText, { color: st.fg }]}>{st.label}</Text>
                          <Feather name="chevron-down" size={10} color={st.fg} style={{ marginLeft: 2 }} />
                        </TouchableOpacity>
                      </View>

                      {/* Purchase Date */}
                      <View style={TABLE_COLS.purchase}>
                        <Text style={[styles.td, { fontSize: 12, color: '#475569' }]}>
                          {item.purchase_date || '—'}
                        </Text>
                      </View>

                      {/* Action Buttons */}
                      <View style={[TABLE_COLS.actions, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }]}>
                        <TouchableOpacity
                          style={styles.rowActionBtn}
                          onPress={() => {
                            setEditItem(item);
                            setEditStatus(item.status);
                            setEditMac(item.mac_address || '');
                            setEditSerial(item.serial_no);
                          }}
                          title="Edit ONU"
                        >
                          <Feather name="edit-2" size={13} color="#2563eb" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.rowActionBtn, { borderColor: '#fee2e2' }]}
                          onPress={() => setDeleteItem(item)}
                          title="Delete ONU"
                        >
                          <Feather name="trash-2" size={13} color="#dc2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* ===================================================== */}
          {/* Pagination Controls                                   */}
          {/* ===================================================== */}
          {onus.length > 0 && (
            <View style={[styles.paginationBar, isMobile && styles.paginationBarMobile]}>
              <Text style={styles.paginationInfo}>
                Showing {Math.min((page - 1) * pageSize + 1, totalCount)} to {Math.min(page * pageSize, totalCount)} of {totalCount} ONUs
              </Text>

              <View style={styles.paginationControls}>
                <TouchableOpacity
                  style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                  disabled={page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <Feather name="chevron-left" size={14} color={page <= 1 ? '#cbd5e1' : '#0f172a'} />
                </TouchableOpacity>

                <Text style={styles.pageNumberText}>
                  Page {page} of {totalPages}
                </Text>

                <TouchableOpacity
                  style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                  disabled={page >= totalPages}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <Feather name="chevron-right" size={14} color={page >= totalPages ? '#cbd5e1' : '#0f172a'} />
                </TouchableOpacity>

                {/* Rows per page selector */}
                <select
                  style={styles.pageSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </View>
            </View>
          )}
        </View>

      </ScrollView>

      {/* ======================================================== */}
      {/* 6. Modal: ADD NEW ONU                                     */}
      {/* ======================================================== */}
      {showAddModal && (
        <Modal transparent animationType="fade" visible={showAddModal} onRequestClose={() => setShowAddModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, isMobile && { width: '92%', maxHeight: '90%' }]}>
              {/* Modal Head */}
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="plus-circle" size={17} color={COLORS.primary} />
                  <Text style={styles.modalTitle}>Add ONU Device</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Modal Body */}
              <ScrollView style={{ padding: 18, maxHeight: 460 }}>
                {/* Bulk Scanner Fast-Track Banner */}
                <TouchableOpacity
                  style={styles.addModalScanBanner}
                  onPress={() => {
                    setShowAddModal(false);
                    setShowBulkScannerModal(true);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <View style={styles.addModalScanIconBox}>
                      <Feather name="maximize" size={15} color="#0284c7" />
                    </View>
                    <View>
                      <Text style={styles.addModalScanBannerTitle}>Import Multiple Devices via Scanner</Text>
                      <Text style={styles.addModalScanBannerSub}>Use Barcode Gun or Camera to scan MAC & Serials in bulk</Text>
                    </View>
                  </View>
                  <Feather name="arrow-right" size={15} color="#0284c7" />
                </TouchableOpacity>

                {/* 1. Vendor Selection */}
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <Text style={styles.formLabel}>Vendor <Text style={{ color: '#dc2626' }}>*</Text></Text>
                    <TouchableOpacity
                      onPress={() => {
                        setNewVendorName('');
                        setShowAddVendorModal(true);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Feather name="plus" size={12} color={COLORS.primary} />
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.primary }}>New Vendor</Text>
                    </TouchableOpacity>
                  </View>
                  <select
                    style={styles.formSelect}
                    value={newVendorId}
                    onChange={(e) => {
                      setNewVendorId(e.target.value);
                      setNewModelId('');
                    }}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </View>

                {/* 2. Model Selection */}
                <View style={styles.formGroup}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <Text style={styles.formLabel}>Model <Text style={{ color: '#dc2626' }}>*</Text></Text>
                    <TouchableOpacity
                      onPress={() => {
                        setModelVendorId(newVendorId || (vendors[0]?.id ? String(vendors[0].id) : ''));
                        setModelName('');
                        setModelType('GPON');
                        setModelDesc('');
                        setShowAddModelModal(true);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    >
                      <Feather name="plus" size={12} color={COLORS.primary} />
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: COLORS.primary }}>New Model</Text>
                    </TouchableOpacity>
                  </View>
                  <select
                    style={styles.formSelect}
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                  >
                    <option value="">Select Model</option>
                    {availableModelsInAdd.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.type})
                      </option>
                    ))}
                  </select>
                </View>

                {/* 3. Serial Number */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Serial Number</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. HWTC1A2B3C4D"
                    placeholderTextColor="#94a3b8"
                    value={newSerialNo}
                    onChangeText={setNewSerialNo}
                  />
                </View>

                {/* 4. MAC Address */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>MAC Address</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 48:57:02:1A:3B:10"
                    placeholderTextColor="#94a3b8"
                    value={newMacAddress}
                    onChangeText={setNewMacAddress}
                  />
                </View>

                {/* 5. Inventory Status */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Status</Text>
                  <select
                    style={styles.formSelect}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="reserved">Reserved</option>
                    <option value="assigned">Assigned</option>
                    <option value="faulty">Faulty</option>
                  </select>
                </View>

                {/* 6. Purchase Date */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Purchase Date</Text>
                  <input
                    type="date"
                    style={{ ...styles.formInput, paddingVertical: 8 }}
                    value={newPurchaseDate}
                    onChange={(e) => setNewPurchaseDate(e.target.value)}
                  />
                </View>
              </ScrollView>

              {/* Modal Footer */}
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAddModal(false)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddSubmit}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={14} color="#ffffff" />
                      <Text style={styles.submitBtnText}>Add Device</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 7. Modal: EDIT ONU / STATUS CHANGE                        */}
      {/* ======================================================== */}
      {editItem && (
        <Modal transparent animationType="fade" visible={!!editItem} onRequestClose={() => setEditItem(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, isMobile && { width: '92%' }]}>
              {/* Modal Head */}
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="edit" size={17} color="#2563eb" />
                  <Text style={styles.modalTitle}>Update ONU #{editItem.id}</Text>
                </View>
                <TouchableOpacity onPress={() => setEditItem(null)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 18 }}>
                <View style={styles.editHeaderBox}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>
                    {editItem.vendor_name} {editItem.model_name}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    PON: {editItem.pon_type} · Added: {editItem.created_at}
                  </Text>
                </View>

                {/* Status Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Change Status</Text>
                  <select
                    style={styles.formSelect}
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="reserved">Reserved</option>
                    <option value="assigned">Assigned</option>
                    <option value="faulty">Faulty</option>
                    <option value="in_repair">In Repair</option>
                    <option value="retired">Retired</option>
                  </select>
                </View>

                {/* Serial No Edit */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Serial Number</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editSerial}
                    onChangeText={setEditSerial}
                  />
                </View>

                {/* MAC Edit */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>MAC Address</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="XX:XX:XX:XX:XX:XX"
                    placeholderTextColor="#94a3b8"
                    value={editMac}
                    onChangeText={setEditMac}
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setEditItem(null)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: '#2563eb' }]}
                  onPress={handleEditSubmit}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 8. Modal: DELETE CONFIRMATION                             */}
      {/* ======================================================== */}
      {deleteItem && (
        <Modal transparent animationType="fade" visible={!!deleteItem} onRequestClose={() => setDeleteItem(null)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { width: isMobile ? '90%' : 420 }]}>
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="alert-triangle" size={17} color="#dc2626" />
                  <Text style={[styles.modalTitle, { color: '#dc2626' }]}>Confirm Delete</Text>
                </View>
                <TouchableOpacity onPress={() => setDeleteItem(null)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 18 }}>
                <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                  Are you sure you want to permanently delete ONU <Text style={{ fontWeight: '700' }}>{deleteItem.serial_no}</Text> ({deleteItem.vendor_name} {deleteItem.model_name}) from inventory?
                </Text>
                <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 8 }}>
                  This action cannot be undone.
                </Text>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setDeleteItem(null)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: '#dc2626' }]}
                  onPress={handleDeleteSubmit}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Delete Device</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 9. Modal: ADD VENDOR                                      */}
      {/* ======================================================== */}
      {showAddVendorModal && (
        <Modal transparent animationType="fade" visible={showAddVendorModal} onRequestClose={() => setShowAddVendorModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { width: isMobile ? '92%' : 440 }]}>
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="briefcase" size={16} color={COLORS.primary} />
                  <Text style={styles.modalTitle}>Add Hardware Vendor</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAddVendorModal(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 18 }}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Vendor Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Syrotech, Netlink, D-Link"
                    placeholderTextColor="#94a3b8"
                    value={newVendorName}
                    onChangeText={setNewVendorName}
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAddVendorModal(false)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddVendorSubmit}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={14} color="#ffffff" />
                      <Text style={styles.submitBtnText}>Create Vendor</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 10. Modal: ADD MODEL                                     */}
      {/* ======================================================== */}
      {showAddModelModal && (
        <Modal transparent animationType="fade" visible={showAddModelModal} onRequestClose={() => setShowAddModelModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { width: isMobile ? '92%' : 480 }]}>
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="cpu" size={16} color={COLORS.primary} />
                  <Text style={styles.modalTitle}>Add ONU Model</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAddModelModal(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 18, maxHeight: 480 }}>
                {/* Vendor Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Vendor <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <select
                    style={styles.formSelect}
                    value={modelVendorId}
                    onChange={(e) => setModelVendorId(e.target.value)}
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </View>

                {/* Model Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Model Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. SY-GPON-1110-WDONT, HG8546M"
                    placeholderTextColor="#94a3b8"
                    value={modelName}
                    onChangeText={setModelName}
                  />
                </View>

                {/* PON Technology */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>PON Type <Text style={{ color: '#dc2626' }}>*</Text></Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {['GPON', 'XPON', 'EPON'].map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.ponTypeRadio,
                          modelType === t && styles.ponTypeRadioActive
                        ]}
                        onPress={() => setModelType(t)}
                      >
                        <View style={[styles.radioCircle, modelType === t && styles.radioCircleActive]} />
                        <Text style={[styles.ponTypeRadioText, modelType === t && styles.ponTypeRadioTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                    placeholder="e.g. 1 GE + 3 FE + 1 POTS + 2.4GHz Wi-Fi"
                    placeholderTextColor="#94a3b8"
                    value={modelDesc}
                    onChangeText={setModelDesc}
                    multiline
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAddModelModal(false)}
                  disabled={actionLoading}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAddModelSubmit}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={14} color="#ffffff" />
                      <Text style={styles.submitBtnText}>Create Model</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 11. Modal: HARDWARE CATALOG (Vendors & Models Overview)   */}
      {/* ======================================================== */}
      {showCatalogModal && (
        <Modal transparent animationType="fade" visible={showCatalogModal} onRequestClose={() => setShowCatalogModal(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalBox, { width: isMobile ? '95%' : 680, maxHeight: '88%' }]}>
              {/* Modal Head */}
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="layers" size={17} color={COLORS.primary} />
                  <Text style={styles.modalTitle}>Vendors & Models</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCatalogModal(false)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Action bar inside catalog */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexWrap: 'wrap', gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  {vendors.length} Vendors · {allModels.length} Models
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.addBtn, { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#0f172a' }]}
                    onPress={() => {
                      setNewVendorName('');
                      setShowAddVendorModal(true);
                    }}
                  >
                    <Feather name="plus" size={12} color="#ffffff" />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#ffffff' }}>Add Vendor</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.addBtn, { paddingHorizontal: 10, paddingVertical: 6 }]}
                    onPress={() => {
                      setModelVendorId(vendors[0]?.id ? String(vendors[0].id) : '');
                      setModelName('');
                      setModelType('GPON');
                      setModelDesc('');
                      setShowAddModelModal(true);
                    }}
                  >
                    <Feather name="plus" size={12} color="#ffffff" />
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#ffffff' }}>Add Model</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Catalog list */}
              <ScrollView style={{ padding: 16, maxHeight: 480 }}>
                {vendors.map((vendor) => {
                  const vendorModels = vendor.models || [];
                  return (
                    <View key={vendor.id} style={styles.catalogVendorCard}>
                      <View style={styles.catalogVendorHead}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={styles.catalogVendorIconBox}>
                            <Feather name="cpu" size={14} color="#0f172a" />
                          </View>
                          <Text style={styles.catalogVendorName}>{vendor.name}</Text>
                          <View style={styles.catalogCountBadge}>
                            <Text style={styles.catalogCountBadgeText}>{vendorModels.length} models</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.catalogAddModelBtn}
                          onPress={() => {
                            setModelVendorId(String(vendor.id));
                            setModelName('');
                            setModelType('GPON');
                            setModelDesc('');
                            setShowAddModelModal(true);
                          }}
                        >
                          <Feather name="plus" size={11} color={COLORS.primary} />
                          <Text style={styles.catalogAddModelBtnText}>Add Model</Text>
                        </TouchableOpacity>
                      </View>

                      {vendorModels.length === 0 ? (
                        <Text style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 6 }}>
                          No models registered under this vendor yet.
                        </Text>
                      ) : (
                        <View style={styles.catalogModelsGrid}>
                          {vendorModels.map((m) => {
                            const pon = PON_COLORS[m.type] || { fg: '#334155', bg: '#f1f5f9' };
                            return (
                              <View key={m.id} style={styles.catalogModelItem}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                  <Text style={styles.catalogModelName}>{m.name}</Text>
                                  <View style={[styles.ponBadge, { backgroundColor: pon.bg, paddingHorizontal: 6, paddingVertical: 1 }]}>
                                    <Text style={[styles.ponBadgeText, { color: pon.fg, fontSize: 9.5 }]}>{m.type}</Text>
                                  </View>
                                </View>
                                {m.description ? (
                                  <Text style={styles.catalogModelDesc} numberOfLines={2}>{m.description}</Text>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowCatalogModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ======================================================== */}
      {/* 11. Modal: BULK SCANNER IMPORT (BARCODE GUN / CAMERA / PASTE) */}
      {/* ======================================================== */}
      {showBulkScannerModal && (
        <BulkInventoryScannerModal
          visible={showBulkScannerModal}
          onClose={() => setShowBulkScannerModal(false)}
          vendors={vendors}
          allModels={allModels}
          onSuccess={() => {
            loadStatsAndVendors();
            loadOnus();
          }}
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    padding: 24,
    paddingBottom: 40,
  },
  containerMobile: {
    padding: 12,
    paddingBottom: 32,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    backgroundColor: '#f8fafc',
  },
  deniedTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 14,
    marginBottom: 6,
  },
  deniedSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 18,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 14,
  },
  headerIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionsMobile: {
    width: '100%',
    gap: 8,
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
    paddingVertical: 8,
  },
  refreshBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 2,
    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
  },
  addBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    elevation: 2,
    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
  },
  scanBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  addModalScanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 14,
  },
  addModalScanIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addModalScanBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369a1',
  },
  addModalScanBannerSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },

  // Metrics
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 18,
  },
  metricsGridMobile: {
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  metricCardMobile: {
    flex: 0,
    width: '48.5%',
    minWidth: '48.5%',
    padding: 12,
  },
  metricCardActive: {
    borderColor: COLORS.primary,
    boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
  },
  metricCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metricCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#64748b',
  },
  metricIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricCardVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  metricCardFooter: {
    fontSize: 10.5,
    color: '#94a3b8',
  },

  // Chip Row
  chipRowWrapper: {
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  chipBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
  },
  chipBadgeActive: {
    backgroundColor: '#334155',
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  chipBadgeTextActive: {
    color: '#f8fafc',
  },

  // Control Bar
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  controlBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
    outlineStyle: 'none',
  },
  dropdownFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 38,
  },
  selectLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748b',
  },
  nativeSelect: {
    borderWidth: 0,
    outlineStyle: 'none',
    backgroundColor: 'transparent',
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    cursor: 'pointer',
    maxWidth: 110,
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  viewModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: '#0f172a',
  },
  viewModeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  viewModeBtnTextActive: {
    color: '#ffffff',
  },
  mobileSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  mobileSwipeHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369a1',
  },

  // Table Card Container
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  loadingBox: {
    padding: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  emptyBox: {
    padding: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 340,
    marginBottom: 16,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyAddBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Desktop Table Styles
  tableContainer: {
    width: '100%',
    minWidth: 960,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  th: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  trEven: {
    backgroundColor: '#fafbfc',
  },
  td: {
    fontSize: 12.5,
    color: '#0f172a',
  },
  tdCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serialText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  macText: {
    fontSize: 11.5,
    color: '#475569',
    fontFamily: 'monospace',
  },
  iconCopyBtn: {
    padding: 3,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  vendorNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  modelNameText: {
    fontSize: 11,
    color: '#64748b',
  },
  ponBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  ponBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    cursor: 'pointer',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  rowActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Mobile Card List Styles
  mobileListContainer: {
    padding: 10,
    gap: 10,
  },
  mCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  mCardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
  },
  mVendorText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  mModelText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  mCardBody: {
    gap: 6,
    marginBottom: 10,
  },
  mCardDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  mSerialText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  mMacText: {
    fontSize: 11.5,
    color: '#475569',
    fontFamily: 'monospace',
  },
  mValText: {
    fontSize: 11.5,
    color: '#334155',
  },
  mCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  mActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  mActionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },

  // Pagination
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexWrap: 'wrap',
    gap: 10,
  },
  paginationBarMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  paginationInfo: {
    fontSize: 11.5,
    color: '#64748b',
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  pageBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.4,
    borderColor: '#e2e8f0',
  },
  pageNumberText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  pageSelect: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 11.5,
    color: '#334155',
    backgroundColor: '#ffffff',
    outlineStyle: 'none',
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modalBox: {
    width: 500,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
    overflow: 'hidden',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  editHeaderBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  formInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0f172a',
    outlineStyle: 'none',
  },
  formSelect: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0f172a',
    outlineStyle: 'none',
    cursor: 'pointer',
  },
  formHint: {
    fontSize: 10.5,
    color: '#94a3b8',
    marginTop: 3,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: COLORS.primary,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  catalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  catalogBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  ponTypeRadio: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  ponTypeRadioActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0fdf4',
  },
  radioCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
  },
  radioCircleActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  ponTypeRadioText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  ponTypeRadioTextActive: {
    color: COLORS.primary,
  },
  catalogVendorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  catalogVendorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
  },
  catalogVendorIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogVendorName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  catalogCountBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
  },
  catalogCountBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748b',
  },
  catalogAddModelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  catalogAddModelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  catalogModelsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catalogModelItem: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
  },
  catalogModelName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  catalogModelDesc: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 3,
  },
});
