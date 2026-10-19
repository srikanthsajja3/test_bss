import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, useWindowDimensions, ActivityIndicator, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { Dropdown } from './internet/shared';

// Hierarchy: Super Admin > Super Distributor > Distributor > Sub Distributor > Operator.
// The three middle levels are "admin" accounts; their level comes from who they are created under.
const LEVEL_TYPES = [
  { id: 'sd', label: 'Super Distributor', role: 'admin', parentLevel: 0, icon: 'award' },
  { id: 'd', label: 'Distributor', role: 'admin', parentLevel: 1, icon: 'shield' },
  { id: 'subd', label: 'Sub Distributor', role: 'admin', parentLevel: 2, icon: 'git-branch' },
  { id: 'operator', label: 'Operator', role: 'operator', parentLevel: null, icon: 'briefcase' },
];

export const CreateAccountModal = ({ visible, onClose, initialRole = 'operator', onAccountCreated, canCreateAdmin = false, parentId = null }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [role, setRole] = useState(canCreateAdmin ? initialRole : 'operator');
  const isOperatorRole = role !== 'admin';
  // Where the new partner goes: its level and its parent ('' = directly under the super admin)
  const [levelType, setLevelType] = useState(initialRole === 'admin' ? 'sd' : 'operator');
  const [parentSel, setParentSel] = useState(parentId ? String(parentId) : '');
  const [adminList, setAdminList] = useState([]);
  const levelDef = LEVEL_TYPES.find((t) => t.id === levelType) || LEVEL_TYPES[3];
  const parentOptions = levelDef.role === 'operator'
    ? [{ value: '', label: 'Super Admin (directly)' }, ...adminList.map((a) => ({ value: String(a.partner_id), label: `${a.hierarchy_label || 'Admin'} — ${a.partner_name} (#${a.partner_id})` }))]
    : levelDef.parentLevel === 0
      ? [{ value: '', label: 'Super Admin' }]
      : adminList
          .filter((a) => Number(a.admin_level) === levelDef.parentLevel)
          .map((a) => ({ value: String(a.partner_id), label: `${a.hierarchy_label || 'Admin'} — ${a.partner_name} (#${a.partner_id})` }));
  const chooseLevel = (id) => {
    const def = LEVEL_TYPES.find((t) => t.id === id);
    setLevelType(id);
    setRole(def.role);
    // keep the parent only if it is valid for the new level
    setParentSel((cur) => {
      if (def.role === 'operator') return cur;
      if (def.parentLevel === 0) return '';
      const a = adminList.find((x) => String(x.partner_id) === String(cur));
      return a && Number(a.admin_level) === def.parentLevel ? cur : '';
    });
  };
  
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
  const DEFAULT_IPTV_BASE_URL = 'https://admin.pioneerdigitaltv.in/api/t4b6lNZu0nWCuC8G/';
  const [iptvBaseUrl, setIptvBaseUrl] = useState(DEFAULT_IPTV_BASE_URL);
  const [iptvKey, setIptvKey] = useState('');
  const [iptvOperatorId, setIptvOperatorId] = useState('');
  const [ottFranchiseId, setOttFranchiseId] = useState('');
  const [iptvBranchId, setIptvBranchId] = useState('');

  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reset all fields whenever the modal opens
  useEffect(() => {
    if (visible) {
      setRole(canCreateAdmin ? initialRole || 'operator' : 'operator');
      setLevelType(initialRole === 'admin' ? 'sd' : 'operator');
      setParentSel(parentId ? String(parentId) : '');
      if (canCreateAdmin) {
        OneBssApi.getPartners('admin').then((res) => {
          const list = res.ok && Array.isArray(res.data) ? res.data : [];
          setAdminList(list);
          // "Add ... under this admin": the level follows the parent's level
          if (parentId) {
            const parent = list.find((a) => String(a.partner_id) === String(parentId));
            if (parent && initialRole === 'admin') {
              const lvl = Number(parent.admin_level || 0);
              const t = LEVEL_TYPES.find((x) => x.parentLevel === lvl && x.role === 'admin');
              if (t) {
                setLevelType(t.id);
                setRole('admin');
              }
            } else if (initialRole !== 'admin') {
              setLevelType('operator');
              setRole('operator');
            }
          }
        });
      }
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
      setIptvBaseUrl(DEFAULT_IPTV_BASE_URL);
      setIptvKey('');
      setIptvOperatorId('');
      setIptvBranchId('');
      setPartnerDropdownOpen(false);
      setBranchDropdownOpen(false);
      setRoleDropdownOpen(false);
    }
  }, [visible, initialRole, parentId]);

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
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      toast.error('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Please enter a valid email address');
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
    if (password.trim().length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (canCreateAdmin && levelDef.role === 'admin' && levelDef.parentLevel > 0 && !parentSel) {
      toast.error(`Choose the ${LEVEL_TYPES.find((t) => t.parentLevel === levelDef.parentLevel - 1 && t.role === 'admin')?.label || 'admin'} this ${levelDef.label} belongs to`);
      return;
    }
    if (isOperatorRole) {
      if (!internetBaseUrl.trim() || !internetToken.trim()) {
        toast.error('Please enter the RADIUS URL and API token');
        return;
      }
      if (!internetPartnerId.trim() || !internetBranchId.trim()) {
        toast.error('Please select the RADIUS partner and branch');
        return;
      }
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
      ...(canCreateAdmin && parentSel ? { parent_id: Number(parentSel) } : {}),
      // Gateways belong to operators only; IPTV is optional (sent only when a key is given)
      ...(isOperatorRole
        ? {
            internet_mapping: {
              internet_base_url: internetBaseUrl.trim(),
              internet_token: internetToken.trim(),
              internet_partner_id: internetPartnerId.trim(),
              internet_branch_id: internetBranchId.trim(),
            },
            ...(iptvKey.trim()
              ? { iptv_mapping: { iptv_base_url: iptvBaseUrl.trim(), iptv_key: iptvKey.trim(), iptv_operator_id: Number(iptvOperatorId) || 0 } }
              : {}),
            ...(ottFranchiseId.trim() ? { ott_mapping: { franchise_id: ottFranchiseId.trim() } } : {}),
          }
        : {}),
    };

    try {
      const res = await OneBssApi.createPartner(payload);
      const resData = res.data || {};

      if (!res.ok || (res.status && res.status >= 400) || resData.success === false) {
        const errMsg = resData.message || resData.data?.message || resData.error || 'Failed to create operator. Please check input parameters.';
        toast.error(errMsg);
        setError(errMsg);
      } else {
        // The server returns the stored partner; the list is re-fetched by the parent.
        const createdPartner = resData.data || {
          partner_id: resData.partner_id,
          partner_name: partnerName.trim(),
          company_name: companyName.trim(),
          account_username: username.trim(),
          account_role: role,
          status: 'enabled',
        };

        toast.success(resData.message || `Operator "${partnerName.trim()}" registered successfully!`);
        if (onAccountCreated) {
          onAccountCreated(createdPartner, resData.message || `Operator "${partnerName.trim()}" registered successfully!`);
        }
        onClose();
      }
    } catch (err) {
      const errMsg = err?.message || 'Failed to create operator account. Please check network connection.';
      toast.error(errMsg);
      setError(errMsg);
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
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.fullScreenTitle}>
            New {canCreateAdmin ? levelDef.label.toLowerCase() : role === 'admin' ? 'admin' : 'operator'}
          </Text>
          <Text style={styles.fullScreenSubtitle}>
            {role === 'admin' ? 'Admin levels see the data of everything below them (view only) and earn margins on their operators\' recharges.' : 'Operators sell Internet, IPTV and OTT to their customers.'}
          </Text>
        </View>

      </View>

      <ScrollView style={styles.fullScreenContent} contentContainerStyle={{ paddingHorizontal: isMobile ? 14 : 28, paddingVertical: 20 }}>
        {/* Level + parent (super admin only — admins are view-only) */}
        {canCreateAdmin ? (
          <View style={[styles.sectionCard, { paddingVertical: 14 }]}>
            <Text style={styles.sectionCardTitle}>LEVEL IN THE HIERARCHY</Text>
            <View style={[styles.roleToggleRow, { marginTop: 8, flexWrap: 'wrap' }]}>
              {LEVEL_TYPES.map((t) => {
                const on = levelType === t.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.roleOption, { minWidth: 150 }, on && (t.role === 'admin' ? styles.roleOptionAdminActive : styles.roleOptionOperatorActive)]}
                    onPress={() => chooseLevel(t.id)}
                  >
                    <Feather name={t.icon} size={16} color={on ? '#ffffff' : COLORS.textMuted} />
                    <Text style={[styles.roleOptionText, on && styles.roleOptionTextActive]}>{t.label.toUpperCase()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.inputGroup, { marginTop: 12 }]}>
              <Text style={styles.label}>{levelDef.role === 'operator' ? 'UNDER' : levelDef.parentLevel === 0 ? 'UNDER' : `UNDER WHICH ${LEVEL_TYPES.find((t) => t.parentLevel === levelDef.parentLevel - 1 && t.role === 'admin')?.label.toUpperCase() || 'ADMIN'} *`}</Text>
              {parentOptions.length ? (
                <Dropdown
                  value={parentSel}
                  options={parentOptions}
                  onChange={(v) => setParentSel(String(v))}
                  disabled={levelDef.role === 'admin' && levelDef.parentLevel === 0}
                  placeholder="Select…"
                />
              ) : (
                <Text style={{ fontSize: 12.5, color: '#b45309' }}>
                  No {LEVEL_TYPES.find((t) => t.parentLevel === levelDef.parentLevel - 1 && t.role === 'admin')?.label || 'admin'} exists yet — create one first.
                </Text>
              )}
              <Text style={[styles.manualModeHelpText, { marginTop: 6 }]}>
                Super Distributor › Distributor › Sub Distributor › Operator. Admin levels can only view their data; the super admin sets their margins on each operator's plans.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Section 1: Basic Identity & Contact */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>1. PROFILE & CONTACT INFORMATION</Text>

          <View style={[styles.row, isMobile && styles.rowMobile]}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>PARTNER NAME *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter Partner / Operator Name"
                value={partnerName}
                onChangeText={setPartnerName}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>COMPANY NAME *</Text>
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
              <Text style={styles.label}>MOBILE (10 DIGITS) *</Text>
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
          <Text style={styles.sectionCardTitle}>2. LOGIN CREDENTIALS</Text>

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
              <Text style={styles.label}>LOGIN PASSWORD (MIN 8) *</Text>
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

        {/* Section 3: RADIUS Internet Mapping (operators only) */}
        {isOperatorRole ? (
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <Text style={styles.sectionCardTitle}>3. INTERNET MAPPING (RADIUS GATEWAY)</Text>
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
              <Text style={styles.label}>RADIUS BASE URL *</Text>
              <TextInput
                style={styles.input}
                placeholder="https://radius.domain.com"
                value={internetBaseUrl}
                onChangeText={setInternetBaseUrl}
                placeholderTextColor={COLORS.textDim}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>RADIUS TOKEN *</Text>
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
                  <Text style={styles.label}>RADIUS PARTNER ID *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 292"
                    value={internetPartnerId}
                    onChangeText={setInternetPartnerId}
                    placeholderTextColor={COLORS.textDim}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>RADIUS BRANCH ID *</Text>
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
                    <Text style={styles.label}>SELECT RADIUS PARTNER *</Text>
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
                    <Text style={styles.label}>SELECT RADIUS BRANCH *</Text>
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

        ) : null}

        {/* Section 4: IPTV Mapping (operators only) */}
        {isOperatorRole ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>4. IPTV MAPPING (OPTIONAL)</Text>

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
          <Text style={styles.manualModeHelpText}>Branches and packs are assigned from the partner page after creating the account.</Text>
        </View>
        ) : null}

        {/* Section 5: OTT (operators only) */}
        {isOperatorRole ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionCardTitle}>5. OTT MAPPING (OPTIONAL)</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>OTTAGGRE FRANCHISE ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. F1001"
              value={ottFranchiseId}
              onChangeText={setOttFranchiseId}
              autoCapitalize="none"
              placeholderTextColor={COLORS.textDim}
            />
          </View>
          <Text style={styles.manualModeHelpText}>OTT packages are synced and priced from the partner page (OTT Plans) after creating the account.</Text>
        </View>
        ) : null}

        {/* Bottom Action Control Bar */}
        <View style={styles.fullScreenActionFooter}>
          <TouchableOpacity style={styles.footerCancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.footerCancelBtnText}>Cancel</Text>
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
              {loading ? 'Creating…' : `Create ${canCreateAdmin ? levelDef.label.toLowerCase() : role === 'admin' ? 'admin' : 'operator'}`}
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
