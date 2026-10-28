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
  status:    { width: 90 },
  ip:        { flex: 1.4, minWidth: 140 },
  mac:       { flex: 1.6, minWidth: 150 },
  node:      { flex: 2.0, minWidth: 170 },
  node_ip:   { flex: 1.2, minWidth: 125 },
  lease_end: { flex: 1.5, minWidth: 145 },
  actions:   { width: 105, alignItems: 'center' },
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

  // Filtered devices list
  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      // Status filter
      if (statusFilter !== 'ALL') {
        const devStatus = String(d.status || '').toUpperCase();
        if (statusFilter === 'LIVE' && devStatus !== 'LIVE') return false;
        if (statusFilter === 'INACTIVE' && devStatus === 'LIVE') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ip = String(d.ip || '').toLowerCase();
        const mac = String(d.mac || '').toLowerCase();
        const node = String(d.serving_node || '').toLowerCase();
        const nodeIp = String(d.node_ip || '').toLowerCase();
        const host = String(d.hostname || '').toLowerCase();
        return ip.includes(q) || mac.includes(q) || node.includes(q) || nodeIp.includes(q) || host.includes(q);
      }
      return true;
    });
  }, [devices, statusFilter, searchQuery]);

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

        {/* Action Controls & Filters */}
        <View style={[styles.controlsCard, isMobile && styles.controlsCardMobile]}>
          <View style={[styles.controlsRow, isMobile && styles.controlsRowMobile]}>
            {/* Search Box */}
            <View style={[styles.searchWrapper, isMobile && styles.searchWrapperMobile]}>
              <Feather name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by IP, MAC, Node..."
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

            {/* Status Filter Tabs */}
            <View style={[styles.filterTabs, isMobile && styles.filterTabsMobile]}>
              {[
                { id: 'ALL', label: 'All', count: devices.length },
                { id: 'LIVE', label: 'Live', count: liveCount },
                { id: 'INACTIVE', label: 'Inactive', count: inactiveCount },
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

            {/* View Mode Toggle (Mobile / Tablet) */}
            {isMobile && (
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
                {searchQuery ? 'Try clearing your search query' : 'Click "Sync DHCP" to fetch live client leases'}
              </Text>
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
                          {isLive ? 'LIVE' : 'OFFLINE'}
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
            /* DESKTOP TABLE VIEW: Flexible, Responsive Full Width   */
            /* ===================================================== */
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={{ minWidth: 960, width: isMobile ? undefined : '100%' }}
            >
              <View style={[styles.tableContainer, { minWidth: 960, width: '100%' }]}>
                {/* Table Header */}
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

                {/* Table Rows */}
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
                          {isLive ? 'LIVE' : 'OFF'}
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

  // Controls
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
    height: 40,
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
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    gap: 3,
    alignSelf: 'flex-start',
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
  btnSync: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    height: 40,
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
  },

  // Table Structure
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
