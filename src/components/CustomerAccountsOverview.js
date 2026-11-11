import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, Modal, TextInput, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { CustomerPhoto, isAadhaarVerified, isRadiusVerified, aadhaarBlocksRecharge, iptvLabel, ModalShell, Btn, sharedStyles } from './internet/shared';
import { OneBssApi } from '../services/oneBssApi';
import { toast } from 'react-toastify';
import { CustomerLocationModal } from './CustomerLocationModal';

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

export const normaliseOttAccount = (acc, index) => ({
  kind: 'ott',
  index,
  key: `ott_${acc.id ?? index}`,
  id: acc.id,
  title: clean(acc.subscriber_id) ? `OTT ${acc.subscriber_id}` : `OTT #${acc.id}`,
  subtitle: [clean(acc.franchise_id) ? `Franchise ${acc.franchise_id}` : '', `OTT #${acc.id}`].filter(Boolean).join(' · '),
  statusText: clean(acc.status_text) || 'New',
  statusColor: null,
  online: false,
  showOnline: false,
  planLabel: clean(acc.package_name) || 'No package yet',
  subplanLabel: clean(acc.duration) || '—',
  planId: acc.plan_id,
  subPlanId: acc.sub_plan_id,
  expiration: acc.expiration,
  lastSeenLabel: 'Started',
  lastSeen: acc.start_date,
  canRecharge: !!acc.id,
  canRechargeAny: !!acc.id,
  raw: acc,
});

// IPTV: the date shown to the operator / customer is the date the STB is PAID till
// (expected_expiry — includes months still to be renewed automatically); the real Pioneer
// expiry (expriration) is shown next to it when it differs.
const laterDate = (a, b) => {
  const da = parseApiDate(a);
  const db = parseApiDate(b);
  if (!da) return b;
  if (!db) return a;
  return da.getTime() >= db.getTime() ? a : b;
};
export const iptvShownExpiry = (acc) => laterDate(acc?.expected_expiry, acc?.expriration || acc?.expiration);
export const iptvRealExpiry = (acc) => acc?.expriration || acc?.expiration || null;

export const normaliseIptvAccount = (acc, index) => ({
  kind: 'iptv',
  index,
  key: `iptv_${acc.id ?? index}`,
  id: acc.id,
  title: iptvLabel(acc),
  subtitle: [clean(acc.device_name) && clean(acc.pioneer_stb_id) ? `STB ${acc.pioneer_stb_id}` : '', clean(acc.branch_name) ? `Branch ${acc.branch_name}` : '', `IPTV #${acc.id}`].filter(Boolean).join(' · '),
  statusText: clean(acc.sts) || 'Unknown',
  statusColor: null,
  online: false,
  showOnline: false,
  planLabel: clean(acc.plan_name) || (acc.plan_id ? `Plan #${acc.plan_id}` : '—'),
  subplanLabel: clean(acc.subplan_name) || (acc.subplan_id ? `Sub plan #${acc.subplan_id}` : '—'),
  planId: acc.plan_id,
  subPlanId: acc.subplan_id,
  expiration: iptvShownExpiry(acc), // paid till (expected expiry); falls back to Pioneer's
  realExpiration: iptvRealExpiry(acc), // API spells it "expriration"
  lastSeenLabel: 'Next invoice',
  lastSeen: acc.nxt_inv_date,
  balance: acc.balance,
  autoRenew: acc.auto_renew === 1 || acc.auto_renew === '1',
  canRecharge: !!(acc.id && acc.plan_id),
  raw: acc,
});

// ---------- small pieces ----------

const KIND = {
  internet: { color: '#059669', soft: 'rgba(16,185,129,0.12)', icon: 'wifi', label: 'Internet' },
  iptv: { color: '#7c3aed', soft: 'rgba(139,92,246,0.12)', icon: 'tv', label: 'IPTV' },
  ott: { color: '#0284c7', soft: 'rgba(14,165,233,0.12)', icon: 'play-circle', label: 'OTT' },
};

const Pill = ({ text, tone }) => (
  <View style={[styles.pill, { backgroundColor: tone.bg }]}>
    <Text style={[styles.pillText, { color: tone.fg }]}>{text}</Text>
  </View>
);

// Plan length in days from "1 Month", "3 Months", "30 Days", "1 Year" (or OTT validity_days); default 30.
const planDays = (account) => {
  const v = Number(account.raw?.validity_days);
  if (v > 0) return v;
  const m = String(account.subplanLabel || account.planLabel || '').match(/(\d+)\s*(day|month|year)/i);
  if (!m) return 30;
  const n = Number(m[1]);
  return /year/i.test(m[2]) ? n * 365 : /month/i.test(m[2]) ? n * 30 : n;
};

/** How much of the current plan is left — the bar under each card's expiry. */
const ValidityBar = ({ account }) => {
  const d = parseApiDate(account.expiration);
  if (!d) return <View style={styles.barTrack} />;
  const left = (d.getTime() - Date.now()) / 86400000;
  const pct = left <= 0 ? 100 : Math.max(4, Math.min(100, (left / planDays(account)) * 100));
  const color = left <= 0 ? '#dc2626' : left <= 3 ? '#d97706' : KIND[account.kind].color;
  return (
    <View style={styles.barTrack}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 2, backgroundColor: color, opacity: left <= 0 ? 0.35 : 1 }} />
    </View>
  );
};

const AadhaarLine = ({ raw, onVerify }) => {
  if (isAadhaarVerified(raw)) {
    return (
      <View style={[styles.kycLine, styles.kycOk]}>
        <Feather name="shield" size={13} color="#047857" />
        <Text style={[styles.kycText, { color: '#065f46' }]} numberOfLines={1}>Aadhaar verified</Text>
      </View>
    );
  }
  return (
    <View style={[styles.kycLine, styles.kycBad]}>
      <Feather name="shield-off" size={13} color="#b45309" />
      <Text style={[styles.kycText, { color: '#92400e', flex: 1 }]} numberOfLines={1}>Aadhaar not verified</Text>
      {onVerify ? (
        <TouchableOpacity style={styles.kycVerifyBtn} onPress={() => onVerify(raw)}>
          <Feather name="shield" size={11} color="#ffffff" />
          <Text style={styles.kycVerifyText}>Verify</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const AccountCard = ({ account, isMobile, onInternetRecharge, onIptvRecharge, onOttRecharge, onOttDeactivate, onVerify, onVerifyCustomer, onDetails, onRecheck, onRename, readOnly }) => {
  const k = KIND[account.kind];
  const expiry = describeExpiry(account.expiration);
  const isInternet = account.kind === 'internet';
  const isAdvance = defaultRechargeType(account) === 'advance';
  // blocks recharge only when the operator requires Aadhaar; otherwise "Verify" stays on the Aadhaar line
  const needsAadhaar = isInternet && aadhaarBlocksRecharge(account.raw);
  const canVerifyInline = isInternet && !readOnly && !needsAadhaar && !isAadhaarVerified(account.raw) && !!onVerify;
  const hasDate = !!parseApiDate(account.expiration);
  const hasPlan = account.planLabel && account.planLabel !== '—';

  let primary = null;
  if (!readOnly) {
    // a handler left out (staff role without that permission) = no button
    if (account.raw?.open_recharge) {
      primary = onRecheck ? { label: 'Recheck', icon: 'rotate-ccw', bg: '#d97706', onPress: () => onRecheck(account.raw) } : null;
    } else if (isInternet && !isRadiusVerified(account.raw)) {
      primary = onVerifyCustomer ? { label: 'Verify Customer', icon: 'user-check', bg: '#2563eb', onPress: () => onVerifyCustomer(account.raw) } : null;
    } else if (needsAadhaar) {
      primary = onVerify ? { label: 'Verify Aadhaar', icon: 'shield', bg: '#2563eb', onPress: () => onVerify(account.raw) } : null;
    } else if ((isInternet || account.kind === 'iptv') && account.raw?.combo_lock) {
      primary = null; // shown as a note
    } else if (account.kind === 'ott') {
      primary = onOttRecharge ? { label: isAdvance ? 'Advance renewal' : 'Recharge', icon: isAdvance ? 'fast-forward' : 'play-circle', bg: k.color, onPress: () => onOttRecharge(account.raw) } : null;
    } else if (isInternet) {
      primary = onInternetRecharge ? { label: isAdvance ? 'Advance renewal' : 'Recharge', icon: isAdvance ? 'fast-forward' : 'refresh-cw', bg: '#ea580c', disabled: !account.canRechargeAny, onPress: () => onInternetRecharge(account.raw, isAdvance) } : null;
    } else {
      primary = onIptvRecharge ? { label: isAdvance ? 'Advance renewal' : 'Recharge', icon: isAdvance ? 'fast-forward' : 'refresh-cw', bg: k.color, onPress: () => onIptvRecharge(account.raw) } : null;
    }
  }

  return (
    <View style={[styles.accCard, isMobile ? { width: '100%', maxWidth: '100%' } : null]}>
      <View style={styles.accHeader}>
        <View style={[styles.accIcon, { backgroundColor: k.soft }]}>
          <Feather name={k.icon} size={17} color={k.color} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.accTitle, { flexShrink: 1 }]} numberOfLines={1}>{account.title}</Text>
            {account.kind === 'iptv' && onRename && !readOnly ? (
              <TouchableOpacity onPress={() => onRename(account.raw)} style={styles.renameBtn} title={account.raw?.device_name ? 'Rename this device' : 'Name this device'} accessibilityLabel="Device name">
                <Feather name="edit-2" size={12} color="#7c3aed" />
              </TouchableOpacity>
            ) : null}
          </View>
          {isInternet ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <View style={[styles.dot, { backgroundColor: account.online ? '#10b981' : '#cbd5e1' }]} />
              <Text style={[styles.accSubtitle, { color: account.online ? '#047857' : '#64748b', marginTop: 0 }]}>{account.online ? 'Online now' : 'Offline'}</Text>
            </View>
          ) : (
            <Text style={styles.accSubtitle} numberOfLines={1}>{account.subtitle}</Text>
          )}
        </View>
        <Pill text={account.statusText} tone={statusTone(account.statusText, account.statusColor)} />
      </View>

      {/* expiry first: it is what the operator came for */}
      <View style={styles.expiryBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Text style={[styles.expiryMain, { color: TONE[expiry.tone].fg }]}>{expiry.text}</Text>
          {hasDate ? <Text style={styles.expiryDate}>{formatApiDate(account.expiration, false)}</Text> : null}
        </View>
        <ValidityBar account={account} />
      </View>

      <View style={styles.planRow}>
        <Feather name="package" size={13} color="#64748b" />
        <Text style={[styles.planText, !hasPlan && { color: '#94a3b8', fontWeight: '500' }]} numberOfLines={1}>
          {hasPlan ? `${account.planLabel}${account.subplanLabel && account.subplanLabel !== '—' ? `, ${account.subplanLabel}` : ''}` : 'No package yet'}
        </Text>
        {(isInternet || account.kind === 'iptv') && account.raw?.customer_price !== null && account.raw?.customer_price !== undefined ? (
          <Text style={styles.priceText}>₹{Number(account.raw.customer_price).toFixed(0)}{account.kind === 'iptv' ? ' base' : ''}</Text>
        ) : null}
      </View>

      {isInternet ? <AadhaarLine raw={account.raw} onVerify={canVerifyInline ? onVerify : null} /> : null}

      {account.raw?.open_recharge ? (
        <View style={styles.recheckNote}>
          <Feather name="alert-triangle" size={12} color="#b45309" />
          <Text style={styles.recheckNoteText} numberOfLines={2}>
            {account.raw.open_recharge.kind === 'combo' ? 'Combo recharge' : 'Last recharge'} not completed by the provider. ₹{Number(account.raw.open_recharge.amount || 0).toFixed(2)} is already paid.
          </Text>
        </View>
      ) : null}

      {!readOnly && !account.raw?.open_recharge && !needsAadhaar && (isInternet || account.kind === 'iptv') && account.raw?.combo_lock ? (
        <View style={styles.comboLock}>
          <Feather name="layers" size={13} color="#be185d" />
          <Text style={styles.comboLockText} numberOfLines={2}>
            On combo "{account.raw.combo_lock.combo_name}" till {formatApiDate(account.raw.combo_lock.until, false)}. Use Combo recharge.
          </Text>
        </View>
      ) : null}

      <View style={styles.accActions}>
        {primary ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: primary.bg }, primary.disabled && styles.btnDisabled]} onPress={primary.onPress} disabled={primary.disabled}>
            <Feather name={primary.icon} size={13} color="#ffffff" />
            <Text style={styles.btnQuickText}>{primary.label}</Text>
          </TouchableOpacity>
        ) : null}
        {account.kind === 'ott' ? (
          isAdvance && onOttDeactivate && !readOnly ? (
            <TouchableOpacity style={[styles.btn, styles.btnDetails]} onPress={() => onOttDeactivate(account.raw)} title="Stop the current OTT package (no refund)">
              <Feather name="slash" size={13} color="#b91c1c" />
              <Text style={[styles.btnDetailsText, { color: '#b91c1c' }]}>Deactivate</Text>
            </TouchableOpacity>
          ) : null
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnDetails]} onPress={() => onDetails(account)}>
            <Text style={styles.btnDetailsText}>Details</Text>
            <Feather name="chevron-right" size={14} color={COLORS.textMain} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};



// Small status line for the background provider sync of this customer.
const SyncStatus = ({ syncState, onRetry }) => {
  if (!syncState) return null;
  const at = syncState.at ? syncState.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (syncState.state === 'syncing') {
    return (
      <View style={styles.syncChip}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.syncChipText}>Updating…</Text>
      </View>
    );
  }
  if (syncState.state === 'done') {
    return (
      <View style={[styles.syncChip, { backgroundColor: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.25)' }]}>
        <Feather name="check" size={12} color="#047857" />
        <Text style={[styles.syncChipText, { color: '#047857' }]}>Up to date · {at}</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onRetry}
      style={[styles.syncChip, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.35)' }]}
      title={syncState.message || ''}
    >
      <Feather name="alert-triangle" size={12} color="#b45309" />
      <Text style={[styles.syncChipText, { color: '#b45309' }]} numberOfLines={1}>
        {syncState.state === 'partial' ? 'Refresh' : 'Refresh'}
      </Text>
    </TouchableOpacity>
  );
};

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
export const CustomerAccountsOverview = ({ customer, loading = false, syncing = false, syncState = null, onBack, onOpenDetails, onInternetRecharge, onIptvRecharge, onVerify, onVerifyCustomer, onRefresh, onModifyMobile: onModifyMobileProp, onAddIptv, onComboRecharge: onComboRechargeProp, onRecheck, onOttRecharge, onAddOtt: onAddOttProp, onOttDeactivate, readOnly = false, operatorNames = {} }) => {
  // Admins (super distributor / distributor / sub distributor) only view: no recharge, edits or adds.
  const onModifyMobile = readOnly ? null : onModifyMobileProp;
  const onComboRecharge = readOnly ? null : onComboRechargeProp;
  const onAddOtt = readOnly ? null : onAddOttProp;
  // Online recharge switch per operator of this customer (customer_online_access.php).
  const [onlineOverride, setOnlineOverride] = useState({});
  const [savingOnline, setSavingOnline] = useState(null);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [submittingIptv, setSubmittingIptv] = useState(false);
  const [branchModalVisible, setBranchModalVisible] = useState(false);
  const [availableBranches, setAvailableBranches] = useState([]);
  const [selectedBranchCode, setSelectedBranchCode] = useState('');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [iptvSyncStatus, setIptvSyncStatus] = useState(customer?.iptv_sync_status || null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [tab, setTab] = useState('all'); // all | internet | iptv | ott
  const [renameFor, setRenameFor] = useState(null); // iptv account being named
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [mergeAsk, setMergeAsk] = useState(null); // cust_id being confirmed
  const [merging, setMerging] = useState(null);

  useEffect(() => {
    setIptvSyncStatus(customer?.iptv_sync_status || null);
  }, [customer?.iptv_sync_status, customer?.cust_id]);

  // Hide Add IPTV / Add OTT for operators that were never given that service (no plans assigned)
  const [services, setServices] = useState(null); // { iptv, ott } | null while unknown
  useEffect(() => {
    setServices(null);
    if (!customer?.cust_id || readOnly) return undefined;
    let alive = true;
    OneBssApi.getOperatorServices({ custId: customer.cust_id }).then((res) => {
      if (alive && res?.ok && res.data?.success !== false && res.data?.data) setServices(res.data.data);
    });
    return () => { alive = false; };
  }, [customer?.cust_id, readOnly]);
  const offersIptv = !services || services.iptv !== false;
  const offersOtt = !services || services.ott !== false;
  // The empty "Add IPTV" / "Add OTT" cards and tabs only when the operator really has that
  // service's plans assigned (known true — not while loading, not in read-only views).
  const showIptvSlot = services?.iptv === true && !readOnly;
  const showOttSlot = services?.ott === true && !!onAddOtt;

  if (!customer) return null;

  const internet = (customer.internet_accounts || []).map(normaliseInternetAccount);
  const iptv = (customer.iptv_accounts || []).map(normaliseIptvAccount);
  const ott = (customer.ott_accounts || []).map(normaliseOttAccount);
  const all = [...internet, ...iptv, ...ott];
  const activeCount = all.filter((a) => a.statusText.toLowerCase() === 'active').length;
  const name = clean(customer.full_name) || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || `Customer #${customer.cust_id}`;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

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
      if (onAddIptv) {
        // the parent screen creates the IPTV customer and syncs it (one call, not two)
        const res = await onAddIptv({
          customer,
          name,
          mobile: finalMobile,
          stbMac: defaultMac,
          stbId: defaultStbId,
          branchCode: cleanBranchCode,
          partnerId,
        });
        if (res === false) return;
        if (res?.status === 'no_devices' || res === 'no_devices') {
          setIptvSyncStatus('no_devices');
        }
      } else {
        const addRes = await OneBssApi.addIptvCustomer(payload);
        if (!addRes.ok) {
          toast.error(`Could not add IPTV account: ${addRes.data?.message || 'Pioneer rejected the request.'}`);
          return;
        }
        const syncRes = await OneBssApi.syncIptvCustomers(finalMobile);
        const syncData = syncRes?.data || {};
        const s = syncData?.summary || syncRes?.summary;
        if (
          (syncData?.success || syncRes?.success) &&
          s &&
          Number(s.stbs_added || 0) === 0 &&
          Number(s.stbs_skipped || 0) === 0
        ) {
          setIptvSyncStatus('no_devices');
          toast.info('customer registered successfully , No devices found');
        } else if (syncRes.ok) {
          toast.success(`IPTV service provisioned successfully for ${name}!`);
        } else {
          toast.warn(`IPTV customer created, but the STB sync failed: ${syncData.message || 'unknown error'}.`);
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
        onVerifyCustomer={onVerifyCustomer}
        onRecheck={onRecheck}
        onOttRecharge={onOttRecharge}
        onOttDeactivate={onOttDeactivate}
        readOnly={readOnly}
        onDetails={(a) => onOpenDetails(a.kind, a.index)}
        onRename={(raw) => { setRenameText(raw?.device_name || ''); setRenameFor(raw); }}
      />
    ));

  const saveDeviceName = async () => {
    setRenaming(true);
    const res = await OneBssApi.setIptvDeviceName(renameFor.id, renameText.trim());
    setRenaming(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not save the device name');
      return;
    }
    toast.success(res.data?.message || 'Device name saved');
    renameFor.device_name = res.data?.device_name || null; // show it right away; the refresh confirms
    setRenameFor(null);
    if (onRefresh) onRefresh();
  };

  const openDirections = async () => {
    const cleanMob = String(customer.mobile || customer.MobileNumber || '').replace(/\D/g, '').slice(-10);
    let dest = '';
    if (cleanMob && cleanMob.length === 10) {
      try {
        const locRes = await OneBssApi.getCustomerLocation(cleanMob);
        const locData = locRes?.data?.data || locRes?.data || [];
        const locRec = Array.isArray(locData) ? locData[0] : (typeof locData === 'object' ? locData : null);
        if (locRec && locRec.latitude && locRec.longitude) dest = `${locRec.latitude},${locRec.longitude}`;
      } catch (e) {}
    }
    if (!dest) dest = encodeURIComponent(clean(customer.installation_address || customer.address));
    if (!dest) {
      toast.warn('No location or address yet. Use Set location first.');
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    else Linking.openURL(url).catch(() => {});
  };

  const mobile = clean(customer.mobile);
  const address = clean(customer.installation_address || customer.address).replace(/\s+/g, ' ');
  const aadhaarDone = internet.filter((a) => isAadhaarVerified(a.raw)).length;

  const comboButton = onComboRecharge && internet.length > 0 && iptv.length > 0 ? (
    <TouchableOpacity style={[styles.comboBtn, isMobile && { alignSelf: 'stretch', justifyContent: 'center' }]} onPress={() => onComboRecharge(customer)} title="Renew internet + IPTV together with a combo plan">
      <Feather name="layers" size={15} color="#ffffff" />
      <Text style={styles.comboBtnText}>Combo recharge</Text>
    </TouchableOpacity>
  ) : null;

  const contactBlock = (
    <View style={{ gap: 8, marginTop: isMobile ? 0 : 8 }}>
      <View style={styles.contactRow}>
        {mobile ? (
          <TouchableOpacity style={styles.contactChip} onPress={() => Linking.openURL(`tel:${mobile}`).catch(() => {})} title="Call">
            <Feather name="phone" size={13} color="#0f766e" />
            <Text style={[styles.contactText, { color: '#0f766e', fontWeight: '700' }]}>{mobile}</Text>
          </TouchableOpacity>
        ) : null}
        {onModifyMobile ? (
          <TouchableOpacity style={styles.miniBtn} onPress={() => onModifyMobile(customer)} title="Change mobile number">
            <Feather name="edit-2" size={11} color="#2563eb" />
            <Text style={styles.miniBtnText}>Change</Text>
          </TouchableOpacity>
        ) : null}
        {clean(customer.email) ? (
          <View style={styles.contactChip}>
            <Feather name="mail" size={13} color="#64748b" />
            <Text style={styles.contactText} numberOfLines={1}>{clean(customer.email)}</Text>
          </View>
        ) : null}
        <View style={styles.contactChip}>
          <Feather name="calendar" size={13} color="#64748b" />
          <Text style={styles.contactText}>Since {formatApiDate(customer.registered_date, false)}</Text>
        </View>
      </View>
      <View style={[styles.contactRow, { alignItems: 'flex-start', flexWrap: 'nowrap' }]}>
        <Feather name="map-pin" size={13} color="#64748b" style={{ marginTop: 2 }} />
        <Text style={[styles.contactText, { flex: 1 }]} numberOfLines={3}>{address || 'No address yet'}</Text>
      </View>
      <View style={styles.contactRow}>
        <TouchableOpacity style={styles.miniBtn} onPress={openDirections} title="Open Google Maps directions">
          <Feather name="navigation" size={11} color="#2563eb" />
          <Text style={styles.miniBtnText}>Directions</Text>
        </TouchableOpacity>
        {!readOnly ? (
          <TouchableOpacity style={styles.miniBtn} onPress={() => setLocationModalVisible(true)} title="Pin the customer's location">
            <Feather name="crosshair" size={11} color="#2563eb" />
            <Text style={styles.miniBtnText}>Set location</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const noDevicesEarly = iptvSyncStatus === 'no_devices' || customer?.iptv_sync_status === 'no_devices';
  const tabs = [
    { id: 'all', label: 'All', count: all.length },
    { id: 'internet', label: 'Internet', count: internet.length },
    { id: 'iptv', label: 'IPTV', count: iptv.length, hide: !iptv.length && !showIptvSlot && !noDevicesEarly },
    { id: 'ott', label: 'OTT', count: ott.length, hide: !ott.length && !showOttSlot },
  ];
  // a tab that is hidden (no accounts, service not offered) falls back to All
  const curTab = tabs.some((t) => t.id === tab && !t.hide) ? tab : 'all';
  const shownList = curTab === 'all' ? all : curTab === 'internet' ? internet : curTab === 'iptv' ? iptv : ott;


  const addIptvButton = readOnly || !offersIptv || !onAddIptv ? null : (
    <TouchableOpacity style={[styles.addBtn, { borderColor: 'rgba(139,92,246,0.4)' }]} disabled={submittingIptv} onPress={handleAddIptvDirect}>
      {submittingIptv ? <ActivityIndicator size="small" color="#7c3aed" /> : <Feather name="plus" size={13} color="#7c3aed" />}
      <Text style={[styles.addBtnText, { color: '#7c3aed' }]}>{submittingIptv ? 'Adding IPTV…' : 'Add IPTV'}</Text>
    </TouchableOpacity>
  );
  const addOttButton = onAddOtt && offersOtt ? (
    <TouchableOpacity style={[styles.addBtn, { borderColor: 'rgba(14,165,233,0.4)' }]} onPress={() => onAddOtt(customer)}>
      <Feather name="plus" size={13} color="#0284c7" />
      <Text style={[styles.addBtnText, { color: '#0284c7' }]}>Add OTT</Text>
    </TouchableOpacity>
  ) : null;
  const noDevices = iptvSyncStatus === 'no_devices' || customer?.iptv_sync_status === 'no_devices';

  // A card in the accounts grid for a service the customer doesn't have (yet)
  const emptyFor = (kind) => {
    const k = KIND[kind];
    const cardStyle = [styles.accCard, styles.emptyCard, isMobile ? { width: '100%', maxWidth: '100%' } : null];
    if (kind === 'iptv' && noDevices) {
      // registered with Pioneer, but no set-top box linked to the login yet
      return (
        <View key="empty-iptv" style={cardStyle}>
          <View style={styles.regPill}>
            <Text style={styles.regPillText}>Customer Registered</Text>
          </View>
          <Text style={styles.emptyEmoji}>📺</Text>
          <Text style={styles.emptyTitle}>No devices linked</Text>
          <Text style={styles.emptySub}>Login to the Pioneer Digital TV to enable recharge</Text>
          <Text style={styles.emptyHint}>Please refresh the page after logging in to see the devices</Text>
          {onRefresh ? (
            <TouchableOpacity style={styles.emptyRefresh} onPress={onRefresh}>
              <Feather name="refresh-cw" size={12} color="#c2410c" />
              <Text style={styles.emptyRefreshText}>Refresh</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    const button = kind === 'iptv' ? addIptvButton : kind === 'ott' ? addOttButton : null;
    return (
      <View key={`empty-${kind}`} style={cardStyle}>
        <View style={[styles.emptyIconCircle, { backgroundColor: `${k.color}14` }]}>
          <Feather name={k.icon} size={24} color={k.color} />
        </View>
        <Text style={[styles.emptySub, { fontSize: 14, fontWeight: '600', color: '#334155' }]}>No {k.label} account yet.</Text>
        {button ? <View style={{ marginTop: 6 }}>{button}</View> : null}
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 22, width: '100%', maxWidth: 1320, alignSelf: 'center' }}
    >
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={15} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>Subscribers</Text>
        </TouchableOpacity>
        <SyncStatus syncState={syncState} onRetry={onRefresh} />
      </View>

      {/* WHO */}
      <View style={styles.identityCard}>
        <View style={[styles.identityMain, isMobile && { padding: 14, gap: 12 }]}>
          <View style={styles.idTop}>
            <CustomerPhoto uri={customer.profile_image} size={isMobile ? 56 : 72} height={isMobile ? 70 : 90} radius={12} initials={initials} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.custName, isMobile && { fontSize: 18 }]} numberOfLines={2}>{name}</Text>
              <Text style={styles.custId}>Customer #{customer.cust_id}</Text>
              {!isMobile ? contactBlock : null}
            </View>
            {!isMobile && comboButton ? comboButton : null}
          </View>
          {isMobile ? contactBlock : null}
          {isMobile && comboButton ? <View style={{ alignSelf: 'stretch' }}>{comboButton}</View> : null}
        </View>

        <View style={styles.identityStrip}>
          <View style={styles.stripStats}>
            <Text style={styles.stripStat}><Text style={styles.stripNum}>{activeCount}</Text> of {all.length} active</Text>
            {internet.length ? (
              <Text style={[styles.stripStat, aadhaarDone < internet.length && { color: '#b45309' }]}>
                <Text style={[styles.stripNum, aadhaarDone < internet.length && { color: '#b45309' }]}>{aadhaarDone}</Text> of {internet.length} internet Aadhaar verified
              </Text>
            ) : null}
          </View>
          {Array.isArray(customer.online_recharge) && customer.online_recharge.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {customer.online_recharge.map((o) => {
                const key = String(o.partner_id);
                const on = onlineOverride[key] !== undefined ? onlineOverride[key] : !!o.enabled;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.onlineRow, on && styles.onlineRowOn, (readOnly || savingOnline === key) && { opacity: readOnly ? 0.9 : 0.6 }]}
                    disabled={readOnly || savingOnline === key}
                    title={on ? 'The customer can recharge online' : 'The customer cannot recharge online'}
                    onPress={async () => {
                      setSavingOnline(key);
                      const res = await OneBssApi.setCustomerOnlineAccess(customer.cust_id, o.partner_id, !on);
                      setSavingOnline(null);
                      if (!res.ok) {
                        toast.error(res.data?.message || 'Could not change online recharge.');
                        return;
                      }
                      setOnlineOverride((prev) => ({ ...prev, [key]: !on }));
                      toast.success(res.data?.message || (on ? 'Online recharge turned off.' : 'Online recharge turned on.'));
                    }}
                  >
                    <View style={[styles.switchTrack, { backgroundColor: on ? '#10b981' : '#cbd5e1', alignItems: on ? 'flex-end' : 'flex-start' }]}>
                      <View style={styles.switchKnob} />
                    </View>
                    <Text style={[styles.onlineRowText, on && { color: '#047857' }]} numberOfLines={1}>
                      Online recharge {on ? 'on' : 'off'}{customer.online_recharge.length > 1 ? ` (${operatorNames[key] || `operator #${key}`})` : ''}
                    </Text>
                    {savingOnline === key ? <ActivityIndicator size="small" color="#10b981" /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {/* Same person saved twice (older Add Customer runs) — offer to merge into this record */}
      {!readOnly && Array.isArray(customer.same_person_records) && customer.same_person_records.length ? (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {customer.same_person_records.map((d) => {
            const parts = [d.accounts?.internet ? `${d.accounts.internet} internet` : '', d.accounts?.iptv ? `${d.accounts.iptv} IPTV` : '', d.accounts?.ott ? `${d.accounts.ott} OTT` : ''].filter(Boolean).join(', ');
            return (
              <View key={d.cust_id} style={styles.dupBox}>
                <Feather name="copy" size={15} color="#1d4ed8" />
                <Text style={styles.dupText}>
                  The same person is also saved as customer #{d.cust_id} ({d.full_name}{parts ? `, ${parts}` : ''}). Merge it here so all accounts show on one page.
                </Text>
                {mergeAsk === d.cust_id ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={styles.dupGhost} onPress={() => setMergeAsk(null)} disabled={!!merging}><Text style={styles.dupGhostText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dupBtn}
                      disabled={!!merging}
                      onPress={async () => {
                        setMerging(d.cust_id);
                        const res = await OneBssApi.mergeCustomers(customer.cust_id, d.cust_id);
                        setMerging(null);
                        setMergeAsk(null);
                        if (!res.ok) {
                          toast.error(res.data?.error || res.data?.message || 'Could not merge the customers');
                          return;
                        }
                        toast.success(`Customer #${d.cust_id} merged into #${customer.cust_id}.`);
                        if (onRefresh) onRefresh();
                      }}
                    >
                      {merging === d.cust_id ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.dupBtnText}>Yes, merge #{d.cust_id}</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.dupBtn} onPress={() => setMergeAsk(d.cust_id)}>
                    <Feather name="git-merge" size={13} color="#ffffff" />
                    <Text style={styles.dupBtnText}>Merge</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* ACCOUNTS */}
      <View style={styles.tabsRow}>
        <View style={styles.tabs}>
          {tabs.filter((t) => !t.hide).map((t) => (
            <TouchableOpacity key={t.id} style={[styles.tab, curTab === t.id && styles.tabOn]} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, curTab === t.id && styles.tabTextOn]}>{t.label}</Text>
              <Text style={[styles.tabCount, curTab === t.id && styles.tabTextOn]}>{t.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ott.length > 0 ? addOttButton : null}
        </View>
      </View>

      {loading && !all.length ? (
        <View style={[styles.emptyBox, { flexDirection: 'row' }]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.emptyText}>Loading accounts…</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {renderCards(shownList)}
          {curTab !== 'all' && !shownList.length ? emptyFor(curTab) : null}
          {curTab === 'all' && !iptv.length && (showIptvSlot || noDevices) ? emptyFor('iptv') : null}
          {curTab === 'all' && !ott.length && showOttSlot ? emptyFor('ott') : null}
        </View>
      )}


      <ModalShell
        visible={!!renameFor}
        title="Device name"
        icon="tv"
        iconColor="#7c3aed"
        onClose={() => setRenameFor(null)}
        busy={renaming}
        maxWidth={420}
        footer={
          <>
            <Btn label="Cancel" kind="ghost" onPress={() => setRenameFor(null)} disabled={renaming} />
            <Btn label="Save" onPress={saveDeviceName} loading={renaming} />
          </>
        }
      >
        <Text style={sharedStyles.label}>NAME FOR STB {renameFor?.pioneer_stb_id || renameFor?.id}</Text>
        <TextInput
          style={sharedStyles.input}
          value={renameText}
          onChangeText={(v) => setRenameText(v.slice(0, 60))}
          placeholder="e.g. Hall TV"
          placeholderTextColor="#94a3b8"
          onSubmitEditing={saveDeviceName}
          autoFocus
        />
        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Shown instead of the STB number. Leave empty to show the STB number again.</Text>
      </ModalShell>

      {/* Edit Customer Location Popup Modal */}
      <CustomerLocationModal
        visible={locationModalVisible}
        onClose={() => setLocationModalVisible(false)}
        customer={customer}
        onLocationSaved={() => {
          if (onRefresh) onRefresh();
        }}
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
  backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e9f0' },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },

  identityCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e9f0', marginBottom: 16 },
  avatar: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  custName: { fontSize: 21, fontWeight: '800', color: COLORS.textMain, letterSpacing: -0.3 },
  custId: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  metaText: { fontSize: 12, color: '#4b5563', flexShrink: 1 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  btnRecheck: { backgroundColor: '#d97706' },
  recheckNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10, padding: 8, borderRadius: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  recheckNoteText: { flex: 1, fontSize: 11, color: '#92400e' },
  custPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  custPriceText: { flex: 1, fontSize: 11.5, fontWeight: '600', color: '#047857' },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  onlineRowOn: { backgroundColor: 'rgba(16,185,129,0.07)', borderColor: 'rgba(16,185,129,0.3)' },
  onlineRowText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#64748b' },
  switchTrack: { width: 34, height: 20, borderRadius: 10, padding: 2 },
  switchKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#ffffff' },
  comboBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#db2777' },
  comboBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  summaryBox: { minWidth: 72, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: COLORS.glassBorder, alignItems: 'center' },
  summaryNum: { fontSize: 18, fontWeight: '800', color: COLORS.textMain },
  summaryLbl: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#4b5563' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' },
  emptyBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  emptyText: { fontSize: 12, color: '#64748b' },
  emptyCard: { alignItems: 'center', justifyContent: 'center', minHeight: 230, gap: 6, paddingVertical: 20 },
  emptyIconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyEmoji: { fontSize: 44, lineHeight: 54, marginVertical: 2 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  emptyHint: { fontSize: 13, fontWeight: '600', color: '#c2410c', textAlign: 'center', marginTop: 6 },
  emptyRefresh: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  emptyRefreshText: { fontSize: 12.5, fontWeight: '700', color: '#c2410c' },
  regPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e7f6ec', marginBottom: 4 },
  regPillText: { fontSize: 13, fontWeight: '700', color: '#15803d' },

  accCard: { flexGrow: 1, flexBasis: 300, maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: 'rgb(203, 213, 225)', borderLeftWidth: 4, borderRightWidth: 4, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, flexDirection: 'column' },
  accHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accIcon: { width: 34, height: 34, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  accTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  accSubtitle: { fontSize: 11, color: '#64748b', marginTop: 2 },
  accBody: { gap: 9, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9', marginBottom: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  infoLabel: { fontSize: 12, color: '#64748b' },
  infoValueWrap: { flexShrink: 1, alignItems: 'flex-end' },
  infoValue: { fontSize: 12, fontWeight: '600', color: COLORS.textMain, textAlign: 'right' },
  expiryHint: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  realExpiry: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  comboLock: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: 'rgba(236,72,153,0.08)', borderWidth: 1, borderColor: 'rgba(236,72,153,0.3)' , marginBottom: 10 },
  comboLockText: { fontSize: 11.5, fontWeight: '600', color: '#9d174d', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },

  accActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 },
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
  btnOtt: { backgroundColor: '#0ea5e9' },
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  syncChipText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8', flexShrink: 1 },
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

  // ---- customer page ----
  topBar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 },
  identityMain: { padding: 18, gap: 12 },
  identityStrip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 18, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef2f7', backgroundColor: '#fbfcfd', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  stripStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  stripStat: { fontSize: 12.5, color: '#475569' },
  stripNum: { fontSize: 14, fontWeight: '800', color: COLORS.textMain },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 6 },
  contactChip: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  contactText: { fontSize: 12.5, color: '#475569' },
  inlineLink: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
  idTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  dupBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  dupText: { flex: 1, minWidth: 220, fontSize: 12.5, color: '#1e3a8a', lineHeight: 18 },
  dupBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#2563eb', minWidth: 70, justifyContent: 'center' },
  dupBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  dupGhost: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#bfdbfe' },
  dupGhostText: { fontSize: 12, fontWeight: '700', color: '#1e3a8a' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  miniBtnText: { fontSize: 11.5, fontWeight: '700', color: '#2563eb' },
  renameBtn: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.1)' },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: '#eef2f6' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 9 },
  tabOn: { backgroundColor: '#ffffff', boxShadow: '0px 1px 3px rgba(15,23,42,0.12)' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextOn: { color: COLORS.textMain, fontWeight: '800' },
  tabCount: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', backgroundColor: '#ffffff' },
  addBtnText: { fontSize: 12, fontWeight: '700' },
  expiryBlock: { gap: 6, marginBottom: 10 },
  expiryMain: { fontSize: 13.5, fontWeight: '700' },
  expiryDate: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  barTrack: { height: 3, borderRadius: 2, backgroundColor: '#eef2f6', overflow: 'hidden' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, marginBottom: 6 },
  planText: { flex: 1, fontSize: 12.5, color: COLORS.textMain, fontWeight: '600' },
  priceText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  kycLine: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  kycOk: { backgroundColor: 'rgba(16,185,129,0.07)' },
  kycBad: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  kycText: { flex: 1, fontSize: 12, fontWeight: '600' },
  kycVerifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, backgroundColor: '#2563eb' },
  kycVerifyText: { fontSize: 11.5, fontWeight: '700', color: '#ffffff' },
  kycLink: { fontSize: 12, fontWeight: '700', color: '#2563eb' },
});
