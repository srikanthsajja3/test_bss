import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { CreateAccountModal } from '../components/CreateAccountModal';

export const PartnerScreen = ({ onOpenCreate, initialCreateRole, user }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createRole, setCreateRole] = useState('admin');

  useEffect(() => {
    if (initialCreateRole) {
      setCreateRole(initialCreateRole);
      setIsCreateOpen(true);
    }
  }, [initialCreateRole]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await OneBssApi.getPartners(search, selectedRole);
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setPartners(res.data);
      } else {
        setPartners([
          {
            partner_id: 1116,
            partner_name: 'Airtel Broadband Ltd',
            company_name: 'Bharti Airtel Ltd',
            partner_mobile: '9876543210',
            partner_email: 'support@airtel.in',
            account_role: 'operator',
            status: 'enabled',
            nas_ip: '192.168.10.250',
            shared_secret: 'AirtelRadSecret2026',
            iptv_gateway: 'https://iptv-airtel.onebss.io/api/v1',
            active_sessions: 4821,
          },
          {
            partner_id: 1117,
            partner_name: 'Jio Digital Fibre',
            company_name: 'Reliance Jio Infocomm',
            partner_mobile: '9123456789',
            partner_email: 'care@jio.com',
            account_role: 'admin',
            status: 'enabled',
            nas_ip: '10.200.4.15',
            shared_secret: 'JioFibreSecret99',
            iptv_gateway: 'https://iptv-jio.onebss.io/api/v1',
            active_sessions: 8940,
          },
          {
            partner_id: 1118,
            partner_name: 'Act Fibernet',
            company_name: 'Atria Convergence Tech',
            partner_mobile: '9988776655',
            partner_email: 'act@fibernet.in',
            account_role: 'operator',
            status: 'disabled',
            nas_ip: '172.16.88.2',
            shared_secret: 'ActRadSecured77',
            iptv_gateway: 'https://iptv-act.onebss.io/api/v1',
            active_sessions: 0,
          },
          {
            partner_id: 1119,
            partner_name: 'Hathway Cable & Datacom',
            company_name: 'Hathway Digital Ltd',
            partner_mobile: '9765432109',
            partner_email: 'admin@hathway.net',
            account_role: 'operator',
            status: 'enabled',
            nas_ip: '10.10.150.12',
            shared_secret: 'HathwayNasKey33',
            iptv_gateway: 'https://iptv-hathway.onebss.io/api/v1',
            active_sessions: 1420,
          },
          {
            partner_id: 1120,
            partner_name: 'Tata Play Fiber',
            company_name: 'Tata Play Broadband',
            partner_mobile: '9654321098',
            partner_email: 'fiber@tataplay.com',
            account_role: 'operator',
            status: 'enabled',
            nas_ip: '192.168.44.100',
            shared_secret: 'TataPlayRadSecured',
            iptv_gateway: 'https://iptv-tataplay.onebss.io/api/v1',
            active_sessions: 3105,
          },
        ]);
      }
    } catch (e) {
      setPartners([
        {
          partner_id: 1116,
          partner_name: 'Airtel Broadband Ltd',
          company_name: 'Bharti Airtel Ltd',
          partner_mobile: '9876543210',
          partner_email: 'support@airtel.in',
          account_role: 'operator',
          status: 'enabled',
          nas_ip: '192.168.10.250',
          shared_secret: 'AirtelRadSecret2026',
          iptv_gateway: 'https://iptv-airtel.onebss.io/api/v1',
          active_sessions: 4821,
        },
        {
          partner_id: 1117,
          partner_name: 'Jio Digital Fibre',
          company_name: 'Reliance Jio Infocomm',
          partner_mobile: '9123456789',
          partner_email: 'care@jio.com',
          account_role: 'admin',
          status: 'enabled',
          nas_ip: '10.200.4.15',
          shared_secret: 'JioFibreSecret99',
          iptv_gateway: 'https://iptv-jio.onebss.io/api/v1',
          active_sessions: 8940,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [search, selectedRole]);

  const filteredPartners = partners.filter((p) => {
    const query = search.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.partner_name?.toLowerCase().includes(query) ||
      p.company_name?.toLowerCase().includes(query) ||
      p.partner_email?.toLowerCase().includes(query) ||
      p.partner_mobile?.includes(query) ||
      String(p.partner_id).includes(query);

    const matchesRole = !selectedRole || p.account_role?.toLowerCase() === selectedRole.toLowerCase();

    return matchesSearch && matchesRole;
  });

  const togglePartnerStatus = (partnerId) => {
    setPartners((prev) =>
      prev.map((p) => {
        if (p.partner_id === partnerId) {
          const newStatus = p.status === 'enabled' ? 'disabled' : 'enabled';
          setToastMsg(`Partner #${partnerId} status updated to ${newStatus.toUpperCase()}`);
          setTimeout(() => setToastMsg(''), 4000);
          return { ...p, status: newStatus };
        }
        return p;
      })
    );
  };

  const handleOpenCreate = (role = 'admin') => {
    setCreateRole(role);
    setIsCreateOpen(true);
    if (onOpenCreate) onOpenCreate(role);
  };

  const handleAccountCreated = (newPartner, msg) => {
    setToastMsg(msg || `New ${newPartner.account_role.toUpperCase()} #${newPartner.partner_id} created successfully!`);
    fetchPartners();
    setTimeout(() => setToastMsg(''), 5000);
  };

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
      {/* Toast Notification Banner */}
      {toastMsg ? (
        <View style={styles.toastContainer}>
          <Feather name="check-circle" size={16} color="#ffffff" />
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* Header & Add Admin / Add Operator Buttons */}
      <View style={[styles.topRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 12 }]}>
        <View>
          <Text style={[styles.title, isMobile && { fontSize: 18 }]}>Partner & Gateway Console</Text>
          <Text style={styles.subtitle}>
            Manage telecom operators, RADIUS servers, and IPTV gateway bindings in a structured table
          </Text>
        </View>
        {user?.role !== 'operator' && (
          <View style={[styles.actionBtnGroup, isMobile && { width: '100%', flexDirection: 'row' }]}>
            <TouchableOpacity
              style={[styles.addAdminBtn, isMobile && { flex: 1, justifyContent: 'center' }]}
              onPress={() => handleOpenCreate('admin')}
            >
              <Feather name="shield" size={15} color="#fff" />
              <Text style={styles.addAdminBtnText}>Add Admin</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addOperatorBtn, isMobile && { flex: 1, justifyContent: 'center' }]}
              onPress={() => handleOpenCreate('operator')}
            >
              <Feather name="briefcase" size={15} color="#fff" />
              <Text style={styles.addOperatorBtnText}>Add Operator</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Filter Controls Row */}
      <View style={[styles.filterRow, isMobile && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
        <View style={[styles.searchBox, isMobile && { maxWidth: '100%', width: '100%', height: 42 }]}>
          <Feather name="search" size={16} color={COLORS.textDim} />
          <TextInput
            style={[styles.searchInput, isMobile && { fontSize: 13 }]}
            placeholder={isMobile ? "Search partners, email, mobile, ID..." : "Search by partner name, company, email, mobile, or ID..."}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={[styles.roleFilters, isMobile && { width: '100%', justifyContent: 'space-between' }]}>
          {['', 'operator', 'admin'].map((role) => (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleChip,
                isMobile && { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4 },
                selectedRole === role && styles.roleChipActive,
              ]}
              onPress={() => setSelectedRole(role)}
            >
              <Text style={[styles.roleChipText, selectedRole === role && styles.roleChipTextActive]}>
                {role === '' ? 'All Roles' : role.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* STRUCTURED DATA TABLE VIEW */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name="table-large" size={18} color={COLORS.primary} />
            <Text style={styles.cardTitle}>
              Partner & Operator Accounts Registry ({filteredPartners.length} Total Records)
            </Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 40 }} />
        ) : isMobile ? (
          <View style={{ padding: 12, gap: 12 }}>
            {filteredPartners.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No partner records matched your filter criteria.</Text>
              </View>
            ) : (
              filteredPartners.map((item) => {
                const isEnabled = item.status === 'enabled';
                return (
                  <View key={item.partner_id} style={styles.mobileCard}>
                    <View style={styles.mobileCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <View style={styles.idBadge}>
                          <Text style={styles.idText}>#{item.partner_id}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSelectedPartner(item)} style={{ flex: 1 }}>
                          <Text style={styles.partnerNameText} numberOfLines={1}>{item.partner_name}</Text>
                          <Text style={styles.companyNameText} numberOfLines={1}>{item.company_name}</Text>
                        </TouchableOpacity>
                      </View>
                      <View
                        style={[
                          styles.roleBadge,
                          item.account_role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeOperator,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            item.account_role === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextOperator,
                          ]}
                        >
                          {(item.account_role || 'operator').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileCardBody}>
                      <View style={styles.contactRow}>
                        <Feather name="phone" size={12} color={COLORS.textMuted} />
                        <Text style={styles.contactText}>{item.partner_mobile || 'N/A'}</Text>
                      </View>
                      <View style={styles.contactRow}>
                        <Feather name="mail" size={12} color={COLORS.textMuted} />
                        <Text style={styles.contactText}>{item.partner_email || 'N/A'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text style={styles.monoText}>NAS: {item.nas_ip || '192.168.10.250'}</Text>
                        <Text style={styles.subMonoText}>
                          Sessions: {item.active_sessions !== undefined ? item.active_sessions.toLocaleString() : '1,200'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.mobileCardFooter}>
                      <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                        <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                          <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                          <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                            {isEnabled ? 'ENABLED' : 'DISABLED'}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.btnGatewayConfig}
                        onPress={() => setSelectedPartner(item)}
                      >
                        <Feather name="sliders" size={12} color={COLORS.primary} />
                        <Text style={styles.btnGatewayConfigText}>Gateways & Details</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={{ width: '100%' }}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 0.8 }]}>ID</Text>
              <Text style={[styles.th, { flex: 2.2 }]}>Partner & Company Name</Text>
              <Text style={[styles.th, { flex: 2.2 }]}>Contact Info (Mobile / Email)</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Account Role</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Gateway & RADIUS</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Status</Text>
              <Text style={[styles.th, { flex: 1.6, textAlign: 'right' }]}>Actions</Text>
            </View>

            {filteredPartners.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="info" size={24} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No partner records matched your filter criteria.</Text>
              </View>
            ) : (
              filteredPartners.map((item) => {
                const isEnabled = item.status === 'enabled';
                return (
                  <View key={item.partner_id} style={styles.tr}>
                    <View style={[{ flex: 0.8 }, styles.td]}>
                      <View style={styles.idBadge}>
                        <Text style={styles.idText}>#{item.partner_id}</Text>
                      </View>
                    </View>

                    <View style={[{ flex: 2.2 }, styles.td]}>
                      <TouchableOpacity onPress={() => setSelectedPartner(item)}>
                        <Text style={styles.partnerNameText}>{item.partner_name}</Text>
                        <Text style={styles.companyNameText}>{item.company_name}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[{ flex: 2.2 }, styles.td]}>
                      <View style={styles.contactRow}>
                        <Feather name="phone" size={12} color={COLORS.textMuted} />
                        <Text style={styles.contactText}>{item.partner_mobile || 'N/A'}</Text>
                      </View>
                      <View style={styles.contactRow}>
                        <Feather name="mail" size={12} color={COLORS.textMuted} />
                        <Text style={styles.contactText}>{item.partner_email || 'N/A'}</Text>
                      </View>
                    </View>

                    <View style={[{ flex: 1.2 }, styles.td]}>
                      <View
                        style={[
                          styles.roleBadge,
                          item.account_role === 'admin' ? styles.roleBadgeAdmin : styles.roleBadgeOperator,
                        ]}
                      >
                        <Text
                          style={[
                            styles.roleBadgeText,
                            item.account_role === 'admin' ? styles.roleBadgeTextAdmin : styles.roleBadgeTextOperator,
                          ]}
                        >
                          {(item.account_role || 'operator').toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={[{ flex: 1.5 }, styles.td]}>
                      <Text style={styles.monoText}>NAS: {item.nas_ip || '192.168.10.250'}</Text>
                      <Text style={styles.subMonoText}>
                        Sessions: {item.active_sessions !== undefined ? item.active_sessions.toLocaleString() : '1,200'}
                      </Text>
                    </View>

                    <View style={[{ flex: 1.2 }, styles.td]}>
                      <TouchableOpacity onPress={() => togglePartnerStatus(item.partner_id)}>
                        <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
                          <View style={[styles.statusDot, isEnabled ? styles.dotEnabled : styles.dotDisabled]} />
                          <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
                            {isEnabled ? 'ENABLED' : 'DISABLED'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    <View style={[{ flex: 1.6, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }, styles.td]}>
                      <TouchableOpacity
                        style={styles.btnGatewayConfig}
                        onPress={() => setSelectedPartner(item)}
                      >
                        <Feather name="sliders" size={12} color={COLORS.primary} />
                        <Text style={styles.btnGatewayConfigText}>Gateways</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* GATEWAY CONFIGURATIONS MODAL */}
      {selectedPartner && (
        <Modal visible={!!selectedPartner} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialCommunityIcons name="server-network" size={24} color={COLORS.primary} />
                  <View>
                    <Text style={styles.modalTitle}>{selectedPartner.partner_name}</Text>
                    <Text style={styles.modalSubtitle}>
                      {selectedPartner.company_name} (ID: #{selectedPartner.partner_id})
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => setSelectedPartner(null)} style={styles.closeBtn}>
                  <Feather name="x" size={20} color={COLORS.textMain} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ padding: 20 }}>
                <Text style={styles.configSectionTitle}>Operator Codes & Assignment Parameters</Text>
                
                <View style={styles.configGrid}>
                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Partner ID</Text>
                    <Text style={styles.configValue}>#{selectedPartner.partner_id}</Text>
                  </View>

                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Operator Code</Text>
                    <Text style={[styles.configValue, { color: COLORS.primary }]}>
                      {selectedPartner.operator_code || `OPT-${selectedPartner.partner_id}`}
                    </Text>
                  </View>

                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Internal Branch ID</Text>
                    <Text style={styles.configValue}>
                      {selectedPartner.internal_branch_id || `BR-${selectedPartner.partner_id}`}
                    </Text>
                  </View>

                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Parent Admin Assignment</Text>
                    <Text style={[styles.configValue, { color: '#8b5cf6' }]}>
                      Admin #{selectedPartner.parent_admin_id || 1000}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.configSectionTitle, { marginTop: 18 }]}>Internet Service & Gateway Parameters</Text>
                
                <View style={styles.configGrid}>
                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Internet Status</Text>
                    <Text style={[styles.configValue, { color: selectedPartner.internet_enabled !== false ? COLORS.accentEmerald : COLORS.accentRose }]}>
                      {selectedPartner.internet_enabled !== false ? 'ENABLED' : 'DISABLED'}
                    </Text>
                  </View>

                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>Internet Token</Text>
                    <Text style={[styles.configValue, { fontSize: 11 }]}>
                      {selectedPartner.internet_token || `inet_tok_${selectedPartner.partner_id}`}
                    </Text>
                  </View>

                  <View style={[styles.configBox, { width: '100%' }]}>
                    <Text style={styles.configLabel}>Base URL Endpoint</Text>
                    <Text style={[styles.configValue, { color: COLORS.accentCyan, fontSize: 12 }]}>
                      {selectedPartner.base_url || '-'}
                    </Text>
                  </View>

                  <View style={[styles.configBox, { width: '100%' }]}>
                    <Text style={styles.configLabel}>Physical Address</Text>
                    <Text style={[styles.configValue, { fontSize: 12 }]}>
                      {selectedPartner.address || '-'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.configSectionTitle, { marginTop: 18 }]}>Pioneer IPTV STB Service & Token</Text>
                
                <View style={styles.configGrid}>
                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>IPTV Status</Text>
                    <Text style={[styles.configValue, { color: selectedPartner.iptv_enabled !== false ? COLORS.accentEmerald : COLORS.accentRose }]}>
                      {selectedPartner.iptv_enabled !== false ? 'ENABLED' : 'DISABLED'}
                    </Text>
                  </View>

                  <View style={styles.configBox}>
                    <Text style={styles.configLabel}>IPTV Token</Text>
                    <Text style={[styles.configValue, { fontSize: 11, color: '#8b5cf6' }]}>
                      {selectedPartner.iptv_token || `iptv_tok_${selectedPartner.partner_id}`}
                    </Text>
                  </View>

                  <View style={[styles.configBox, { width: '100%' }]}>
                    <Text style={styles.configLabel}>IPTV Gateway API Endpoint</Text>
                    <Text style={[styles.configValue, { color: COLORS.accentCyan, fontSize: 12 }]}>
                      {selectedPartner.iptv_gateway || 'https://iptv-gateway.onebss.io/api/v1'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setSelectedPartner(null)}
                >
                  <Text style={styles.modalDoneBtnText}>Done & Close Console</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* CREATE ACCOUNT (ADD ADMIN / ADD OPERATOR) MODAL */}
      <CreateAccountModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        initialRole={createRole}
        onAccountCreated={handleAccountCreated}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.bgPrimary,
  },
  content: {
    width: '100%',
    paddingHorizontal: '3%',
    paddingVertical: 20,
  },
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  actionBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  addAdminBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  addAdminBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  addOperatorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentEmerald,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    shadowColor: COLORS.accentEmerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  addOperatorBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  searchBox: {
    flex: 1,
    maxWidth: 460,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMain,
    outlineStyle: 'none',
  },
  roleFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleChipTextActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  tableContainer: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    alignItems: 'center',
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.6)',
    alignItems: 'center',
  },
  td: {
    justifyContent: 'center',
  },
  idBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  idText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  partnerNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  companyNameText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: {
    fontSize: 11,
    color: COLORS.textMain,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  roleBadgeAdmin: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  roleBadgeOperator: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  roleBadgeTextAdmin: {
    color: '#8b5cf6',
  },
  roleBadgeTextOperator: {
    color: COLORS.accentEmerald,
  },
  monoText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: COLORS.textMain,
  },
  subMonoText: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
    alignSelf: 'flex-start',
  },
  tagEnabled: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  tagDisabled: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotEnabled: {
    backgroundColor: '#10b981',
  },
  dotDisabled: {
    backgroundColor: '#f43f5e',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagTextEnabled: {
    color: COLORS.accentEmerald,
  },
  tagTextDisabled: {
    color: COLORS.accentRose,
  },
  btnGatewayConfig: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  btnGatewayConfigText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  configSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  configGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  configBox: {
    width: '48%',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  configLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  configValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  modalDoneBtn: {
    marginTop: 24,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },

  // Mobile card styling
  mobileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 14,
    gap: 10,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
    elevation: 2,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  mobileCardBody: {
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  mobileCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
});
