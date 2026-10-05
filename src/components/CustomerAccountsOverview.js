import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { CustomerPhoto, isAccountVerified } from './internet/shared';

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

const Section = ({ title, icon, color, count, emptyText, loading, children }) => (
  <View style={{ marginBottom: 22 }}>
    <View style={styles.sectionHeader}>
      <Feather name={icon} size={15} color={color} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.countBadge}><Text style={styles.countBadgeText}>{count}</Text></View>
    </View>
    {count === 0 && loading ? (
      <View style={[styles.emptyBox, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <ActivityIndicator size="small" color={color} />
        <Text style={styles.emptyText}>Loading accounts…</Text>
      </View>
    ) : count === 0 ? (
      <View style={styles.emptyBox}><Text style={styles.emptyText}>{emptyText}</Text></View>
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
export const CustomerAccountsOverview = ({ customer, loading = false, syncing = false, onBack, onOpenDetails, onInternetRecharge, onIptvRecharge, onVerify, onRefresh, onModifyMobile }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (!customer) return null;

  const internet = (customer.internet_accounts || []).map(normaliseInternetAccount);
  const iptv = (customer.iptv_accounts || []).map(normaliseIptvAccount);
  const all = [...internet, ...iptv];
  const activeCount = all.filter((a) => a.statusText.toLowerCase() === 'active').length;
  const name = clean(customer.full_name) || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || `Customer #${customer.cust_id}`;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

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

      <Section title="IPTV Accounts" icon="tv" color="#8b5cf6" count={iptv.length} loading={loading} emptyText="No IPTV accounts for this customer.">
        {renderCards(iptv)}
      </Section>

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

});
