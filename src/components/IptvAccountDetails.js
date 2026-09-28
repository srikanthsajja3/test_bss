import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Image, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { parseApiDate, defaultRechargeType, normaliseIptvAccount } from './CustomerAccountsOverview';
import { fixDocUrl } from './internet/shared';

const IPTV = '#8b5cf6';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clean = (v) => (v === null || v === undefined || v === 'null' || String(v).trim() === '' ? '' : String(v));
const pick = (...vals) => vals.map(clean).find(Boolean) || '';

const ordinal = (n) => {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
};

// "27th Sep 2026 10:48 AM"
const formatLongDate = (value) => {
  const d = parseApiDate(value);
  if (!d) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()}${ordinal(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${h}:${m} ${ampm}`;
};

const statusStyle = (sts) => {
  const s = (sts || '').toLowerCase();
  if (s === 'active') return { bg: '#22c55e', fg: '#ffffff' };
  if (s === 'expired') return { bg: '#f59e0b', fg: '#ffffff' };
  if (s.includes('suspend') || s.includes('deactive') || s.includes('inactive')) return { bg: '#ef4444', fg: '#ffffff' };
  return { bg: '#94a3b8', fg: '#ffffff' };
};

// "12 days left" / "Expires today" / "Expired 17 days ago"
const expiryHint = (value) => {
  const d = parseApiDate(value);
  if (!d) return { text: 'Not activated', color: '#64748b' };
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  if (days > 1) return { text: `${days} days left`, color: days <= 3 ? '#b45309' : '#047857' };
  if (days === 1) return { text: 'Expires tomorrow', color: '#b45309' };
  if (days === 0) return d.getTime() > Date.now() ? { text: 'Expires today', color: '#b45309' } : { text: 'Expired today', color: '#dc2626' };
  return { text: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`, color: '#dc2626' };
};

const copyText = (text, what) => {
  try {
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(String(text));
      toast.success(`${what} copied`);
    }
  } catch (e) {}
};

const Badge = ({ text, bg, fg = '#ffffff' }) => (
  <View style={[styles.badge, { backgroundColor: bg }]}>
    <Text style={[styles.badgeText, { color: fg }]}>{text}</Text>
  </View>
);

const InfoRow = ({ label, value, children, copy }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {children || <Text style={[styles.infoValue, { flexShrink: 1 }]} selectable>{value || '—'}</Text>}
      {copy && value ? (
        <TouchableOpacity onPress={() => copyText(value, label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Feather name="copy" size={13} color="#94a3b8" />
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
);

/**
 * IPTV account detail view.
 *   Left:  compact photo, customer name, mobile, expiry status + date, Recharge button
 *   Right: Basic Info incl. STB No / VC Number (with copy)
 *
 * Props:
 *  customer      merged customer record (customer_lookup + list row)
 *  account       raw iptv_accounts[i] object
 *  accountIndex  index of that account
 *  operatorName  shown when the STB belongs to the logged-in operator
 *  onBack()
 *  onOpenRecharge()  opens the IPTV Recharge / Advance Renewal package modal
 *  onSync()      re-sync this customer's STBs from the provider
 */
export const IptvAccountDetails = ({ customer, account, accountIndex, operatorName, onBack, onOpenRecharge, onSync }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [infoOpen, setInfoOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  if (!customer || !account) return null;

  const normalised = normaliseIptvAccount(account, accountIndex);
  const rechargeType = defaultRechargeType(normalised);
  const name = pick(customer.full_name, [customer.first_name, customer.last_name].filter(Boolean).join(' ')) || '—';
  const mobile = clean(customer.mobile);
  const sts = pick(account.sts, account.status) || 'Unknown';
  const stsStyle = statusStyle(sts);
  const expiryValue = pick(account.expriration, account.expiration);
  const hint = expiryHint(expiryValue);
  const userType = pick(account.user_type, account.customer_type, customer.customer_type, customer.internet_accounts?.[0]?.customer_type);
  const autoRenew = String(account.auto_renew) === '1';
  const photo = fixDocUrl(clean(customer.profile_image));
  const stbNo = pick(account.stb_box, account.stb_no);
  const vcNo = pick(account.smartcard, account.vc_number);
  const stbId = pick(account.pioneer_stb_id, account.id);

  const doSync = async () => {
    if (!onSync || syncing) return;
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  const leftRows = [
    { label: 'STB No', value: stbNo, copy: true },
    { label: 'VC Number', value: vcNo, copy: true },
    { label: 'STB ID', value: stbId },
    { label: 'A/C No', value: pick(account.acc_no, account.account_no, customer.cust_bss_id, customer.cust_id) },
    { label: 'Username', value: pick(account.username, customer.mobile) },
    { label: 'User Type', node: userType ? <Badge text={userType.charAt(0).toUpperCase() + userType.slice(1)} bg="#3b82f6" /> : null },
  ];
  const rightRows = [
    { label: 'Operator Name', value: pick(account.operator_name, account.partner_name, operatorName) },
    { label: 'Branch', value: clean(account.branch_name) },
    { label: 'CAF No', value: pick(account.caf_no, account.caf_number) },
    { label: 'Register Date', value: formatLongDate(pick(account.register_date, account.created_at, customer.registered_date)) },
    { label: 'Last Renewal', value: formatLongDate(pick(account.last_renewal, account.dad)) },
    { label: 'Email', value: clean(customer.email) },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24, width: '100%' }}
    >
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Feather name="arrow-left" size={16} color={COLORS.textMain} />
        <Text style={styles.backBtnText}>Back to Accounts</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 20, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
        {/* LEFT — photo + customer summary + recharge */}
        <View style={[styles.card, styles.profileCard, isMobile ? null : { width: 280 }]}>
          {photo && !photoFailed ? (
            <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" onError={() => setPhotoFailed(true)} />
          ) : (
            <View style={[styles.photo, styles.photoEmpty]}>
              <Feather name="user" size={40} color="#cbd5e1" />
            </View>
          )}

          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          {mobile ? (
            <TouchableOpacity style={styles.mobileRow} onPress={() => copyText(mobile, 'Mobile number')}>
              <Feather name="phone" size={13} color="#64748b" />
              <Text style={styles.mobileText}>{mobile}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.statusBlock}>
            <View style={styles.statusLine}>
              <Text style={styles.statusLabel}>Status</Text>
              <Badge text={sts} bg={stsStyle.bg} fg={stsStyle.fg} />
            </View>
            <View style={styles.statusLine}>
              <Text style={styles.statusLabel}>Expiry</Text>
              <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                <Text style={styles.expiryDate}>{formatLongDate(expiryValue)}</Text>
                <Text style={[styles.expiryHint, { color: hint.color }]}>{hint.text}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.rechargeBtn} onPress={onOpenRecharge}>
            <Feather name={rechargeType === 'advance' ? 'fast-forward' : 'refresh-cw'} size={15} color="#ffffff" />
            <Text style={styles.rechargeBtnText}>{rechargeType === 'advance' ? 'Advance Renewal' : 'Recharge'}</Text>
          </TouchableOpacity>

          {/* <View style={styles.linkRow}>
            {onSync ? (
              <TouchableOpacity style={styles.linkBtn} onPress={doSync} disabled={syncing}>
                {syncing ? <ActivityIndicator size="small" color={IPTV} /> : <Feather name="refresh-cw" size={12} color={IPTV} />}
                <Text style={styles.linkBtnText}>Sync STB</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.linkBtn} onPress={() => setInfoOpen(true)}>
              <Feather name="info" size={12} color={IPTV} />
              <Text style={styles.linkBtnText}>STB & Products</Text>
            </TouchableOpacity>
          </View> */}
        </View>

        {/* RIGHT — basic info incl. STB / VC */}
        <View style={[styles.card, { flex: isMobile ? undefined : 1, minWidth: 0 }]}>
          <Text style={styles.cardTitle}>Basic Info</Text>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0 : 36 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {leftRows.map((r) => <InfoRow key={r.label} label={r.label} value={r.value} copy={r.copy}>{r.node}</InfoRow>)}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {rightRows.map((r) => <InfoRow key={r.label} label={r.label} value={r.value}>{r.node}</InfoRow>)}
            </View>
          </View>
        </View>
      </View>

      {/* STB & PRODUCTS INFO */}
      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.infoModal}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>STB & Products Info</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)}>
                <Feather name="x" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            <InfoRow label="IPTV ID" value={clean(account.id)} />
            <InfoRow label="Pioneer STB ID" value={clean(account.pioneer_stb_id)} />
            <InfoRow label="STB No" value={stbNo} copy />
            <InfoRow label="VC Number" value={vcNo} copy />
            <InfoRow label="Plan" value={normalised.planLabel} />
            <InfoRow label="Sub Plan" value={normalised.subplanLabel} />
            <InfoRow label="Activated" value={formatLongDate(account.dad)} />
            <InfoRow label="Next Invoice" value={formatLongDate(account.nxt_inv_date)} />
            <InfoRow label="Expiry" value={formatLongDate(expiryValue)} />
            <InfoRow label="Auto Renew" value={autoRenew ? 'On' : 'Off'} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: '#f1f5f9' },
  backBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, marginBottom: 16 },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },

  card: { backgroundColor: '#ffffff', borderRadius: 10, padding: 16, boxShadow: '0px 1px 4px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: 20, fontWeight: '400', color: IPTV, marginBottom: 12 },

  profileCard: { alignItems: 'center' },
  photo: { width: 110, height: 110, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  photoEmpty: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.textMain, marginTop: 12, textAlign: 'center' },
  mobileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  mobileText: { fontSize: 14, color: '#475569', fontWeight: '600' },

  statusBlock: { alignSelf: 'stretch', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 10 },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  statusLabel: { fontSize: 13, color: '#64748b' },
  expiryDate: { fontSize: 13, fontWeight: '700', color: COLORS.textMain, textAlign: 'right' },
  expiryHint: { fontSize: 11, fontWeight: '700', marginTop: 1 },

  rechargeBtn: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, paddingVertical: 11, borderRadius: 8, backgroundColor: IPTV },
  rechargeBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  linkRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  linkBtnText: { fontSize: 12, fontWeight: '700', color: IPTV },

  infoRow: { flexDirection: 'row', alignItems: 'center', minHeight: 45, paddingVertical: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  infoLabel: { width: 130, fontSize: 14, color: '#374151' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#111827', wordBreak: 'break-all' },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  infoModal: { width: '100%', maxWidth: 480, backgroundColor: '#ffffff', borderRadius: 12, padding: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
});