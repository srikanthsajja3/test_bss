import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

// Table column dimensions for Desktop view (flexible proportions)
const TABLE_COLS = {
  status:    { width: 135 },
  ip:        { flex: 1.4, minWidth: 145 },
  mac:       { flex: 1.5, minWidth: 155 },
  node:      { flex: 1.9, minWidth: 175 },
  node_ip:   { flex: 1.2, minWidth: 130 },
  lease_end: { flex: 1.5, minWidth: 145 },
  actions:   { width: 100, alignItems: 'center' },
};

export const DhcpDevicesScreen = ({ user, refreshSignal }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'LIVE' | 'INACTIVE'
  const [loggingInId, setLoggingInId] = useState(null);
  const [viewMode, setViewMode] = useState(isMobile ? 'cards' : 'table');

  // Excel-style column search filters
  const [colFilters, setColFilters] = useState({
    ip: '',
    mac: '',
    node: '',
    node_ip: '',
    lease_end: '',
  });

  // Mobile column filter panel toggle
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Keep viewMode synced if window resizes, unless user explicitly toggled
  useEffect(() => {
    setViewMode(isMobile ? 'cards' : 'table');
  }, [isMobile]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const copyToClipboard = (text, label) => {
    if (!text) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    }
  };

  const fetchDevices = useCallback(async (sync = 0, isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await OneBssApi.getDhcpClients(sync);
      if (res.ok && Array.isArray(res.data?.data)) {
        setDevices(res.data.data);
        if (isManual) {
          toast.success(`Synced ${res.data.data.length} DHCP devices`);
        }
      } else {
        toast.error(res.data?.message || 'Failed to fetch DHCP devices');
      }
    } catch (err) {
      console.error('DHCP fetch error:', err);
      toast.error('Network error loading DHCP devices');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices(0);
  }, [fetchDevices, refreshSignal]);

  // Handle Login to device via observer proxy access grant
  const handleDeviceLogin = async (device) => {
    if (!device?.id) {
      toast.error('Device ID missing');
      return;
    }

    setLoggingInId(device.id);
    try {
      const res = await OneBssApi.grantDhcpDeviceAccess(device.id);
      if (res.ok && res.data?.success && res.data?.url) {
        toast.success(`Access granted for ${device.ip || 'device'}`);
        if (typeof window !== 'undefined') {
          const win = window.open(res.data.url, '_blank');
          if (!win || win.closed || typeof win.closed === 'undefined') {
            toast.info('Popup blocked. Please allow popups to open the device Web GUI.');
          }
        }
      } else {
        toast.error(res.data?.message || 'Access grant failed for this device');
      }
    } catch (err) {
      console.error('Device login error:', err);
      toast.error('Unable to establish device proxy session');
    } finally {
      setLoggingInId(null);
    }
  };

  // Quick counts
  const liveCount = useMemo(() => devices.filter((d) => String(d.status).toUpperCase() === 'LIVE').length, [devices]);
  const inactiveCount = useMemo(() => devices.filter((d) => String(d.status).toUpperCase() !== 'LIVE').length, [devices]);
  const streamingCount = useMemo(() => devices.filter((d) => !!d.streaming).length, [devices]);

  // Check if any filter is actively applied
  const hasActiveFilters = useMemo(() => {
    return (
      statusFilter !== 'ALL' ||
      !!searchQuery.trim() ||
      !!colFilters.ip.trim() ||
      !!colFilters.mac.trim() ||
      !!colFilters.node.trim() ||
      !!colFilters.node_ip.trim() ||
      !!colFilters.lease_end.trim()
    );
  }, [statusFilter, searchQuery, colFilters]);

  // Reset all Excel & global filters
  const resetAllFilters = () => {
    setStatusFilter('ALL');
    setSearchQuery('');
    setColFilters({
      ip: '',
      mac: '',
      node: '',
      node_ip: '',
      lease_end: '',
    });
    setCurrentPage(1);
  };

  // Filtered devices list with both global and Excel column filters
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // 1. Status toggle filter (ALL / LIVE / INACTIVE)
      if (statusFilter !== 'ALL') {
        const devStatus = String(d.status || '').toUpperCase();
        if (statusFilter === 'LIVE' && devStatus !== 'LIVE') return false;
        if (statusFilter === 'INACTIVE' && devStatus === 'LIVE') return false;
      }

      // 2. Global search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ip = String(d.ip || '').toLowerCase();
        const mac = String(d.mac || '').toLowerCase();
        const node = String(d.serving_node || '').toLowerCase();
        const nodeIp = String(d.node_ip || '').toLowerCase();
        const host = String(d.hostname || '').toLowerCase();
        if (!ip.includes(q) && !mac.includes(q) && !node.includes(q) && !nodeIp.includes(q) && !host.includes(q)) {
          return false;
        }
      }

      // 3. Excel column-specific searches
      if (colFilters.ip.trim()) {
        const q = colFilters.ip.toLowerCase().trim();
        if (!String(d.ip || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.mac.trim()) {
        const q = colFilters.mac.toLowerCase().trim();
        if (!String(d.mac || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.node.trim()) {
        const q = colFilters.node.toLowerCase().trim();
        if (!String(d.serving_node || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.node_ip.trim()) {
        const q = colFilters.node_ip.toLowerCase().trim();
        if (!String(d.node_ip || '').toLowerCase().includes(q)) return false;
      }
      if (colFilters.lease_end.trim()) {
        const q = colFilters.lease_end.toLowerCase().trim();
        if (!String(d.lease_end || '').toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [devices, statusFilter, searchQuery, colFilters]);

  // Paginated devices
  const totalItems = filteredDevices.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isMobile && styles.scrollContentMobile]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header / Stats Cards */}
        <View style={[styles.statsRow, isMobile && styles.statsRowMobile]}>
          <TouchableOpacity
            style={[
              styles.statCard,
              isMobile && styles.statCardMobile,
              { borderLeftColor: '#3b82f6' },
              statusFilter === 'ALL' && styles.statCardSelected,
            ]}
            onPress={() => {
              setStatusFilter('ALL');
              setCurrentPage(1);
            }}
          >
            <Text style={styles.statLabel}>TOTAL DEVICES</Text>
            <Text style={styles.statVal}>{devices.length}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              isMobile && styles.statCardMobile,
              { borderLeftColor: '#10b981' },
              statusFilter === 'LIVE' && styles.statCardSelected,
            ]}
            onPress={() => {
              setStatusFilter('LIVE');
              setCurrentPage(1);
            }}
          >
            <Text style={styles.statLabel}>LIVE CLIENTS</Text>
            <Text style={[styles.statVal, { color: '#059669' }]}>{liveCount}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statCard,
              isMobile && styles.statCardMobile,
              { borderLeftColor: '#94a3b8' },
              statusFilter === 'INACTIVE' && styles.statCardSelected,
            ]}
            onPress={() => {
              setStatusFilter('INACTIVE');
              setCurrentPage(1);
            }}
          >
            <Text style={styles.statLabel}>INACTIVE</Text>
            <Text style={[styles.statVal, { color: '#64748b' }]}>{inactiveCount}</Text>
          </TouchableOpacity>

          <View style={[styles.statCard, isMobile && styles.statCardMobile, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={styles.statLabel}>STREAMING</Text>
            <Text style={[styles.statVal, { color: '#7c3aed' }]}>{streamingCount}</Text>
          </View>
        </View>

        {/* Action Controls & Filters Bar */}
        <View style={[styles.controlsCard, isMobile && styles.controlsCardMobile]}>
          <View style={[styles.controlsRow, isMobile && styles.controlsRowMobile]}>
            {/* Global Search Box */}
            <View style={[styles.searchWrapper, isMobile && styles.searchWrapperMobile]}>
              <Feather name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search across all fields..."
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={(val) => {
                  setSearchQuery(val);
                  setCurrentPage(1);
                }}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                  <Feather name="x" size={14} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Quick Status Filter Tabs */}
            <View style={[styles.filterTabs, isMobile && styles.filterTabsMobile]}>
              {[
                { id: 'ALL', label: 'All', count: devices.length },
                { id: 'LIVE', label: 'Online', count: liveCount },
                { id: 'INACTIVE', label: 'Offline', count: inactiveCount },
              ].map((st) => (
                <TouchableOpacity
                  key={st.id}
                  style={[styles.filterChip, statusFilter === st.id && styles.filterChipActive]}
                  onPress={() => {
                    setStatusFilter(st.id);
                    setCurrentPage(1);
                  }}
                >
                  <Text style={[styles.filterChipText, statusFilter === st.id && styles.filterChipTextActive]}>
                    {st.label} ({st.count})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mobile View Mode & Filter Toggle */}
            {isMobile && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={[styles.mobileFilterToggleBtn, hasActiveFilters && styles.mobileFilterToggleBtnActive]}
                  onPress={() => setMobileFilterOpen(!mobileFilterOpen)}
                >
                  <Feather name="filter" size={13} color={hasActiveFilters ? '#2563eb' : '#64748b'} />
                  <Text style={[styles.mobileFilterToggleText, hasActiveFilters && { color: '#2563eb', fontWeight: '700' }]}>
                    {hasActiveFilters ? 'Filters Active' : 'Column Filters'}
                  </Text>
                  <Feather name={mobileFilterOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#64748b" />
                </TouchableOpacity>

                <View style={styles.viewModeToggle}>
                  <TouchableOpacity
                    style={[styles.viewModeBtn, viewMode === 'cards' && styles.viewModeBtnActive]}
                    onPress={() => setViewMode('cards')}
                  >
                    <Feather name="grid" size={14} color={viewMode === 'cards' ? '#2563eb' : '#64748b'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewModeBtn, viewMode === 'table' && styles.viewModeBtnActive]}
                    onPress={() => setViewMode('table')}
                  >
                    <Feather name="list" size={14} color={viewMode === 'table' ? '#2563eb' : '#64748b'} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Reset All Filters Button */}
            {hasActiveFilters && (
              <TouchableOpacity style={styles.btnResetAll} onPress={resetAllFilters}>
                <Feather name="x-circle" size={14} color="#dc2626" style={{ marginRight: 5 }} />
                <Text style={styles.btnResetAllText}>Clear Filters</Text>
              </TouchableOpacity>
            )}

            {/* Sync Button */}
            <TouchableOpacity
              style={[styles.btnSync, isMobile && styles.btnSyncMobile, refreshing && { opacity: 0.7 }]}
              onPress={() => fetchDevices(1, true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 6 }} />
              ) : (
                <Feather name="refresh-cw" size={14} color="#ffffff" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.btnSyncText}>{refreshing ? 'Syncing...' : 'Sync DHCP'}</Text>
            </TouchableOpacity>
          </View>

          {/* Collapsible Column Filter Panel on Mobile */}
          {isMobile && mobileFilterOpen && (
            <View style={styles.mobileFilterDrawer}>
              <Text style={styles.mobileFilterTitle}>EXCEL COLUMN FILTERS</Text>
              
              <View style={styles.mFilterField}>
                <Text style={styles.mFilterFieldLabel}>IP Address:</Text>
                <TextInput
                  style={styles.mFilterInput}
                  placeholder="Filter by IP..."
                  placeholderTextColor="#94a3b8"
                  value={colFilters.ip}
                  onChangeText={(val) => {
                    setColFilters((f) => ({ ...f, ip: val }));
                    setCurrentPage(1);
                  }}
                />
              </View>

              <View style={styles.mFilterField}>
                <Text style={styles.mFilterFieldLabel}>MAC Address:</Text>
                <TextInput
                  style={styles.mFilterInput}
                  placeholder="Filter by MAC..."
                  placeholderTextColor="#94a3b8"
                  value={colFilters.mac}
                  onChangeText={(val) => {
                    setColFilters((f) => ({ ...f, mac: val }));
                    setCurrentPage(1);
                  }}
                />
              </View>

              <View style={styles.mFilterField}>
                <Text style={styles.mFilterFieldLabel}>Serving Node:</Text>
                <TextInput
                  style={styles.mFilterInput}
                  placeholder="Filter by Node..."
                  placeholderTextColor="#94a3b8"
                  value={colFilters.node}
                  onChangeText={(val) => {
                    setColFilters((f) => ({ ...f, node: val }));
                    setCurrentPage(1);
                  }}
                />
              </View>

              <View style={styles.mFilterField}>
                <Text style={styles.mFilterFieldLabel}>Node IP:</Text>
                <TextInput
                  style={styles.mFilterInput}
                  placeholder="Filter by Node IP..."
                  placeholderTextColor="#94a3b8"
                  value={colFilters.node_ip}
                  onChangeText={(val) => {
                    setColFilters((f) => ({ ...f, node_ip: val }));
                    setCurrentPage(1);
                  }}
                />
              </View>

              <View style={styles.mFilterField}>
                <Text style={styles.mFilterFieldLabel}>Lease End:</Text>
                <TextInput
                  style={styles.mFilterInput}
                  placeholder="Filter by Lease End..."
                  placeholderTextColor="#94a3b8"
                  value={colFilters.lease_end}
                  onChangeText={(val) => {
                    setColFilters((f) => ({ ...f, lease_end: val }));
                    setCurrentPage(1);
                  }}
                />
              </View>

              {hasActiveFilters && (
                <TouchableOpacity style={styles.mFilterClearBtn} onPress={resetAllFilters}>
                  <Text style={styles.mFilterClearBtnText}>Reset All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Content Container (Table or Cards) */}
        <View style={styles.tableCard}>
          {loading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading DHCP devices...</Text>
            </View>
          ) : paginatedDevices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={38} color="#94a3b8" />
              <Text style={styles.emptyText}>No DHCP devices found</Text>
              <Text style={styles.emptySubText}>
                {hasActiveFilters
                  ? 'No devices match your column filters. Click "Clear Filters" to view all.'
                  : 'Click "Sync DHCP" to fetch live client leases from the network.'}
              </Text>
              {hasActiveFilters && (
                <TouchableOpacity style={styles.btnEmptyReset} onPress={resetAllFilters}>
                  <Text style={styles.btnEmptyResetText}>Clear All Filters</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isMobile && viewMode === 'cards' ? (
            /* ===================================================== */
            /* MOBILE VIEW: Responsive Touch-Friendly Card List      */
            /* ===================================================== */
            <View style={styles.mobileListContainer}>
              {paginatedDevices.map((d, idx) => {
                const isLive = String(d.status || '').toUpperCase() === 'LIVE';
                const isLoggingIn = loggingInId === d.id;

                return (
                  <View key={d.id || idx} style={styles.mCard}>
                    {/* Top Row: IP + Status Badge */}
                    <View style={styles.mCardHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.mIpText} selectable>{d.ip || '—'}</Text>
                          {d.ip ? (
                            <TouchableOpacity
                              onPress={() => copyToClipboard(d.ip, 'IP Address')}
                              style={styles.iconCopyBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="copy" size={12} color="#64748b" />
                            </TouchableOpacity>
                          ) : null}
                          {d.streaming ? (
                            <View style={styles.streamingBadge}>
                              <Feather name="play" size={9} color="#7c3aed" />
                              <Text style={styles.streamingText}>Streaming</Text>
                            </View>
                          ) : null}
                        </View>
                        {d.hostname ? (
                          <Text style={styles.mHostnameText} numberOfLines={1}>{d.hostname}</Text>
                        ) : null}
                      </View>

                      {/* Status Badge */}
                      <View
                        style={[
                          styles.mStatusBadge,
                          {
                            backgroundColor: isLive ? '#dcfce7' : '#f1f5f9',
                            borderColor: isLive ? '#86efac' : '#cbd5e1',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: isLive ? '#10b981' : '#94a3b8' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.mStatusText,
                            { color: isLive ? '#047857' : '#64748b' },
                          ]}
                        >
                          {isLive ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>
                    </View>

                    {/* Details Rows */}
                    <View style={styles.mCardBody}>
                      {/* MAC Address */}
                      <View style={styles.mInfoRow}>
                        <Text style={styles.mInfoLabel}>MAC Address:</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.mMacText} selectable>{d.mac || '—'}</Text>
                          {d.mac ? (
                            <TouchableOpacity
                              onPress={() => copyToClipboard(d.mac, 'MAC Address')}
                              style={styles.iconCopyBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Feather name="copy" size={11} color="#64748b" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      {/* Serving Node */}
                      <View style={styles.mInfoRow}>
                        <Text style={styles.mInfoLabel}>Serving Node:</Text>
                        <Text style={styles.mInfoVal} numberOfLines={1}>{d.serving_node || '—'}</Text>
                      </View>

                      {/* Node IP */}
                      <View style={styles.mInfoRow}>
                        <Text style={styles.mInfoLabel}>Node IP:</Text>
                        <Text style={styles.mInfoVal}>{d.node_ip || '—'}</Text>
                      </View>

                      {/* Lease End */}
                      <View style={styles.mInfoRow}>
                        <Text style={styles.mInfoLabel}>Lease End:</Text>
                        <Text style={styles.mDateVal}>{d.lease_end || '—'}</Text>
                      </View>
                    </View>

                    {/* Card Footer: Touch-Friendly Login Button */}
                    <View style={styles.mCardFooter}>
                      <TouchableOpacity
                        style={[
                          styles.mBtnLogin,
                          isLoggingIn && { opacity: 0.65 },
                        ]}
                        onPress={() => handleDeviceLogin(d)}
                        disabled={isLoggingIn}
                      >
                        {isLoggingIn ? (
                          <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                        ) : (
                          <Feather name="log-in" size={15} color="#ffffff" style={{ marginRight: 8 }} />
                        )}
                        <Text style={styles.mBtnLoginText}>
                          {isLoggingIn ? 'Establishing Session...' : 'Login to Web GUI'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* ===================================================== */
            /* DESKTOP TABLE VIEW: Excel Filter Row + Flexible Width */
            /* ===================================================== */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={{ minWidth: 980, width: isMobile ? undefined : '100%' }}
            >
              <View style={[styles.tableContainer, { minWidth: 980, width: '100%' }]}>
                {/* 1. TABLE HEADER ROW */}
                <View style={styles.tableHeaderRow}>
                  <View style={TABLE_COLS.status}>
                    <Text style={styles.thCell}>STATUS</Text>
                  </View>
                  <View style={TABLE_COLS.ip}>
                    <Text style={styles.thCell}>IP ADDRESS</Text>
                  </View>
                  <View style={TABLE_COLS.mac}>
                    <Text style={styles.thCell}>MAC ADDRESS</Text>
                  </View>
                  <View style={TABLE_COLS.node}>
                    <Text style={styles.thCell}>SERVING NODE</Text>
                  </View>
                  <View style={TABLE_COLS.node_ip}>
                    <Text style={styles.thCell}>NODE IP</Text>
                  </View>
                  <View style={TABLE_COLS.lease_end}>
                    <Text style={styles.thCell}>LEASE END</Text>
                  </View>
                  <View style={TABLE_COLS.actions}>
                    <Text style={[styles.thCell, { textAlign: 'center' }]}>ACTION</Text>
                  </View>
                </View>

                {/* 2. EXCEL-STYLE FILTER ROW (Row 1) */}
                <View style={styles.excelFilterRow}>
                  {/* Status: 3-way Segmented Toggle [All | On | Off] */}
                  <View style={TABLE_COLS.status}>
                    <View style={styles.statusToggleWrap}>
                      <TouchableOpacity
                        style={[
                          styles.statusToggleBtn,
                          statusFilter === 'ALL' && styles.statusToggleBtnActiveAll,
                        ]}
                        onPress={() => {
                          setStatusFilter('ALL');
                          setCurrentPage(1);
                        }}
                      >
                        <Text
                          style={[
                            styles.statusToggleBtnText,
                            statusFilter === 'ALL' && styles.statusToggleBtnTextActive,
                          ]}
                        >
                          All
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.statusToggleBtn,
                          statusFilter === 'LIVE' && styles.statusToggleBtnActiveLive,
                        ]}
                        onPress={() => {
                          setStatusFilter('LIVE');
                          setCurrentPage(1);
                        }}
                      >
                        <Text
                          style={[
                            styles.statusToggleBtnText,
                            statusFilter === 'LIVE' && styles.statusToggleBtnTextActiveLive,
                          ]}
                        >
                          On
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.statusToggleBtn,
                          statusFilter === 'INACTIVE' && styles.statusToggleBtnActiveOff,
                        ]}
                        onPress={() => {
                          setStatusFilter('INACTIVE');
                          setCurrentPage(1);
                        }}
                      >
                        <Text
                          style={[
                            styles.statusToggleBtnText,
                            statusFilter === 'INACTIVE' && styles.statusToggleBtnTextActiveOff,
                          ]}
                        >
                          Off
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* IP Search Filter */}
                  <View style={[TABLE_COLS.ip, { paddingRight: 8 }]}>
                    <View style={[styles.colSearchBox, colFilters.ip && styles.colSearchBoxActive]}>
                      <Feather name="search" size={11} color={colFilters.ip ? '#2563eb' : '#94a3b8'} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.colSearchInput}
                        placeholder="Filter IP..."
                        placeholderTextColor="#94a3b8"
                        value={colFilters.ip}
                        onChangeText={(val) => {
                          setColFilters((f) => ({ ...f, ip: val }));
                          setCurrentPage(1);
                        }}
                      />
                      {colFilters.ip ? (
                        <TouchableOpacity onPress={() => setColFilters((f) => ({ ...f, ip: '' }))} style={{ padding: 2 }}>
                          <Feather name="x" size={11} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* MAC Search Filter */}
                  <View style={[TABLE_COLS.mac, { paddingRight: 8 }]}>
                    <View style={[styles.colSearchBox, colFilters.mac && styles.colSearchBoxActive]}>
                      <Feather name="search" size={11} color={colFilters.mac ? '#2563eb' : '#94a3b8'} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.colSearchInput}
                        placeholder="Filter MAC..."
                        placeholderTextColor="#94a3b8"
                        value={colFilters.mac}
                        onChangeText={(val) => {
                          setColFilters((f) => ({ ...f, mac: val }));
                          setCurrentPage(1);
                        }}
                      />
                      {colFilters.mac ? (
                        <TouchableOpacity onPress={() => setColFilters((f) => ({ ...f, mac: '' }))} style={{ padding: 2 }}>
                          <Feather name="x" size={11} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Serving Node Search Filter */}
                  <View style={[TABLE_COLS.node, { paddingRight: 8 }]}>
                    <View style={[styles.colSearchBox, colFilters.node && styles.colSearchBoxActive]}>
                      <Feather name="search" size={11} color={colFilters.node ? '#2563eb' : '#94a3b8'} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.colSearchInput}
                        placeholder="Filter Node..."
                        placeholderTextColor="#94a3b8"
                        value={colFilters.node}
                        onChangeText={(val) => {
                          setColFilters((f) => ({ ...f, node: val }));
                          setCurrentPage(1);
                        }}
                      />
                      {colFilters.node ? (
                        <TouchableOpacity onPress={() => setColFilters((f) => ({ ...f, node: '' }))} style={{ padding: 2 }}>
                          <Feather name="x" size={11} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Node IP Search Filter */}
                  <View style={[TABLE_COLS.node_ip, { paddingRight: 8 }]}>
                    <View style={[styles.colSearchBox, colFilters.node_ip && styles.colSearchBoxActive]}>
                      <Feather name="search" size={11} color={colFilters.node_ip ? '#2563eb' : '#94a3b8'} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.colSearchInput}
                        placeholder="Filter Node IP..."
                        placeholderTextColor="#94a3b8"
                        value={colFilters.node_ip}
                        onChangeText={(val) => {
                          setColFilters((f) => ({ ...f, node_ip: val }));
                          setCurrentPage(1);
                        }}
                      />
                      {colFilters.node_ip ? (
                        <TouchableOpacity onPress={() => setColFilters((f) => ({ ...f, node_ip: '' }))} style={{ padding: 2 }}>
                          <Feather name="x" size={11} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Lease End Search Filter */}
                  <View style={[TABLE_COLS.lease_end, { paddingRight: 8 }]}>
                    <View style={[styles.colSearchBox, colFilters.lease_end && styles.colSearchBoxActive]}>
                      <Feather name="search" size={11} color={colFilters.lease_end ? '#2563eb' : '#94a3b8'} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.colSearchInput}
                        placeholder="Filter Lease..."
                        placeholderTextColor="#94a3b8"
                        value={colFilters.lease_end}
                        onChangeText={(val) => {
                          setColFilters((f) => ({ ...f, lease_end: val }));
                          setCurrentPage(1);
                        }}
                      />
                      {colFilters.lease_end ? (
                        <TouchableOpacity onPress={() => setColFilters((f) => ({ ...f, lease_end: '' }))} style={{ padding: 2 }}>
                          <Feather name="x" size={11} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Action Column Filter / Reset */}
                  <View style={TABLE_COLS.actions}>
                    {hasActiveFilters ? (
                      <TouchableOpacity
                        style={styles.btnColReset}
                        onPress={resetAllFilters}
                        title="Reset all filters"
                      >
                        <Feather name="filter" size={11} color="#dc2626" style={{ marginRight: 3 }} />
                        <Text style={styles.btnColResetText}>Clear</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', opacity: 0.4 }}>
                        <Feather name="filter" size={12} color="#94a3b8" />
                      </View>
                    )}
                  </View>
                </View>

                {/* 3. TABLE DATA ROWS */}
                {paginatedDevices.map((d, idx) => {
                  const isLive = String(d.status || '').toUpperCase() === 'LIVE';
                  const isLoggingIn = loggingInId === d.id;

                  return (
                    <View
                      key={d.id || idx}
                      style={[styles.tableRow, idx % 2 === 1 && styles.tableRowEven]}
                    >
                      {/* Status */}
                      <View style={[TABLE_COLS.status, { flexDirection: 'row', alignItems: 'center' }]}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: isLive ? '#10b981' : '#94a3b8' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusText,
                            { color: isLive ? '#047857' : '#64748b' },
                          ]}
                        >
                          {isLive ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>

                      {/* IP Address */}
                      <View style={TABLE_COLS.ip}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.ipText} selectable>{d.ip || '—'}</Text>
                          {d.ip ? (
                            <TouchableOpacity
                              onPress={() => copyToClipboard(d.ip, 'IP')}
                              style={styles.iconCopyBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name="copy" size={11} color="#94a3b8" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {d.streaming ? (
                          <View style={styles.streamingBadge}>
                            <Feather name="play" size={9} color="#7c3aed" />
                            <Text style={styles.streamingText}>Streaming</Text>
                          </View>
                        ) : null}
                      </View>

                      {/* MAC Address */}
                      <View style={TABLE_COLS.mac}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.macText} selectable>{d.mac || '—'}</Text>
                          {d.mac ? (
                            <TouchableOpacity
                              onPress={() => copyToClipboard(d.mac, 'MAC')}
                              style={styles.iconCopyBtn}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Feather name="copy" size={11} color="#94a3b8" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      {/* Serving Node */}
                      <View style={TABLE_COLS.node}>
                        <Text style={styles.nodeText} numberOfLines={1}>
                          {d.serving_node || '—'}
                        </Text>
                      </View>

                      {/* Node IP */}
                      <View style={TABLE_COLS.node_ip}>
                        <Text style={styles.nodeIpText}>{d.node_ip || '—'}</Text>
                      </View>

                      {/* Lease End */}
                      <View style={TABLE_COLS.lease_end}>
                        <Text style={styles.dateText}>{d.lease_end || '—'}</Text>
                      </View>

                      {/* Action: Login Button */}
                      <View style={TABLE_COLS.actions}>
                        <TouchableOpacity
                          style={[
                            styles.btnLogin,
                            isLoggingIn && { opacity: 0.6 },
                          ]}
                          onPress={() => handleDeviceLogin(d)}
                          disabled={isLoggingIn}
                          title={`Login to ${d.ip}`}
                        >
                          {isLoggingIn ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Feather name="log-in" size={13} color="#ffffff" style={{ marginRight: 5 }} />
                              <Text style={styles.btnLoginText}>Login</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <View style={[styles.paginationRow, isMobile && styles.paginationRowMobile]}>
              <Text style={styles.paginationInfo}>
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, totalItems)} of {totalItems}
              </Text>
              <View style={styles.paginationBtns}>
                <TouchableOpacity
                  style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
                  disabled={currentPage === 1}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <Feather name="chevron-left" size={16} color={currentPage === 1 ? '#cbd5e1' : '#334155'} />
                </TouchableOpacity>

                <Text style={styles.pageNumber}>
                  Page {currentPage} of {totalPages}
                </Text>

                <TouchableOpacity
                  style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
                  disabled={currentPage === totalPages}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  <Feather name="chevron-right" size={16} color={currentPage === totalPages ? '#cbd5e1' : '#334155'} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  scrollContentMobile: {
    padding: 12,
    gap: 12,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statsRowMobile: {
    gap: 8,
  },
  statCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
  },
  statCardMobile: {
    minWidth: '47%',
    flex: 1,
    padding: 12,
  },
  statCardSelected: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.4,
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
  },

  // Controls Bar
  controlsCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  controlsCardMobile: {
    padding: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  controlsRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  searchWrapper: {
    flex: 1,
    minWidth: 220,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
  },
  searchWrapperMobile: {
    width: '100%',
    minWidth: '100%',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    outlineStyle: 'none',
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  filterTabsMobile: {
    justifyContent: 'space-between',
    width: '100%',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  mobileFilterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  mobileFilterToggleBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  mobileFilterToggleText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  mobileFilterDrawer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  mobileFilterTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  mFilterField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mFilterFieldLabel: {
    width: 100,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  mFilterInput: {
    flex: 1,
    height: 34,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    backgroundColor: '#ffffff',
    outlineStyle: 'none',
  },
  mFilterClearBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  mFilterClearBtnText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '700',
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    gap: 3,
  },
  viewModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  btnResetAll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  btnResetAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  btnSync: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 8,
  },
  btnSyncMobile: {
    width: '100%',
  },
  btnSyncText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Table Card
  tableCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  tableContainer: {
    width: '100%',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 50,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  emptySubText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 420,
  },
  btnEmptyReset: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#2563eb',
    borderRadius: 6,
  },
  btnEmptyResetText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Table Header Row
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.4,
  },

  // Excel Filter Row (Row 1)
  excelFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
  },
  statusToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    padding: 2,
    width: 118,
  },
  statusToggleBtn: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    borderRadius: 4,
  },
  statusToggleBtnActiveAll: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleBtnActiveLive: {
    backgroundColor: '#059669',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleBtnActiveOff: {
    backgroundColor: '#475569',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 1,
    elevation: 1,
  },
  statusToggleBtnText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748b',
  },
  statusToggleBtnTextActive: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  statusToggleBtnTextActiveLive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  statusToggleBtnTextActiveOff: {
    color: '#ffffff',
    fontWeight: '800',
  },
  colSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    height: 28,
    paddingHorizontal: 6,
  },
  colSearchBoxActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  colSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0f172a',
    outlineStyle: 'none',
    padding: 0,
  },
  btnColReset: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  btnColResetText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#dc2626',
  },

  // Data Rows
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tableRowEven: {
    backgroundColor: '#fafbfc',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  ipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  streamingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  streamingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  macText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: '#334155',
  },
  nodeText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  nodeIpText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
  },
  btnLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    minWidth: 80,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  btnLoginText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  iconCopyBtn: {
    padding: 2,
  },

  // Mobile Cards List
  mobileListContainer: {
    padding: 10,
    gap: 12,
  },
  mCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    gap: 10,
  },
  mCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  mIpText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  mHostnameText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  mStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  mStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mCardBody: {
    gap: 6,
  },
  mInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  mInfoVal: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  mMacText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: '#334155',
  },
  mDateVal: {
    fontSize: 11.5,
    color: '#475569',
  },
  mCardFooter: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  mBtnLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    height: 42,
    borderRadius: 8,
    width: '100%',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  mBtnLoginText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  paginationRowMobile: {
    flexDirection: 'column',
    gap: 10,
    alignItems: 'center',
  },
  paginationInfo: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  paginationBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
});
