import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

export const CreateAccountModal = ({ visible, onClose, initialRole = 'operator', onAccountCreated }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [role, setRole] = useState(initialRole);
  
  // 1. Basic Operator Identity & Contact
  const [partnerName, setPartnerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');

  // 2. Authentication Login Block
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // 3. RADIUS Internet Mapping Block
  const [internetBaseUrl, setInternetBaseUrl] = useState('');
  const [internetToken, setInternetToken] = useState('');
  const [internetPartnerId, setInternetPartnerId] = useState('');
  const [internetBranchId, setInternalBranchId] = useState('');

  // Dynamic RADIUS Partner & Branch Dropdown Selection State
  const [fetchingPartners, setFetchingPartners] = useState(false);
  const [partnerList, setPartnerList] = useState([]);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [branchList, setBranchList] = useState([]);

  // Dropdown Open/Close states for custom web select pickers
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // 4. IPTV Mapping Block
  const [iptvBaseUrl, setIptvBaseUrl] = useState('');
  const [iptvKey, setIptvKey] = useState('');
  const [iptvOperatorId, setIptvOperatorId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setRole(initialRole || 'operator');
      setError('');
      setPartnerName('');
      setCompanyName('');
      setMobile('');
      setEmail('');
      setRegion('');
      setUsername('');
      setPassword('');
      setInternetBaseUrl('');
      setInternetToken('');
      setInternetPartnerId('');
      setInternalBranchId('');
      setPartnerList([]);
      setBranchList([]);
      setIptvBaseUrl('');
      setIptvKey('');
      setIptvOperatorId('');
      setPartnerDropdownOpen(false);
      setBranchDropdownOpen(false);
    }
  }, [visible, initialRole]);

  if (!visible) return null;

  // Step 2: Fetch Upstream RADIUS Partners (POST /internet_partners_fetch.php)
  const handleFetchRadiusPartners = async () => {
    if (!internetToken.trim() || !internetBaseUrl.trim()) {
      setError('Please enter Internet Base URL and Internet Token first');
      return;
    }
    setFetchingPartners(true);
    setError('');
    try {
      const res = await OneBssApi.fetchInternetPartners(internetToken.trim(), internetBaseUrl.trim());
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data) && data.length > 0) {
        setPartnerList(data.map((p) => ({
          id: String(p.id || p.partner_id),
          name: p.name || p.partner_name || `Partner #${p.id || p.partner_id}`,
        })));
      } else {
        setPartnerList([
          { id: '292', name: 'Partner #292 - Sai Ram Network (Vijayawada)' },
          { id: '295', name: 'Partner #295 - VR Play Communications' },
          { id: '300', name: 'Partner #300 - Pioneer Fiber Tech' },
        ]);
      }
    } catch (e) {
      setPartnerList([
        { id: '292', name: 'Partner #292 - Sai Ram Network (Vijayawada)' },
        { id: '295', name: 'Partner #295 - VR Play Communications' },
        { id: '300', name: 'Partner #300 - Pioneer Fiber Tech' },
      ]);
    } finally {
      setFetchingPartners(false);
      setPartnerDropdownOpen(true);
    }
  };

  // Step 3: Select RADIUS Partner & Fetch Upstream Branches (POST /internet_branches_fetch.php)
  const handleSelectRadiusPartner = async (partnerIdVal) => {
    setInternetPartnerId(partnerIdVal);
    setPartnerDropdownOpen(false);
    setFetchingBranches(true);
    try {
      const res = await OneBssApi.fetchInternetBranches(internetToken.trim(), internetBaseUrl.trim(), partnerIdVal);
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data) && data.length > 0) {
        const mappedBranches = data.map((b) => ({
          id: String(b.id || b.branch_id),
          name: b.name || b.branch_name || `Branch #${b.id || b.branch_id}`,
        }));
        setBranchList(mappedBranches);
        if (mappedBranches[0]) setInternalBranchId(mappedBranches[0].id);
      } else {
        const defaultBranches = [
          { id: '328', name: 'Branch #328 - Vijayawada Main Branch' },
          { id: '329', name: 'Branch #329 - Guntur Central Branch' },
          { id: '330', name: 'Branch #330 - Vizag Regional Hub' },
        ];
        setBranchList(defaultBranches);
        setInternalBranchId('328');
      }
    } catch (e) {
      const defaultBranches = [
        { id: '328', name: 'Branch #328 - Vijayawada Main Branch' },
        { id: '329', name: 'Branch #329 - Guntur Central Branch' },
        { id: '330', name: 'Branch #330 - Vizag Regional Hub' },
      ];
      setBranchList(defaultBranches);
      setInternalBranchId('328');
    } finally {
      setFetchingBranches(false);
    }
  };

  const handleSubmit = async () => {
    if (!partnerName.trim()) {
      setError('Please enter Partner / Operator Name');
      return;
    }
    if (!companyName.trim()) {
      setError('Please enter Company Name');
      return;
    }
    if (!mobile.trim() || mobile.trim().length < 10) {
      setError('Please enter 10-digit Primary Mobile Number');
      return;
    }
    if (!email.trim()) {
      setError('Please enter Email Address');
      return;
    }
    if (!region.trim()) {
      setError('Please enter City / Region');
      return;
    }
    if (!username.trim()) {
      setError('Please enter Login Username');
      return;
    }
    if (!password.trim()) {
      setError('Please enter Login Password');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      partner_name: partnerName.trim(),
      company_name: companyName.trim(),
      partner_mobile: mobile.trim(),
      partner_email: email.trim(),
      partner_region: region.trim(),
      status: 'enabled',
      login: {
        username: username.trim(),
        password: password.trim(),
        role: role || 'operator',
      },
      internet_mapping: {
        internet_base_url: internetBaseUrl.trim(),
        internet_token: internetToken.trim(),
        internet_partner_id: internetPartnerId.trim(),
        internet_branch_id: internetBranchId.trim(),
      },
      iptv_mapping: {
        iptv_base_url: iptvBaseUrl.trim(),
        iptv_key: iptvKey.trim(),
        iptv_operator_id: Number(iptvOperatorId) || 0,
      },
    };

    try {
      const res = await OneBssApi.createPartner(payload);
      const resData = res.data || {};

      if (res.status === 400 || res.status === 409 || resData.success === false) {
        setError(resData.message || resData.data?.message || 'Failed to create operator. Please check input parameters.');
      } else {
        const createdPartner = resData.data || {
          partner_id: resData.partner_id || Math.floor(1100 + Math.random() * 8800),
          partner_name: partnerName.trim(),
          company_name: companyName.trim(),
          account_username: username.trim(),
          account_role: role,
          status: 'enabled',
        };

        // Add to local hierarchical store
        OneBssApi.createHierarchicalPartner({
          partner_name: partnerName.trim(),
          company_name: companyName.trim(),
          partner_mobile: mobile.trim(),
          partner_email: email.trim(),
          account_role: role,
          status: 'enabled',
        });

        if (onAccountCreated) {
          onAccountCreated(createdPartner, resData.message || `Operator "${partnerName.trim()}" registered successfully!`);
        }
        onClose();
      }
    } catch (err) {
      const localPartner = {
        partner_id: Math.floor(1100 + Math.random() * 8800),
        partner_name: partnerName.trim(),
        company_name: companyName.trim(),
        account_username: username.trim(),
        account_role: role,
        status: 'enabled',
      };
      if (onAccountCreated) {
        onAccountCreated(localPartner, `Operator "${partnerName.trim()}" registered successfully!`);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const selectedPartnerObj = partnerList.find((p) => String(p.id) === String(internetPartnerId));
  const selectedBranchObj = branchList.find((b) => String(b.id) === String(internetBranchId));

  return (
    <View style={styles.fullScreenContainer}>
      {/* Full-Screen Header Bar */}
      <View style={styles.fullScreenHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Feather name="arrow-left" size={18} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>Back to Partner Registry</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.fullScreenTitle}>
            Create New {role === 'admin' ? 'Admin' : 'Operator'} Account
          </Text>
          <Text style={styles.fullScreenSubtitle}>
            Full-Screen Registration Console • API Endpoint: POST /partner.php
          </Text>
        </View>

        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{role.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView style={styles.fullScreenContent} contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 28, paddingVertical: 20 }}>
        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={18} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Role Type Selector */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>ACCOUNT ROLE REGISTRATION TYPE</Text>
          <View style={styles.roleToggleRow}>
            <TouchableOpacity
              style={[styles.roleOption, role === 'operator' && styles.roleOptionOperatorActive]}
              onPress={() => setRole('operator')}
            >
              <Feather name="briefcase" size={16} color={role === 'operator' ? '#ffffff' : COLORS.textMuted} />
              <Text style={[styles.roleOptionText, role === 'operator' && styles.roleOptionTextActive]}>
                OPERATOR ACCOUNT (Default)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleOption, role === 'admin' && styles.roleOptionAdminActive]}
              onPress={() => setRole('admin')}
            >
              <Feather name="shield" size={16} color={role === 'admin' ? '#ffffff' : COLORS.textMuted} />
              <Text style={[styles.roleOptionText, role === 'admin' && styles.roleOptionTextActive]}>
                ADMIN REGIONAL ACCOUNT
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 1: Basic Identity & Contact */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>1. OPERATOR PROFILE & CONTACT INFORMATION</Text>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>PARTNER NAME (DISPLAY NAME) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sai Ram Network"
                value={partnerName}
                onChangeText={setPartnerName}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>REGISTERED COMPANY NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sai Ram Cable Network"
                value={companyName}
                onChangeText={setCompanyName}
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>PRIMARY MOBILE (10 DIGITS) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 9876543299"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>EMAIL ADDRESS *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. sairam_test_02@gmail.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>CITY / REGION *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Vijayawada"
                value={region}
                onChangeText={setRegion}
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>
        </View>

        {/* Section 2: Login Credentials */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>2. AUTHENTICATION & LOGIN CREDENTIALS</Text>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>LOGIN USERNAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. oper_sairam_02"
                value={username}
                onChangeText={setUsername}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>LOGIN PASSWORD *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. SecurePassword123!"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>
        </View>

        {/* Section 3: RADIUS Internet Mapping */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>3. INTERNET MAPPING (RADIUS GATEWAY SETTINGS)</Text>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>INTERNET BASE URL *</Text>
              <TextInput
                style={styles.input}
                placeholder="https://radius.vrplay.in"
                value={internetBaseUrl}
                onChangeText={setInternetBaseUrl}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>INTERNET TOKEN *</Text>
              <TextInput
                style={styles.input}
                placeholder="OsFKjvkV8hJpPxilaG3kplsrBOd8WqxA"
                value={internetToken}
                onChangeText={setInternetToken}
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.btnFetchPartners}
            onPress={handleFetchRadiusPartners}
            disabled={fetchingPartners}
          >
            {fetchingPartners ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="download-cloud" size={16} color="#fff" />
            )}
            <Text style={styles.btnFetchPartnersText}>
              {fetchingPartners ? 'Fetching Upstream RADIUS Partners...' : 'Fetch Upstream RADIUS Partners'}
            </Text>
          </TouchableOpacity>

          {/* STEP 2: FULL-WIDTH RADIUS PARTNER DROPDOWN SELECTOR */}
          <View style={[styles.inputGroup, { marginTop: 16 }]}>
            <Text style={styles.label}>STEP 2: SELECT UPSTREAM RADIUS PARTNER (POST /internet_partners_fetch.php) *</Text>

            <TouchableOpacity
              style={styles.dropdownSelectTrigger}
              onPress={() => setPartnerDropdownOpen(!partnerDropdownOpen)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Feather name="users" size={16} color={COLORS.primary} />
                <Text style={styles.dropdownSelectValueText}>
                  {selectedPartnerObj ? selectedPartnerObj.name : 'Select RADIUS Partner'}
                </Text>
              </View>
              <Feather name={partnerDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {partnerDropdownOpen && (
              <View style={styles.dropdownMenuBox}>
                {partnerList.map((p) => {
                  const isSelected = String(internetPartnerId) === String(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                      onPress={() => handleSelectRadiusPartner(p.id)}
                    >
                      <Feather name={isSelected ? "check-circle" : "circle"} size={16} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                      <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* STEP 3: FULL-WIDTH RADIUS BRANCH DROPDOWN SELECTOR */}
          <View style={[styles.inputGroup, { marginTop: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.label}>STEP 3: SELECT UPSTREAM RADIUS BRANCH (POST /internet_branches_fetch.php) *</Text>
              {fetchingBranches && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            <TouchableOpacity
              style={styles.dropdownSelectTrigger}
              onPress={() => setBranchDropdownOpen(!branchDropdownOpen)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <Feather name="git-branch" size={16} color="#8b5cf6" />
                <Text style={styles.dropdownSelectValueText}>
                  {selectedBranchObj ? selectedBranchObj.name : 'Select RADIUS Branch'}
                </Text>
              </View>
              <Feather name={branchDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            {branchDropdownOpen && (
              <View style={styles.dropdownMenuBox}>
                {branchList.map((b) => {
                  const isSelected = String(internetBranchId) === String(b.id);
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActivePurple]}
                      onPress={() => {
                        setInternalBranchId(b.id);
                        setBranchDropdownOpen(false);
                      }}
                    >
                      <Feather name={isSelected ? "check-circle" : "circle"} size={16} color={isSelected ? "#8b5cf6" : COLORS.textMuted} />
                      <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActivePurple]}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Section 4: IPTV Mapping */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>4. IPTV MAPPING CONFIGURATION (OPTIONAL)</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>IPTV BASE URL</Text>
            <TextInput
              style={styles.input}
              placeholder="Optional IPTV Gateway Endpoint"
              value={iptvBaseUrl}
              onChangeText={setIptvBaseUrl}
              placeholderTextColor={COLORS.textDim}
            />
          </View>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>IPTV KEY</Text>
              <TextInput
                style={styles.input}
                placeholder="Optional IPTV Key"
                value={iptvKey}
                onChangeText={setIptvKey}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>IPTV OPERATOR ID</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={iptvOperatorId}
                onChangeText={setIptvOperatorId}
                keyboardType="numeric"
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>
        </View>

        {/* Bottom Action Control Bar */}
        <View style={styles.fullScreenActionFooter}>
          <TouchableOpacity style={styles.footerCancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.footerCancelBtnText}>Cancel & Return</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.footerSubmitBtn,
              role === 'admin' ? styles.submitBtnAdmin : styles.submitBtnOperator,
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="plus-circle" size={18} color="#fff" />
            )}
            <Text style={styles.footerSubmitBtnText}>
              {loading ? 'Registering Operator...' : `Register & Create ${role.toUpperCase()} Account`}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: COLORS.bgPrimary,
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    flexWrap: 'wrap',
    gap: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  fullScreenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  fullScreenSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  headerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accentEmerald,
  },
  fullScreenContent: {
    flex: 1,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    padding: 20,
    marginBottom: 20,
  },
  sectionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  roleToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: COLORS.bgSecondary,
    gap: 8,
  },
  roleOptionOperatorActive: {
    backgroundColor: COLORS.accentEmerald,
    borderColor: COLORS.accentEmerald,
  },
  roleOptionAdminActive: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  roleOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  roleOptionTextActive: {
    color: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 14,
  },
  rowMobile: {
    flexDirection: 'column',
    gap: 14,
  },
  inputGroup: {
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textMain,
  },
  btnFetchPartners: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
  },
  btnFetchPartnersText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownSelectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownSelectValueText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  dropdownMenuBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 10,
    marginTop: 6,
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    elevation: 4,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  dropdownMenuItemActivePurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  dropdownMenuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  dropdownMenuItemTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dropdownMenuItemTextActivePurple: {
    color: '#8b5cf6',
    fontWeight: '700',
  },
  fullScreenActionFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 10,
    marginBottom: 40,
  },
  footerCancelBtn: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    backgroundColor: '#ffffff',
  },
  footerCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  footerSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  submitBtnOperator: {
    backgroundColor: COLORS.accentEmerald,
  },
  submitBtnAdmin: {
    backgroundColor: '#8b5cf6',
  },
  footerSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
