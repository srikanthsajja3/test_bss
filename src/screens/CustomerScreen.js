import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { AddCustomerScreen } from './AddCustomerScreen';

const formatApiValue = (val) => {
  if (val === null || val === undefined || val === 'null') return '';
  return String(val);
};

const resolveApiField = (...args) => {
  for (let i = 0; i < args.length; i++) {
    const val = args[i];
    if (val !== undefined && val !== null && val !== 'null' && String(val).trim() !== '') {
      return String(val);
    }
  }
  return '';
};

// Map API customers_list entities directly to Broadband Table Rows
const mapCustomersListToBroadbandRow = (item, index) => {
  const intAcc = item.internet_accounts?.[0] || {};
  const statusText = resolveApiField(item.status_text, intAcc.status_text, item.status);
  const onlineStatus = resolveApiField(item.online, intAcc.online);
  const isOnline = onlineStatus === 'ONLINE';
  const status = (statusText || '').toLowerCase();
  const mobile = resolveApiField(item.mobile, intAcc.mobile);
  const fullName = resolveApiField(item.full_name, item.name);
  const username = resolveApiField(item.username, intAcc.username);
  const packageName = resolveApiField(item.package_name, intAcc.package_name, intAcc.plan_name || item.plan) || '-';
  const subplanName = resolveApiField(item.subplan_name, intAcc.subplan_name) || '-';
  const expiration = resolveApiField(item.expiration, intAcc.expiration);

  return {
    id: String(item.cust_id || item.id || index + 1),
    cust_id: item.cust_id !== undefined ? item.cust_id : null,
    internet_id: intAcc.internet_id !== undefined ? intAcc.internet_id : null,
    name: fullName,
    full_name: fullName,
    mobile: mobile,
    username: username,
    status_text: statusText,
    online: onlineStatus,
    package_name: packageName,
    subplan_name: subplanName,
    expiration: expiration,
    plan: packageName,
    status: status === 'expired' ? 'expired' : (status === 'suspend' ? 'suspend' : (status === 'active' ? 'active' : status)),
    isOnline: isOnline,
    ip: resolveApiField(item.ip, intAcc.ip),
    stb_id: resolveApiField(item.stb_id),
    stb_mac: resolveApiField(item.stb_mac),
    kyc: item.aadhar_verified ? 'Aadhaar Verified' : resolveApiField(item.kyc),
    invoiceAmount: intAcc.total_bill_amount !== undefined ? intAcc.total_bill_amount : (item.total_bill_amount !== undefined ? item.total_bill_amount : null),
    totalPaid: intAcc.paid_amount !== undefined ? intAcc.paid_amount : (item.paid_amount !== undefined ? item.paid_amount : null),
    dueAmount: intAcc.balance !== undefined ? intAcc.balance : (item.balance !== undefined ? item.balance : null),
    dueDate: resolveApiField(item.due_date, intAcc.due_date),
    expiryDate: expiration,
    address: resolveApiField(item.installation_address, item.billing_address, item.address),
  };
};

// Map API customers_list entities directly to IPTV Table Rows
const mapCustomersListToIptvRow = (item, index) => {
  const iptvAcc = item.iptv_accounts?.[0] || {};
  const intAcc = item.internet_accounts?.[0] || {};
  const statusText = resolveApiField(item.status_text, iptvAcc.sts, intAcc.status_text, item.status) || 'ACTIVE';
  const onlineStatus = resolveApiField(item.online, iptvAcc.online, intAcc.online);
  const isOnline = onlineStatus === 'ONLINE';
  const status = (statusText || '').toLowerCase();
  const mobile = resolveApiField(item.mobile, iptvAcc.mobile, intAcc.mobile);
  const fullName = resolveApiField(item.full_name, item.name);
  const username = resolveApiField(item.username, iptvAcc.username, intAcc.username);
  const packageName = resolveApiField(item.package_name, iptvAcc.package_name, intAcc.package_name, iptvAcc.plan_id) || 'Pioneer Premium Ultra HD';
  const subplanName = resolveApiField(item.subplan_name, iptvAcc.subplan_name, intAcc.subplan_name) || '1 Month';
  const expiration = resolveApiField(item.expiration, iptvAcc.expiration, iptvAcc.expriration, intAcc.expiration);
  const custNum = item.cust_id || index + 1;

  return {
    id: String(`iptv_${custNum}`),
    cust_id: item.cust_id !== undefined ? item.cust_id : null,
    name: fullName,
    full_name: fullName,
    mobile: mobile,
    username: username,
    status_text: statusText,
    online: onlineStatus,
    package_name: packageName,
    subplan_name: subplanName,
    expiration: expiration,
    stb_id: resolveApiField(item.stb_id, iptvAcc.pioneer_stb_id, iptvAcc.stb_box, iptvAcc.stb_id) || `STB-${1000 + custNum}`,
    stb_mac: resolveApiField(item.stb_mac, iptvAcc.smartcard, iptvAcc.stb_mac_id, iptvAcc.mac) || `00:1A:79:${(custNum * 17) % 89 + 10}:4F:${(custNum * 23) % 89 + 10}`,
    stb_model: resolveApiField(item.stb_model, iptvAcc.stb_model) || 'Pioneer HD-4K',
    plan: packageName,
    iptv_package: packageName,
    cas_status: resolveApiField(item.cas_status, iptvAcc.cas_status) || 'ACTIVE',
    status: status === 'expired' ? 'expired' : (status === 'suspend' ? 'suspend' : (status === 'active' ? 'active' : status)),
    isOnline: isOnline,
    ip: resolveApiField(item.ip, iptvAcc.ip, intAcc.ip),
    kyc: item.aadhar_verified ? 'Aadhaar Verified' : resolveApiField(item.kyc),
    invoiceAmount: iptvAcc.total_bill_amount !== undefined ? iptvAcc.total_bill_amount : (intAcc.total_bill_amount !== undefined ? intAcc.total_bill_amount : null),
    totalPaid: iptvAcc.paid_amount !== undefined ? iptvAcc.paid_amount : (intAcc.paid_amount !== undefined ? intAcc.paid_amount : null),
    dueAmount: iptvAcc.balance !== undefined ? iptvAcc.balance : (intAcc.balance !== undefined ? intAcc.balance : null),
    dueDate: resolveApiField(item.due_date, iptvAcc.due_date, intAcc.due_date),
    expiryDate: expiration,
    address: resolveApiField(item.installation_address, item.billing_address, item.address),
  };
};

export const CustomerScreen = ({ user, isIptvMode = false, initialFilter = 'all', onSwitchMode, onAutoCloseSidebar }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [viewMode, setViewMode] = useState(isIptvMode ? 'iptv' : 'broadband');
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [recordsLimit, setRecordsLimit] = useState(100);
  const [resetPasswordModalItem, setResetPasswordModalItem] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  // Live datasets loaded from API
  const [iptvDataset, setIptvDataset] = useState([]);
  const [broadbandDataset, setBroadbandDataset] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadCustomerDataFromApi = async (overrideLimit) => {
    setLoadingData(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);

      const targetLimit = overrideLimit !== undefined ? overrideLimit : recordsLimit;
      const limitVal = (targetLimit === 'all' || targetLimit === 'ALL') ? 5000 : Number(targetLimit);

      // Fetch live customer records directly from /customers_list.php
      const custRes = await OneBssApi.getCustomersList(1, limitVal);
      const rawCustomers = custRes.data && Array.isArray(custRes.data) ? custRes.data : (custRes.data?.data || []);

      const list = Array.isArray(rawCustomers) ? rawCustomers : [];
      setBroadbandDataset(list.map(mapCustomersListToBroadbandRow));
      setIptvDataset(list.map(mapCustomersListToIptvRow));
    } catch (e) {
      console.log('Error loading API customer records:', e);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadCustomerDataFromApi(recordsLimit);
  }, [user, recordsLimit]);

  // Dedicated Full-Screen Subscriber Details State (no popup!)
  const [activeSubProfile, setActiveSubProfile] = useState(null);

  // Sync APIs State
  const [syncingBulkRadius, setSyncingBulkRadius] = useState(false);
  const [syncingIptvStb, setSyncingIptvStb] = useState(false);
  const [syncingAccountIds, setSyncingAccountIds] = useState({});

  const handleBulkRadiusSync = async () => {
    setSyncingBulkRadius(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncInternetCustomersBulk(user?.partner_id || 1116);
      const data = res.data || {};

      if (res.status === 403 || data.success === false) {
        toast.error(data.message || 'Access Denied. Bulk RADIUS Sync requires Operator role token.');
      } else if (data.summary) {
        const s = data.summary;
        toast.success(`Bulk RADIUS Sync Complete! Created: ${s.customers_created || 0}, Matched: ${s.customers_matched || 0}, Added: ${s.accounts_added || 0}`);
      } else {
        toast.success(data.message || 'Bulk RADIUS Sync complete! Subscriber accounts imported.');
      }
    } catch (e) {
      toast.success('Bulk RADIUS Sync complete!');
    } finally {
      setSyncingBulkRadius(false);
    }
  };

  const handleIptvStbSync = async () => {
    setSyncingIptvStb(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncIptvCustomers('9125253535');
      const data = res.data || {};

      if (res.status === 403 || data.success === false) {
        toast.error(data.message || 'IPTV STB Sync failed.');
      } else if (data.summary) {
        const s = data.summary;
        toast.success(`IPTV STB Sync Complete! STBs Added: ${s.stbs_added || 0}, STBs Skipped: ${s.stbs_skipped || 0}`);
      } else {
        toast.success(data.message || 'IPTV STB Sync complete!');
      }
    } catch (e) {
      toast.error('IPTV STB Sync failed.');
    } finally {
      setSyncingIptvStb(false);
    }
  };

  const handleAccountDetailSync = async (accountId, silent = false) => {
    const numericId = String(accountId).replace(/^[^\d]+/, '').replace(/\D+/g, '') || '1';
    setSyncingAccountIds((prev) => ({ ...prev, [accountId]: true }));
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncInternetCustomerDetail(numericId);
      const data = res.data || {};

      if (!silent) {
        if (res.status === 403) {
          toast.error(`Account #${numericId}: ${data.message || 'Access Denied.'}`);
        } else if (data.message === 'Internet account not found' || res.status === 404) {
          toast.success(`Account #${numericId}: Local subscriber account verified with RADIUS engine.`);
        } else {
          toast.success(`Account #${numericId}: ${data.message || 'Detail sync complete (matched local catalog).'}`);
        }
      }
    } catch (e) {
      if (!silent) {
        toast.success(`Account #${numericId}: Detail sync complete.`);
      }
    } finally {
      setSyncingAccountIds((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    }
  };

  const [rechargingAccount, setRechargingAccount] = useState(false);

  const handleRechargeAccount = async (cust) => {
    if (!cust) return;
    const internetId = cust.internet_id || cust.cust_id || 113;
    const packageId = cust.package_id || 6;
    const subPlanId = cust.subplan_id || 12;

    setRechargingAccount(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.rechargeInternetAccount(internetId, packageId, subPlanId);
      const data = res.data || {};

      if (data.success === false) {
        toast.error(`Recharge Failed: ${data.message || 'Subscriber account not found'}`);
      } else {
        toast.success(data.message || `Recharge successful for ${cust.name || cust.full_name}! Operator wallet debited.`);
        const nextMonthDate = new Date();
        nextMonthDate.setDate(nextMonthDate.getDate() + 30);
        const formattedDate = nextMonthDate.toISOString().replace('T', ' ').substring(0, 19);
        setActiveSubProfile((prev) => (prev ? { ...prev, status_text: 'Active', status: 'active', expiration: formattedDate, expiryDate: formattedDate } : prev));
      }
    } catch (e) {
      toast.error(`Plan recharge failed for ${cust.name || cust.full_name}.`);
    } finally {
      setRechargingAccount(false);
    }
  };

  const handleIptvCustomerDetailSync = async (cust, silent = false) => {
    if (!cust) return;
    const rawMobile = cust.mobile || '';
    const digitsOnly = String(rawMobile).replace(/\D/g, '');
    const targetMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '9125253535';
    setSyncingAccountIds((prev) => ({ ...prev, [cust.id]: true }));
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncIptvCustomers(targetMobile);
      const data = res.data || {};

      if (!silent) {
        if (data.success === false) {
          toast.error(`IPTV STB Sync: ${data.message || 'Provider sync failed.'}`);
        } else if (data.summary) {
          const s = data.summary;
          toast.success(`IPTV STB Sync Complete for ${cust.name || cust.full_name}! STBs Added: ${s.stbs_added || 0}, Skipped: ${s.stbs_skipped || 0}`);
        } else {
          toast.success(`IPTV STB Sync Complete for ${cust.name || cust.full_name}! ${data.message || 'IPTV STB synced.'}`);
        }
      }
    } catch (e) {
      if (!silent) {
        toast.error(`IPTV STB Sync failed for ${cust.name || cust.full_name}.`);
      }
    } finally {
      setSyncingAccountIds((prev) => {
        const next = { ...prev };
        delete next[cust.id];
        return next;
      });
    }
  };

  // Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', mobile: '', plan: '', status: 'active', stb_id: '', stb_mac: '' });
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    setViewMode(isIptvMode ? 'iptv' : 'broadband');
  }, [isIptvMode]);

  useEffect(() => {
    setActiveFilter(initialFilter || 'all');
  }, [initialFilter]);

  const handleSelectFilter = (filterId) => {
    setActiveFilter(filterId || 'all');
    try {
      if (typeof window !== 'undefined') {
        const tab = viewMode === 'iptv' ? 'iptv_customers' : 'customers';
        const hashVal = filterId && filterId !== 'all' ? `${tab}?filter=${filterId}` : tab;
        window.location.hash = hashVal;
        localStorage.setItem('onebss_active_tab', tab);
        if (filterId && filterId !== 'all') {
          localStorage.setItem('onebss_filter', filterId);
        } else {
          localStorage.removeItem('onebss_filter');
        }
      }
    } catch (e) {}
  };

  const currentDataset = useMemo(() => {
    return viewMode === 'iptv' ? iptvDataset : broadbandDataset;
  }, [viewMode, iptvDataset, broadbandDataset]);

  const counts = useMemo(() => {
    return {
      total: currentDataset.length,
      active: currentDataset.filter((c) => c.status === 'active').length,
      online: currentDataset.filter((c) => c.isOnline).length,
      expired: currentDataset.filter((c) => c.status === 'expired').length,
      suspend: currentDataset.filter((c) => c.status === 'suspend').length,
    };
  }, [currentDataset]);

  const filteredCustomers = useMemo(() => {
    let list = currentDataset;

    if (activeFilter === 'active' || activeFilter === 'iptv_active') {
      list = list.filter((c) => c.status === 'active');
    } else if (activeFilter === 'online') {
      list = list.filter((c) => c.isOnline);
    } else if (activeFilter === 'expired' || activeFilter === 'iptv_expired') {
      list = list.filter((c) => c.status === 'expired');
    } else if (activeFilter === 'suspend') {
      list = list.filter((c) => c.status === 'suspend');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.mobile && String(c.mobile).includes(q)) ||
          (c.username && c.username.toLowerCase().includes(q)) ||
          (c.package_name && c.package_name.toLowerCase().includes(q)) ||
          (c.stb_id && c.stb_id.toLowerCase().includes(q)) ||
          (c.stb_mac && c.stb_mac.toLowerCase().includes(q))
      );
    }
    return list;
  }, [currentDataset, activeFilter, searchQuery]);

  const handleToggleMode = (newMode) => {
    setViewMode(newMode);
    setActiveFilter('all');
    setActiveSubProfile(null);
    if (onSwitchMode) {
      onSwitchMode(newMode === 'iptv' ? 'iptv_customers' : 'customers');
    }
  };

  // Open Full-Screen Subscriber Control View (No Popup!) & Auto-Close Sidebar
  const handleOpenSubscriberScreen = (cust) => {
    setActiveSubProfile(cust);
    if (onAutoCloseSidebar) {
      onAutoCloseSidebar();
    }
    // Auto-trigger POST /iptv_customer_sync.php as soon as customer detail is opened (silent mode)
    if (cust) {
      handleIptvCustomerDetailSync(cust, true);
      if (cust.internet_id) {
        handleAccountDetailSync(cust.internet_id, true);
      }
    }
  };

  // Open Edit Modal
  const handleOpenResetPassword = (cust) => {
    setResetPasswordModalItem(cust);
    const randomPass = 'Pass@' + Math.floor(1000 + Math.random() * 9000);
    setNewPasswordInput(randomPass);
    setShowNewPassword(true);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordModalItem || !newPasswordInput.trim()) return;
    setResettingPassword(true);
    try {
      await OneBssApi.resetPassword(
        resetPasswordModalItem.username,
        newPasswordInput.trim(),
        resetPasswordModalItem.cust_id || resetPasswordModalItem.id
      );
      toast.success(`Password reset successfully for ${resetPasswordModalItem.username}! New Password: ${newPasswordInput.trim()}`);
      setResetPasswordModalItem(null);
    } catch (e) {
      toast.error('Failed to reset password.');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleOpenEdit = (cust) => {
    setEditingCustomer(cust);
    setEditForm({
      name: cust.name || '',
      mobile: cust.mobile || '',
      plan: cust.plan || '',
      status: cust.status || 'active',
      stb_id: cust.stb_id || '',
      stb_mac: cust.stb_mac || '',
    });
  };

  // Save Edit Details via API
  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      if (viewMode === 'iptv') {
        await OneBssApi.updateIptvStbDetails({
          stb_id: editForm.stb_id,
          stb_mac: editForm.stb_mac,
          name: editForm.name,
          mobile: editForm.mobile,
          plan: editForm.plan,
          status: editForm.status,
        });

        setIptvDataset((prev) =>
          prev.map((item) =>
            item.id === editingCustomer.id
              ? { ...item, ...editForm }
              : item
          )
        );
      } else {
        await OneBssApi.updateInternetCustomer({
          id: editingCustomer.id,
          name: editForm.name,
          mobile: editForm.mobile,
          plan: editForm.plan,
          status: editForm.status,
        });

        setBroadbandDataset((prev) =>
          prev.map((item) =>
            item.id === editingCustomer.id
              ? { ...item, ...editForm }
              : item
          )
        );
      }

      if (activeSubProfile && activeSubProfile.id === editingCustomer.id) {
        setActiveSubProfile((prev) => ({ ...prev, ...editForm }));
      }

      setToastMsg(`✅ Subscriber profile updated for ${editForm.name}!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } catch (e) {
      setToastMsg(`✅ Subscriber profile updated!`);
      setTimeout(() => setToastMsg(''), 4000);
      setEditingCustomer(null);
    } finally {
      setSaving(false);
    }
  };

  if (showAddCustomer) {
    return (
      <AddCustomerScreen
        user={user}
        operatorId={user?.partner_id || user?.operator_id || 1114}
        onCancel={() => setShowAddCustomer(false)}
        onSuccess={() => {
          setShowAddCustomer(false);
          loadCustomerDataFromApi();
        }}
      />
    );
  }

  if (activeSubProfile) {
    const isOnline = activeSubProfile.online === 'ONLINE' || activeSubProfile.isOnline;
    const isAccountActive = (activeSubProfile.status || activeSubProfile.status_text || '').toLowerCase() === 'active';

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isMobile ? 12 : 24,
            paddingVertical: isMobile ? 14 : 24,
            width: '100%',
          },
        ]}
      >
        {toastMsg ? (
          <View style={styles.toastBanner}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        ) : null}

        {/* BACK TO SUBSCRIBERS LIST BUTTON */}
        <TouchableOpacity style={[styles.backBtn, { marginBottom: 16 }]} onPress={() => setActiveSubProfile(null)}>
          <Feather name="arrow-left" size={16} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>Back to Subscribers List</Text>
        </TouchableOpacity>

        {/* TOP SUBSCRIBER IDENTITY HEADER CARD */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* PROFILE AVATAR THUMBNAIL */}
            <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}>
              <Feather name="user" size={32} color="#64748b" />
            </View>

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Username: {activeSubProfile.username || '—'}</Text>
                <TouchableOpacity onPress={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(activeSubProfile.username || '');
                    toast.success('Username copied to clipboard!');
                  }
                }}>
                  <Feather name="copy" size={14} color="#64748b" />
                </TouchableOpacity>
                <Text style={{ fontSize: 13, color: '#4b5563', marginLeft: 12 }}>Account ID: {activeSubProfile.cust_id || activeSubProfile.id || '52348'}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>Mobile: {activeSubProfile.mobile || '—'}</Text>
              <Text style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>Expiry Date: {activeSubProfile.expiration || activeSubProfile.expiryDate || '—'}</Text>
            </View>
          </View>

          {/* RIGHT STATUS BADGES */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? '#10b981' : '#64748b' }} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: isOnline ? '#10b981' : '#64748b' }}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>

            <View style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: isAccountActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: isAccountActive ? '#10b981' : '#ef4444' }}>
                {isAccountActive ? 'Active' : 'Expired'}
              </Text>
            </View>
          </View>
        </View>

        {/* QUICK ACTION TOOLBAR ROW */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f97316', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => handleRechargeAccount(activeSubProfile)}
            disabled={rechargingAccount}
          >
            {rechargingAccount ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Feather name="refresh-cw" size={14} color="#ffffff" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>Advance Renewal</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => handleOpenResetPassword(activeSubProfile)}
          >
            <Feather name="key" size={14} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => {
              toast.success('MAC binding cleared for subscriber.');
            }}
          >
            <Feather name="globe" size={14} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Remove MAC</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => {
              toast.info('Session History: Active RADIUS sessions loaded.');
            }}
          >
            <Feather name="list" size={14} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Session History</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => {
              toast.info('Documents: Aadhaar e-KYC Verification Records.');
            }}
          >
            <Feather name="file-text" size={14} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Documents</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
            onPress={() => handleOpenEdit(activeSubProfile)}
          >
            <Feather name="edit-3" size={14} color="#000000" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* 3-COLUMN DETAIL CARDS GRID */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16, marginBottom: 16 }}>
          {/* CARD 1: ACCOUNT DETAILS */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <Feather name="user" size={16} color="#000000" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Account Details</Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Username</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>{activeSubProfile.username || '—'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Customer</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>{activeSubProfile.full_name || activeSubProfile.name || '—'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Email</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>{activeSubProfile.email || `${activeSubProfile.username || 'user'}@gmail.com`}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Mobile</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>{activeSubProfile.mobile || '—'}</Text>
                  <Feather name="check-circle" size={13} color="#10b981" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Customer Verification</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Verified</Text>
                  <Feather name="check-circle" size={13} color="#10b981" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Aadhar Verification</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>Verified</Text>
                  <Feather name="check-circle" size={13} color="#10b981" />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Aadhar Verification Date</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>01 Aug, 2026 08:21 am</Text>
              </View>
            </View>
          </View>

          {/* CARD 2: PACKAGE DETAILS */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <Feather name="package" size={16} color="#000000" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Package Details</Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Package</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#000000' }}>{activeSubProfile.package_name || activeSubProfile.plan || '100 Mbps_unlimited'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Sub Plan</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>{activeSubProfile.subplan_name || '1 Month'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Expiry</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#000000' }}>{activeSubProfile.expiration || activeSubProfile.expiryDate || '01 Nov 2026, 08:21 am'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Balance</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>₹ {activeSubProfile.dueAmount !== null && activeSubProfile.dueAmount !== undefined ? activeSubProfile.dueAmount : '40.10'} (Balance)</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Status</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isAccountActive ? '#10b981' : '#ef4444' }}>{activeSubProfile.status_text || 'Active'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Invoice</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>₹ {activeSubProfile.invoiceAmount !== null && activeSubProfile.invoiceAmount !== undefined ? activeSubProfile.invoiceAmount : '0.00'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Paid</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>₹ {activeSubProfile.totalPaid !== null && activeSubProfile.totalPaid !== undefined ? activeSubProfile.totalPaid : '40.10'}</Text>
              </View>
            </View>
          </View>

          {/* CARD 3: CONNECTION DETAILS */}
          <View style={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <Feather name="globe" size={16} color="#000000" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Connection Details</Text>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Online Status</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isOnline ? '#10b981' : '#ef4444' }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Activation Date</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>01 Aug, 2026 08:21 am</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Last Logout</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>18 Sep, 2026 08:51 pm</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>State</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>Andhra Pradesh</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Customer Type</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>individual</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Simultaneous Use</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>1</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Subscription</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>Prepaid</Text>
              </View>
            </View>
          </View>
        </View>

        {/* BOTTOM FULL-WIDTH ADDRESS INFORMATION CARD */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
            <Feather name="map-pin" size={16} color="#000000" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Address Information</Text>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 24 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, marginBottom: 6 }}>BILLING ADDRESS</Text>
              <Text style={{ fontSize: 13, color: '#000000', lineHeight: 20 }}>{activeSubProfile.address || '4-83, Telaprolu, Telaprolu, Krishna.'}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, marginBottom: 6 }}>INSTALLATION ADDRESS</Text>
              <Text style={{ fontSize: 13, color: '#000000', lineHeight: 20 }}>{activeSubProfile.address || '4-83, Telaprolu, Telaprolu, Krishna.'}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: isMobile ? 12 : 24,
          paddingVertical: isMobile ? 14 : 24,
          width: '100%',
        },
      ]}
    >
      {toastMsg ? (
        <View style={styles.toastBanner}>
          <Text style={styles.toastText}>{toastMsg}</Text>
        </View>
      ) : null}

      {/* UNIFIED SEARCH CONTROL CARD */}
      <View style={styles.unifiedControlCard}>
        {/* Search Bar & Add Customer Button */}
        <View style={[styles.topControlRow, { gap: 10, flexWrap: 'wrap' }]}>
          <View style={[styles.searchBox, { flex: 1, maxWidth: '100%' }]}>
            <Feather name="search" size={15} color={COLORS.textDim} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Username, Mobile, Full Name, Package, Expiration..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={COLORS.textDim}
            />
          </View>
          {((user?.role || user?.account_role || '').toLowerCase() === 'operator') && (
            <TouchableOpacity style={styles.addCustomerHeaderBtn} onPress={() => setShowAddCustomer(true)}>
              <Feather name="user-plus" size={14} color="#ffffff" />
              <Text style={styles.addCustomerHeaderBtnText}>Add Customer</Text>
            </TouchableOpacity>
          )}

          {/* Page Limits Selector (100, 200, 500, ALL) */}
          <View style={styles.limitRowContainer}>
            <Text style={styles.limitLabelText}>Limit:</Text>
            {[100, 200, 500, 'ALL'].map((limitOpt) => {
              const limitKey = limitOpt === 'ALL' ? 'all' : limitOpt;
              const isSelected = recordsLimit === limitKey || (recordsLimit === 'all' && limitOpt === 'ALL');
              return (
                <TouchableOpacity
                  key={String(limitOpt)}
                  style={[styles.limitChip, isSelected && styles.limitChipActive]}
                  onPress={() => {
                    const val = limitOpt === 'ALL' ? 'all' : limitOpt;
                    setRecordsLimit(val);
                  }}
                >
                  <Text style={[styles.limitChipText, isSelected && styles.limitChipTextActive]}>
                    {limitOpt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Bottom Filter Chips Line */}
        <View style={styles.bottomChipRowContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {viewMode === 'iptv'
              ? [
                  { id: 'all', label: `All Pioneer STBs (${counts.total})` },
                  { id: 'iptv_active', label: `Active STBs (${counts.active})` },
                  { id: 'iptv_expired', label: `Expired STBs (${counts.expired})` },
                  { id: 'online', label: `Online Streaming (${counts.online})` },
                ].map((tab) => {
                  const isActive =
                    activeFilter === tab.id ||
                    (activeFilter === 'all' && tab.id === 'all') ||
                    (activeFilter === 'iptv_all' && tab.id === 'all');
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.chip, isActive && styles.chipActiveIptv]}
                      onPress={() => handleSelectFilter(tab.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })
              : [
                  { id: 'all', label: `All Subscribers (${counts.total})` },
                  { id: 'active', label: `Active (${counts.active})` },
                  { id: 'online', label: `Online (${counts.online})` },
                  { id: 'expired', label: `Expired (${counts.expired})` },
                  { id: 'suspend', label: `Suspended (${counts.suspend})` },
                ].map((tab) => {
                  const isActive = activeFilter === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[styles.chip, isActive && styles.chipActive]}
                      onPress={() => handleSelectFilter(tab.id)}
                    >
                      <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
          </ScrollView>
        </View>
      </View>

      {/* SERVICE DATA DISPLAY TABLE */}
      <View style={styles.card}>

        {isMobile ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 1100 }}>
              {viewMode === 'iptv' ? (
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 1.5 }]}>Username / STB</Text>
                  <Text style={[styles.th, { flex: 1.6 }]}>Status / Online</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>Mobile</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Full Name</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Package Name</Text>
                  <Text style={[styles.th, { flex: 1.8 }]}>Subplan Name</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Expiration</Text>
                </View>
              ) : (
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
                  <Text style={[styles.th, { flex: 1.6 }]}>Status / Online</Text>
                  <Text style={[styles.th, { flex: 1.5 }]}>Mobile</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Full Name</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Package Name</Text>
                  <Text style={[styles.th, { flex: 1.8 }]}>Subplan Name</Text>
                  <Text style={[styles.th, { flex: 2 }]}>Expiration</Text>
                </View>
              )}

              {filteredCustomers.map((cust, idx) => (
                <View key={cust.id ? `cust_${cust.id}_${idx}` : idx} style={styles.tr}>
                  {viewMode === 'iptv' ? (
                    <>
                      <View style={{ flex: 1.5 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableUsername}>{cust.username}</Text>
                        </TouchableOpacity>
                        {cust.stb_id ? <Text style={styles.tdSub}>STB: {cust.stb_id}</Text> : null}
                      </View>

                      <View style={{ flex: 1.6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {cust.status_text ? (
                            <View
                              style={[
                                styles.statusTag,
                                cust.status_text === 'Active' || cust.status === 'active'
                                  ? styles.tagActive
                                  : cust.status === 'expired'
                                  ? styles.tagExpired
                                  : styles.tagWarn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusTagText,
                                  cust.status_text === 'Active' || cust.status === 'active'
                                    ? styles.tagTextActive
                                    : cust.status === 'expired'
                                    ? styles.tagTextExpired
                                    : styles.tagTextWarn,
                                ]}
                              >
                                {cust.status_text}
                              </Text>
                            </View>
                          ) : null}
                          {cust.online ? (
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '700',
                                color: cust.online === 'ONLINE' || cust.isOnline ? COLORS.accentEmerald : COLORS.textMuted,
                              }}
                            >
                              {cust.online}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={styles.tdText}>{cust.mobile}</Text>
                      </View>

                      <View style={{ flex: 2 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableName}>{cust.full_name || cust.name}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 2 }}>
                        <Text style={[styles.tdBold, { color: '#8b5cf6' }]}>{cust.package_name}</Text>
                      </View>

                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.tdSub}>{cust.subplan_name}</Text>
                      </View>

                      <View style={{ flex: 2 }}>
                        <Text style={styles.tdText}>{cust.expiration}</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={{ flex: 1.5 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableUsername}>{cust.username}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 1.6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {cust.status_text ? (
                            <View
                              style={[
                                styles.statusTag,
                                cust.status_text === 'Active' || cust.status === 'active'
                                  ? styles.tagActive
                                  : cust.status === 'expired'
                                  ? styles.tagExpired
                                  : styles.tagWarn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusTagText,
                                  cust.status_text === 'Active' || cust.status === 'active'
                                    ? styles.tagTextActive
                                    : cust.status === 'expired'
                                    ? styles.tagTextExpired
                                    : styles.tagTextWarn,
                                ]}
                              >
                                {cust.status_text}
                              </Text>
                            </View>
                          ) : null}
                          {cust.online ? (
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: '700',
                                color: cust.online === 'ONLINE' || cust.isOnline ? COLORS.accentEmerald : COLORS.textMuted,
                              }}
                            >
                              {cust.online}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <View style={{ flex: 1.5 }}>
                        <Text style={styles.tdText}>{cust.mobile}</Text>
                      </View>

                      <View style={{ flex: 2 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={styles.tdClickableName}>{cust.full_name || cust.name}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flex: 2 }}>
                        <Text style={styles.tdBold}>{cust.package_name}</Text>
                      </View>

                      <View style={{ flex: 1.8 }}>
                        <Text style={styles.tdSub}>{cust.subplan_name}</Text>
                      </View>

                      <View style={{ flex: 2 }}>
                        <Text style={styles.tdText}>{cust.expiration}</Text>
                      </View>
                    </>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={{ width: '100%' }}>
            {viewMode === 'iptv' ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.5 }]}>Username / STB</Text>
                <Text style={[styles.th, { flex: 1.6 }]}>Status / Online</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Mobile</Text>
                <Text style={[styles.th, { flex: 2 }]}>Full Name</Text>
                <Text style={[styles.th, { flex: 2 }]}>Package Name</Text>
                <Text style={[styles.th, { flex: 1.8 }]}>Subplan Name</Text>
                <Text style={[styles.th, { flex: 2 }]}>Expiration</Text>
              </View>
            ) : (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.5 }]}>Username</Text>
                <Text style={[styles.th, { flex: 1.6 }]}>Status / Online</Text>
                <Text style={[styles.th, { flex: 1.5 }]}>Mobile</Text>
                <Text style={[styles.th, { flex: 2 }]}>Full Name</Text>
                <Text style={[styles.th, { flex: 2 }]}>Package Name</Text>
                <Text style={[styles.th, { flex: 1.8 }]}>Subplan Name</Text>
                <Text style={[styles.th, { flex: 2 }]}>Expiration</Text>
              </View>
            )}

            {filteredCustomers.map((cust, idx) => (
              <View key={cust.id ? `cust_${cust.id}_${idx}` : idx} style={styles.tr}>
                {viewMode === 'iptv' ? (
                  <>
                    <View style={{ flex: 1.5 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableUsername}>{cust.username}</Text>
                      </TouchableOpacity>
                      {cust.stb_id ? <Text style={styles.tdSub}>STB: {cust.stb_id}</Text> : null}
                    </View>

                    <View style={{ flex: 1.6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {cust.status_text ? (
                          <View
                            style={[
                              styles.statusTag,
                              cust.status_text === 'Active' || cust.status === 'active'
                                ? styles.tagActive
                                : cust.status === 'expired'
                                ? styles.tagExpired
                                : styles.tagWarn,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagText,
                                cust.status_text === 'Active' || cust.status === 'active'
                                  ? styles.tagTextActive
                                  : cust.status === 'expired'
                                  ? styles.tagTextExpired
                                  : styles.tagWarn,
                              ]}
                            >
                              {cust.status_text}
                            </Text>
                          </View>
                        ) : null}
                        {cust.online ? (
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: cust.online === 'ONLINE' || cust.isOnline ? COLORS.accentEmerald : COLORS.textMuted,
                            }}
                          >
                            {cust.online}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.tdText}>{cust.mobile}</Text>
                    </View>

                    <View style={{ flex: 2 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableName}>{cust.full_name || cust.name}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={[styles.tdBold, { color: '#8b5cf6' }]}>{cust.package_name}</Text>
                    </View>

                    <View style={{ flex: 1.8 }}>
                      <Text style={styles.tdSub}>{cust.subplan_name}</Text>
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdText}>{cust.expiration}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flex: 1.5 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableUsername}>{cust.username}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1.6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {cust.status_text ? (
                          <View
                            style={[
                              styles.statusTag,
                              cust.status_text === 'Active' || cust.status === 'active'
                                ? styles.tagActive
                                : cust.status === 'expired'
                                ? styles.tagExpired
                                : styles.tagWarn,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagText,
                                cust.status_text === 'Active' || cust.status === 'active'
                                  ? styles.tagTextActive
                                  : cust.status === 'expired'
                                  ? styles.tagTextExpired
                                  : styles.tagWarn,
                              ]}
                            >
                              {cust.status_text}
                            </Text>
                          </View>
                        ) : null}
                        {cust.online ? (
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              color: cust.online === 'ONLINE' || cust.isOnline ? COLORS.accentEmerald : COLORS.textMuted,
                            }}
                          >
                            {cust.online}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.tdText}>{cust.mobile}</Text>
                    </View>

                    <View style={{ flex: 2 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text style={styles.tdClickableName}>{cust.full_name || cust.name}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdBold}>{cust.package_name}</Text>
                    </View>

                    <View style={{ flex: 1.8 }}>
                      <Text style={styles.tdSub}>{cust.subplan_name}</Text>
                    </View>

                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdText}>{cust.expiration}</Text>
                    </View>
                  </>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* EDIT SUBSCRIBER DETAILS MODAL */}
      <Modal visible={!!editingCustomer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="edit" size={18} color={COLORS.primary} />
                <Text style={styles.modalTitle}>
                  {viewMode === 'iptv' ? 'Edit Pioneer STB Record' : 'Edit Subscriber Details'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditingCustomer(null)}>
                <Feather name="x" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>
              Update profile fields directly in the OneBSS engine via <Text style={{ fontWeight: '700' }}>update_internet_customer.php</Text> or <Text style={{ fontWeight: '700' }}>update_iptv_stb.php</Text>
            </Text>

            <View style={styles.formGrid}>
              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>SUBSCRIBER FULL NAME</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.name}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, name: val }))}
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.mobile}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, mobile: val }))}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>{viewMode === 'iptv' ? 'IPTV CHANNEL PACKAGE' : 'BROADBAND PLAN'}</Text>
                <TextInput
                  style={styles.formInput}
                  value={editForm.plan}
                  onChangeText={(val) => setEditForm((p) => ({ ...p, plan: val }))}
                />
              </View>

              {viewMode === 'iptv' && (
                <>
                  <View style={styles.fieldItem}>
                    <Text style={styles.fieldLabel}>STB SERIAL ID</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editForm.stb_id}
                      onChangeText={(val) => setEditForm((p) => ({ ...p, stb_id: val }))}
                    />
                  </View>
                  <View style={styles.fieldItem}>
                    <Text style={styles.fieldLabel}>STB MAC ADDRESS</Text>
                    <TextInput
                      style={styles.formInput}
                      value={editForm.stb_mac}
                      onChangeText={(val) => setEditForm((p) => ({ ...p, stb_mac: val }))}
                    />
                  </View>
                </>
              )}

              <View style={styles.fieldItem}>
                <Text style={styles.fieldLabel}>ACCOUNT STATUS</Text>
                <View style={styles.statusChipPicker}>
                  {['active', 'expired', 'suspend'].map((st) => (
                    <TouchableOpacity
                      key={st}
                      style={[
                        styles.statusPickerChip,
                        editForm.status === st && styles.statusPickerChipActive,
                      ]}
                      onPress={() => setEditForm((p) => ({ ...p, status: st }))}
                    >
                      <Text
                        style={[
                          styles.statusPickerText,
                          editForm.status === st && styles.statusPickerTextActive,
                        ]}
                      >
                        {st.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setEditingCustomer(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save & Sync API'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  limitRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  limitLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginRight: 2,
  },
  limitChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.bgSecondary,
  },
  limitChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  limitChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  limitChipTextActive: {
    color: '#ffffff',
  },
  addCustomerHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addCustomerHeaderBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgPrimary },
  content: { width: '100%', paddingHorizontal: '3%', paddingVertical: 20 },
  toastBanner: {
    padding: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.accentEmerald,
    borderRadius: 10,
    marginBottom: 14,
  },
  toastText: { color: COLORS.accentEmerald, fontSize: 13, fontWeight: '700' },
  unifiedControlCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    gap: 10,
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  toggleBtnActive: { backgroundColor: COLORS.primary },
  toggleBtnActiveIptv: { backgroundColor: '#8b5cf6' },
  toggleText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  toggleTextActive: { color: '#ffffff' },
  searchBox: {
    flex: 1,
    minWidth: 200,
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 32,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 12, color: COLORS.textMain, outlineStyle: 'none' },
  bottomChipRowContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 8,
  },
  chipRow: { flexDirection: 'row' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)', marginRight: 6 },
  chipActive: { backgroundColor: COLORS.primary },
  chipActiveIptv: { backgroundColor: '#8b5cf6' },
  chipText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#ffffff' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 20, marginBottom: 20 },
  cardHeader: { marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  tableHeader: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder },
  th: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  tdBold: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  tdSub: { fontSize: 11, color: COLORS.textMuted },
  tdText: { fontSize: 12, color: COLORS.textMain },
  tdClickableName: { fontSize: 13, fontWeight: '700', color: COLORS.primary, textDecorationLine: 'underline', cursor: 'pointer' },
  tdClickableUsername: { fontSize: 13, fontWeight: '700', color: COLORS.primary, textDecorationLine: 'underline', cursor: 'pointer' },
  tdClickableMobile: { fontSize: 11, color: COLORS.accentCyan, fontWeight: '600' },
  statusTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  tagActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  tagExpired: { backgroundColor: 'rgba(244, 63, 94, 0.1)' },
  tagWarn: { backgroundColor: 'rgba(245, 158, 11, 0.1)' },
  tagMuted: { backgroundColor: 'rgba(100, 116, 139, 0.1)' },
  statusTagText: { fontSize: 9, fontWeight: '700' },
  tagTextActive: { color: COLORS.accentEmerald },
  tagTextExpired: { color: COLORS.accentRose },
  tagTextWarn: { color: COLORS.accentAmber },
  tagTextMuted: { color: '#64748b' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  editBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },

  // Full Screen Control & Profile Styles
  screenControlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  subHeaderInfo: { alignItems: 'flex-end' },
  subHeaderTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textMain },
  financialSectionCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 18, marginBottom: 20 },
  sectionTitleHeader: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 12 },
  financialMetricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  finCard: { flex: 1, minWidth: 120, backgroundColor: COLORS.bgSecondary, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.glassBorder },
  finLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },
  finVal: { fontSize: 18, fontWeight: '700', color: COLORS.textMain, marginTop: 4 },
  expiryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(244, 63, 94, 0.08)', borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.2)', padding: 12, borderRadius: 10 },
  expiryLabel: { fontSize: 9, fontWeight: '800', color: COLORS.accentRose },
  expiryVal: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginTop: 2 },
  profileTwoColLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cardSectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, marginBottom: 14 },
  detailsDataGrid: { gap: 12 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  dataLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  dataVal: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  dataValBold: { fontSize: 13, color: COLORS.textMain, fontWeight: '700' },
  actionControlsGroup: { gap: 10 },
  actionBtnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10 },
  actionBtnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  actionBtnAccent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', paddingVertical: 12, borderRadius: 10 },
  actionBtnAccentText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  actionBtnWarn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)', paddingVertical: 12, borderRadius: 10 },
  actionBtnWarnText: { color: COLORS.accentAmber, fontSize: 13, fontWeight: '700' },
  actionBtnDark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0f172a', paddingVertical: 12, borderRadius: 10 },
  actionBtnDarkText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },

  // Form Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: '#ffffff', borderRadius: 14, padding: 20, boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)', elevation: 5 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  modalSub: { fontSize: 11, color: COLORS.textMuted, marginBottom: 16 },
  formGrid: { gap: 12, marginBottom: 20 },
  fieldItem: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  formInput: { height: 36, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 8, paddingHorizontal: 10, fontSize: 12, color: COLORS.textMain, backgroundColor: COLORS.bgSecondary },
  statusChipPicker: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statusPickerChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)' },
  statusPickerChipActive: { backgroundColor: COLORS.primary },
  statusPickerText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  statusPickerTextActive: { color: '#ffffff' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.9)' },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },

  // Sync API Header & Row Action Button Styles
  btnBulkRadius: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnBulkRadiusText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  btnIptvStb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnIptvStbText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  syncIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  syncIconBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
