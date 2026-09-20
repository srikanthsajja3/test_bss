import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

export const CreateAccountModal = ({ visible, onClose, initialRole = 'operator', onAccountCreated }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [role, setRole] = useState(initialRole);
  
  // Basic Identity Fields
  const [partnerId, setPartnerId] = useState('');
  const [networkName, setNetworkName] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [operatorCode, setOperatorCode] = useState('');
  const [internalBranchId, setInternalBranchId] = useState('');
  const [parentAdminId, setParentAdminId] = useState('1100');

  // Internet Service Settings & Conditional Base URL / Address
  const [internetEnabled, setInternetEnabled] = useState(true);
  const [internetToken, setInternetToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [address, setAddress] = useState('');

  // IPTV Service Settings & Conditional IPTV Token
  const [iptvEnabled, setIptvEnabled] = useState(true);
  const [iptvToken, setIptvToken] = useState('');

  // Network NAS IP & RADIUS Secret
  const [nasIp, setNasIp] = useState('');
  const [sharedSecret, setSharedSecret] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      const generatedId = Math.floor(1200 + Math.random() * 8800);
      setRole(initialRole || 'operator');
      setError('');
      setPartnerId(String(generatedId));
      setNetworkName('');
      setName('');
      setMobile('');
      setEmail('');
      setOperatorCode('');
      setInternalBranchId('');
      setInternetEnabled(true);
      setInternetToken('');
      setBaseUrl('');
      setAddress('');
      setIptvEnabled(true);
      setIptvToken('');
      setNasIp('');
      setSharedSecret('');
    }
  }, [visible, initialRole]);

  const existingAdmins = OneBssApi.getHierarchyPartners().filter(
    (p) => p.account_role === 'admin' || p.account_role === 'superadmin'
  );

  const handleSubmit = () => {
    if (!networkName.trim() && !name.trim()) {
      setError('Please enter Network Name or Contact Person Name');
      return;
    }
    if (!mobile.trim()) {
      setError('Please enter Mobile Number');
      return;
    }

    const assignedId = Number(partnerId) || Math.floor(1200 + Math.random() * 8800);

    const payload = {
      partner_id: assignedId,
      partner_name: networkName.trim() || name.trim() || `Operator #${assignedId}`,
      company_name: networkName.trim() ? `${networkName.trim()} Telecom` : 'Operator Telecom Services',
      contact_person: name.trim(),
      partner_mobile: mobile.trim(),
      partner_email: email.trim() || `operator_${assignedId}@onebss.in`,
      account_role: role,
      operator_code: operatorCode.trim() || `OPT-${assignedId}`,
      internal_branch_id: internalBranchId.trim() || 'BR-101',
      parent_admin_id: Number(parentAdminId) || 1000,
      
      // Internet Service & Conditional Base URL / Address
      internet_enabled: internetEnabled,
      internet_token: internetEnabled ? internetToken.trim() : '',
      base_url: internetEnabled ? baseUrl.trim() : '',
      address: internetEnabled ? address.trim() : '',

      // IPTV Service & Conditional IPTV Token
      iptv_enabled: iptvEnabled,
      iptv_token: iptvEnabled ? iptvToken.trim() : '',

      // RADIUS Gateway & Session Parameters
      nas_ip: nasIp,
      shared_secret: sharedSecret,
      iptv_gateway: iptvEnabled ? `https://iptv-gateway.onebss.io/api/v1?token=${iptvToken.trim()}` : 'Disabled',
      status: 'enabled',
      wallet_balance: 10000,
    };

    const res = OneBssApi.createHierarchicalPartner(payload);
    if (onAccountCreated) {
      onAccountCreated(res.partner, res.message);
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.dialog, isMobile && styles.dialogMobile]}>
          {/* Modal Title & Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <MaterialCommunityIcons
                name={role === 'admin' ? 'shield-account' : 'account-cog'}
                size={24}
                color={role === 'admin' ? '#8b5cf6' : COLORS.accentEmerald}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  Add {role === 'admin' ? 'Admin' : 'Operator'} Account
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  Fill operator code, assignment, tokens & service configuration
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={COLORS.textMain} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContent} contentContainerStyle={{ padding: isMobile ? 14 : 20 }}>
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Role Type Selector */}
            <Text style={styles.label}>ACCOUNT ROLE TYPE</Text>
            <View style={styles.roleToggleRow}>
              <TouchableOpacity
                style={[styles.roleOption, role === 'admin' && styles.roleOptionAdminActive]}
                onPress={() => setRole('admin')}
              >
                <Feather name="shield" size={15} color={role === 'admin' ? '#ffffff' : COLORS.textMuted} />
                <Text style={[styles.roleOptionText, role === 'admin' && styles.roleOptionTextActive]}>
                  ADMIN ACCOUNT
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleOption, role === 'operator' && styles.roleOptionOperatorActive]}
                onPress={() => setRole('operator')}
              >
                <Feather name="briefcase" size={15} color={role === 'operator' ? '#ffffff' : COLORS.textMuted} />
                <Text style={[styles.roleOptionText, role === 'operator' && styles.roleOptionTextActive]}>
                  OPERATOR ACCOUNT
                </Text>
              </TouchableOpacity>
            </View>

            {/* Section 1: Basic Identity & Codes */}
            <Text style={styles.sectionHeader}>1. OPERATOR IDENTIFICATION & CODES</Text>

            <View style={[styles.row, isMobile && styles.rowMobile]}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>NETWORK NAME *</Text>
                <TextInput
                  style={styles.input}
                  value={networkName}
                  onChangeText={setNetworkName}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>OPERATOR NAME *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </View>

            <View style={[styles.row, isMobile && styles.rowMobile]}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>MOBILE NUMBER *</Text>
                <TextInput
                  style={styles.input}
                  value={mobile}
                  onChangeText={setMobile}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>MAIL ID (EMAIL)</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={[styles.row, isMobile && styles.rowMobile]}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>PARTNER ID</Text>
                <TextInput
                  style={styles.input}
                  value={partnerId}
                  onChangeText={setPartnerId}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>OPERATOR CODE</Text>
                <TextInput
                  style={styles.input}
                  value={operatorCode}
                  onChangeText={setOperatorCode}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>INTERNAL BRANCH ID</Text>
                <TextInput
                  style={styles.input}
                  value={internalBranchId}
                  onChangeText={setInternalBranchId}
                />
              </View>
            </View>

            {/* Operator Assignment / Parent Admin Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>OPERATOR ASSIGNMENT (PARENT ADMIN)</Text>
              <View style={styles.parentSelectContainer}>
                {existingAdmins.map((adm) => (
                  <TouchableOpacity
                    key={adm.partner_id}
                    style={[
                      styles.parentChip,
                      String(parentAdminId) === String(adm.partner_id) && styles.parentChipActive,
                    ]}
                    onPress={() => setParentAdminId(String(adm.partner_id))}
                  >
                    <Text
                      style={[
                        styles.parentChipText,
                        String(parentAdminId) === String(adm.partner_id) && styles.parentChipTextActive,
                      ]}
                    >
                      #{adm.partner_id} - {adm.partner_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Section 2: Internet Service Settings */}
            <Text style={styles.sectionHeader}>2. INTERNET BROADBAND CONFIGURATION</Text>

            <View style={styles.serviceBox}>
              <View style={styles.serviceHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="wifi" size={18} color={internetEnabled ? COLORS.accentEmerald : COLORS.textMuted} />
                  <Text style={styles.serviceTitle}>Internet Broadband Service</Text>
                </View>

                {/* Enable / Disable Toggle Switch */}
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, internetEnabled && styles.toggleBtnEnabled]}
                    onPress={() => setInternetEnabled(true)}
                  >
                    <Text style={[styles.toggleBtnText, internetEnabled && styles.toggleBtnTextActive]}>
                      ENABLE
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !internetEnabled && styles.toggleBtnDisabled]}
                    onPress={() => setInternetEnabled(false)}
                  >
                    <Text style={[styles.toggleBtnText, !internetEnabled && styles.toggleBtnTextActive]}>
                      DISABLE
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>INTERNET TOKEN</Text>
                <TextInput
                  style={styles.input}
                  value={internetToken}
                  onChangeText={setInternetToken}
                />
              </View>

              {/* Conditional Fields: If Enable -> Base URL & Address */}
              {internetEnabled && (
                <View style={styles.conditionalContainer}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>BASE URL (INTERNET ENDPOINT) *</Text>
                    <TextInput
                      style={styles.input}
                      value={baseUrl}
                      onChangeText={setBaseUrl}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>PHYSICAL ADDRESS *</Text>
                    <TextInput
                      style={[styles.input, { height: 54 }]}
                      value={address}
                      onChangeText={setAddress}
                      multiline
                    />
                  </View>
                </View>
              )}
            </View>

            {/* Section 3: IPTV Service Settings */}
            <Text style={styles.sectionHeader}>3. PIONEER IPTV SERVICE CONFIGURATION</Text>

            <View style={styles.serviceBox}>
              <View style={styles.serviceHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialCommunityIcons name="tv-screen-open" size={18} color={iptvEnabled ? '#8b5cf6' : COLORS.textMuted} />
                  <Text style={styles.serviceTitle}>IPTV STB Service</Text>
                </View>

                {/* IPTV Enable / Disable Toggle Switch */}
                <View style={styles.toggleGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, iptvEnabled && styles.toggleBtnPurpleEnabled]}
                    onPress={() => setIptvEnabled(true)}
                  >
                    <Text style={[styles.toggleBtnText, iptvEnabled && styles.toggleBtnTextActive]}>
                      ENABLE
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, !iptvEnabled && styles.toggleBtnDisabled]}
                    onPress={() => setIptvEnabled(false)}
                  >
                    <Text style={[styles.toggleBtnText, !iptvEnabled && styles.toggleBtnTextActive]}>
                      DISABLE
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Conditional Field: If Enable -> IPTV Token */}
              {iptvEnabled ? (
                <View style={styles.conditionalContainer}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>IPTV TOKEN *</Text>
                    <TextInput
                      style={styles.input}
                      value={iptvToken}
                      onChangeText={setIptvToken}
                    />
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
                  IPTV STB middleware integration is currently disabled for this operator.
                </Text>
              )}
            </View>

            {/* Submit & Cancel Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  role === 'admin' ? styles.submitBtnAdmin : styles.submitBtnOperator,
                ]}
                onPress={handleSubmit}
              >
                <Feather name="plus-circle" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>
                  Register {role.toUpperCase()} Account
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.2)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  formContent: {
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  roleToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    gap: 8,
  },
  roleOptionAdminActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#7c3aed',
  },
  roleOptionOperatorActive: {
    backgroundColor: COLORS.accentEmerald,
    borderColor: '#059669',
  },
  roleOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  roleOptionTextActive: {
    color: '#ffffff',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMain,
    marginTop: 14,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: '#ffffff',
  },
  parentSelectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  parentChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  parentChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: COLORS.accentEmerald,
  },
  parentChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  parentChipTextActive: {
    color: COLORS.accentEmerald,
    fontWeight: '700',
  },
  serviceBox: {
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  serviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnEnabled: {
    backgroundColor: COLORS.accentEmerald,
  },
  toggleBtnPurpleEnabled: {
    backgroundColor: '#8b5cf6',
  },
  toggleBtnDisabled: {
    backgroundColor: '#94a3b8',
  },
  toggleBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  conditionalContainer: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  submitBtnAdmin: {
    backgroundColor: '#8b5cf6',
  },
  submitBtnOperator: {
    backgroundColor: COLORS.accentEmerald,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
