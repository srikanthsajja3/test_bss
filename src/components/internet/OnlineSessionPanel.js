import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { Note } from './shared';

/**
 * Internet account › Online Session tab: the live RADIUS session (internet_online_session.php —
 * stored session id first, otherwise found in RADIUS's Online Users list) and Log Out Session.
 * onStatus(online) after every load, so the page header shows the live state at once;
 * onRefreshAccount() after Refresh and after Log Out, so the account itself is synced too.
 */
const val = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));

const copy = (text) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(String(text || ''));
      toast.success('Copied');
    }
  } catch (e) {
    // ignore
  }
};

const Field = ({ label, value, mono, copyable }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={[styles.fieldValue, mono && styles.mono]} selectable numberOfLines={2}>{val(value)}</Text>
      {copyable && value ? (
        <TouchableOpacity onPress={() => copy(value)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="copy" size={12} color="#94a3b8" />
        </TouchableOpacity>
      ) : null}
    </View>
  </View>
);

export const OnlineSessionPanel = ({ internetId, username, readOnly = false, onStatus, onRefreshAccount }) => {
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null); // { online, session, message }
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    if (!internetId) return;
    setLoading(true);
    const res = await OneBssApi.getInternetOnlineSession(internetId);
    setLoading(false);
    if (!res.ok) {
      setError(res.data?.message || 'Could not load the online session.');
      return;
    }
    setError('');
    setData(res.data);
    if (onStatus) onStatus(!!res.data.online);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internetId]);

  // Refresh button: the session + the account (header, Basic Info)
  const refreshAll = async () => {
    await load();
    if (onRefreshAccount) onRefreshAccount();
  };

  useEffect(() => {
    setData(null);
    setConfirm(false);
    load();
  }, [load]);

  const logout = async () => {
    setLoggingOut(true);
    const res = await OneBssApi.logoutInternetSession(internetId);
    if (!res.ok) {
      setLoggingOut(false);
      toast.error(res.data?.message || 'Could not log out the session.');
      return;
    }
    toast.success(res.data?.message || 'Session logged out.');
    setConfirm(false);
    // RADIUS needs a moment to close the session; then reload everything
    await new Promise((r) => setTimeout(r, 2000));
    await refreshAll();
    setLoggingOut(false);
  };

  const s = data?.session || {};
  const online = data?.online;

  const groups = [
    {
      title: 'Session',
      icon: 'activity',
      fields: [
        ['Started', s.acctstarttime],
        ['Duration', s.session_time],
        ['Running package', s.running_package],
        ['Login type', s.login_type],
        ['Protocol', s.protocol],
        ['Session ID', s.acctuniqueid, true, true],
      ],
    },
    {
      title: 'Network',
      icon: 'globe',
      fields: [
        ['IPv4 address', s.login_ip_address, true, true],
        ['IPv6 address', s.ip_v6, true, true],
        ['NAT address', s.nat_ip_address, true, true],
        ['NAS (BRAS) IP', s.nas_ip, true, true],
        ['Device MAC', s.login_mac_address, true, true],
      ],
    },
    {
      title: 'Customer',
      icon: 'user',
      fields: [
        ['Account no.', s.customer_id],
        ['Username', s.username || username],
        ['Company', s.company_name],
        ['Branch', s.branch_name],
      ],
    },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <Feather name="wifi" size={18} color={COLORS.primary} />
          <Text style={styles.title}>Online Session</Text>
          {data ? (
            <View style={[styles.badge, { backgroundColor: online ? '#dcfce7' : '#f1f5f9' }]}>
              <View style={[styles.dot, { backgroundColor: online ? '#16a34a' : '#94a3b8' }]} />
              <Text style={[styles.badgeText, { color: online ? '#15803d' : '#64748b' }]}>{online ? 'ONLINE' : 'OFFLINE'}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={styles.ghostBtn} onPress={refreshAll} disabled={loading || loggingOut} accessibilityLabel="Refresh session">
          {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Feather name="refresh-cw" size={13} color="#334155" />}
          <Text style={styles.ghostBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={{ padding: 18, gap: 16 }}>
        {error ? <Note tone="error" text={error} /> : null}
        {!data && loading ? <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 24 }} /> : null}

        {data && !online ? (
          <View style={styles.empty}>
            <Feather name="wifi-off" size={26} color="#94a3b8" />
            <Text style={styles.emptyTitle}>Not online right now</Text>
            <Text style={styles.emptyText}>{data.message || 'There is no active session for this account.'}</Text>
          </View>
        ) : null}

        {data && online ? (
          <>
            {/* usage */}
            <View style={styles.usageRow}>
              {[
                ['Total data', s.total_data, 'database'],
                ['Download', s.total_download, 'arrow-down'],
                ['Upload', s.total_upload, 'arrow-up'],
                ['Session time', s.session_time, 'clock'],
              ].map(([l, v, ic]) => (
                <View key={l} style={styles.usage}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name={ic} size={12} color="#64748b" />
                    <Text style={styles.usageLabel}>{l}</Text>
                  </View>
                  <Text style={styles.usageValue}>{val(v)}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.groups, narrow && { flexDirection: 'column' }]}>
              {groups.map((g) => (
                <View key={g.title} style={styles.group}>
                  <View style={styles.groupHead}>
                    <Feather name={g.icon} size={14} color="#334155" />
                    <Text style={styles.groupTitle}>{g.title}</Text>
                  </View>
                  {g.fields.map(([l, v, mono, cp]) => <Field key={l} label={l} value={v} mono={mono} copyable={cp} />)}
                </View>
              ))}
            </View>

            {readOnly ? null : (
              <View style={styles.logoutBox}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={styles.logoutTitle}>Log out this session</Text>
                  <Text style={styles.logoutText}>
                    Disconnects the customer now. The device usually reconnects by itself unless the account is disabled or expired.
                  </Text>
                </View>
                {confirm ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={styles.ghostBtn} onPress={() => setConfirm(false)} disabled={loggingOut}>
                      <Text style={styles.ghostBtnText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dangerBtn} onPress={logout} disabled={loggingOut}>
                      {loggingOut ? <ActivityIndicator size="small" color="#ffffff" /> : <Feather name="log-out" size={13} color="#ffffff" />}
                      <Text style={styles.dangerBtnText}>{loggingOut ? 'Logging out…' : 'Yes, log out'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.dangerOutline} onPress={() => setConfirm(true)}>
                    <Feather name="log-out" size={13} color="#dc2626" />
                    <Text style={styles.dangerOutlineText}>Log Out Session</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', overflow: 'hidden', width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10.5, fontWeight: '800' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: '#ffffff' },
  ghostBtnText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textMain },
  emptyText: { fontSize: 12.5, color: '#64748b', textAlign: 'center' },
  usageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  usage: { flexGrow: 1, flexBasis: 130, padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  usageLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  usageValue: { fontSize: 18, fontWeight: '800', color: COLORS.textMain, marginTop: 4 },
  groups: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  group: { flex: 1, alignSelf: 'stretch', minWidth: 0, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', gap: 10 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  groupTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  field: { gap: 2 },
  fieldLabel: { fontSize: 11, color: '#64748b' },
  fieldValue: { fontSize: 13, fontWeight: '600', color: COLORS.textMain, flexShrink: 1 },
  mono: { fontFamily: 'monospace', fontSize: 12.5 },
  logoutBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  logoutTitle: { fontSize: 13.5, fontWeight: '800', color: '#991b1b' },
  logoutText: { fontSize: 12, color: '#b91c1c', marginTop: 2, lineHeight: 17 },
  dangerOutline: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#ffffff' },
  dangerOutlineText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 8, backgroundColor: '#dc2626' },
  dangerBtnText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
});
