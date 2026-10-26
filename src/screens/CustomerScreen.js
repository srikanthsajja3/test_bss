import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Modal, ActivityIndicator, useWindowDimensions, Linking, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome } from '@expo/vector-icons';
import { COLORS, GLASS_CARD_INTERACTIVE } from '../constants/theme';
import { OneBssApi, setApiConfig, newClientRef } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { AddCustomerScreen } from './AddCustomerScreen';
import { IptvAccountDetails } from '../components/IptvAccountDetails';
import { InternetRechargeModal } from '../components/internet/InternetRechargeModal';
import { PasswordModal, MacBindingsModal, SessionHistoryModal, AuthLogsModal, VerifyCustomerModal, DocumentsModal } from '../components/internet/AccountActionModals';
import { CustomerPhoto, isSuperAdmin, isAccountVerified } from '../components/internet/shared';
import { IptvRechargeModal } from '../components/iptv/IptvRechargeModal';
import { ComboRechargeModal } from '../components/combo/ComboRechargeModal';
import { OttRechargeModal } from '../components/ott/OttRechargeModal';
import { AddOttModal } from '../components/ott/AddOttModal';
import { CustomerAccountsOverview, defaultRechargeType, formatApiDate, normaliseInternetAccount, normaliseIptvAccount } from '../components/CustomerAccountsOverview';
import { CustomerLocationModal } from '../components/CustomerLocationModal';
import { CustomerDevicesModal } from '../components/CustomerDevicesModal';
import { OnlineSessionPanel } from '../components/internet/OnlineSessionPanel';

const calculateBalanceDays = (expiryDateStr) => {
  if (!expiryDateStr || expiryDateStr === '—' || expiryDateStr === 'N/A') {
    return { text: 'N/A', days: null, status: 'unknown' };
  }

  try {
    let dateObj = null;
    if (typeof expiryDateStr === 'string' && expiryDateStr.includes('-')) {
      const parts = expiryDateStr.split('-');
      if (parts[0].length === 4) {
        dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else if (parts[2].length === 4) {
        dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
    } else if (typeof expiryDateStr === 'string' && expiryDateStr.includes('/')) {
      const parts = expiryDateStr.split('/');
      if (parts[2].length === 4) {
        dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      dateObj = new Date(expiryDateStr);
    }

    if (isNaN(dateObj.getTime())) {
      return { text: String(expiryDateStr), days: null, status: 'unknown' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateObj.setHours(0, 0, 0, 0);

    const diffTime = dateObj.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return { text: `${diffDays} ${diffDays === 1 ? 'Day' : 'Days'} Left`, days: diffDays, status: 'active' };
    } else if (diffDays === 0) {
      return { text: 'Expires Today', days: 0, status: 'warning' };
    } else {
      const absDays = Math.abs(diffDays);
      return { text: `Expired ${absDays} ${absDays === 1 ? 'day' : 'days'} ago`, days: diffDays, status: 'expired' };
    }
  } catch (e) {
    return { text: '—', days: null, status: 'unknown' };
  }
};

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
// accIndex picks which internet account to map (defaults to the first one for the list table)
const mapCustomersListToBroadbandRow = (item, index, accIndex = 0) => {
  const intAcc = item.internet_accounts?.[accIndex] || {};
  const statusText = resolveApiField(item.status_text, intAcc.status_text, item.status);
  const onlineStatus = resolveApiField(item.online, intAcc.online);
  const isOnline = onlineStatus === 'ONLINE';
  const status = (statusText || '').toLowerCase();
  const mobile = resolveApiField(item.mobile, intAcc.mobile);
  const fullName = resolveApiField(item.full_name, item.name);
  const username = resolveApiField(item.username, intAcc.username);
  const packageName = resolveApiField(item.package_name, intAcc.package_name, intAcc.plan_name || item.plan) || (intAcc.package_id ? `Package #${intAcc.package_id}` : '-');
  const subplanName = resolveApiField(item.subplan_name, intAcc.subplan_name) || (intAcc.subplan_id ? `Sub plan #${intAcc.subplan_id}` : '-');
  const expiration = resolveApiField(item.expiration, intAcc.expiration);
  const partnerName = resolveApiField(item.partner_name, intAcc.partner_name, item.partner, item.partner_title, item.partner_id);
  const partnerId = resolveApiField(item.partner_id, intAcc.partner_id, item.operator_id, item.partner);
  const passwordVal = item.password !== undefined ? item.password : (intAcc.password !== undefined ? intAcc.password : (item.pass !== undefined ? item.pass : intAcc.pass));

  return {
    id: String(item.cust_id || item.id || index + 1),
    cust_id: item.cust_id !== undefined ? item.cust_id : null,
    internet_id: intAcc.internet_id !== undefined ? intAcc.internet_id : null,
    name: fullName,
    full_name: fullName,
    mobile: mobile,
    username: username,
    password: passwordVal,
    partner_name: partnerName,
    partner_id: partnerId,
    operator_id: partnerId,
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
    dueDate: resolveApiField(item.due_date, intAcc.due_date),
    expiryDate: expiration,
    address: resolveApiField(item.installation_address, item.billing_address, item.address),
    billing_address: resolveApiField(item.billing_address, item.address),
    installation_address: resolveApiField(item.installation_address, item.address),
    email: resolveApiField(item.email),
    account_type: 'internet',
    verified: resolveApiField(intAcc.verified),
    acc_id: intAcc.acc_id !== undefined ? intAcc.acc_id : null,
    package_id: intAcc.package_id !== undefined ? intAcc.package_id : null,
    subplan_id: intAcc.subplan_id !== undefined ? intAcc.subplan_id : null,
    activation_date: resolveApiField(intAcc.activation_date),
    last_logoff: resolveApiField(intAcc.last_loff_off),
    renewal_date: resolveApiField(intAcc.renewal_date),
    ip_address: resolveApiField(intAcc.ip_address),
    status_color: intAcc.status_color,
    customer_type: resolveApiField(intAcc.customer_type),
    simultaneous_use: resolveApiField(intAcc.simultanious_use),
    subscription_type: intAcc.subscription_type,
    aadhar_verified: !!item.aadhar_verified,
    aadhar_verified_date: resolveApiField(item.aadhar_verified_date),
    mobile_verified: !!item.mobile_verified,
  };
};

// "12 days left" / "Expires today" / "Expired 3 days ago" / "Not activated" (no amounts)
const validityLeft = (expiry) => {
  const s = String(expiry || '').trim();
  const d = s ? new Date(s.replace(' ', 'T')) : null;
  if (!d || isNaN(d.getTime()) || d.getFullYear() < 2000) return { text: 'Not activated', color: '#64748b' };
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (d.getTime() <= Date.now()) {
    const ago = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    return { text: ago === 0 ? 'Expired today' : `Expired ${ago} day${ago === 1 ? '' : 's'} ago`, color: '#ef4444' };
  }
  if (days <= 1) return { text: 'Expires today', color: '#f59e0b' };
  return { text: `${days} days left`, color: days <= 5 ? '#f59e0b' : '#10b981' };
};

// Map API customers_list entities directly to IPTV Table Rows
const mapCustomersListToIptvRow = (item, index, accIndex = 0) => {
  const iptvAcc = item.iptv_accounts?.[accIndex] || {};
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
  const realExpiry = resolveApiField(item.expiration, iptvAcc.expiration, iptvAcc.expriration, intAcc.expiration);
  // IPTV: show the paid-till date (expected expiry) when it is later than Pioneer's real expiry
  const paidTill = resolveApiField(item.expected_expiry, iptvAcc.expected_expiry);
  const expiration = paidTill && realExpiry && new Date(String(paidTill).replace(' ', 'T')) > new Date(String(realExpiry).replace(' ', 'T')) ? paidTill : realExpiry || paidTill;
  const partnerName = resolveApiField(item.partner_name, iptvAcc.partner_name, intAcc.partner_name, item.partner, item.partner_title, item.partner_id);
  const partnerId = resolveApiField(item.partner_id, iptvAcc.partner_id, intAcc.partner_id, item.operator_id, item.partner);
  const passwordVal = item.password !== undefined ? item.password : (iptvAcc.password !== undefined ? iptvAcc.password : (intAcc.password !== undefined ? intAcc.password : (item.pass !== undefined ? item.pass : iptvAcc.pass)));
  const custNum = item.cust_id || index + 1;

  return {
    id: String(`iptv_${custNum}`),
    cust_id: item.cust_id !== undefined ? item.cust_id : null,
    name: fullName,
    full_name: fullName,
    mobile: mobile,
    username: username,
    password: passwordVal,
    partner_name: partnerName,
    partner_id: partnerId,
    operator_id: partnerId,
    status_text: statusText,
    online: onlineStatus,
    package_name: packageName,
    subplan_name: subplanName,
    expiration: expiration,
    stb_id: resolveApiField(item.stb_id, iptvAcc.pioneer_stb_id, iptvAcc.stb_box, iptvAcc.stb_id) || '',
    stb_mac: resolveApiField(item.stb_mac, iptvAcc.smartcard, iptvAcc.stb_mac_id, iptvAcc.mac) || `00:1A:79:${(custNum * 17) % 89 + 10}:4F:${(custNum * 23) % 89 + 10}`,
    stb_model: resolveApiField(item.stb_model, iptvAcc.stb_model) || 'Pioneer HD-4K',
    plan: packageName,
    iptv_package: packageName,
    cas_status: resolveApiField(item.cas_status, iptvAcc.cas_status) || 'ACTIVE',
    status: status === 'expired' ? 'expired' : (status === 'suspend' ? 'suspend' : (status === 'active' ? 'active' : status)),
    isOnline: isOnline,
    ip: resolveApiField(item.ip, iptvAcc.ip, intAcc.ip),
    kyc: item.aadhar_verified ? 'Aadhaar Verified' : resolveApiField(item.kyc),
    dueDate: resolveApiField(item.due_date, iptvAcc.due_date, intAcc.due_date),
    expiryDate: expiration,
    address: resolveApiField(item.installation_address, item.billing_address, item.address),
    billing_address: resolveApiField(item.billing_address, item.address),
    installation_address: resolveApiField(item.installation_address, item.address),
    email: resolveApiField(item.email),
    account_type: 'iptv',
    iptv_id: iptvAcc.id !== undefined ? iptvAcc.id : null,
    package_id: iptvAcc.plan_id !== undefined ? iptvAcc.plan_id : null,
    subplan_id: iptvAcc.subplan_id !== undefined ? iptvAcc.subplan_id : null,
    activation_date: resolveApiField(iptvAcc.dad),
    last_logoff: '',
    customer_type: '',
    simultaneous_use: '',
    subscription_type: undefined,
    aadhar_verified: !!item.aadhar_verified,
    aadhar_verified_date: resolveApiField(item.aadhar_verified_date),
    mobile_verified: !!item.mobile_verified,
  };
};

// ---- Subscriber list (customers_list.php: one flat row per account) ----

// Filter keys arrive from the dashboard / URL in several spellings
// ('suspend', 'Suspended', 'iptv_active', 'iptv_all', ...). Map them onto the
// status buckets customers_list.php understands.
const LIST_FILTERS_INTERNET = ['all', 'new', 'active', 'online', 'offline', 'expired', 'suspended', 'disabled'];
const LIST_FILTERS_IPTV = ['all', 'active', 'expired', 'suspended', 'disabled', 'new'];
const normalizeListFilter = (key, isIptv = false) => {
  let k = String(key || 'all').trim().toLowerCase().replace(/^iptv_?/, '');
  if (k === '' || k === 'iptv') k = 'all';
  if (k === 'suspend') k = 'suspended';
  if (k === 'newsub') k = 'new';
  const allowed = isIptv ? LIST_FILTERS_IPTV : LIST_FILTERS_INTERNET;
  return allowed.includes(k) ? k : 'all';
};

// Same buckets as customers_list.php (used only if an older backend sends no status_key)
const listStatusKey = (value) => {
  const st = String(value ?? '').trim().toLowerCase();
  if (st === '' || st.startsWith('new')) return 'new';
  if (st.startsWith('activ')) return 'active';
  if (st.startsWith('expir')) return 'expired';
  if (st.startsWith('suspen')) return 'suspended';
  if (st.startsWith('disab') || st.startsWith('deactiv') || st.startsWith('inactiv')) return 'disabled';
  return 'other';
};

// Fallback counts for an older backend that doesn't return `counts` (covers this page only)
const countListRows = (rows, isIptv) => {
  const c = { total: rows.length, active: 0, expired: 0, suspended: 0, disabled: 0, new: 0 };
  if (!isIptv) { c.online = 0; c.offline = 0; }
  rows.forEach((r) => {
    const key = r.status_key || listStatusKey(isIptv ? r.status : r.status_text);
    if (c[key] !== undefined) c[key] += 1;
    if (!isIptv) {
      if (String(r.online || '').toUpperCase() === 'ONLINE') c.online += 1;
      else c.offline += 1;
    }
  });
  return c;
};

// Expiry / registration ranges (customers_by_date.php) — opened from the dashboard buttons
export const DATE_RANGES = [
  { key: 'expiring_next_7_days', label: 'Expires in next 7 days', kind: 'expiry' },
  { key: 'expired_last_7_days', label: 'Expired in last 7 days', kind: 'expiry' },
  { key: 'expires_today', label: 'Expires today', kind: 'expiry' },
  { key: 'expires_tomorrow', label: 'Expires tomorrow', kind: 'expiry' },
  { key: 'expired_yesterday', label: 'Expired yesterday', kind: 'expiry' },
  { key: 'registered_today', label: 'Registered today', kind: 'registered' },
  { key: 'registered_yesterday', label: 'Registered yesterday', kind: 'registered' },
  { key: 'registered_this_month', label: 'Registered this month', kind: 'registered' },
  { key: 'registered_last_month', label: 'Registered last month', kind: 'registered' },
];
const findDateRange = (key) => DATE_RANGES.find((r) => r.key === key) || null;

const STATUS_BADGE = {
  active: { label: 'Active', bg: '#dcfce7', fg: '#15803d', dot: '#16a34a' },
  expired: { label: 'Expired', bg: '#ffe4e6', fg: '#be123c', dot: '#e11d48' },
  suspended: { label: 'Suspended', bg: '#fef3c7', fg: '#b45309', dot: '#d97706' },
  disabled: { label: 'Disabled', bg: '#f1f5f9', fg: '#475569', dot: '#64748b' },
  new: { label: 'New', bg: '#ede9fe', fg: '#6d28d9', dot: '#8b5cf6' },
  other: { label: '—', bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' },
};

const isBlankValue = (v) => v === undefined || v === null || String(v).trim() === '' || String(v).trim().toLowerCase() === 'null';

const mapInternetListRow = (r, idx) => {
  const statusKey = r.status_key || listStatusKey(r.status_text);
  const intId = r.internet_id ?? r.username ?? r.cust_id ?? r.id ?? idx;
  return {
    ...r,
    id: `int_${intId}`,
    name: r.full_name || '',
    status: statusKey,
    status_key: statusKey,
    isOnline: r.is_online !== undefined ? !!r.is_online : String(r.online || '').toUpperCase() === 'ONLINE',
    package_name: r.package_name || (r.package_id ? `Package #${r.package_id}` : ''),
    subplan_name: r.subplan_name || (r.subplan_id ? `Sub plan #${r.subplan_id}` : ''),
    account_type: 'internet',
  };
};

const mapIptvListRow = (r, idx) => {
  const statusKey = r.status_key || listStatusKey(r.status);
  const iptvIdentifier = r.iptv_id ?? r.stb_box ?? r.pioneer_stb_id ?? r.cust_id ?? r.id ?? idx;
  return {
    ...r,
    id: `iptv_${iptvIdentifier}`,
    name: r.full_name || '',
    status_text: r.status,
    status: statusKey,
    status_key: statusKey,
    account_type: 'iptv',
  };
};

// Top-level fields on a customers_list row that really belong to one account
const ACCOUNT_LEVEL_KEYS = [
  'username', 'status_text', 'status', 'online', 'package_name', 'subplan_name', 'plan', 'expiration',
  'ip', 'stb_id', 'stb_mac', 'stb_model', 'cas_status', 'total_bill_amount', 'paid_amount', 'balance', 'due_date',
  'internet_id', 'package_id', 'subplan_id', 'acc_id',
];

export const CustomerScreen = ({ user, isIptvMode = false, initialFilter = 'all', initialRange = '', initialSearch = '', onSwitchMode, onAutoCloseSidebar, refreshSignal = 0 }) => {
  const { width, height: winHeight } = useWindowDimensions();
  const isMobile = width < 768;

  const isOperatorRole = String(user?.role || user?.account_role || '').toLowerCase() === 'operator';
  const [viewMode, setViewMode] = useState(isIptvMode ? 'iptv' : 'broadband');
  const [activeFilter, setActiveFilter] = useState(() => normalizeListFilter(initialFilter, isIptvMode));
  const [activeRange, setActiveRange] = useState(() => (findDateRange(initialRange) ? initialRange : ''));
  const activeRangeInfo = findDateRange(activeRange);
  const showRegisteredCol = activeRangeInfo?.kind === 'registered'; // extra "Registered On" column
  useEffect(() => {
    setActiveRange(findDateRange(initialRange) ? initialRange : '');
  }, [initialRange]);
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || '');

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchQuery(initialSearch || '');
      setDebouncedSearch(initialSearch || '');
    }
  }, [initialSearch]);

  // Customers verified during THIS page session, so the badge flips immediately
  // after a successful KYC. Not persisted: after a reload the server's
  // aadhar_verified field is the only source of truth.
  const [locallyVerifiedCustIds, setLocallyVerifiedCustIds] = useState(() => new Set());

  const markCustomerAsVerifiedLocally = (target) => {
    if (!target) return;
    setLocallyVerifiedCustIds((prev) => {
      const next = new Set(prev);
      if (typeof target === 'object') {
        if (target.id) next.add(String(target.id));
        if (target.cust_id) next.add(String(target.cust_id));
        if (target.internet_id) next.add(String(target.internet_id));
        if (target.username) next.add(String(target.username));
        if (target.mobile) next.add(String(target.mobile));
      } else {
        next.add(String(target));
      }
      return next;
    });
  };

  const checkIsAadhaarVerified = (cust) => {
    if (!cust) return false;
    if (
      (cust.id && locallyVerifiedCustIds.has(String(cust.id))) ||
      (cust.cust_id && locallyVerifiedCustIds.has(String(cust.cust_id))) ||
      (cust.internet_id && locallyVerifiedCustIds.has(String(cust.internet_id))) ||
      (cust.username && locallyVerifiedCustIds.has(String(cust.username))) ||
      (cust.mobile && locallyVerifiedCustIds.has(String(cust.mobile)))
    ) {
      return true;
    }
    const v = cust.aadhar_verified ?? cust.aadhaar_verified ?? cust.is_aadhar_verified ?? cust.is_aadhaar_verified ?? cust.verified;
    if (v === true || v === 1 || v === '1' || v === 'true' || String(v).toLowerCase() === 'verified') return true;
    const k = String(cust.kyc || '').toLowerCase();
    if (!/\b(un|not|non)[\s_-]?verified\b|pending|failed/.test(k) && /\b(verified|aadhaar|scoreme|digilocker)\b/.test(k)) return true;
    return false;
  };

  const [showPasswordMap, setShowPasswordMap] = useState({});
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());

  const toggleSelectAllRows = () => {
    if (selectedRowIds.size === paginatedCustomers.length && paginatedCustomers.length > 0) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(paginatedCustomers.map((c) => c.id)));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [resetPasswordModalItem, setResetPasswordModalItem] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [operators, setOperators] = useState([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [operatorDropdownOpen, setOperatorDropdownOpen] = useState(false);
  const [operatorSearchQuery, setOperatorSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('');

  const selectedOpObj = useMemo(() => {
    if (!selectedOperatorId) return null;
    return operators.find((op) => String(op.partner_id || op.id) === String(selectedOperatorId));
  }, [operators, selectedOperatorId]);

  const selectedOpLabel = selectedOpObj
    ? `#${selectedOpObj.partner_id || selectedOpObj.id} - ${selectedOpObj.partner_name || selectedOpObj.company_name}`
    : `All Operators (${operators.length})`;

  const filteredOperators = useMemo(() => {
    if (!operatorSearchQuery.trim()) return operators;
    const q = operatorSearchQuery.toLowerCase().trim();
    return operators.filter((op) => {
      const idStr = String(op.partner_id || op.id || '').toLowerCase();
      const nameStr = String(op.partner_name || op.company_name || op.name || '').toLowerCase();
      const userStr = String(op.username || '').toLowerCase();
      return idStr.includes(q) || nameStr.includes(q) || userStr.includes(q);
    });
  }, [operators, operatorSearchQuery]);

  // Item 7 & 8 Modal States
  const [modifyMobileCust, setModifyMobileCust] = useState(null);
  const [newMobileVal, setNewMobileVal] = useState('');
  const [savingMobile, setSavingMobile] = useState(false);
  const [verifyAadhaarCust, setVerifyAadhaarCust] = useState(null);
  const [showUnregisteredIptvModal, setShowUnregisteredIptvModal] = useState(false);
  const [unregisteredIptvName, setUnregisteredIptvName] = useState('');
  const [unregisteredIptvMobile, setUnregisteredIptvMobile] = useState('');
  const [unregisteredIptvMac, setUnregisteredIptvMac] = useState('');
  const [submittingIptvAdd, setSubmittingIptvAdd] = useState(false);
  const [selectedLocationCustomer, setSelectedLocationCustomer] = useState(null);
  const [selectedDevicesCustomer, setSelectedDevicesCustomer] = useState(null);

  // Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', mobile: '', plan: '', status: 'active', stb_id: '', stb_mac: '' });
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // ---- Subscriber list: one page of customers_list.php rows ----
  // Status filter, search, operator filter, sorting and paging all run on the server, so the
  // counts and results cover every account (not just the rows loaded into the browser).
  const [rawCustomers, setRawCustomers] = useState([]); // current page, flat account rows
  const [listTotal, setListTotal] = useState(0); // rows matching every filter
  const [listCounts, setListCounts] = useState({}); // per-status counts (status filter ignored)
  const [loadingData, setLoadingData] = useState(true);
  const [listError, setListError] = useState('');

  const dynamicBranches = useMemo(() => {
    const branchSet = new Map();
    (rawCustomers || []).forEach((c) => {
      const bName = c.branch_name || c.iptv_branch_id || c.branch_id;
      if (bName && String(bName).trim()) {
        const val = String(bName).trim();
        if (!branchSet.has(val)) {
          branchSet.set(val, { id: val, label: c.branch_name ? `Branch: ${c.branch_name}` : `Branch #${val}` });
        }
      }
    });

    (operators || []).forEach((op) => {
      if (op.iptv_branch_id && String(op.iptv_branch_id).trim()) {
        const val = String(op.iptv_branch_id).trim();
        if (!branchSet.has(val)) {
          branchSet.set(val, { id: val, label: `Branch #${val} (${op.partner_name || 'Operator'})` });
        }
      }
      if (op.partner_region && String(op.partner_region).trim()) {
        const reg = String(op.partner_region).trim();
        if (!branchSet.has(reg)) {
          branchSet.set(reg, { id: reg, label: `${reg} Zone` });
        }
      }
    });

    return Array.from(branchSet.values());
  }, [rawCustomers, operators]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (isSuperAdmin(user) || (user?.account_role || user?.role || '').toLowerCase() === 'admin') {
      // only operators own customers — admins are not a useful filter here
      OneBssApi.getPartners('operator')
        .then((res) => {
          const list = res.ok && Array.isArray(res.data) ? res.data : [];
          setOperators(list);
        })
        .catch(() => {});
    }
  }, [user]);

  // Latest query params, read by loadCustomerDataFromApi so callers elsewhere (recharge,
  // add customer) always reload the page the user is looking at.
  const listQueryRef = React.useRef({});
  const listRequestSeq = React.useRef(0);

  const loadCustomerDataFromApi = async () => {
    const q = listQueryRef.current;
    const seq = ++listRequestSeq.current;
    setLoadingData(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.getCustomersList(q.page || 1, q.pageSize || 100, q.type || 'internet', q.search || '', {
        status: q.status,
        partner_id: q.partnerId,
        sort: q.sort,
        dir: q.dir,
        range: q.range,
      });
      if (seq !== listRequestSeq.current) return; // a newer request superseded this one
      const body = res?.data || {};
      if (!res?.ok || body.success === false) {
        setListError(body.message || `Could not load subscribers (HTTP ${res?.status ?? '?'})`);
        setRawCustomers([]);
        setListTotal(0);
        return;
      }
      let list = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : []);
      setListError('');
      setRawCustomers(list);
      setListTotal(Number(body.total ?? list.length) || 0);
      setListCounts(body.counts && typeof body.counts === 'object' ? body.counts : countListRows(list, q.type === 'iptv'));
    } catch (e) {
      if (seq !== listRequestSeq.current) return;
      console.log('Error loading API customer records:', e);
      setListError('Could not load subscribers.');
    } finally {
      if (seq === listRequestSeq.current) setLoadingData(false);
    }
  };

  // Navigation inside this screen:
  //   list  ->  customer accounts overview (cards)  ->  full account detail screen
  // URL hash mirrors it:  customers?sub_id=<cust_id>[&acc=int_<n>|iptv_<n>]
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [activeAccountSel, setActiveAccountSel] = useState(null); // { kind: 'internet'|'iptv', index }
  const [activeSubProfile, setActiveSubProfile] = useState(null);

  // customers_list.php does not include internet_accounts / iptv_accounts, so the
  // full record for the opened customer is fetched from customer_lookup.php.
  const [customerDetails, setCustomerDetails] = useState({}); // { [cust_id]: full record }
  const [verifiedOverrides, setVerifiedOverrides] = useState({}); // { [internet_id]: true }
  const [loadingDetailsFor, setLoadingDetailsFor] = useState(null);

  const extractLookupRecord = (res, custId) => {
    const body = res?.data || {};
    const payload = body.data !== undefined ? body.data : body;
    const list = Array.isArray(payload) ? payload : (payload && typeof payload === 'object' ? [payload] : []);
    return list.find((c) => String(c?.cust_id) === String(custId)) || null;
  };

  // Loads the full customer record from customer_lookup.php and caches it. Resolves to the
  // record (or null). Concurrent calls share one request; a forced call waits for any
  // in-flight one and then fetches again, so it always returns data newer than its caller.
  const fetchCustomerDetails = async (custId, force = false) => {
    if (custId === null || custId === undefined) return null;
    const key = String(custId);
    if (!force && customerDetailsRef.current[key]) return customerDetailsRef.current[key];
    const pending = detailsInFlight.current[key];
    if (pending) {
      if (!force) return pending;
      await pending.catch(() => null);
    }
    let run;
    run = (async () => {
      setLoadingDetailsFor(key);
      try {
        if (user?.token) setApiConfig(undefined, user.token);
        // 1st try by mobile/username from the list item, then fall back to cust_id
        const listItem = rawCustomersRef.current.find((c) => String(c.cust_id) === key || String(c.id) === key);
        let mobile = String(listItem?.mobile || customerDetailsRef.current[key]?.mobile || '').replace(/\D/g, '').slice(-10);
        // Show what is saved right away; provider syncs run afterwards in the background.
        let record = null;
        const syncStatus = customerDetailsRef.current[key]?.iptv_sync_status || null;
        if (mobile.length === 10) {
          record = extractLookupRecord(await OneBssApi.customerLookup(mobile), custId);
        }
        if (!record && /^\d+$/.test(key)) {
          // page reloaded on this customer: only the id from the URL is known
          record = extractLookupRecord(await OneBssApi.customerLookupById(key), custId);
        }
        if (!record && listItem?.username) {
          record = extractLookupRecord(await OneBssApi.customerLookup(listItem.username), custId);
        }
        if (!record) {
          record = extractLookupRecord(await OneBssApi.customerLookup(key), custId);
        }
        if (!record && listItem) {
          // Graceful fallback from list item data if lookup endpoint does not have detailed record
          const matchingRows = rawCustomersRef.current.filter((c) => String(c.cust_id) === key || String(c.id) === key);
          const intAccounts = matchingRows
            .filter((r) => r.internet_id || r.username || r.account_type === 'internet' || (!r.iptv_id && !r.stb_box && !r.stb_id))
            .map((r, i) => ({
              internet_id: r.internet_id || r.id || r.username || (i + 1),
              acc_id: r.acc_id || r.id || r.internet_id,
              username: r.username,
              status_text: r.status_text || r.status || 'ACTIVE',
              status_color: r.status_color,
              online: r.online || (r.is_online ? 'ONLINE' : 'OFFLINE'),
              package_id: r.package_id,
              package_name: r.package_name || r.plan,
              subplan_id: r.subplan_id,
              subplan_name: r.subplan_name,
              expiration: r.expiration || r.expiryDate,
              balance: r.balance,
              last_loff_off: r.last_loff_off || r.last_logoff,
              partner_id: r.partner_id || r.operator_id,
            }));

          const iptvAccs = matchingRows
            .filter((r) => r.iptv_id || r.stb_box || r.stb_id || r.account_type === 'iptv')
            .map((r, i) => ({
              id: r.iptv_id || r.id || (i + 1),
              stb_id: r.stb_id || r.pioneer_stb_id || `STB-${r.cust_id || i}`,
              stb_box: r.stb_box || r.stb_id,
              pioneer_stb_id: r.pioneer_stb_id,
              stb_mac: r.stb_mac,
              status: r.status || 'Active',
              sts: r.status || 'Active',
              plan_id: r.package_id || r.plan_id,
              plan_name: r.package_name || r.plan,
              package_name: r.package_name || r.plan,
              subplan_id: r.subplan_id,
              subplan_name: r.subplan_name,
              expiration: r.expiration || r.expiryDate,
              expriration: r.expiration || r.expiryDate,
              balance: r.balance,
              branch_name: r.branch_name,
              partner_id: r.partner_id || r.operator_id,
            }));

          record = {
            cust_id: custId,
            id: custId,
            full_name: listItem.full_name || listItem.name || 'Subscriber',
            name: listItem.full_name || listItem.name || 'Subscriber',
            mobile: listItem.mobile || '',
            partner_id: listItem.partner_id || listItem.operator_id,
            partner_name: listItem.partner_name,
            internet_accounts: intAccounts.length > 0 ? intAccounts : [{
              internet_id: listItem.internet_id || listItem.username || custId,
              acc_id: listItem.acc_id || listItem.internet_id || custId,
              username: listItem.username,
              status_text: listItem.status_text || listItem.status || 'ACTIVE',
              plan_id: listItem.package_id,
              package_name: listItem.package_name,
              subplan_name: listItem.subplan_name,
              expiration: listItem.expiration,
              partner_id: listItem.partner_id || listItem.operator_id,
            }],
            iptv_accounts: iptvAccs,
          };
        }
        if (record) {
          record.iptv_sync_status = syncStatus || null;
          customerDetailsRef.current = { ...customerDetailsRef.current, [key]: record };
          setCustomerDetails((prev) => ({ ...prev, [key]: record }));
        }
        return record;
      } catch (e) {
        toast.error(`Could not load accounts for customer #${custId}.`);
        return null;
      } finally {
        if (detailsInFlight.current[key] === run) delete detailsInFlight.current[key];
        setLoadingDetailsFor((cur) => (cur === key ? null : cur));
      }
    })();
    detailsInFlight.current[key] = run;
    return run;
  };
  const detailsInFlight = React.useRef({});

  // ---- Gateway -> local sync (internet_customer_detail_sync.php & iptv_customer_sync.php) ----
  // Pulls each internet account's latest state from RADIUS and IPTV customer state from IPTV gateway into our DB,
  // then re-reads customer_lookup so the screen shows it. Runs for ALL accounts when customer is opened or Refreshed.
  const [syncingFor, setSyncingFor] = useState(null);
  // per customer: { state: 'syncing' | 'done' | 'partial' | 'failed', at: Date, message }
  const [syncState, setSyncState] = useState({});
  const syncInFlight = React.useRef({});
  const syncCustomerAccounts = async (custId, internetIds, mobile) => {
    if (custId === null || custId === undefined) return;
    const key = String(custId);
    const ids = [...new Set((internetIds || []).filter(Boolean).map(String))];
    const cleanMobile = String(mobile || '').replace(/\D/g, '').slice(-10);
    if (ids.length === 0 && !cleanMobile) {
      await fetchCustomerDetails(custId, true);
      return;
    }
    if (syncInFlight.current[key]) await syncInFlight.current[key].catch(() => null);
    let run;
    run = (async () => {
      setSyncingFor(key);
      setSyncState((prev) => ({ ...prev, [key]: { state: 'syncing', at: prev[key]?.at || null } }));
      const problems = [];
      let iptvSyncResultStatus = null;
      try {
        const tasks = [];
        if (ids.length > 0) {
          tasks.push(
            Promise.allSettled(ids.map((id) => OneBssApi.syncInternetCustomerDetail(id))).then((results) => {
              const failed = results.filter((r) => r.status === 'rejected' || !r.value?.ok);
              if (failed.length) {
                const msg = failed[0].value?.data?.message || 'gateway unreachable';
                problems.push(`Internet: ${failed.length} of ${ids.length} not synced (${msg})`);
              }
            })
          );
        }
        if (cleanMobile.length === 10) {
          tasks.push(
            OneBssApi.syncIptvCustomers(cleanMobile).then((syncRes) => {
              if (!syncRes.ok) {
                problems.push(`IPTV: ${syncRes.data?.message || 'not synced'}`);
                return;
              }
              const s = syncRes.data?.summary;
              if (s && Number(s.stbs_added || 0) === 0 && Number(s.stbs_skipped || 0) === 0) {
                iptvSyncResultStatus = 'no_devices';
              }
            })
          );
          // OTT: only counts as a problem when OTTAggre is unreachable, not when there is no subscription
          tasks.push(
            OneBssApi.syncOttCustomer(cleanMobile).then((r) => {
              if (!r.ok && r.status >= 500) problems.push(`OTT: ${r.data?.message || 'not synced'}`);
            })
          );
        }
        await Promise.allSettled(tasks);
        const refRec = await fetchCustomerDetails(custId, true);
        if (refRec) {
          refRec.iptv_sync_status = iptvSyncResultStatus || null;
          customerDetailsRef.current = { ...customerDetailsRef.current, [key]: refRec };
          setCustomerDetails((prev) => ({ ...prev, [key]: refRec }));
        }
        const total = (ids.length > 0 ? 1 : 0) + (cleanMobile.length === 10 ? 1 : 0);
        setSyncState((prev) => ({
          ...prev,
          [key]: {
            state: problems.length === 0 ? 'done' : problems.length < total ? 'partial' : 'failed',
            at: new Date(),
            message: problems.join(' · '),
          },
        }));
      } finally {
        if (syncInFlight.current[key] === run) delete syncInFlight.current[key];
        setSyncingFor((cur) => (cur === key ? null : cur));
      }
    })();
    syncInFlight.current[key] = run;
    return run;
  };

  const syncInternetAccounts = async (custId, internetIds, mobile) => {
    const rawMobile = mobile || customerDetailsRef.current[String(custId)]?.mobile || '';
    return syncCustomerAccounts(custId, internetIds, rawMobile);
  };

  const syncAllAccountsOf = async (custId) => {
    const record = await fetchCustomerDetails(custId);
    const ids = (record?.internet_accounts || []).map((a) => a.internet_id);
    const rawMobile = record?.mobile || customerDetailsRef.current[String(custId)]?.mobile || rawCustomersRef.current.find((c) => String(c.cust_id) === String(custId))?.mobile || '';
    return syncCustomerAccounts(custId, ids, rawMobile);
  };

  const customerDetailsRef = React.useRef(customerDetails);
  customerDetailsRef.current = customerDetails;
  const rawCustomersRef = React.useRef(rawCustomers);
  rawCustomersRef.current = rawCustomers;

  // List row merged with the full lookup record (lookup wins)
  const activeCustomer = useMemo(() => {
    if (activeCustomerId === null) return null;
    // List rows are per ACCOUNT (internet or IPTV), so only the customer-level fields are
    // taken from them — account fields come from customer_lookup's nested accounts.
    const row = rawCustomers.find((c) => String(c.cust_id) === String(activeCustomerId)) || {};
    const listItem = {};
    ['full_name', 'mobile', 'email', 'partner_id', 'partner_name'].forEach((k) => {
      if (!isBlankValue(row[k])) listItem[k] = row[k];
    });
    const details = customerDetails[String(activeCustomerId)] || {};
    const merged = { cust_id: activeCustomerId, ...listItem, ...details };

    // customer_lookup has only package/sub-plan IDs; customers_list has one row per internet
    // account (same cust_id) with the plan names — copy those names onto the matching account.
    const rowsForCustomer = rawCustomers.filter((c) => String(c.cust_id) === String(activeCustomerId));
    if (Array.isArray(merged.internet_accounts)) {
      merged.internet_accounts = merged.internet_accounts.map((acc) => {
        const row = rowsForCustomer.find((r) => r.username && String(r.username) === String(acc.username));
        if (!row) return acc;
        return {
          ...acc,
          package_name: acc.package_name || resolveApiField(row.package_name),
          subplan_name: acc.subplan_name || resolveApiField(row.subplan_name),
        };
      });
    }
    // Accounts verified in this session (RADIUS confirmed) stay verified even if the local
    // cache hasn't caught up yet.
    if (Array.isArray(merged.internet_accounts)) {
      merged.internet_accounts = merged.internet_accounts.map((acc) =>
        verifiedOverrides[String(acc.internet_id)] ? { ...acc, verified: 'Verified' } : acc
      );
    }
    return merged;
  }, [rawCustomers, customerDetails, activeCustomerId, verifiedOverrides]);

  // Fetch when a customer is opened, and retry once the list has loaded (the mobile
  // fallback needs the list row, e.g. after a page reload on a deep link).
  useEffect(() => {
    if (activeCustomerId !== null) fetchCustomerDetails(activeCustomerId);
  }, [activeCustomerId, rawCustomers]);

  // On opening a customer: once its accounts are known, sync every internet account from
  // RADIUS and sync IPTV customer data from IPTV gateway (POST /iptv_customer_sync.php) and reload.
  const autoSyncedFor = React.useRef(null);
  const activeDetailsLoaded = activeCustomerId !== null && !!customerDetails[String(activeCustomerId)];
  useEffect(() => {
    if (activeCustomerId === null) {
      autoSyncedFor.current = null;
      return;
    }
    if (!activeDetailsLoaded || autoSyncedFor.current === String(activeCustomerId)) return;
    autoSyncedFor.current = String(activeCustomerId);
    const details = customerDetails[String(activeCustomerId)];
    const ids = (details?.internet_accounts || []).map((a) => a.internet_id);
    const mobile = details?.mobile || rawCustomersRef.current.find((c) => String(c.cust_id) === String(activeCustomerId))?.mobile || '';
    syncCustomerAccounts(activeCustomerId, ids, mobile);
  }, [activeCustomerId, activeDetailsLoaded]);

  // Top-bar Refresh: refresh whatever is on screen (customer -> provider sync, list -> reload)
  const firstRefreshSignal = React.useRef(true);
  useEffect(() => {
    if (firstRefreshSignal.current) {
      firstRefreshSignal.current = false;
      return;
    }
    if (activeCustomerId !== null) {
      syncAllAccountsOf(activeCustomerId);
    } else {
      loadCustomerDataFromApi();
    }
  }, [refreshSignal]);

  // Build the detail-screen row for one specific account of a customer.
  // customers_list rows carry the FIRST account's username / package / expiry / status at the
  // top level, and the row mappers prefer top-level values — so those are stripped here to make
  // the selected account's own values win. For IPTV the internet accounts are dropped as well,
  // otherwise the internet username / online status would leak into the STB details.
  const buildAccountProfile = (customer, kind, accIndex) => {
    if (!customer) return null;
    const idx = rawCustomers.findIndex((c) => String(c.cust_id) === String(customer.cust_id));
    const base = { ...customer };
    ACCOUNT_LEVEL_KEYS.forEach((k) => delete base[k]);
    if (kind === 'iptv') {
      base.internet_accounts = [];
      const row = mapCustomersListToIptvRow(base, idx, accIndex);
      const acc = customer.iptv_accounts?.[accIndex] || {};
      const stb = resolveApiField(acc.pioneer_stb_id, acc.stb_box);
      return { ...row, username: row.username || (stb ? `STB ${stb}` : `IPTV #${acc.id ?? ''}`) };
    }
    return mapCustomersListToBroadbandRow(base, idx, accIndex);
  };

  // Keep the detail screen in sync with the selected account (also refreshes after a recharge)
  useEffect(() => {
    if (!activeAccountSel || !activeCustomer) {
      setActiveSubProfile(null);
      return;
    }
    const accounts = activeAccountSel.kind === 'iptv' ? activeCustomer.iptv_accounts : activeCustomer.internet_accounts;
    if (!Array.isArray(accounts) || !accounts[activeAccountSel.index]) return; // details still loading
    setActiveSubProfile(buildAccountProfile(activeCustomer, activeAccountSel.kind, activeAccountSel.index));
  }, [activeCustomer, activeAccountSel]);

  const parseSubHash = () => {
    if (typeof window === 'undefined') return {};
    const hash = window.location.hash;
    const sub = hash.match(/sub_id=([^&]+)/);
    const acc = hash.match(/acc=(int|iptv)_(\d+)/);
    return {
      subId: sub ? decodeURIComponent(sub[1]) : null,
      accKind: acc ? (acc[1] === 'iptv' ? 'iptv' : 'internet') : null,
      accIndex: acc ? Number(acc[2]) : null,
    };
  };

  // Apply the current URL hash to screen state (page reload + browser back/forward)
  const applyHashToState = () => {
    const { subId, accKind, accIndex } = parseSubHash();
    if (!subId) {
      setActiveCustomerId(null);
      setActiveAccountSel(null);
      return;
    }
    setActiveCustomerId((cur) => (String(cur) === String(subId) ? cur : subId));
    setActiveAccountSel(accKind ? { kind: accKind, index: accIndex } : null);
  };

  useEffect(() => {
    applyHashToState();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onHash = () => applyHashToState();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Sync APIs State
  const [syncingBulkRadius, setSyncingBulkRadius] = useState(false);
  const [syncingIptvStb, setSyncingIptvStb] = useState(false);
  const [syncingAccountIds, setSyncingAccountIds] = useState({});

  const handleBulkRadiusSync = async () => {
    setSyncingBulkRadius(true);
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.syncInternetCustomersBulk(user?.partner_id);
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
      const res = await OneBssApi.syncIptvCustomers(user?.mobile || user?.partner_mobile || user?.username || '');
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

  // Pull the renewed account's latest state from the provider, then refresh the screen
  const refreshAfterRecharge = (kind, id) => {
    loadCustomerDataFromApi();
    if (activeCustomerId === null) return;
    if (kind === 'ott') {
      // the recharge already saved OTTAggre's new end date
      fetchCustomerDetails(activeCustomerId, true);
      return;
    }
    if (kind === 'internet') {
      syncInternetAccounts(activeCustomerId, [id]);
    } else {
      (async () => {
        await handleIptvCustomerDetailSync({ id: `iptv_${id}`, mobile: activeCustomer?.mobile, name: activeCustomer?.full_name }, true);
        fetchCustomerDetails(activeCustomerId, true);
      })();
    }
  };

  // Runs one recharge / advance renewal. kind: 'internet' | 'iptv'.
  // IPTV passes subPlanIds (1 DPO + add-ons) instead of planId/subPlanId.
  // Every attempt carries a client_ref. If the answer is lost (network drop, browser or proxy
  // timeout, server error without our own result) we do NOT report "failed" — the provider may
  // already have renewed. We ask recharge_status.php until we know what really happened.
  // Returns true when the dialog can close.
  const runRecharge = async ({ kind, id, planId, subPlanId, subPlanIds, label, internetId }, type = 'recharge') => {
    const hasPlan = kind === 'iptv' ? Array.isArray(subPlanIds) && subPlanIds.length > 0 : kind === 'ott' ? !!subPlanId : !!planId;
    if (!id || !hasPlan) {
      toast.error(`Cannot recharge ${label}: plan details missing on this account.`);
      return false;
    }
    const clientRef = newClientRef();
    const succeeded = (data) => {
      const kindLabel = (data.renewal_type || type) === 'advance' ? 'Advance renewal' : 'Recharge';
      const expiryNote = data.new_expiry_date ? ` New expiry: ${formatApiDate(data.new_expiry_date)}.` : '';
      const amountNote = data.amount !== undefined ? ` ₹${Number(data.amount).toFixed(2)} debited.` : '';
      toast.success(`${kindLabel} successful for ${label}.${amountNote}${expiryNote}`);
      refreshAfterRecharge(kind, id);
      try {
        window.dispatchEvent(new Event('onebss:wallet-changed')); // header wallet balance
      } catch (e) {}
      return true;
    };

    let res;
    try {
      res = kind === 'iptv'
        ? await OneBssApi.rechargeIptvAccount(id, subPlanIds, clientRef, internetId)
        : kind === 'ott'
        ? await OneBssApi.rechargeOtt(id, subPlanId, clientRef)
        : await OneBssApi.rechargeInternetAccount(id, planId, subPlanId, clientRef);
    } catch (e) {
      res = { ok: false, status: 0, data: {} };
    }
    const data = res.data || {};

    // 202 { recheck: true }: the wallet was debited but the provider did not complete it.
    // The card now shows "Recheck" in place of Recharge.
    if (data.recheck) {
      toast.warning(`${label}: ${data.message || 'Recharge not completed by the provider — use Recheck.'}`, { autoClose: 15000 });
      refreshAfterRecharge(kind, id);
      try {
        window.dispatchEvent(new Event('onebss:wallet-changed'));
      } catch (e) {}
      return true;
    }
    if (data.recheck_required) {
      toast.warning(`${label}: ${data.message}`, { autoClose: 12000 });
      refreshAfterRecharge(kind, id);
      return true;
    }
    // 202 { pending: true }: the provider got the request but didn't confirm — amount is held.
    if (data.pending) {
      toast.warning(`${label}: ${data.message || 'Renewal not confirmed yet — the amount is held.'}`, { autoClose: 12000 });
      refreshAfterRecharge(kind, id);
      return true;
    }
    if (res.ok && data.success !== false) return succeeded(data);

    // A definite answer from our server (validation, wallet, provider refused + rolled back)
    const definite = res.status > 0 && res.status < 500 || data.charged === false || data.rolled_back;
    if (definite) {
      let reason = data.message || `HTTP ${res.status}`;
      if (res.status === 402 && data.amount_required !== undefined) {
        reason += ` (needs ₹${data.amount_required}, wallet has ₹${data.wallet_balance ?? 0})`;
      }
      if (data.rolled_back || data.charged === false) reason += ' — nothing was charged';
      toast.error(`Recharge failed for ${label}: ${reason}`, { autoClose: 9000 });
      return false;
    }

    // Unknown outcome — check with the server before saying anything.
    const checking = toast.info(`Checking the result of the recharge for ${label}…`, { autoClose: false });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 5000));
      const st = await OneBssApi.getRechargeStatus(kind, id, clientRef);
      const state = st.data?.state;
      if (state === 'completed') {
        toast.dismiss(checking);
        return succeeded({ ...data, new_expiry_date: st.data.new_expiry_date });
      }
      if (state === 'failed') {
        toast.dismiss(checking);
        toast.warning(`Recharge for ${label} was paid but not completed by the provider. Use Recheck on the account.`, { autoClose: 15000 });
        refreshAfterRecharge(kind, id);
        return true;
      }
      if (state === 'not_found') {
        toast.dismiss(checking);
        toast.error(`Recharge for ${label} did not go through and nothing was charged. You can try again.`, { autoClose: 9000 });
        return false;
      }
      // in_progress or the status call itself failed -> keep waiting
    }
    toast.dismiss(checking);
    toast.warning(`Could not confirm the recharge for ${label} yet. Do not retry — refresh this customer in a minute to see the new expiry.`, { autoClose: 15000 });
    refreshAfterRecharge(kind, id);
    return true;
  };

  // ---- Internet account actions (recharge modal, verify, password, MAC, sessions, documents) ----
  const [rechargeReq, setRechargeReq] = useState(null); // { account, advance }
  const [verifyReq, setVerifyReq] = useState(null); // raw internet account
  const [passwordReq, setPasswordReq] = useState(null); // raw internet account
  const [macReq, setMacReq] = useState(null); // raw internet account
  const [sessionReq, setSessionReq] = useState(null); // raw internet account
  const [authLogsReq, setAuthLogsReq] = useState(null); // raw internet account
  const [documentsOpen, setDocumentsOpen] = useState(false);
  // internet account page: the selected tab (Basic Info first)
  const [internetTab, setInternetTab] = useState('basic');
  // live online state from the Online Session tab (RADIUS), shown in the header right away
  // instead of waiting for the account to be synced again
  const [onlineOverride, setOnlineOverride] = useState(null);
  useEffect(() => {
    setInternetTab('basic');
    setOnlineOverride(null);
  }, [activeAccountSel?.kind, activeAccountSel?.index, activeCustomerId]);
  const canSeeDocuments = isSuperAdmin(user);

  // ---- Recheck: a recharge that was paid but not completed by the provider ----
  const recheckBusy = React.useRef(false);
  const runRecheck = async (account, kind) => {
    const open = account?.open_recharge;
    if (!open || recheckBusy.current) return;
    recheckBusy.current = true;
    const label = kind === 'iptv'
      ? (account.pioneer_stb_id ? `STB ${account.pioneer_stb_id}` : `IPTV #${account.id}`)
      : kind === 'ott'
      ? `OTT ${account.subscriber_id || `#${account.id}`}`
      : (account.username || `Internet #${account.internet_id}`);
    const t = toast.info(`Rechecking the recharge of ${label} with the provider…`, { autoClose: false });
    try {
      const res = await OneBssApi.recheckRecharge(open.log_id);
      toast.dismiss(t);
      const d = res.data || {};
      if (res.ok && d.success !== false) {
        toast.success(`${label}: ${d.message || 'Recharge confirmed.'}${d.new_expiry_date ? ` New expiry: ${formatApiDate(d.new_expiry_date)}.` : ''}`, { autoClose: 9000 });
      } else {
        toast.error(`${label}: ${d.message || 'Recheck failed.'}`, { autoClose: 12000 });
      }
    } finally {
      recheckBusy.current = false;
      // the recheck already wrote the confirmed expiry; just reload what is saved
      loadCustomerDataFromApi();
      if (activeCustomerId !== null) fetchCustomerDetails(activeCustomerId, true);
      try {
        window.dispatchEvent(new Event('onebss:wallet-changed'));
      } catch (e) {}
    }
  };

  // ---- OTT ----
  const [ottRechargeReq, setOttRechargeReq] = useState(null); // raw ott account
  const [addOttFor, setAddOttFor] = useState(null); // customer record
  const openOttRecharge = (acc) => {
    if (acc?.open_recharge) {
      runRecheck(acc, 'ott');
      return;
    }
    setOttRechargeReq(acc);
  };
  const confirmOttRecharge = (subPlanId) => {
    const acc = ottRechargeReq;
    if (!acc) return Promise.resolve(false);
    return runRecharge({ kind: 'ott', id: acc.id, subPlanId, label: `OTT ${acc.subscriber_id || `#${acc.id}`}` });
  };
  const deactivateOtt = async (acc) => {
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`Stop the OTT package "${acc.package_name || ''}" for ${acc.subscriber_id}? The remaining days are lost and nothing is refunded.`)
      : true;
    if (!ok) return;
    const res = await OneBssApi.deactivateOtt(acc.id);
    if (res.ok) toast.success(res.data?.message || 'OTT package deactivated.');
    else toast.error(res.data?.message || 'Could not deactivate the OTT package.');
    if (activeCustomerId !== null) fetchCustomerDetails(activeCustomerId, true);
  };

  const openIptvRecharge = (acc) => {
    if (acc?.open_recharge) {
      runRecheck(acc, 'iptv');
      return;
    }
    setIptvRechargeReq(acc);
  };

  const openInternetRecharge = (account, advance) => {
    if (account?.open_recharge) {
      runRecheck(account, 'internet');
      return;
    }
    if (!isAccountVerified(account)) {
      toast.warning('Verify the customer before recharging.');
      setVerifyReq(account);
      return;
    }
    setRechargeReq({ account, advance });
  };

  const confirmInternetRecharge = (packageId, subPlanId) => {
    const acc = rechargeReq?.account;
    if (!acc) return Promise.resolve(false);
    return runRecharge(
      { kind: 'internet', id: acc.internet_id, planId: packageId, subPlanId, label: acc.username || `Internet #${acc.internet_id}` },
      rechargeReq.advance ? 'advance' : 'recharge'
    );
  };

  const handleVerified = async () => {
    const acc = verifyReq;
    if (!acc) return;
    setVerifiedOverrides((prev) => ({ ...prev, [String(acc.internet_id)]: true }));
    markCustomerAsVerifiedLocally(acc);
    if (activeCustomer) markCustomerAsVerifiedLocally(activeCustomer);
    // pull the new status into the local DB, then refresh the lookup
    if (activeCustomerId !== null) syncInternetAccounts(activeCustomerId, [acc.internet_id]);
  };

  // ---- IPTV recharge (DPO + Broadcaster / A-la-carte package set) ----
  const [iptvRechargeReq, setIptvRechargeReq] = useState(null); // raw iptv account
  const confirmIptvRecharge = (subPlanIds, opts = {}) => {
    const acc = iptvRechargeReq;
    if (!acc) return Promise.resolve(false);
    return runRecharge({
      kind: 'iptv',
      id: acc.id,
      subPlanIds,
      internetId: opts.internetId || null, // the internet account the IPTV dates follow
      label: acc.pioneer_stb_id ? `STB ${acc.pioneer_stb_id}` : `IPTV #${acc.id}`,
    });
  };

  // ---- Combo recharge (one internet account + one STB, combo plan + IPTV add-ons) ----
  const [comboRechargeFor, setComboRechargeFor] = useState(null); // customer record
  const runComboRecharge = async ({ internet, iptv, combo, addonIds }) => {
    const label = `${internet.username || `Internet #${internet.internet_id}`} + ${iptv.pioneer_stb_id ? `STB ${iptv.pioneer_stb_id}` : `IPTV #${iptv.id}`}`;
    const clientRef = newClientRef();
    const refreshBoth = () => {
      refreshAfterRecharge('internet', internet.internet_id);
      refreshAfterRecharge('iptv', iptv.id);
      try {
        window.dispatchEvent(new Event('onebss:wallet-changed'));
      } catch (e) {}
    };
    const done = (data) => {
      const exp = [
        data.internet?.new_expiry_date ? `Internet till ${formatApiDate(data.internet.new_expiry_date)}` : null,
        data.iptv?.new_expiry_date ? `IPTV till ${formatApiDate(data.iptv.new_expiry_date)}` : null,
      ].filter(Boolean).join(', ');
      const amt = data.amount !== undefined ? ` ₹${Number(data.amount).toFixed(2)} debited.` : '';
      toast.success(`Combo ${combo.combo_name} renewed for ${label}.${amt}${exp ? ` ${exp}.` : ''}`, { autoClose: 9000 });
      refreshBoth();
      return true;
    };

    let res;
    try {
      res = await OneBssApi.rechargeCombo({ internetId: internet.internet_id, iptvId: iptv.id, comboId: combo.combo_id, addonSubPlanIds: addonIds, clientRef });
    } catch (e) {
      res = { ok: false, status: 0, data: {} };
    }
    const data = res.data || {};
    if (data.recheck || data.recheck_required) {
      // paid, but RADIUS and/or Pioneer did not complete their part -> Recheck on the card(s)
      toast.warning(`${label}: ${data.message || 'Combo recharge not completed — use Recheck.'}`, { autoClose: 15000 });
      refreshBoth();
      return true;
    }
    if (data.pending) {
      toast.warning(`${label}: ${data.message || 'Renewal not confirmed yet — the amount is held.'}`, { autoClose: 12000 });
      refreshBoth();
      return true;
    }
    if (res.ok && data.success !== false) return done(data);

    const definite = (res.status > 0 && res.status < 500) || data.charged === false || data.rolled_back;
    if (definite) {
      let reason = data.message || `HTTP ${res.status}`;
      if (res.status === 402 && data.amount_required !== undefined) {
        reason += ` (needs ₹${data.amount_required}, wallet has ₹${data.wallet_balance ?? 0})`;
      }
      if (data.rolled_back || data.charged === false) reason += ' — nothing was charged';
      toast.error(`Combo recharge failed for ${label}: ${reason}`, { autoClose: 9000 });
      return false;
    }

    // Lost answer — ask the server what happened before saying anything
    const checking = toast.info(`Checking the result of the combo recharge for ${label}…`, { autoClose: false });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 1500 : 5000));
      const st = await OneBssApi.getRechargeStatus('combo', internet.internet_id, clientRef);
      const state = st.data?.state;
      if (state === 'completed') {
        toast.dismiss(checking);
        return done({});
      }
      if (state === 'failed') {
        toast.dismiss(checking);
        toast.warning(`${label}: the combo recharge was paid but not fully completed by the providers. Use Recheck on the account.`, { autoClose: 15000 });
        refreshBoth();
        return true;
      }
      if (state === 'not_found') {
        toast.dismiss(checking);
        toast.error(`Combo recharge for ${label} did not go through and nothing was charged. You can try again.`, { autoClose: 9000 });
        return false;
      }
    }
    toast.dismiss(checking);
    toast.warning(`Could not confirm the combo recharge for ${label} yet. Do not retry — refresh this customer in a minute.`, { autoClose: 15000 });
    refreshBoth();
    return true;
  };

  const openWhatsApp = (cust) => {
    const rawNum = cust?.mobile || cust?.phone || '';
    const num = String(rawNum).replace(/[^\d]/g, '');
    if (!num || num.length < 10) {
      toast.info('No valid mobile number available for WhatsApp messaging.');
      return;
    }
    const phone = num.length === 10 ? `91${num}` : num;
    const name = cust.full_name || cust.name || cust.username || 'Subscriber';
    const plan = cust.package_name || cust.plan || cust.package || 'Internet Plan';
    const expDate = cust.expiration || cust.expiryDate || cust.expiry;
    const formattedExp = expDate ? formatApiDate(expDate) : '';

    let message = `Dear ${name},\n\nYour broadband subscription (${plan}) `;
    if (formattedExp) {
      message += `is expiring/expired on ${formattedExp}. `;
    } else {
      message += `is expiring soon. `;
    }
    message += `Please recharge your account to enjoy uninterrupted service.\n\nThank you!`;

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    try {
      if (typeof window !== 'undefined') {
        window.open(waUrl, '_blank');
      } else {
        Linking.openURL(waUrl);
      }
    } catch (e) {
      toast.error('Could not open WhatsApp window.');
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

  // Save edits to the OneBSS customer profile (name + mobile only).
  // Plan, status and STB details belong to RADIUS / Pioneer and are changed via
  // recharge, suspend or sync — not by editing text here.
  const handleSaveEdit = async () => {
    if (!editingCustomer) return;
    setSaving(true);
    try {
      const res = await OneBssApi.updateCustomerProfile({
        cust_id: editingCustomer.cust_id,
        name: editForm.name,
        mobile: editForm.mobile,
      });
      if (!res.ok) {
        toast.error(res.data?.message || 'Could not update the subscriber profile.');
        return;
      }
      if (activeSubProfile && activeSubProfile.id === editingCustomer.id) {
        setActiveSubProfile((prev) => ({ ...prev, name: editForm.name, mobile: editForm.mobile }));
      }
      toast.success(`Profile updated for ${editForm.name}. (RADIUS / IPTV provider records are unchanged.)`);
      setEditingCustomer(null);
      loadCustomerDataFromApi();
    } catch (e) {
      toast.error('Could not update the subscriber profile.');
    } finally {
      setSaving(false);
    }
  };

  const currentInternetAccount =
    activeAccountSel?.kind === 'internet' ? activeCustomer?.internet_accounts?.[activeAccountSel.index] || null : null;

  const accountActionModals = (
    <>
      {/* ONU details — opened from the list row or the internet account page */}
      <CustomerDevicesModal
        visible={!!selectedDevicesCustomer}
        onClose={() => setSelectedDevicesCustomer(null)}
        customer={selectedDevicesCustomer}
      />
      <InternetRechargeModal
        visible={!!rechargeReq}
        account={rechargeReq?.account}
        advance={!!rechargeReq?.advance}
        onClose={() => setRechargeReq(null)}
        onConfirm={confirmInternetRecharge}
      />
      <VerifyCustomerModal
        visible={!!verifyReq}
        internetId={verifyReq?.internet_id}
        username={verifyReq?.username}
        customerName={activeCustomer?.full_name}
        onClose={() => setVerifyReq(null)}
        onVerified={handleVerified}
      />
      <PasswordModal visible={!!passwordReq} internetId={passwordReq?.internet_id} username={passwordReq?.username} onClose={() => setPasswordReq(null)} />
      <MacBindingsModal visible={!!macReq} internetId={macReq?.internet_id} username={macReq?.username} onClose={() => setMacReq(null)} />
      <SessionHistoryModal visible={!!sessionReq} internetId={sessionReq?.internet_id} username={sessionReq?.username} onClose={() => setSessionReq(null)} />
      <AuthLogsModal visible={!!authLogsReq} internetId={authLogsReq?.internet_id} username={authLogsReq?.username} onClose={() => setAuthLogsReq(null)} />
      {canSeeDocuments ? <DocumentsModal visible={documentsOpen} customer={activeCustomer} onClose={() => setDocumentsOpen(false)} /> : null}
      <IptvRechargeModal visible={!!iptvRechargeReq} account={iptvRechargeReq} onClose={() => setIptvRechargeReq(null)} onConfirm={confirmIptvRecharge} />
      <ComboRechargeModal visible={!!comboRechargeFor} customer={comboRechargeFor} onClose={() => setComboRechargeFor(null)} onConfirm={runComboRecharge} />
      <OttRechargeModal visible={!!ottRechargeReq} account={ottRechargeReq} onClose={() => setOttRechargeReq(null)} onConfirm={confirmOttRecharge} />
      <AddOttModal
        visible={!!addOttFor}
        customer={addOttFor}
        onClose={() => setAddOttFor(null)}
        onAdded={() => {
          if (activeCustomerId !== null) fetchCustomerDetails(activeCustomerId, true);
        }}
      />

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
              Updates the subscriber's name and mobile in OneBSS. Plans, status and STB details change only through Recharge, Suspend or Sync.
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
                <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODIFY MOBILE NUMBER MODAL (ITEM 7) */}
      {modifyMobileCust && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModifyMobileCust(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Modify Mobile Number</Text>
                <TouchableOpacity onPress={() => setModifyMobileCust(null)}>
                  <Feather name="x" size={18} color={COLORS.textDim} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>Update subscriber contact mobile number for #{modifyMobileCust.cust_id || modifyMobileCust.id}</Text>
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 }}>PRIMARY MOBILE NUMBER *</Text>
                <TextInput
                  style={styles.formInput}
                  value={newMobileVal}
                  onChangeText={setNewMobileVal}
                  placeholder="Enter 10-digit mobile number"
                  keyboardType="phone-pad"
                />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setModifyMobileCust(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  disabled={savingMobile}
                  onPress={async () => {
                    if (newMobileVal.trim().length < 10) return toast.info('Please enter a valid 10-digit mobile number');
                    setSavingMobile(true);
                    try {
                      const res = await OneBssApi.updateCustomerProfile({
                        cust_id: modifyMobileCust.cust_id,
                        mobile: newMobileVal.trim(),
                      });
                      if (!res.ok) {
                        toast.error(res.data?.message || 'Failed to update mobile number.');
                        return;
                      }
                      toast.success(`Mobile number updated to ${newMobileVal.trim()} in OneBSS.`);
                      setModifyMobileCust(null);
                      loadCustomerDataFromApi();
                    } catch (e) {
                      toast.error('Failed to update mobile number.');
                    } finally {
                      setSavingMobile(false);
                    }
                  }}
                >
                  <Text style={styles.saveBtnText}>{savingMobile ? 'Updating...' : 'Save Mobile Number'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* AADHAAR VERIFY MODAL FOR EXISTING CUSTOMERS (ITEM 5 & ITEM 8) */}
      {verifyAadhaarCust && (
        <VerifyCustomerModal
          visible={!!verifyAadhaarCust}
          onClose={() => setVerifyAadhaarCust(null)}
          internetId={verifyAadhaarCust.internet_id || verifyAadhaarCust.id}
          username={verifyAadhaarCust.username}
          customerName={verifyAadhaarCust.full_name || verifyAadhaarCust.name}
          onVerified={async () => {
            toast.success(`Aadhaar verification completed for ${verifyAadhaarCust.full_name || verifyAadhaarCust.username}!`);
            setVerifyAadhaarCust(null);
            loadCustomerDataFromApi();
          }}
        />
      )}

      {/* ADD IPTV UNREGISTERED CUSTOMER MODAL (ITEM 1) */}
      {showUnregisteredIptvModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowUnregisteredIptvModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add IPTV Subscriber (Unregistered User)</Text>
                <TouchableOpacity onPress={() => setShowUnregisteredIptvModal(false)}>
                  <Feather name="x" size={18} color={COLORS.textDim} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>Add an IPTV customer directly even if not yet registered in the core database.</Text>
              
              <View style={{ gap: 12, marginBottom: 20 }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>SUBSCRIBER FULL NAME *</Text>
                  <TextInput style={styles.formInput} placeholder="Enter full name" value={unregisteredIptvName} onChangeText={setUnregisteredIptvName} />
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>MOBILE NUMBER *</Text>
                  <TextInput style={styles.formInput} placeholder="10-digit mobile number" value={unregisteredIptvMobile} onChangeText={setUnregisteredIptvMobile} keyboardType="phone-pad" />
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 }}>IPTV STB BOX / MAC ADDRESS *</Text>
                  <TextInput style={styles.formInput} placeholder="e.g. 00:1A:79:45:67:89 or STB-99482" value={unregisteredIptvMac} onChangeText={setUnregisteredIptvMac} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowUnregisteredIptvModal(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#8b5cf6' }]}
                  disabled={submittingIptvAdd}
                  onPress={async () => {
                    if (!unregisteredIptvMobile.trim()) return toast.info('Mobile number is required');
                    setSubmittingIptvAdd(true);
                    try {
                      await OneBssApi.syncIptvCustomers(unregisteredIptvMobile.trim());
                      toast.success('Unregistered IPTV subscriber registered and synchronized via Gateway API!');
                      setShowUnregisteredIptvModal(false);
                      setUnregisteredIptvName('');
                      setUnregisteredIptvMobile('');
                      setUnregisteredIptvMac('');
                      loadCustomerDataFromApi();
                    } catch (e) {
                      toast.error('Failed to register IPTV subscriber.');
                    } finally {
                      setSubmittingIptvAdd(false);
                    }
                  }}
                >
                  <Text style={styles.saveBtnText}>{submittingIptvAdd ? 'Registering...' : 'Register & Sync IPTV'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );

  const handleIptvCustomerDetailSync = async (cust, silent = false) => {
    if (!cust) return;
    const rawMobile = cust.mobile || '';
    const digitsOnly = String(rawMobile).replace(/\D/g, '');
    const targetMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';
    if (!targetMobile) {
      if (!silent) toast.error('This subscriber has no valid mobile number to sync with.');
      return;
    }
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

  const handleAddIptvForCustomer = async ({ customer, name, mobile, stbMac, stbId, branchCode, partnerId }) => {
    const rawMobile = mobile || customer?.mobile || '';
    const digitsOnly = String(rawMobile).replace(/\D/g, '');
    const cleanMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';
    if (!cleanMobile) {
      toast.error('A valid 10-digit mobile number is required to add IPTV.');
      return false;
    }
    const targetName = name || customer?.full_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Subscriber';
    const custId = customer?.cust_id || customer?.id;
    const finalStbId = stbId || `STB-${custId || cleanMobile.slice(-4)}`;
    const resolvedPartnerId = partnerId || customer?.internet_accounts?.[0]?.partner_id || customer?.partner_id || user?.partner_id;
    const resolvedBranchCode = branchCode || customer?.branch_code || '';

    try {
      if (user?.token) setApiConfig(undefined, user.token);

      // 1. Call POST /iptv_add_customer.php
      const parts = targetName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || customer?.first_name || 'Subscriber';
      const lastName = parts.slice(1).join(' ') || customer?.last_name || '';

      const iptvPayload = {
        partner_id: Number(resolvedPartnerId),
        mobile: cleanMobile,
        first_name: firstName,
        last_name: lastName,
        email: customer?.email || '',
        address: customer?.installation_address || customer?.address || '',
        branch_code: resolvedBranchCode,
        state: customer?.state || '',
        city: customer?.city || '',
      };

      const addRes = await OneBssApi.addIptvCustomer(iptvPayload);
      if (!addRes.ok) {
        toast.error(`Could not add IPTV account: ${addRes.data?.message || 'Pioneer rejected the request.'}`);
        return false;
      }

      // 2. Synchronize / register IPTV customer via gateway
      const res = await OneBssApi.syncIptvCustomers(cleanMobile);
      const syncData = res?.data || {};

      const s = syncData?.summary || res?.summary;
      const isNoDevices = (
        (syncData?.success || res?.success) &&
        s &&
        Number(s.stbs_added || 0) === 0 &&
        Number(s.stbs_skipped || 0) === 0
      );

      if (isNoDevices) {
        toast.info('customer registered successfully , No devices found');
      } else if (syncData?.success || res?.success) {
        toast.success(`IPTV account successfully added for ${targetName}!`);
      } else {
        toast.warn(`IPTV customer created, but the STB sync failed: ${syncData.message || 'unknown error'}. Run the sync again later.`);
      }

      // 3. Refresh customer details and subscriber records
      const refreshed = await fetchCustomerDetails(custId, true);

      const curDetails = customerDetailsRef.current[String(custId)] || customerDetails[String(custId)] || customer || {};
      const existingIptv = curDetails.iptv_accounts || [];
      const updated = {
        ...curDetails,
        ...refreshed,
        iptv_sync_status: isNoDevices ? 'no_devices' : (refreshed?.iptv_sync_status || curDetails?.iptv_sync_status || null),
        iptv_accounts: isNoDevices ? (refreshed?.iptv_accounts || []) : (existingIptv.length > 0 ? existingIptv : []),
      };
      customerDetailsRef.current = { ...customerDetailsRef.current, [String(custId)]: updated };
      setCustomerDetails((prev) => ({ ...prev, [String(custId)]: updated }));

      await loadCustomerDataFromApi();
      return isNoDevices ? { status: 'no_devices' } : true;
    } catch (err) {
      toast.error(`Failed to add IPTV account: ${err?.message || 'Error occurred'}`);
      return false;
    }
  };


  useEffect(() => {
    setViewMode(isIptvMode ? 'iptv' : 'broadband');
  }, [isIptvMode]);

  useEffect(() => {
    setActiveFilter(normalizeListFilter(initialFilter, viewMode === 'iptv'));
  }, [initialFilter, viewMode]);

  // URL hash for this list: keeps the status filter and the date range, plus any extra
  // params (sub_id / acc), so opening a customer and coming back restores the same list.
  const buildListHash = (extra = [], filter = activeFilter, range = activeRange) => {
    const tab = viewMode === 'iptv' ? 'iptv_customers' : 'customers';
    const parts = [];
    if (filter && filter !== 'all') parts.push(`filter=${filter}`);
    if (range) parts.push(`range=${range}`);
    parts.push(...extra);
    return parts.length ? `${tab}?${parts.join('&')}` : tab;
  };

  const handleClearRange = () => {
    setActiveRange('');
    try {
      if (typeof window !== 'undefined') window.location.hash = buildListHash([], activeFilter, '');
    } catch (e) {}
  };

  const handleSelectFilter = (filterId) => {
    const next = normalizeListFilter(filterId, viewMode === 'iptv');
    setActiveFilter(next);
    try {
      if (typeof window !== 'undefined') {
        const tab = viewMode === 'iptv' ? 'iptv_customers' : 'customers';
        window.location.hash = buildListHash([], next);
        localStorage.setItem('onebss_active_tab', tab);
        if (next !== 'all') {
          localStorage.setItem('onebss_filter', next);
        } else {
          localStorage.removeItem('onebss_filter');
        }
      }
    } catch (e) {}
  };

  // Back to page 1 whenever the result set changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRowIds(new Set());
  }, [activeFilter, activeRange, debouncedSearch, viewMode, selectedOperatorId, pageSize, sortField, sortDirection]);

  // (Re)load the page from the server whenever any list parameter changes
  listQueryRef.current = {
    type: viewMode === 'iptv' ? 'iptv' : 'internet',
    page: currentPage,
    pageSize,
    search: debouncedSearch,
    status: activeFilter,
    partnerId: selectedOperatorId,
    sort: sortField || undefined,
    dir: sortField ? sortDirection : undefined,
    range: activeRange || undefined,
  };
  const listQueryKey = JSON.stringify(listQueryRef.current);
  useEffect(() => {
    if (!user) return;
    loadCustomerDataFromApi();
  }, [user, listQueryKey]);

  const counts = listCounts;
  const filteredCustomers = useMemo(
    () => {
      let rows = rawCustomers.map(viewMode === 'iptv' ? mapIptvListRow : mapInternetListRow);
      if (selectedBranchFilter) {
        rows = rows.filter((c) => {
          const bVal = String(c.branch_name || c.iptv_branch_id || c.branch_id || c.partner_region || '').toLowerCase();
          return bVal.includes(String(selectedBranchFilter).toLowerCase());
        });
      }
      return rows;
    },
    [rawCustomers, viewMode, selectedBranchFilter]
  );
  const paginatedCustomers = filteredCustomers; // the server already returned just this page
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));

  const handleToggleMode = (newMode) => {
    setViewMode(newMode);
    setActiveFilter('all');
    setActiveAccountSel(null);
    setActiveCustomerId(null);
    if (onSwitchMode) {
      onSwitchMode(newMode === 'iptv' ? 'iptv_customers' : 'customers');
    }
  };

  const modeTab = isIptvMode ? 'iptv_customers' : 'customers';

  // Row click in the list -> open the customer's account cards overview & auto-close sidebar
  const handleOpenSubscriberScreen = (cust) => {
    if (!cust) return;
    const cId = cust.cust_id;
    if (cId === null || cId === undefined || cId === '') {
      toast.warning(`${cust.username || cust.stb_box || 'This account'} is not linked to a customer yet.`);
      return;
    }
    setActiveCustomerId(cId);
    setActiveAccountSel(null);
    if (typeof window !== 'undefined') {
      window.location.hash = buildListHash([`sub_id=${cId}`]);
    }
    if (onAutoCloseSidebar) {
      onAutoCloseSidebar();
    }
    // Internet + IPTV sync starts automatically once the saved record is shown (see autoSyncedFor).
  };

  // "Details" on an account card -> existing full detail screen for that account
  const handleOpenAccountDetails = (kind, accIndex) => {
    if (!activeCustomer) return;
    setActiveAccountSel({ kind, index: accIndex });
    if (typeof window !== 'undefined') {
      window.location.hash = buildListHash([`sub_id=${activeCustomer.cust_id}`, `acc=${kind === 'iptv' ? 'iptv' : 'int'}_${accIndex}`]);
    }
  };

  // Detail screen back -> account cards
  const handleCloseSubscriberScreen = () => {
    setActiveAccountSel(null);
    if (typeof window !== 'undefined' && activeCustomerId !== null) {
      window.location.hash = buildListHash([`sub_id=${activeCustomerId}`]);
    }
  };

  // Account cards back -> subscriber list
  const handleCloseCustomerOverview = () => {
    setActiveAccountSel(null);
    setActiveCustomerId(null);
    if (typeof window !== 'undefined') {
      window.location.hash = buildListHash();
    }
  };

  // Open Edit Modal
  const handleOpenResetPassword = (cust) => {
    setResetPasswordModalItem(cust);
    setNewPasswordInput('');
    setShowNewPassword(true);
  };

  // Changes the subscriber's internet (PPPoE) password on the RADIUS gateway.
  const handleConfirmResetPassword = async () => {
    const pass = newPasswordInput.trim();
    if (!resetPasswordModalItem || !pass) return;
    const internetId = resetPasswordModalItem.internet_id;
    if (!internetId) {
      toast.error('This subscriber has no internet account to change the password for.');
      return;
    }
    setResettingPassword(true);
    try {
      const res = await OneBssApi.changeInternetPassword(internetId, pass);
      if (!res.ok) {
        toast.error(res.data?.message || 'Failed to change the password.');
        return;
      }
      toast.success(`Password changed for ${resetPasswordModalItem.username}.`);
      setResetPasswordModalItem(null);
    } catch (e) {
      toast.error('Failed to change the password.');
    } finally {
      setResettingPassword(false);
    }
  };


  if (showAddCustomer) {
    return (
      <AddCustomerScreen
        user={user}
        operatorId={user?.partner_id || user?.operator_id}
        isIptvMode={viewMode === 'iptv'}
        onCancel={() => setShowAddCustomer(false)}
        onSuccess={() => {
          setShowAddCustomer(false);
          loadCustomerDataFromApi();
        }}
      />
    );
  }

  if (activeCustomer && !activeSubProfile) {
    return (
      <>
      <CustomerAccountsOverview
        customer={activeCustomer}
        loading={loadingDetailsFor === String(activeCustomerId)}
        syncing={syncingFor === String(activeCustomerId)}
        syncState={syncState[String(activeCustomerId)]}
        onRefresh={() => syncAllAccountsOf(activeCustomerId)}
        onInternetRecharge={openInternetRecharge}
        onIptvRecharge={openIptvRecharge}
        onRecheck={(acc) => runRecheck(acc, acc.internet_id ? 'internet' : acc.subscriber_id ? 'ott' : 'iptv')}
        onOttRecharge={openOttRecharge}
        onOttDeactivate={deactivateOtt}
        onAddOtt={(c) => setAddOttFor(c)}
        onVerify={(acc) => setVerifyReq(acc)}
        onBack={handleCloseCustomerOverview}
        onOpenDetails={handleOpenAccountDetails}
        onModifyMobile={(c) => { setModifyMobileCust(c); setNewMobileVal(c?.mobile || ''); }}
        onAddIptv={handleAddIptvForCustomer}
        onComboRecharge={(c) => setComboRechargeFor(c)}
        // admins (super distributor / distributor / sub distributor) only view customers
        readOnly={String(user?.role || user?.account_role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'admin'}
        operatorNames={Object.fromEntries((operators || []).map((o) => [String(o.partner_id), o.partner_name]))}
      />
      {accountActionModals}
      </>
    );
  }

  // IPTV accounts get their own detail layout (Basic Info + STB Info)
  if (activeCustomer && activeAccountSel?.kind === 'iptv') {
    const iptvAcc = activeCustomer.iptv_accounts?.[activeAccountSel.index];
    if (iptvAcc) {
      return (
        <>
        <IptvAccountDetails
          customer={activeCustomer}
          account={iptvAcc}
          accountIndex={activeAccountSel.index}
          operatorName={String(iptvAcc.partner_id) === String(user?.partner_id) ? user?.partner_name : ''}
          onBack={handleCloseSubscriberScreen}
          onOpenRecharge={() => openIptvRecharge(iptvAcc)}
          onSync={async () => {
            await handleIptvCustomerDetailSync({ id: `iptv_${iptvAcc.id}`, mobile: activeCustomer.mobile, name: activeCustomer.full_name });
            await fetchCustomerDetails(activeCustomerId, true);
          }}
        />
        {accountActionModals}
        </>
      );
    }
  }

  if (activeSubProfile) {
    const isOnline = onlineOverride !== null && activeAccountSel?.kind === 'internet' ? onlineOverride : (activeSubProfile.online === 'ONLINE' || activeSubProfile.isOnline);
    const isAccountActive = (activeSubProfile.status || activeSubProfile.status_text || '').toLowerCase() === 'active';
    // admins (super distributor / distributor / sub distributor) only view customers
    const readOnlyViewer = String(user?.role || user?.account_role || '').toLowerCase().replace(/[\s_-]+/g, '') === 'admin';
    const internetTabs = [
      { id: 'basic', label: 'Basic Info', short: 'Basic', icon: 'user' },
      { id: 'online', label: 'Online Session', short: 'Online', icon: 'wifi', color: isOnline ? '#059669' : undefined, disabled: !isOnline || !currentInternetAccount, hint: 'Available while the customer is online' },
      { id: 'password', label: 'Password', short: 'Password', icon: 'key', disabled: !currentInternetAccount },
      { id: 'mac', label: 'MAC Bindings', short: 'MAC', icon: 'globe', disabled: !currentInternetAccount },
      { id: 'sessions', label: 'Session History', short: 'Sessions', icon: 'list', disabled: !currentInternetAccount },
      { id: 'auth', label: 'Authentication Logs', short: 'Auth logs', icon: 'shield', disabled: !currentInternetAccount },
      { id: 'onu', label: 'ONU Details', short: 'ONU', icon: 'hard-drive', disabled: !currentInternetAccount },
      ...(canSeeDocuments ? [{ id: 'documents', label: 'Documents', short: 'Docs', icon: 'file-text' }] : []),
    ];

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
        <TouchableOpacity style={[styles.backBtn, { marginBottom: 16 }]} onPress={handleCloseSubscriberScreen}>
          <Feather name="arrow-left" size={16} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>{activeCustomer ? 'Back to Accounts' : 'Back to Subscribers List'}</Text>
        </TouchableOpacity>

        {/* TOP SUBSCRIBER IDENTITY HEADER CARD */}
        <View style={{ backgroundColor: '#ffffff', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isMobile ? 12 : 16, maxWidth: '100%' }}>
            {/* PROFILE AVATAR THUMBNAIL */}
            <CustomerPhoto uri={activeCustomer?.profile_image} size={isMobile ? 52 : 64} radius={12} dark={false} />

            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#000000' }}>Username: {activeSubProfile.username || '—'}</Text>
                <TouchableOpacity onPress={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    navigator.clipboard.writeText(activeSubProfile.username || '');
                    toast.success('Username copied to clipboard!');
                  }
                }}>
                  <Feather name="copy" size={14} color="#64748b" />
                </TouchableOpacity>
                <Text style={{ fontSize: 13, color: '#4b5563', marginLeft: isMobile ? 0 : 12 }}>
                  {activeSubProfile.account_type === 'iptv'
                    ? `IPTV ID: ${activeSubProfile.iptv_id ?? '—'}`
                    : `Account ID: ${activeSubProfile.acc_id ?? activeSubProfile.cust_id ?? '—'}`}
                </Text>
              </View>
              <Text style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>Mobile: {activeSubProfile.mobile || '—'}</Text>
              <Text style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>Expiry Date: {formatApiDate(activeSubProfile.expiration || activeSubProfile.expiryDate)}</Text>
            </View>
          </View>

          {/* RIGHT STATUS BADGES */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* ONLINE opens the Online Session tab */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(100, 116, 139, 0.1)' }}
              onPress={() => isOnline && currentInternetAccount && setInternetTab('online')}
              disabled={!isOnline || !currentInternetAccount}
              title={isOnline ? 'View the online session' : undefined}
              accessibilityRole={isOnline ? 'button' : undefined}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOnline ? '#10b981' : '#64748b' }} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: isOnline ? '#10b981' : '#ef4444' }}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
              {isOnline && currentInternetAccount ? <Feather name="chevron-right" size={13} color="#10b981" /> : null}
            </TouchableOpacity>

            <View style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: isAccountActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: isAccountActive ? '#10b981' : '#ef4444' }}>
                {isAccountActive ? 'Active' : 'Expired'}
              </Text>
            </View>
          </View>
          {/* RECHARGE / VERIFY */}
          {readOnlyViewer ? null : (
            <View style={{ flexDirection: 'row' }}>
              {currentInternetAccount && !currentInternetAccount.open_recharge && !isAccountVerified(currentInternetAccount) ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
                  onPress={() => setVerifyReq(currentInternetAccount)}
                >
                  <Feather name="user-check" size={14} color="#ffffff" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>Verify Customer</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f97316', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }, !currentInternetAccount && { opacity: 0.5 }]}
                  onPress={() => currentInternetAccount && openInternetRecharge(currentInternetAccount, defaultRechargeType({ expiration: currentInternetAccount.expiration }) === 'advance')}
                  disabled={!currentInternetAccount}
                >
                  <Feather name={isAccountActive ? 'fast-forward' : 'refresh-cw'} size={14} color="#ffffff" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#ffffff' }}>
                    {currentInternetAccount?.open_recharge
                      ? `Recheck Recharge · ₹${Number(currentInternetAccount.open_recharge.amount || 0).toFixed(2)}`
                      : currentInternetAccount && defaultRechargeType({ expiration: currentInternetAccount.expiration }) === 'advance' ? 'Advance Renewal' : 'Recharge'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* TABS (vertical on PC, a horizontal scrollable strip on phones) + SELECTED TAB */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 16, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
          <ScrollView
            horizontal={isMobile}
            style={[styles.tabRail, isMobile ? { width: '100%' } : { width: 210, maxHeight: Math.max(260, (winHeight || 700) - 140) }]}
            contentContainerStyle={isMobile ? { padding: 5, gap: 4, flexDirection: 'row' } : { padding: 6, gap: 4 }}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            {internetTabs.map((t) => {
              const on = internetTab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[isMobile ? styles.tabItemSm : styles.tabItem, on && styles.tabItemOn, t.disabled && { opacity: 0.4 }]}
                  onPress={() => !t.disabled && setInternetTab(t.id)}
                  disabled={t.disabled}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on, disabled: !!t.disabled }}
                  title={t.disabled ? t.hint : t.label}
                >
                  <Feather name={t.icon} size={isMobile ? 14 : 15} color={on ? '#ffffff' : t.color || '#334155'} />
                  <Text style={[isMobile ? styles.tabTextSm : styles.tabText, on && { color: '#ffffff' }]} numberOfLines={1}>{t.label}</Text>
                  {t.id === 'online' && isOnline && !on ? <View style={styles.tabLiveDot} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ flex: 1, minWidth: 0, gap: 16 }}>
        {internetTab === 'online' && currentInternetAccount ? (
          <OnlineSessionPanel
            internetId={currentInternetAccount.internet_id}
            username={activeSubProfile.username}
            readOnly={readOnlyViewer}
            onStatus={(online) => setOnlineOverride(!!online)}
            onRefreshAccount={async () => {
              await handleAccountDetailSync(currentInternetAccount.internet_id, true);
              await fetchCustomerDetails(activeCustomerId, true);
            }}
          />
        ) : internetTab === 'password' && currentInternetAccount ? (
          <PasswordModal inline visible internetId={currentInternetAccount.internet_id} username={currentInternetAccount.username} onClose={() => setInternetTab('basic')} />
        ) : internetTab === 'mac' && currentInternetAccount ? (
          <MacBindingsModal inline visible internetId={currentInternetAccount.internet_id} username={currentInternetAccount.username} onClose={() => setInternetTab('basic')} />
        ) : internetTab === 'sessions' && currentInternetAccount ? (
          <SessionHistoryModal inline visible internetId={currentInternetAccount.internet_id} username={currentInternetAccount.username} onClose={() => setInternetTab('basic')} />
        ) : internetTab === 'auth' && currentInternetAccount ? (
          <AuthLogsModal inline visible internetId={currentInternetAccount.internet_id} username={currentInternetAccount.username} onClose={() => setInternetTab('basic')} />
        ) : internetTab === 'onu' && currentInternetAccount ? (
          <CustomerDevicesModal inline visible customer={{ ...currentInternetAccount, full_name: activeSubProfile?.name }} onClose={() => setInternetTab('basic')} />
        ) : internetTab === 'documents' && canSeeDocuments ? (
          <DocumentsModal inline visible customer={activeCustomer} onClose={() => setInternetTab('basic')} />
        ) : (
          <>

        {/* BASIC INFO: account, package, connection + address */}
        <View style={{ flexDirection: isMobile ? 'column' : 'row', flexWrap: isMobile ? 'nowrap' : 'wrap', gap: 16 }}>
          {/* CARD 1: ACCOUNT DETAILS */}
          <View style={{ flex: 1, flexBasis: isMobile ? 'auto' : 280, minWidth: isMobile ? 0 : 260, backgroundColor: '#ffffff', borderRadius: 14, padding: isMobile ? 14 : 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
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
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>{activeSubProfile.email || '—'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Mobile</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>{activeSubProfile.mobile || '—'}</Text>
                  {activeSubProfile.mobile_verified ? <Feather name="check-circle" size={13} color="#10b981" /> : null}
                  <TouchableOpacity
                    onPress={() => {
                      setModifyMobileCust(activeSubProfile);
                      setNewMobileVal(activeSubProfile.mobile || '');
                    }}
                    style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(139, 92, 246, 0.1)', borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.25)', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    title="Modify Mobile Number"
                  >
                    <Feather name="edit-2" size={10} color="#8b5cf6" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#8b5cf6' }}>Edit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Customer Verification</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: isAccountVerified(currentInternetAccount || activeSubProfile) ? '#000000' : '#b45309' }}>
                    {isAccountVerified(currentInternetAccount || activeSubProfile) ? 'Verified' : 'Not verified'}
                  </Text>
                  {isAccountVerified(currentInternetAccount || activeSubProfile) ? <Feather name="check-circle" size={13} color="#10b981" /> : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Aadhar Verification</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: activeSubProfile.aadhar_verified ? '#000000' : '#b45309' }}>{activeSubProfile.aadhar_verified ? 'Verified' : 'Not verified'}</Text>
                  {activeSubProfile.aadhar_verified ? <Feather name="check-circle" size={13} color="#10b981" /> : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Aadhar Verification Date</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>{formatApiDate(activeSubProfile.aadhar_verified_date)}</Text>
              </View>
            </View>
          </View>

          {/* CARD 2: PACKAGE DETAILS */}
          <View style={{ flex: 1, flexBasis: isMobile ? 'auto' : 280, minWidth: isMobile ? 0 : 260, backgroundColor: '#ffffff', borderRadius: 14, padding: isMobile ? 14 : 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
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
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#000000' }}>{formatApiDate(activeSubProfile.expiration || activeSubProfile.expiryDate)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Validity</Text>
                {(() => {
                  const v = validityLeft(activeSubProfile.expiration || activeSubProfile.expiryDate);
                  return <Text style={{ fontSize: 13, fontWeight: '700', color: v.color }}>{v.text}</Text>;
                })()}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Last Renewal</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>{formatApiDate(activeSubProfile.renewal_date)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Status</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isAccountActive ? '#10b981' : '#ef4444' }}>{activeSubProfile.status_text || 'Active'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Operator</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000', flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>{activeSubProfile.partner_name || '—'}</Text>
              </View>
            </View>
          </View>

          {/* CARD 3: CONNECTION DETAILS */}
          <View style={{ flex: 1, flexBasis: isMobile ? 'auto' : 280, minWidth: isMobile ? 0 : 260, backgroundColor: '#ffffff', borderRadius: 14, padding: isMobile ? 14 : 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
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
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>{formatApiDate(activeSubProfile.activation_date)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Last Logout</Text>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#000000' }}>{formatApiDate(activeSubProfile.last_logoff)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>IP Address</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>{activeSubProfile.ip_address || 'Dynamic'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Customer Type</Text>
                <Text style={{ fontSize: 13, fontWeight: '500', color: '#000000' }}>{activeSubProfile.customer_type || '—'}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#64748b' }}>Simultaneous Use</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#000000' }}>{activeSubProfile.simultaneous_use || '—'}</Text>
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
              <Text style={{ fontSize: 13, color: '#000000', lineHeight: 20 }}>{activeSubProfile.billing_address || activeSubProfile.address || '—'}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, marginBottom: 6 }}>INSTALLATION ADDRESS</Text>
              <Text style={{ fontSize: 13, color: '#000000', lineHeight: 20 }}>{activeSubProfile.installation_address || activeSubProfile.address || '—'}</Text>
            </View>
          </View>
        </View>
          </>
        )}
          </View>
        </View>
        {accountActionModals}
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
        {/* Search Bar, Operator Filter & Add Customer Button */}
        <View style={[styles.topControlRow, { gap: 10, flexWrap: 'wrap', alignItems: 'center' }]}>
          <View style={[styles.searchBox, { width: isMobile ? '100%' : 260, maxWidth: '100%' }]}>
            <Feather name="search" size={15} color={COLORS.textDim} />
            <TextInput
              style={styles.searchInput}
              placeholder={viewMode === 'iptv'
                ? 'Search STB / VC number, Pioneer ID, name, mobile, operator...'
                : 'Search username, mobile, name, email, account ID, operator...'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={() => setDebouncedSearch(searchQuery.trim())}
              placeholderTextColor={COLORS.textDim}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedSearch(''); }} style={{ padding: 2 }} title="Clear search">
                <Feather name="x" size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            ) : null}
          </View>

          {(isSuperAdmin(user) || (user?.account_role || user?.role || '').toLowerCase() === 'admin') && operators.length > 0 && (
            <View style={{ position: 'relative', zIndex: 10000 }}>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: COLORS.cardBg || '#ffffff',
                  borderWidth: 1,
                  borderColor: selectedOperatorId ? (COLORS.primary || '#3b82f6') : (COLORS.borderLight || '#cbd5e1'),
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  height: 40,
                  minWidth: 170,
                  justifyContent: 'space-between',
                }}
                onPress={() => setOperatorDropdownOpen(!operatorDropdownOpen)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
                  <Feather name="filter" size={14} color={selectedOperatorId ? (COLORS.primary || '#3b82f6') : COLORS.textDim} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: selectedOperatorId ? (COLORS.primary || '#3b82f6') : (COLORS.textMain || '#000000'),
                    }}
                  >
                    {selectedOpLabel}
                  </Text>
                </View>
                <Feather name={operatorDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textDim} />
              </TouchableOpacity>

              {operatorDropdownOpen && (
                <>
                  {/* Web backdrop overlay to close dropdown on outside click */}
                  <TouchableOpacity
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 9999,
                      backgroundColor: 'transparent',
                    }}
                    activeOpacity={1}
                    onPress={() => {
                      setOperatorDropdownOpen(false);
                      setOperatorSearchQuery('');
                    }}
                  />

                  {/* Inline Dropdown Box with Search */}
                  <View
                    style={{
                      position: 'absolute',
                      top: 44,
                      left: isMobile ? 0 : undefined,
                      right: isMobile ? undefined : 0,
                      width: isMobile ? 260 : 280,
                      backgroundColor: '#ffffff',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      elevation: 20,
                      zIndex: 10000,
                      padding: 8,
                      boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    {/* Search Input inside Dropdown */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: '#f8fafc',
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 6,
                        paddingHorizontal: 10,
                        height: 38,
                        marginBottom: 8,
                      }}
                    >
                      <Feather name="search" size={14} color="#64748b" />
                      <TextInput
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: '#0f172a',
                          paddingVertical: 0,
                          outline: 'none',
                        }}
                        placeholder="Search operator..."
                        placeholderTextColor="#94a3b8"
                        value={operatorSearchQuery}
                        onChangeText={setOperatorSearchQuery}
                        autoFocus={true}
                      />
                      {operatorSearchQuery ? (
                        <TouchableOpacity onPress={() => setOperatorSearchQuery('')} style={{ padding: 2 }}>
                          <Feather name="x" size={13} color="#64748b" />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Scrollable Operators List */}
                    <ScrollView style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                      {/* All Operators Option */}
                      {(!operatorSearchQuery || 'all operators'.includes(operatorSearchQuery.toLowerCase())) && (
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 6,
                            backgroundColor: selectedOperatorId === '' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                            marginBottom: 2,
                          }}
                          onPress={() => {
                            setSelectedOperatorId('');
                            setOperatorDropdownOpen(false);
                            setOperatorSearchQuery('');
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: selectedOperatorId === '' ? '700' : '600',
                              color: selectedOperatorId === '' ? '#2563eb' : '#1e293b',
                            }}
                          >
                            All Operators ({operators.length})
                          </Text>
                          {selectedOperatorId === '' && <Feather name="check" size={14} color="#2563eb" />}
                        </TouchableOpacity>
                      )}

                      {/* Filtered Operator Items */}
                      {filteredOperators.length > 0 ? (
                        filteredOperators.map((op) => {
                          const opId = String(op.partner_id || op.id);
                          const isSelected = String(selectedOperatorId) === opId;
                          const opName = op.partner_name || op.company_name || `Partner #${opId}`;
                          return (
                            <TouchableOpacity
                              key={opId}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 6,
                                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                                marginBottom: 2,
                              }}
                              onPress={() => {
                                setSelectedOperatorId(opId);
                                setOperatorDropdownOpen(false);
                                setOperatorSearchQuery('');
                              }}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? '700' : '600',
                                    color: isSelected ? '#2563eb' : '#0f172a',
                                  }}
                                  numberOfLines={1}
                                >
                                  #{opId} - {opName}
                                </Text>
                                {op.company_name && op.company_name !== op.partner_name ? (
                                  <Text style={{ fontSize: 11, color: '#64748b' }} numberOfLines={1}>
                                    {op.company_name}
                                  </Text>
                                ) : null}
                              </View>
                              {isSelected && <Feather name="check" size={14} color="#2563eb" />}
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <View style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}>
                          <Feather name="search" size={18} color="#94a3b8" style={{ marginBottom: 4 }} />
                          <Text style={{ fontSize: 12, color: '#64748b' }}>No matching operators</Text>
                        </View>
                      )}
                    </ScrollView>
                  </View>
                </>
              )}
            </View>
          )}




          {((user?.role || user?.account_role || '').toLowerCase() === 'operator') && (
            <TouchableOpacity style={styles.addCustomerHeaderBtn} onPress={() => setShowAddCustomer(true)}>
              <Feather name="user-plus" size={14} color="#ffffff" />
              <Text style={styles.addCustomerHeaderBtnText}>Add Customer</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Active expiry / registration range (from the dashboard buttons) */}
        {activeRangeInfo ? (
          <View style={styles.rangeBanner}>
            <Feather name={activeRangeInfo.kind === 'expiry' ? 'clock' : 'user-plus'} size={14} color={activeRangeInfo.kind === 'expiry' ? '#b45309' : '#0369a1'} />
            <Text style={styles.rangeBannerText}>
              {viewMode === 'iptv' ? 'IPTV' : 'Internet'} · {activeRangeInfo.label}
              {!loadingData ? ` — ${counts.total ?? listTotal} ${viewMode === 'iptv' ? 'STB(s)' : 'account(s)'}` : ''}
            </Text>
            <TouchableOpacity onPress={handleClearRange} style={styles.rangeBannerClear} title="Show all accounts">
              <Feather name="x" size={13} color="#475569" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Clear</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Bottom Filter Chips Line — counts come from the server and cover every account */}
        <View style={styles.bottomChipRowContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {(viewMode === 'iptv'
              ? [
                  { id: 'all', label: 'All STBs', count: counts.total },
                  { id: 'active', label: 'Active', count: counts.active },
                  { id: 'expired', label: 'Expired', count: counts.expired },
                  { id: 'suspended', label: 'Suspended', count: counts.suspended },
                  { id: 'disabled', label: 'Disabled', count: counts.disabled },
                  { id: 'new', label: 'New', count: counts.new },
                ]
              : [
                  { id: 'all', label: 'All Subscribers', count: counts.total },
                  { id: 'new', label: 'New', count: counts.new },
                  { id: 'active', label: 'Active', count: counts.active },
                  { id: 'online', label: 'Online', count: counts.online },
                  { id: 'offline', label: 'Offline', count: counts.offline },
                  { id: 'expired', label: 'Expired', count: counts.expired },
                  { id: 'suspended', label: 'Suspended', count: counts.suspended },
                  { id: 'disabled', label: 'Disabled', count: counts.disabled },
                ]
            ).map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.chip, isActive && (viewMode === 'iptv' ? styles.chipActiveIptv : styles.chipActive)]}
                  onPress={() => handleSelectFilter(tab.id)}
                >
                  <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                    {tab.label} ({tab.count ?? 0})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* SERVICE DATA DISPLAY TABLE */}
      <View style={styles.card}>
        <View style={{ width: '100%' }}>
          {/* PAGINATION CONTROLS BAR (TOP) */}
          <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight || '#e2e8f0', gap: 10, backgroundColor: COLORS.cardBg || '#ffffff' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {loadingData ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
              <Text style={{ fontSize: 12, color: COLORS.textMuted || '#64748b' }}>
                Showing {listTotal === 0 ? 0 : (currentPage - 1) * pageSize + 1} to {Math.min((currentPage - 1) * pageSize + paginatedCustomers.length, listTotal)} of {listTotal} {viewMode === 'iptv' ? 'set-top boxes' : 'subscribers'}
                {debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>

              {/* Items Per Page Selector */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: COLORS.textMuted || '#64748b' }}>Per page:</Text>
                {[100, 250, 500, 1000].map((size) => (
                  <TouchableOpacity
                    key={size}
                    style={[{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: COLORS.borderLight || '#e2e8f0' }, pageSize === size && { backgroundColor: COLORS.primary || '#3b82f6', borderColor: COLORS.primary || '#3b82f6' }]}
                    onPress={() => { setPageSize(size); setCurrentPage(1); }}
                  >
                    <Text style={[{ fontSize: 11, fontWeight: '600', color: COLORS.textMuted || '#64748b' }, pageSize === size && { color: '#ffffff' }]}>{size}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Previous & Next Buttons */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: COLORS.borderLight || '#e2e8f0', backgroundColor: COLORS.bgSecondary || '#f8fafc' }, currentPage === 1 && { opacity: 0.4 }]}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMain || '#000000' }}>Previous</Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textMain || '#000000', paddingHorizontal: 4 }}>
                  Page {currentPage} of {totalPages}
                </Text>

                <TouchableOpacity
                  style={[{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: COLORS.borderLight || '#e2e8f0', backgroundColor: COLORS.bgSecondary || '#f8fafc' }, currentPage >= totalPages && { opacity: 0.4 }]}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.textMain || '#000000' }}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: viewMode === 'iptv' ? 1040 : 1240, width: '100%' }}>
          <View style={{ width: '100%' }}>
            {/* Table Header (on phones the table scrolls sideways) */}
            <View style={styles.tableHeader}>
              {viewMode === 'iptv' ? (
                <>
                  <Text style={[styles.th, { flex: 1.7, minWidth: 140 }]}>STB / Box No.</Text>
                  <Text style={[styles.th, { flex: 1.1, minWidth: 95 }]}>Status</Text>
                  <Text style={[styles.th, { flex: 1.7, minWidth: 130 }]}>Full Name</Text>
                  <Text style={[styles.th, { flex: 1.4, minWidth: 120 }]}>Mobile</Text>
                  {!isOperatorRole ? <Text style={[styles.th, { flex: 1.7, minWidth: 130 }]}>Operator / Branch</Text> : null}
                  <Text style={[styles.th, { flex: 1.8, minWidth: 140 }]}>Package</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.th, { flex: 1.5, minWidth: 120 }]}>Username</Text>
                  <Text style={[styles.th, { flex: 1.1, minWidth: 95 }]}>Connectivity</Text>
                  <Text style={[styles.th, { flex: 1.8, minWidth: 140 }]}>Full Name</Text>
                  <Text style={[styles.th, { flex: 1.4, minWidth: 120 }]}>Mobile</Text>
                  <Text style={[styles.th, { flex: 1.3, minWidth: 120 }]}>Aadhaar</Text>
                  {!isOperatorRole ? <Text style={[styles.th, { flex: 1.5, minWidth: 120 }]}>Operator</Text> : null}
                  <Text style={[styles.th, { flex: 1.8, minWidth: 140 }]}>Plan</Text>
                </>
              )}
              <TouchableOpacity
                style={[{ flex: viewMode === 'iptv' ? 2 : 2.2, minWidth: 140, flexDirection: 'row', alignItems: 'center', gap: 4 }, styles.th]}
                onPress={() => {
                  if (sortField === 'expiration') {
                    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  } else {
                    setSortField('expiration');
                    setSortDirection('asc');
                  }
                }}
              >
                <Text style={[styles.th, { flex: 0 }]}>Expiration Date</Text>
                <Feather
                  name={sortField === 'expiration' ? (sortDirection === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-down'}
                  size={12}
                  color={sortField === 'expiration' ? COLORS.primary : COLORS.textMuted}
                />
              </TouchableOpacity>
              {showRegisteredCol ? <Text style={[styles.th, { flex: 1.3, minWidth: 110 }]}>Registered On</Text> : null}
              <Text style={[styles.th, { flex: viewMode === 'iptv' ? 0.8 : 1.6, minWidth: viewMode === 'iptv' ? 80 : 150, textAlign: 'left' }]}>
                Actions
              </Text>
            </View>

            {/* Table Rows Body Container (ONLY SUBSCRIBER LIST ROWS SCROLL) */}
            <ScrollView style={isMobile ? null : { maxHeight: 600 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
            {listError && !loadingData ? (
              <View style={{ padding: 30, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="alert-circle" size={24} color="#dc2626" />
                <Text style={{ marginTop: 8, fontSize: 13, color: '#dc2626' }}>{listError}</Text>
                <TouchableOpacity onPress={loadCustomerDataFromApi} style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : paginatedCustomers.length === 0 ? (
              <View style={{ padding: 30, alignItems: 'center', justifyContent: 'center' }}>
                {loadingData ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <>
                    <Feather name="info" size={24} color={COLORS.textMuted} />
                    <Text style={{ marginTop: 8, fontSize: 13, color: COLORS.textMuted }}>No subscriber records matched your filter criteria.</Text>
                  </>
                )}
              </View>
            ) : (
              paginatedCustomers.map((cust, idx) => {
                const badge = STATUS_BADGE[cust.status_key] || STATUS_BADGE.other;
                const balInfo = calculateBalanceDays(cust.expiration || cust.expiryDate);

                const statusPill = (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: badge.bg, alignSelf: 'flex-start' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: badge.dot }} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: badge.fg }}>
                      {(badge.label === '—' ? (cust.status_text || '—') : badge.label).toUpperCase()}
                    </Text>
                  </View>
                );

                const mobileCell = (flex, minWidth = 120) => (
                  <View style={{ flex, minWidth, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                      onPress={() => {
                        if (cust.mobile) {
                          const num = String(cust.mobile).replace(/[^\d+]/g, '');
                          if (typeof window !== 'undefined') window.location.href = `tel:${num}`;
                          else Linking.openURL(`tel:${num}`);
                        }
                      }}
                    >
                      <Feather name="phone-call" size={12} color="#0651d4" />
                      <Text style={[styles.tdText, { color: '#0651d4', fontWeight: '600' }]}>{cust.mobile || '—'}</Text>
                    </TouchableOpacity>
                    {cust.mobile ? (
                      <TouchableOpacity
                        onPress={() => {
                          const num = String(cust.mobile).replace(/[^\d+]/g, '');
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(num);
                            toast.success('Mobile number copied to clipboard!');
                          }
                        }}
                        style={{ padding: 2 }}
                        title="Copy Mobile Number"
                      >
                        <Feather name="copy" size={12} color={COLORS.primary || '#3b82f6'} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );

                const isAadhaarDone = checkIsAadhaarVerified(cust);
                const aadhaarCell = (flex = 1.3, minWidth = 120) => (
                  <View style={{ flex, minWidth }}>
                    {isAadhaarDone ? (
                      <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="check-circle" size={11} color="#10b981" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#10b981' }}>Verified</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        onPress={() => setVerifyAadhaarCust(cust)}
                      >
                        <Feather name="shield" size={11} color="#ef4444" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#ef4444' }}>Verify Aadhaar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );

                const expiryCell = (flex, minWidth = 140) => (
                  <View style={{ flex, minWidth }}>
                    <Text style={styles.tdText}>{cust.expiration ? formatApiDate(cust.expiration) : '—'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {balInfo.status !== 'unknown' ? (
                        <View style={{ backgroundColor: balInfo.status === 'active' ? '#dcfce7' : (balInfo.status === 'warning' ? '#fef3c7' : '#ffe4e6'), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: balInfo.status === 'active' ? '#15803d' : (balInfo.status === 'warning' ? '#b45309' : '#be123c') }}>{balInfo.text}</Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        style={{
                          paddingHorizontal: 5,
                          paddingVertical: 3,
                          borderRadius: 4,
                          backgroundColor: 'rgba(37, 211, 102, 0.12)',
                          borderWidth: 1,
                          borderColor: 'rgba(37, 211, 102, 0.3)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        onPress={() => openWhatsApp(cust)}
                        title="Send WhatsApp Expiry Reminder"
                      >
                        <FontAwesome name="whatsapp" size={13} color="#25D366" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );

                const registeredCell = showRegisteredCol ? (
                  <View style={{ flex: 1.3, minWidth: 110 }}>
                    <Text style={[styles.tdText, { color: '#0369a1', fontWeight: '600' }]}>
                      {cust.registered_on ? formatApiDate(cust.registered_on, false) : '—'}
                    </Text>
                  </View>
                ) : null;

                if (viewMode === 'iptv') {
                  const stb = cust.stb_box || cust.pioneer_stb_id || `IPTV #${cust.iptv_id}`;
                  const rowKey = cust.id && cust.id !== 'iptv_undefined' ? cust.id : `iptv_row_${idx}_${cust.cust_id ?? idx}`;
                  return (
                    <View key={rowKey} style={styles.tr}>
                      {/* STB / Box */}
                      <View style={{ flex: 1.7, minWidth: 140 }}>
                        <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                          <Text style={[styles.tdClickableUsername, { color: '#7c3aed', fontFamily: 'monospace' }]}>{stb}</Text>
                        </TouchableOpacity>
                        {cust.pioneer_stb_id && cust.pioneer_stb_id !== stb ? (
                          <Text style={styles.tdSub}>Pioneer ID: {cust.pioneer_stb_id}</Text>
                        ) : null}
                      </View>

                      {/* Status */}
                      <View style={{ flex: 1.1, minWidth: 95 }}>{statusPill}</View>

                      {/* Full Name */}
                      <View style={{ flex: 1.7, minWidth: 130 }}>
                        <Text style={styles.tdText}>{cust.full_name || '—'}</Text>
                      </View>

                      {mobileCell(1.4, 120)}

                      {/* Operator / Branch (not shown to operators — it is always them) */}
                      {!isOperatorRole ? (
                        <View style={{ flex: 1.7, minWidth: 130 }}>
                          <Text style={styles.tdText}>{cust.partner_name || '—'}</Text>
                          {cust.branch_name ? <Text style={styles.tdSub}>{cust.branch_name}</Text> : null}
                        </View>
                      ) : null}

                      {/* Package + validity */}
                      <View style={{ flex: 1.8, minWidth: 140 }}>
                        <Text style={[styles.tdBold, { color: '#7c3aed' }]}>{cust.package_name || '—'}</Text>
                        <Text style={styles.tdSub}>
                          {[cust.subplan_name, cust.auto_renew ? 'Auto-renew' : null].filter(Boolean).join(' · ') || ' '}
                        </Text>
                      </View>

                      {expiryCell(2.0, 140)}
                      {registeredCell}

                      {/* Actions: Map (STBs have no ONU, so no Devices button) */}
                      <View style={{ flex: 0.8, minWidth: 80, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity onPress={() => setSelectedLocationCustomer(cust)} style={styles.rowActionBtn} title="View & pin location">
                          <Feather name="map-pin" size={13} color="#2563eb" />
                          <Text style={styles.rowActionText}>Map</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                const usernameColor = {
                  active: '#16a34a',
                  expired: '#dc2626',
                  suspended: '#d97706',
                  disabled: '#64748b',
                  new: '#7c3aed',
                }[cust.status_key] || COLORS.primary;
                const intRowKey = cust.id && cust.id !== 'int_undefined' ? cust.id : `int_row_${idx}_${cust.cust_id ?? idx}`;

                return (
                  <View key={intRowKey} style={styles.tr}>
                    {/* Username */}
                    <View style={{ flex: 1.5, minWidth: 120, gap: 3 }}>
                      <TouchableOpacity onPress={() => handleOpenSubscriberScreen(cust)}>
                        <Text
                          style={[
                            styles.tdClickableUsername,
                            { color: usernameColor },
                            cust.status_key === 'disabled' && { textDecorationLine: 'line-through' },
                          ]}
                        >
                          {cust.username || '—'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Connectivity */}
                    <View style={{ flex: 1.1, minWidth: 95 }}>
                      <View style={[styles.connPill, { backgroundColor: cust.isOnline ? '#dcfce7' : '#f1f5f9' }]}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cust.isOnline ? '#16a34a' : '#94a3b8' }} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: cust.isOnline ? '#15803d' : '#64748b' }}>
                          {cust.isOnline ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>
                    </View>

                    {/* Full Name */}
                    <View style={{ flex: 1.8, minWidth: 140 }}>
                      <Text style={styles.tdText}>{cust.full_name || cust.name || '—'}</Text>
                    </View>

                    {mobileCell(1.4, 120)}
                    {aadhaarCell(1.3, 120)}

                    {/* Operator (not shown to operators — it is always them) */}
                    {!isOperatorRole ? (
                      <View style={{ flex: 1.5, minWidth: 120 }}>
                        <Text style={styles.tdText}>{cust.partner_name || '—'}</Text>
                      </View>
                    ) : null}

                    {/* Plan: package + sub plan */}
                    <View style={{ flex: 1.8, minWidth: 140 }}>
                      <Text style={styles.tdBold}>{cust.package_name || '—'}</Text>
                      {cust.subplan_name ? <Text style={styles.tdSub}>{cust.subplan_name}</Text> : null}
                    </View>

                    {expiryCell(2.2, 140)}
                    {registeredCell}

                    {/* Actions: Map & ONU device */}
                    <View style={{ flex: 1.6, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity style={styles.rowActionBtn} onPress={() => setSelectedLocationCustomer(cust)} title="View & pin location">
                        <Feather name="map-pin" size={13} color="#2563eb" />
                        <Text style={styles.rowActionText}>Map</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rowActionBtn, { backgroundColor: 'rgba(14, 165, 233, 0.1)', borderColor: 'rgba(14, 165, 233, 0.3)' }]}
                        onPress={() => setSelectedDevicesCustomer({ ...cust, account_type: 'internet' })}
                        title="ONU details"
                      >
                        <Feather name="hard-drive" size={13} color="#0284c7" />
                        <Text style={[styles.rowActionText, { color: '#0284c7' }]}>ONU</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </View>
      {accountActionModals}
      {/* CUSTOMER LOCATION MAP MODAL */}
      <CustomerLocationModal
        visible={!!selectedLocationCustomer}
        onClose={() => setSelectedLocationCustomer(null)}
        customer={selectedLocationCustomer}
        onLocationSaved={() => {
          loadCustomerDataFromApi();
        }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  tabRail: { flexGrow: 0, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  tabItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10 },
  tabItemSm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 9 },
  tabItemOn: { backgroundColor: COLORS.primary },
  tabText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: '#334155' },
  tabTextSm: { fontSize: 13, fontWeight: '600', color: '#334155' },
  tabLiveDot: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, backgroundColor: '#10b981' },
  rowActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    alignSelf: 'flex-start',
  },
  rowActionText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },
  connPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  rangeBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', flexWrap: 'wrap', marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  rangeBannerText: { fontSize: 12, fontWeight: '700', color: '#0c4a6e' },
  rangeBannerClear: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' },
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
    zIndex: 9999,
    overflow: 'visible',
  },
  topControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
    zIndex: 9999,
    overflow: 'visible',
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
  tableHeader: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.glassBorder || '#cbd5e1',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  th: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' },
  tr: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', minHeight: 48 },
  tdBold: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  tdSub: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  tdText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
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