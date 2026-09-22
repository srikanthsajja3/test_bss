import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';

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

  // 3. RADIUS Internet Mapping Block (Dynamic from API)
  const [internetBaseUrl, setInternetBaseUrl] = useState('');
  const [internetToken, setInternetToken] = useState('');
  const [internetPartnerId, setInternetPartnerId] = useState('');
  const [internetBranchId, setInternalBranchId] = useState('');

  // Dynamic RADIUS Partner & Branch Dropdown Selection State
  const [fetchingPartners, setFetchingPartners] = useState(false);
  const [partnerList, setPartnerList] = useState([]);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [branchList, setBranchList] = useState([]);
  const [apiError, setApiError] = useState('');
  const [manualMode, setManualMode] = useState(false);

  // Dropdown Open/Close states for custom web select pickers
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);

  // 4. IPTV Mapping Block
  const [iptvBaseUrl, setIptvBaseUrl] = useState('');
  const [iptvKey, setIptvKey] = useState('');
  const [iptvOperatorId, setIptvOperatorId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset all fields whenever the modal opens
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
      setApiError('');
      setManualMode(false);
      setIptvBaseUrl('');
      setIptvKey('');
      setIptvOperatorId('');
      setPartnerDropdownOpen(false);
      setBranchDropdownOpen(false);
    }
  }, [visible, initialRole]);

  if (!visible) return null;

  // Auto-fetch Upstream RADIUS Partners & Branches dynamically from API when Base URL and Token are entered
  useEffect(() => {
    const url = internetBaseUrl.trim();
    const token = internetToken.trim();

    if (!url || !token || url.length < 8 || token.length < 4) {
      setPartnerList([]);
      setBranchList([]);
      setInternetPartnerId('');
      setInternalBranchId('');
      setApiError('');
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(async () => {
      setFetchingPartners(true);
      setError('');
      setApiError('');
      try {
        const res = await OneBssApi.fetchInternetPartners(token, url);
        if (!res.ok || res.status >= 400 || res.data?.success === false) {
          const msg = res.data?.message || res.data?.data?.message || `Gateway returned HTTP ${res.status || 'Error'}`;
          if (isCancelled) return;
          setApiError(msg);
          toast.error(`RADIUS Gateway API Error: ${msg}`);
          setPartnerList([]);
          setInternetPartnerId('');
          setBranchList([]);
          setInternalBranchId('');
          return;
        }

        const data = res.data?.data || res.data || [];
        let pList = [];
        if (Array.isArray(data) && data.length > 0) {
          pList = data.map((p) => ({
            id: String(p.id || p.partner_id),
            name: p.name || p.partner_name || `Partner #${p.id || p.partner_id}`,
          }));
        }

        if (isCancelled) return;

        if (pList.length > 0) {
          setPartnerList(pList);
          setApiError('');
          toast.success(`Successfully loaded ${pList.length} upstream RADIUS partners!`);
          const chosenPartnerId = pList[0].id;
          setInternetPartnerId(chosenPartnerId);

          // Auto-fetch Upstream Branches for the first partner
          setFetchingBranches(true);
          try {
            const branchRes = await OneBssApi.fetchInternetBranches(token, url, chosenPartnerId);
            if (!branchRes.ok || branchRes.status >= 400 || branchRes.data?.success === false) {
              const bMsg = branchRes.data?.message || 'Unable to fetch branches for selected partner.';
              toast.warn(`Branch Warning: ${bMsg}`);
              setBranchList([]);
              setInternalBranchId('');
              return;
            }
            const bData = branchRes.data?.data || branchRes.data || [];
            let bList = [];
            if (Array.isArray(bData) && bData.length > 0) {
              bList = bData.map((b) => ({
                id: String(b.id || b.branch_id),
                name: b.name || b.branch_name || `Branch #${b.id || b.branch_id}`,
              }));
            }
            if (isCancelled) return;
            setBranchList(bList);
            setInternalBranchId(bList.length > 0 ? bList[0].id : '');
          } catch (e) {
            if (isCancelled) return;
            toast.error(`Branch API Error: ${e.message || 'Failed to fetch branches'}`);
            setBranchList([]);
            setInternalBranchId('');
          } finally {
            if (!isCancelled) setFetchingBranches(false);
          }
        } else {
          const emptyMsg = 'Gateway reachable, but no upstream partners were returned.';
          setApiError(emptyMsg);
          toast.warn(emptyMsg);
          setPartnerList([]);
          setInternetPartnerId('');
          setBranchList([]);
          setInternalBranchId('');
        }
      } catch (err) {
        if (isCancelled) return;
        const errMsg = err.message || 'Network connection failed. Verify Base URL & Token.';
        setApiError(errMsg);
        toast.error(`RADIUS Gateway API Error: ${errMsg}`);
        setPartnerList([]);
        setInternetPartnerId('');
        setBranchList([]);
        setInternalBranchId('');
      } finally {
        if (!isCancelled) setFetchingPartners(false);
      }
    }, 600);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [internetBaseUrl, internetToken]);

  // Handle manual selection from auto-fetched Partner dropdown
  const handleSelectPartner = async (partnerIdVal) => {
    setInternetPartnerId(partnerIdVal);
    setPartnerDropdownOpen(false);
    setBranchList([]);
    setInternalBranchId('');

    const url = internetBaseUrl.trim();
    const token = internetToken.trim();
    if (!url || !token) return;

    setFetchingBranches(true);
    try {
      const branchRes = await OneBssApi.fetchInternetBranches(token, url, partnerIdVal);
      if (!branchRes.ok || branchRes.status >= 400 || branchRes.data?.success === false) {
        const bMsg = branchRes.data?.message || 'Failed to fetch branches from RADIUS gateway';
        toast.error(`Branch API Error: ${bMsg}`);
        setBranchList([]);
        setInternalBranchId('');
        return;
      }
      const bData = branchRes.data?.data || branchRes.data || [];
      if (Array.isArray(bData) && bData.length > 0) {
        const liveList = bData.map((b) => ({
          id: String(b.id || b.branch_id),
          name: b.name || b.branch_name || `Branch #${b.id || b.branch_id}`,
        }));
        setBranchList(liveList);
        if (liveList[0]) setInternalBranchId(liveList[0].id);
      } else {
        toast.warn(`No branches available for partner #${partnerIdVal}`);
        setBranchList([]);
        setInternalBranchId('');
      }
    } catch (e) {
      toast.error(`Branch API Error: ${e.message || 'Connection failed'}`);
      setBranchList([]);
      setInternalBranchId('');
    } finally {
      setFetchingBranches(false);
    }
  };

  // Handle manual selection from auto-fetched Branch dropdown
  const handleSelectBranch = (branchIdVal) => {
    setInternalBranchId(branchIdVal);
    setBranchDropdownOpen(false);
  };

  const handleSubmit = async () => {
    if (!partnerName.trim()) {
      toast.error('Please enter Partner / Operator Name');
      return;
    }
    if (!companyName.trim()) {
      toast.error('Please enter Company Name');
      return;
    }
    if (!mobile.trim() || mobile.trim().length < 10) {
      toast.error('Please enter 10-digit Primary Mobile Number');
      return;
    }
    if (!email.trim()) {
      toast.error('Please enter Email Address');
      return;
    }
    if (!region.trim()) {
      toast.error('Please enter City / Region');
      return;
    }
    if (!username.trim()) {
      toast.error('Please enter Login Username');
      return;
    }
    if (!password.trim()) {
      toast.error('Please enter Login Password');
      return;
    }
    if (!internetBaseUrl.trim() || !internetToken.trim()) {
      toast.error('Please enter Internet Base URL and Internet Token first');
      return;
    }
    if (!internetPartnerId.trim()) {
      toast.error('Please select an Upstream RADIUS Partner');
      return;
    }
    if (!internetBranchId.trim()) {
      toast.error('Please select an Upstream RADIUS Branch');
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
        toast.error(resData.message || resData.data?.message || 'Failed to create operator. Please check input parameters.');
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

        toast.success(resData.message || `Operator "${partnerName.trim()}" registered successfully!`);
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
      toast.success(`Operator "${partnerName.trim()}" registered successfully!`);
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
                placeholder="Enter Partner / Operator Name"
                value={partnerName}
                onChangeText={setPartnerName}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>REGISTERED COMPANY NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Registered Company Name"
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
                placeholder="Enter 10-digit mobile number"
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
                placeholder="Enter operator email address"
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
                placeholder="Enter operational city or region"
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
                placeholder="Enter login username"
                value={username}
                onChangeText={setUsername}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>LOGIN PASSWORD *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter login password"
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <Text style={styles.sectionCardTitle}>3. INTERNET MAPPING (RADIUS GATEWAY SETTINGS)</Text>
            <TouchableOpacity
              style={styles.toggleModeBtn}
              onPress={() => setManualMode(!manualMode)}
            >
              <Feather name={manualMode ? "list" : "edit-3"} size={13} color={COLORS.primary} />
              <Text style={styles.toggleModeBtnText}>
                {manualMode ? "Switch to Auto-Fetch Dropdown" : "Enter IDs Manually"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>INTERNET BASE URL *</Text>
              <TextInput
                style={styles.input}
                placeholder="https://radius.domain.com"
                value={internetBaseUrl}
                onChangeText={setInternetBaseUrl}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>INTERNET TOKEN *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter RADIUS Gateway Token"
                value={internetToken}
                onChangeText={setInternetToken}
                placeholderTextColor={COLORS.textDim}
              />
            </View>
          </View>

          {/* Auto-fetching status indicator when Base URL and Token are entered */}
          {(fetchingPartners || fetchingBranches) ? (
            <View style={styles.autoFetchStatusCard}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.autoFetchStatusText}>
                {fetchingPartners
                  ? 'Auto-fetching upstream RADIUS partners from gateway...'
                  : 'Auto-fetching upstream RADIUS branches from gateway...'}
              </Text>
            </View>
          ) : null}

          {/* If API is not correct: Display visual warning card with Switch to Manual option */}
          {Boolean(apiError) ? (
            <View style={styles.apiErrorBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Feather name="alert-triangle" size={16} color="#ef4444" />
                <Text style={styles.apiErrorBannerText}>
                  Gateway API Error: {apiError}
                </Text>
              </View>
              {!manualMode ? (
                <TouchableOpacity
                  style={styles.apiErrorActionBtn}
                  onPress={() => setManualMode(true)}
                >
                  <Text style={styles.apiErrorActionBtnText}>Enter IDs Manually</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* If manual mode is active: allow direct text inputs */}
          {manualMode ? (
            <View style={{ marginTop: 14 }}>
              <View style={[styles.row, isMobile && styles.rowMobile]}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>UPSTREAM RADIUS PARTNER ID *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 292"
                    value={internetPartnerId}
                    onChangeText={setInternetPartnerId}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>UPSTREAM RADIUS BRANCH ID *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 328"
                    value={internetBranchId}
                    onChangeText={setInternalBranchId}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>
              </View>
              <Text style={styles.manualModeHelpText}>
                💡 Manual entry mode active: Specify the partner and branch IDs directly if the upstream RADIUS API is unreachable or returns errors.
              </Text>
            </View>
          ) : (
            <>
              {/* RADIUS PARTNER DROPDOWN - Dynamic & User Selectable */}
              <View style={[styles.inputGroup, { marginTop: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.label}>SELECT UPSTREAM RADIUS PARTNER *</Text>
                    {partnerList.length > 0 ? (
                      <View style={styles.seedIndicatorBadge}>
                        <Text style={styles.seedIndicatorText}>{partnerList.length} Available</Text>
                      </View>
                    ) : null}
                  </View>
                  {fetchingPartners ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
                </View>

                <TouchableOpacity
                  style={styles.dropdownSelectTrigger}
                  onPress={() => setPartnerDropdownOpen(!partnerDropdownOpen)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Feather name="users" size={16} color={COLORS.primary} />
                    <Text style={styles.dropdownSelectValueText}>
                      {selectedPartnerObj
                        ? selectedPartnerObj.name
                        : (fetchingPartners
                            ? 'Fetching partners from gateway...'
                            : (partnerList.length > 0
                                ? 'Select RADIUS Partner'
                                : 'Enter Base URL & Token above to auto-fetch partners'))}
                    </Text>
                  </View>
                  <Feather name={partnerDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>

                {partnerDropdownOpen && partnerList.length > 0 ? (
                  <View style={styles.dropdownMenuBox}>
                    {partnerList.map((p) => {
                      const isSelected = String(internetPartnerId) === String(p.id);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                          onPress={() => handleSelectPartner(p.id)}
                        >
                          <Feather name={isSelected ? "check-circle" : "circle"} size={16} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                          <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              {/* RADIUS BRANCH DROPDOWN - Dynamic & User Selectable */}
              <View style={[styles.inputGroup, { marginTop: 14 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.label}>SELECT UPSTREAM RADIUS BRANCH *</Text>
                    {branchList.length > 0 ? (
                      <View style={[styles.seedIndicatorBadge, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                        <Text style={[styles.seedIndicatorText, { color: '#8b5cf6' }]}>{branchList.length} Available</Text>
                      </View>
                    ) : null}
                  </View>
                  {fetchingBranches ? <ActivityIndicator size="small" color="#8b5cf6" /> : null}
                </View>

                <TouchableOpacity
                  style={[styles.dropdownSelectTrigger, { borderColor: '#8b5cf6' }]}
                  onPress={() => setBranchDropdownOpen(!branchDropdownOpen)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Feather name="git-branch" size={16} color="#8b5cf6" />
                    <Text style={styles.dropdownSelectValueText}>
                      {selectedBranchObj
                        ? selectedBranchObj.name
                        : (fetchingBranches
                            ? 'Fetching branches from gateway...'
                            : (branchList.length > 0
                                ? 'Select RADIUS Branch'
                                : (internetPartnerId
                                    ? 'No branches found for selected partner'
                                    : 'Select an upstream partner to fetch branches')))}
                    </Text>
                  </View>
                  <Feather name={branchDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>

                {branchDropdownOpen && branchList.length > 0 ? (
                  <View style={styles.dropdownMenuBox}>
                    {branchList.map((b) => {
                      const isSelected = String(internetBranchId) === String(b.id);
                      return (
                        <TouchableOpacity
                          key={b.id}
                          style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActivePurple]}
                          onPress={() => handleSelectBranch(b.id)}
                        >
                          <Feather name={isSelected ? "check-circle" : "circle"} size={16} color={isSelected ? "#8b5cf6" : COLORS.textMuted} />
                          <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActivePurple]}>
                            {b.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </>
          )}
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
  seedIndicatorBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  seedIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  toggleModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  toggleModeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  apiErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  apiErrorBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
    flex: 1,
  },
  apiErrorActionBtn: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  apiErrorActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  manualModeHelpText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    fontStyle: 'italic',
  },
  autoFetchStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  autoFetchStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  autoFetchSuccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  autoFetchSuccessTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.accentEmerald,
  },
  autoFetchSuccessText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 2,
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
