import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { CustomerPhoto, isAccountVerified } from './internet/shared';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { CustomerLocationMap } from './CustomerLocationMap';

// ---------- helpers ----------

const clean = (v) => (v === null || v === undefined || v === 'null' || String(v).trim() === '' ? '' : String(v));

// API returns "YYYY-MM-DD HH:mm:ss". Years before 2000 (1970-01-01, 1999-01-01) are placeholders for "not set".
export const parseApiDate = (value) => {
  const s = clean(value);
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T'));
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return d;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const formatApiDate = (value, withTime = true) => {
  const d = parseApiDate(value);
  if (!d) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const base = `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (!withTime) return base;
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${base}, ${h}:${m} ${ampm}`;
};

const describeExpiry = (value) => {
  const d = parseApiDate(value);
  if (!d) return { text: 'Never activated', tone: 'muted' };
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (days > 1) return { text: `${days} days left`, tone: days <= 3 ? 'warn' : 'ok' };
  if (days === 1) return { text: 'Expires tomorrow', tone: 'warn' };
  if (days === 0) return { text: d.getTime() > Date.now() ? 'Expires today' : 'Expired today', tone: 'warn' };
  if (days === -1) return { text: 'Expired yesterday', tone: 'bad' };
  return { text: `Expired ${Math.abs(days)} days ago`, tone: 'bad' };
};

const TONE = {
  ok: { fg: '#047857', bg: 'rgba(16, 185, 129, 0.12)' },
  warn: { fg: '#b45309', bg: 'rgba(245, 158, 11, 0.14)' },
  bad: { fg: '#dc2626', bg: 'rgba(239, 68, 68, 0.12)' },
  muted: { fg: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
};

const statusTone = (statusText, statusColor) => {
  const s = (statusText || '').toLowerCase();
  if (statusColor === 'success' || s === 'active') return TONE.ok;
  if (statusColor === 'danger' || s === 'suspend' || s === 'suspended') return TONE.bad;
  if (statusColor === 'warning' || s === 'expired') return TONE.warn;
  return TONE.muted;
};

const formatMoney = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || isNaN(n)) return '—';
  return `₹ ${n.toFixed(2)}`;
};

// Normalise both account kinds into one shape so the card can render either.
export const normaliseInternetAccount = (acc, index) => ({
  kind: 'internet',
  index,
  key: `int_${acc.internet_id ?? index}`,
  id: acc.internet_id,
  title: clean(acc.username) || `Internet #${acc.internet_id}`,
  subtitle: `Acc ID ${clean(acc.acc_id) || '—'} · Internet #${acc.internet_id}`,
  statusText: clean(acc.status_text) || 'Unknown',
  statusColor: acc.status_color,
  online: clean(acc.online).toUpperCase() === 'ONLINE',
  showOnline: true,
  planLabel: clean(acc.package_name) || (acc.package_id ? `Package #${acc.package_id}` : '—'),
  subplanLabel: clean(acc.subplan_name) || (acc.subplan_id ? `Sub plan #${acc.subplan_id}` : '—'),
  planId: acc.package_id,
  subPlanId: acc.subplan_id,
  expiration: acc.expiration,
  lastSeenLabel: 'Last logoff',
  lastSeen: acc.last_loff_off,
  balance: acc.balance,
  canRecharge: !!(acc.internet_id && acc.package_id && acc.subplan_id),
  canRechargeAny: !!(acc.internet_id && acc.partner_id), // plan is chosen in the recharge modal
  raw: acc,
});

export const normaliseIptvAccount = (acc, index) => ({
  kind: 'iptv',
  index,
  key: `iptv_${acc.id ?? index}`,
  id: acc.id,
  title: clean(acc.pioneer_stb_id) ? `STB ${acc.pioneer_stb_id}` : `IPTV #${acc.id}`,
  subtitle: clean(acc.branch_name) ? `Branch ${acc.branch_name} · IPTV #${acc.id}` : `IPTV #${acc.id}`,
  statusText: clean(acc.sts) || 'Unknown',
  statusColor: null,
  online: false,
  showOnline: false,
  planLabel: clean(acc.plan_name) || (acc.plan_id ? `Plan #${acc.plan_id}` : '—'),
  subplanLabel: clean(acc.subplan_name) || (acc.subplan_id ? `Sub plan #${acc.subplan_id}` : '—'),
  planId: acc.plan_id,
  subPlanId: acc.subplan_id,
  expiration: acc.expriration || acc.expiration, // API spells it "expriration"
  lastSeenLabel: 'Next invoice',
  lastSeen: acc.nxt_inv_date,
  balance: acc.balance,
  autoRenew: acc.auto_renew === 1 || acc.auto_renew === '1',
  canRecharge: !!(acc.id && acc.plan_id),
  raw: acc,
});

// ---------- small pieces ----------

const InfoRow = ({ label, children }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <View style={styles.infoValueWrap}>{typeof children === 'string' ? <Text style={styles.infoValue} numberOfLines={1}>{children}</Text> : children}</View>
  </View>
);

const Pill = ({ text, tone }) => (
  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
    <Text style={[styles.pillText, { color: tone.fg }]}>{text}</Text>
  </View>
);

const AccountCard = ({ account, isMobile, onInternetRecharge, onIptvRecharge, onVerify, onDetails }) => {
  const expiry = describeExpiry(account.expiration);
  const isInternet = account.kind === 'internet';
  const accent = isInternet ? COLORS.primary : '#8b5cf6';

  return (
    <View style={[styles.accCard, { borderTopColor: accent }, isMobile ? { width: '100%' } : null]}>
      {/* Header */}
      <View style={styles.accHeader}>
        <View style={[styles.accIcon, { backgroundColor: isInternet ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)' }]}>
          <Feather name={isInternet ? 'wifi' : 'tv'} size={18} color={accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.accTitle} numberOfLines={1}>{account.title}</Text>
          <Text style={styles.accSubtitle} numberOfLines={1}>{account.subtitle}</Text>
        </View>
        <Pill text={account.statusText} tone={statusTone(account.statusText, account.statusColor)} />
      </View>

      {/* Body */}
      <View style={styles.accBody}>
        <InfoRow label="Plan">{`${account.planLabel} · ${account.subplanLabel}`}</InfoRow>
        <InfoRow label="Expiry">
          <View style={{ alignItems: 'flex-end' }}>
            {parseApiDate(account.expiration) ? <Text style={styles.infoValue}>{formatApiDate(account.expiration)}</Text> : null}
            <Text style={[styles.expiryHint, { color: TONE[expiry.tone].fg }]}>{expiry.text}</Text>
          </View>
        </InfoRow>
        {account.showOnline ? (
          <InfoRow label="Connection">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.dot, { backgroundColor: account.online ? '#10b981' : '#94a3b8' }]} />
              <Text style={[styles.infoValue, { color: account.online ? '#047857' : '#64748b' }]}>{account.online ? 'Online' : 'Offline'}</Text>
            </View>
          </InfoRow>
        ) : (
          <InfoRow label="Auto renew">{account.autoRenew ? 'On' : 'Off'}</InfoRow>
        )}
        <InfoRow label={account.lastSeenLabel}>{formatApiDate(account.lastSeen)}</InfoRow>
        {isInternet ? (
          <InfoRow label="Verification">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name={isAccountVerified(account.raw) ? 'check-circle' : 'alert-circle'} size={12} color={isAccountVerified(account.raw) ? '#10b981' : '#d97706'} />
              <Text style={[styles.infoValue, { color: isAccountVerified(account.raw) ? '#047857' : '#b45309' }]}>
                {isAccountVerified(account.raw) ? 'Verified' : 'Not verified'}
              </Text>
            </View>
          </InfoRow>
        ) : null}
        {account.balance !== undefined ? <InfoRow label="Balance">{formatMoney(account.balance)}</InfoRow> : null}
      </View>

      {/* Actions */}
      <View style={styles.accActions}>
        {isInternet ? (
          !isAccountVerified(account.raw) ? (
            // Customer verification is mandatory before Recharge / Advance Renewal
            <>
              <TouchableOpacity style={[styles.btn, styles.btnVerify]} onPress={() => onVerify(account.raw)}>
                <Feather name="user-check" size={13} color="#ffffff" />
                <Text style={styles.btnQuickText}>Verify Customer</Text>
              </TouchableOpacity>
              <Text style={styles.rechargeHint}>Required before recharge</Text>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.btn, styles.btnQuick, !account.canRechargeAny && styles.btnDisabled]}
              onPress={() => onInternetRecharge(account.raw, defaultRechargeType(account) === 'advance')}
              disabled={!account.canRechargeAny}
            >
              <Feather name={defaultRechargeType(account) === 'advance' ? 'fast-forward' : 'refresh-cw'} size={13} color="#ffffff" />
              <Text style={styles.btnQuickText}>{defaultRechargeType(account) === 'advance' ? 'Advance Renewal' : 'Recharge'}</Text>
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnIptv]} onPress={() => onIptvRecharge(account.raw)}>
            <Feather name={defaultRechargeType(account) === 'advance' ? 'fast-forward' : 'refresh-cw'} size={13} color="#ffffff" />
            <Text style={styles.btnQuickText}>{defaultRechargeType(account) === 'advance' ? 'Advance Renewal' : 'Recharge'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, styles.btnDetails]} onPress={() => onDetails(account)}>
          <Text style={styles.btnDetailsText}>Details</Text>
          <Feather name="chevron-right" size={14} color={COLORS.textMain} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Section = ({ title, icon, color, count, emptyText, emptyContent, loading, headerAction, children }) => (
  <View style={{ marginBottom: 22 }}>
    <View style={styles.sectionHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Feather name={icon} size={15} color={color} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.countBadge}><Text style={styles.countBadgeText}>{count}</Text></View>
      </View>
      {headerAction}
    </View>
    {count === 0 && loading ? (
      <View style={[styles.emptyBox, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <ActivityIndicator size="small" color={color} />
        <Text style={styles.emptyText}>Loading accounts…</Text>
      </View>
    ) : count === 0 ? (
      emptyContent ? (
        emptyContent
      ) : (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>{emptyText}</Text></View>
      )
    ) : (
      <View style={styles.grid}>{children}</View>
    )}
  </View>
);

// Quick Recharge type is decided by expiry: still running -> 'advance', expired / never activated -> 'recharge'
export const defaultRechargeType = (account) => {
  const exp = parseApiDate(account?.expiration);
  return exp && exp.getTime() > Date.now() ? 'advance' : 'recharge';
};

// ---------- main ----------

/**
 * Landing view for one customer: identity header + a card per internet / IPTV account.
 * Each card offers Quick Recharge (sent as 'advance' if the plan is still running, else 'recharge') and Details.
 *
 * Props:
 *  customer   full customer record (customer_lookup.php) incl. internet_accounts / iptv_accounts
 *  onBack()   back to the subscriber list
 *  onOpenDetails(kind, index)   open the full detail screen for that account
 *  onIptvRecharge(rawIptvAccount)                   opens the IPTV package recharge modal
 *  onInternetRecharge(rawInternetAccount, advance)  opens the plan-picker recharge modal
 *  onVerify(rawInternetAccount)                     opens Verify Customer (required before recharge)
 */
export const CustomerAccountsOverview = ({ customer, loading = false, syncing = false, onBack, onOpenDetails, onInternetRecharge, onIptvRecharge, onVerify, onRefresh, onModifyMobile, onAddIptv }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [submittingIptv, setSubmittingIptv] = useState(false);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [selectedBranchCode, setSelectedBranchCode] = useState('');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [iptvSyncStatus, setIptvSyncStatus] = useState(customer?.iptv_sync_status || null);

  useEffect(() => {
    setIptvSyncStatus(customer?.iptv_sync_status || null);
  }, [customer?.iptv_sync_status, customer?.cust_id]);

  if (!customer) return null;

  const internet = (customer.internet_accounts || []).map(normaliseInternetAccount);
  const iptv = (customer.iptv_accounts || []).map(normaliseIptvAccount);
  const all = [...internet, ...iptv];
  const activeCount = all.filter((a) => a.statusText.toLowerCase() === 'active').length;
  const name = clean(customer.full_name) || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || `Customer #${customer.cust_id}`;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  // Check IPTV sync status if 0 IPTV accounts
  useEffect(() => {
    const rawMobile = clean(customer?.mobile || customer?.MobileNumber || customer?.internet_accounts?.[0]?.mobile || '');
    const digitsOnly = rawMobile.replace(/\D/g, '');
    const finalMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';
    if (iptv.length === 0 && finalMobile) {
      OneBssApi.syncIptvCustomers(finalMobile).then((res) => {
        const s = res?.data?.summary || res?.summary;
        if ((res?.data?.success || res?.success) && s && Number(s.stbs_added || 0) === 0 && Number(s.stbs_skipped || 0) === 0) {
          setIptvSyncStatus('no_devices');
        } else {
          setIptvSyncStatus(null);
        }
      }).catch(() => {
        setIptvSyncStatus(null);
      });
    } else {
      setIptvSyncStatus(null);
    }
  }, [customer?.cust_id, customer?.mobile, iptv.length]);

  const executeAddIptv = async (branchCode) => {
    if (!branchCode || !String(branchCode).trim()) {
      toast.error('Branch code is required to add IPTV customer.');
      return;
    }
    const cleanBranchCode = String(branchCode).trim();
    const rawMobile = clean(customer.mobile || customer.MobileNumber || (customer.internet_accounts?.[0]?.mobile) || '');
    const digitsOnly = rawMobile.replace(/\D/g, '');
    const finalMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
    const custId = customer.cust_id || customer.id || '';
    const hexSuffix = String(custId || '12').slice(-2).padStart(2, '0');
    const defaultMac = `00:1A:79:${hexSuffix}:45:8A`;
    const defaultStbId = `STB-${custId || finalMobile.slice(-4) || '1001'}`;
    const partnerId = customer?.internet_accounts?.[0]?.partner_id || customer?.partner_id;

    const parts = name.split(/\s+/).filter(Boolean);
    const firstName = parts[0] || customer.first_name || 'Subscriber';
    const lastName = parts.slice(1).join(' ') || customer.last_name || '';

    const payload = {
      partner_id: Number(partnerId),
      mobile: finalMobile,
      first_name: firstName,
      last_name: lastName,
      email: customer.email || '',
      address: customer.installation_address || customer.address || '',
      branch_code: cleanBranchCode,
      state: customer.state || '',
      city: customer.city || '',
    };

    setSubmittingIptv(true);
    try {
      try {
        await OneBssApi.addIptvCustomer(payload);
      } catch (e) {
        console.warn('OneBssApi.addIptvCustomer error:', e);
      }

      if (onAddIptv) {
        const res = await onAddIptv({
          customer,
          name,
          mobile: finalMobile,
          stbMac: defaultMac,
          stbId: defaultStbId,
          branchCode: cleanBranchCode,
          partnerId,
        });
        if (res?.status === 'no_devices' || res === 'no_devices') {
          setIptvSyncStatus('no_devices');
        }
      } else {
        const syncRes = await OneBssApi.syncIptvCustomers(finalMobile);
        const syncData = syncRes?.data || {};
        try {
          await OneBssApi.updateIptvStbDetails({
            stb_id: defaultStbId,
            stb_mac: defaultMac,
            name,
            mobile: finalMobile,
            status: 'active',
          });
        } catch (e) {}
        const s = syncData?.summary || syncRes?.summary;
        if (
          (syncData?.success || syncRes?.success) &&
          s &&
          Number(s.stbs_added || 0) === 0 &&
          Number(s.stbs_skipped || 0) === 0
        ) {
          setIptvSyncStatus('no_devices');
          toast.info('customer registered successfully , No devices found');
        } else {
          toast.success(`IPTV service provisioned successfully for ${name}!`);
        }
        if (onRefresh) onRefresh();
      }

      try {
        const checkSync = await OneBssApi.syncIptvCustomers(finalMobile);
        const s = checkSync?.data?.summary || checkSync?.summary;
        if ((checkSync?.data?.success || checkSync?.success) && s && Number(s.stbs_added || 0) === 0 && Number(s.stbs_skipped || 0) === 0) {
          setIptvSyncStatus('no_devices');
        }
      } catch (e) {}
      setBranchModalVisible(false);
    } catch (e) {
      toast.error('Failed to provision IPTV service.');
    } finally {
      setSubmittingIptv(false);
    }
  };

  // Directly provisions IPTV with existing user data from database.
  // Fetches branch mapping for the customer's partner from GET /iptv_branch_mapping.php?partner_id=...
  // - If multiple branches are returned from DB, shows dropdown for selecting a branch.
  // - If single branch is returned from DB, automatically selects and provisions that branch.
  // - If no branch is found in DB, allows user to input their branch code.
  const handleAddIptvDirect = async () => {
    const rawMobile = clean(customer.mobile || customer.MobileNumber || (customer.internet_accounts?.[0]?.mobile) || '');
    const digitsOnly = rawMobile.replace(/\D/g, '');
    const finalMobile = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

    if (!finalMobile) {
      toast.error('Customer has no mobile number registered.');
      return;
    }

    setSubmittingIptv(true);
    try {
      const partnerId = customer?.internet_accounts?.[0]?.partner_id || customer?.partner_id;
      let branchList = [];
      try {
        const res = await OneBssApi.getIptvBranchMapping(partnerId);
        if (res?.data) {
          if (Array.isArray(res.data.data)) branchList = res.data.data;
          else if (Array.isArray(res.data.branches)) branchList = res.data.branches;
          else if (Array.isArray(res.data)) branchList = res.data;
        }
      } catch (e) {
        console.warn('Failed to fetch IPTV branch mapping:', e);
      }

      // Filter and map ONLY real branches from the database response
      const formattedBranches = (branchList || [])
        .map((b) => {
          if (typeof b === 'string' && b.trim()) {
            return { branch_code: b.trim(), branch_name: b.trim() };
          }
          if (typeof b === 'object' && b !== null) {
            const code = String(b.branch_code || b.code || b.branchCode || b.id || '').trim();
            const bName = String(b.branch_name || b.name || b.branchName || code).trim();
            if (code) return { branch_code: code, branch_name: bName || code };
          }
          return null;
        })
        .filter(Boolean);

      if (formattedBranches.length > 1) {
        setAvailableBranches(formattedBranches);
        setSelectedBranchCode(formattedBranches[0].branch_code);
        setBranchDropdownOpen(false);
        setBranchModalVisible(true);
        setSubmittingIptv(false);
        return;
      }

      if (formattedBranches.length === 1) {
        // Single branch from DB
        await executeAddIptv(formattedBranches[0].branch_code);
        return;
      }

      // No branches in DB mapping: check customer profile or let user input branch code
      const profileBranch = (customer?.branch_code || '').trim();
      if (profileBranch) {
        await executeAddIptv(profileBranch);
        return;
      }

      // No hard-coded branch: open modal allowing operator to specify their branch code
      setAvailableBranches([]);
      setSelectedBranchCode('');
      setBranchModalVisible(true);
      setSubmittingIptv(false);
    } catch (err) {
      setSubmittingIptv(false);
      toast.error('Failed to process IPTV addition: ' + (err?.message || ''));
    }
  };

  const renderCards = (list) =>
    list.map((acc) => (
      <AccountCard
        key={acc.key}
        account={acc}
        isMobile={isMobile}
        onInternetRecharge={onInternetRecharge}
        onIptvRecharge={onIptvRecharge}
        onVerify={onVerify}
        onDetails={(a) => onOpenDetails(a.kind, a.index)}
      />
    ));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity style={[styles.backBtn, { marginBottom: 0 }]} onPress={onBack}>
          <Feather name="arrow-left" size={16} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>Back to Subscribers List</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {syncing ? (
            <View style={styles.syncChip}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.syncChipText}>Syncing latest data…</Text>
            </View>
          ) : null}
          {onRefresh ? (
            <TouchableOpacity style={[styles.backBtn, { marginBottom: 0 }, (loading || syncing) && { opacity: 0.6 }]} onPress={onRefresh} disabled={loading || syncing}>
              {loading && !syncing ? <ActivityIndicator size="small" color={COLORS.textMain} /> : <Feather name="refresh-cw" size={14} color={COLORS.textMain} />}
              <Text style={styles.backBtnText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* CUSTOMER IDENTITY */}
      <View style={[styles.identityCard, { flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
          <CustomerPhoto uri={customer.profile_image} size={isMobile ? 64 : 76} initials={initials} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text style={styles.custName}>{name}</Text>
              <Text style={styles.custId}>#{customer.cust_id}</Text>
              {isAccountVerified(customer) ? (
                <Pill text="Aadhaar verified" tone={TONE.ok} />
              ) : (
                <Pill text="KYC pending" tone={TONE.warn} />
              )}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Feather name="phone" size={12} color="#64748b" />
                <Text style={styles.metaText}>{clean(customer.mobile) || '—'}</Text>
                {onModifyMobile ? (
                  <TouchableOpacity
                    onPress={() => onModifyMobile(customer)}
                    style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(139, 92, 246, 0.1)', flexDirection: 'row', alignItems: 'center', gap: 3 }}
                    title="Modify Mobile Number"
                  >
                    <Feather name="edit-2" size={10} color="#8b5cf6" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#8b5cf6' }}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.metaItem}><Feather name="mail" size={12} color="#64748b" /><Text style={styles.metaText}>{clean(customer.email) || '—'}</Text></View>
              <View style={styles.metaItem}><Feather name="calendar" size={12} color="#64748b" /><Text style={styles.metaText}>Since {formatApiDate(customer.registered_date, false)}</Text></View>
            </View>
            {clean(customer.installation_address || customer.address) ? (
              <View style={[styles.metaItem, { marginTop: 4 }]}>
                <Feather name="map-pin" size={12} color="#64748b" />
                <Text style={styles.metaText} numberOfLines={1}>{clean(customer.installation_address || customer.address).replace(/\s+/g, ' ')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}><Text style={styles.summaryNum}>{internet.length}</Text><Text style={styles.summaryLbl}>Internet</Text></View>
          <View style={styles.summaryBox}><Text style={styles.summaryNum}>{iptv.length}</Text><Text style={styles.summaryLbl}>IPTV</Text></View>
          <View style={styles.summaryBox}><Text style={[styles.summaryNum, { color: '#047857' }]}>{activeCount}</Text><Text style={styles.summaryLbl}>Active</Text></View>
        </View>
      </View>

      <Section title="Internet Accounts" icon="wifi" color={COLORS.primary} count={internet.length} loading={loading} emptyText="No internet accounts for this customer.">
        {renderCards(internet)}
      </Section>

      <Section
        title="IPTV Accounts"
        icon="tv"
        color="#8b5cf6"
        count={iptv.length}
        loading={loading}
        emptyText="No IPTV accounts for this customer."
        emptyContent={
          <View style={styles.emptyBoxCustom}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.emptyIconBadge}>
                <Feather name="tv" size={18} color="#8b5cf6" />
              </View>
              <Text style={styles.emptyPrimaryText}>No IPTV accounts for this customer.</Text>
            </View>
            <View style={{ marginTop: 12, alignItems: 'flex-start' }}>
              {(iptvSyncStatus === 'no_devices' || customer?.iptv_sync_status === 'no_devices') ? (
                <View style={styles.noDevicesBadge}>
                  <Feather name="check-circle" size={14} color="#16a34a" />
                  <Text style={styles.noDevicesText}>
                    customer registered successfully , No devices found
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addIptvBtn}
                  disabled={submittingIptv}
                  onPress={handleAddIptvDirect}
                >
                  {submittingIptv ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Feather name="plus-circle" size={13} color="#ffffff" />
                  )}
                  <Text style={styles.addIptvBtnText}>
                    {submittingIptv ? 'Adding IPTV...' : 'Add IPTV'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        }
      >
        {renderCards(iptv)}
      </Section>

      {/* GEOGRAPHIC LOCATION & INSTALLATION MAP */}
      <CustomerLocationMap
        key={`overview_map_${customer.cust_id}_${clean(customer.mobile || customer.MobileNumber || '')}`}
        mobile={clean(customer.mobile || customer.MobileNumber || (customer.internet_accounts?.[0]?.mobile) || '')}
        customerName={name}
        customerAddress={clean(customer.installation_address || customer.address || customer.billing_address || '')}
        customerZipcode={clean(customer.zipcode || '')}
        custId={customer.cust_id}
        isCard={true}
      />

      {/* Select IPTV Branch Modal (Shown when operator has multiple branches) */}
      <Modal visible={branchModalVisible} transparent animationType="fade" onRequestClose={() => setBranchModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="git-branch" size={18} color="#8b5cf6" />
                <Text style={styles.modalTitle}>Select IPTV Branch</Text>
              </View>
              <TouchableOpacity onPress={() => setBranchModalVisible(false)}>
                <Feather name="x" size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              {availableBranches.length > 1
                ? `Multiple branches are available in the database for this operator. Select the branch to assign for ${name}.`
                : `No branch mapping found in database for this operator. Enter the branch code for ${name}.`}
            </Text>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 }}>
                OPERATOR BRANCH CODE *
              </Text>
              {availableBranches.length > 1 ? (
                <>
                  <TouchableOpacity
                    style={styles.dropdownTrigger}
                    onPress={() => setBranchDropdownOpen(!branchDropdownOpen)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <Feather name="map-pin" size={15} color="#8b5cf6" />
                      <Text style={styles.dropdownValueText}>
                        {availableBranches.find((b) => b.branch_code === selectedBranchCode)?.branch_name || selectedBranchCode || 'Select Branch'}
                        {selectedBranchCode ? ` (${selectedBranchCode})` : ''}
                      </Text>
                    </View>
                    <Feather name={branchDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>

                  {branchDropdownOpen && (
                    <View style={styles.dropdownMenuBox}>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                        {availableBranches.map((b) => {
                          const isSelected = selectedBranchCode === b.branch_code;
                          return (
                            <TouchableOpacity
                              key={b.branch_code}
                              style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                              onPress={() => {
                                setSelectedBranchCode(b.branch_code);
                                setBranchDropdownOpen(false);
                              }}
                            >
                              <Feather
                                name={isSelected ? 'check-circle' : 'circle'}
                                size={15}
                                color={isSelected ? '#8b5cf6' : COLORS.textMuted}
                              />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={[styles.dropdownMenuItemText, isSelected && styles.dropdownMenuItemTextActive]}>
                                  {b.branch_name}
                                </Text>
                                <Text style={{ fontSize: 10, color: '#64748b' }}>
                                  Code: {b.branch_code}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    </View>
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.branchTextInput}
                  placeholder="Enter operator branch code"
                  value={selectedBranchCode}
                  onChangeText={setSelectedBranchCode}
                />
              )}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setBranchModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: '#8b5cf6' }]}
                disabled={submittingIptv}
                onPress={() => executeAddIptv(selectedBranchCode)}
              >
                {submittingIptv ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Feather name="plus-circle" size={14} color="#ffffff" />
                )}
                <Text style={styles.saveBtnText}>
                  {submittingIptv ? 'Adding IPTV...' : 'Add IPTV'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgSecondary },
  backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 16 },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },

  identityCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 22, justifyContent: 'space-between', gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  custName: { fontSize: 18, fontWeight: '700', color: COLORS.textMain },
  custId: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  metaText: { fontSize: 12, color: '#4b5563', flexShrink: 1 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryBox: { minWidth: 72, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
  summaryNum: { fontSize: 18, fontWeight: '800', color: COLORS.textMain },
  summaryLbl: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  emptyBox: { padding: 18, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)', backgroundColor: '#ffffff' },
  emptyText: { fontSize: 12, color: '#64748b' },

  accCard: { flexGrow: 1, flexBasis: 340, maxWidth: 560, backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderTopWidth: 3, padding: 16, boxShadow: '0px 2px 10px rgba(0,0,0,0.04)' },
  accHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  accIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  accTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  accSubtitle: { fontSize: 11, color: '#64748b', marginTop: 2 },
  accBody: { gap: 9, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9', marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  infoLabel: { fontSize: 12, color: '#64748b' },
  infoValueWrap: { flexShrink: 1, alignItems: 'flex-end' },
  infoValue: { fontSize: 12, fontWeight: '600', color: COLORS.textMain, textAlign: 'right' },
  expiryHint: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },

  accActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8 },
  btnQuick: { backgroundColor: '#f97316' },
  btnQuickText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  btnAdvance: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  btnAdvanceText: { fontSize: 12, fontWeight: '700', color: '#c2410c' },
  btnDetails: { marginLeft: 'auto', backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  btnDetailsText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  btnDisabled: { opacity: 0.45 },
  btnVerify: { backgroundColor: '#2563eb' },
  btnIptv: { backgroundColor: '#8b5cf6' },
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  syncChipText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
  rechargeHint: { alignSelf: 'center', fontSize: 11, fontWeight: '600', color: '#64748b' },

  // IPTV Empty State & Direct Add styles
  headerAddIptvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  headerAddIptvBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },

  emptyBoxCustom: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(139, 92, 246, 0.35)',
    padding: 16,
  },
  emptyIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  addIptvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addIptvBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Modal & Dropdown styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#8b5cf6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  dropdownValueText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  dropdownMenuBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    elevation: 4,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  dropdownMenuItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  dropdownMenuItemTextActive: {
    fontWeight: '700',
    color: '#8b5cf6',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  branchTextInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: '#ffffff',
  },
  noDevicesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  noDevicesText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
  },
});
