import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note, sharedStyles, fixDocUrl, isImageUrl, openExternal } from './shared';

const errMsg = (res, fallback) => res?.data?.message || (res?.status ? `${fallback} (HTTP ${res.status})` : fallback);
const okRes = (res) => res && res.ok && res.data && res.data.success !== false;

const copy = (text, what) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(String(text || ''));
      toast.success(`${what} copied`);
    }
  } catch (e) {}
};

// =====================================================================
// PASSWORD — view current RADIUS password + set a new one
// =====================================================================
export const PasswordModal = ({ visible, onClose, internetId, username }) => {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reveal, setReveal] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await OneBssApi.viewInternetPassword(internetId);
      if (okRes(res)) setCurrent(res.data.results?.password || '');
      else setLoadError(errMsg(res, 'Unable to fetch password'));
    } catch (e) {
      setLoadError('Unable to fetch password');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setPw('');
      setPw2('');
      setReveal(false);
      setCurrent('');
      load();
    }
  }, [visible, internetId]);

  const save = async () => {
    if (pw.trim().length < 4) return toast.info('New password must be at least 4 characters');
    if (pw !== pw2) return toast.warning('Passwords do not match');
    setSaving(true);
    try {
      const res = await OneBssApi.changeInternetPassword(internetId, pw.trim());
      if (okRes(res)) {
        toast.success(res.data.message || 'Password changed successfully');
        setPw('');
        setPw2('');
        load();
      } else {
        toast.error(errMsg(res, 'Failed to change password'));
      }
    } catch (e) {
      toast.error('Unable to change password');
    } finally {
      setSaving(false);
    }
  };

  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <ModalShell
      visible={visible}
      title={`Password — ${username || ''}`}
      icon="key"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <Btn label="Close" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Change Password" onPress={save} loading={saving} disabled={!pw || !pw2 || mismatch} />
        </>
      }
    >
      <Text style={sharedStyles.label}>CURRENT PASSWORD</Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : (
        <View style={styles.pwRow}>
          <Text style={styles.pwText} selectable>{reveal ? current || '—' : current ? '•'.repeat(Math.min(current.length, 12)) : '—'}</Text>
          <TouchableOpacity onPress={() => setReveal((r) => !r)} style={styles.iconBtn}>
            <Feather name={reveal ? 'eye-off' : 'eye'} size={15} color="#475569" />
          </TouchableOpacity>
          {current ? (
            <TouchableOpacity onPress={() => copy(current, 'Password')} style={styles.iconBtn}>
              <Feather name="copy" size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={sharedStyles.label}>NEW PASSWORD</Text>
      <TextInput style={sharedStyles.input} value={pw} onChangeText={setPw} secureTextEntry={!reveal} placeholder="Minimum 4 characters" placeholderTextColor="#94a3b8" />
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>CONFIRM PASSWORD</Text>
      <TextInput style={[sharedStyles.input, mismatch && { borderColor: '#f87171' }]} value={pw2} onChangeText={setPw2} secureTextEntry={!reveal} placeholder="Re-enter password" placeholderTextColor="#94a3b8" />
      {mismatch ? <Text style={styles.errText}>Passwords do not match</Text> : null}
      <Note tone="info" text="The customer's PPPoE session may need to reconnect with the new password." />
    </ModalShell>
  );
};

// =====================================================================
// MAC BINDINGS — list + remove
// =====================================================================
export const MacBindingsModal = ({ visible, onClose, internetId, username }) => {
  const [loading, setLoading] = useState(false);
  const [bindings, setBindings] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await OneBssApi.getInternetMacBindings(internetId);
      if (okRes(res)) setBindings(Array.isArray(res.data.results) ? res.data.results : []);
      else setLoadError(errMsg(res, 'Unable to load MAC bindings'));
    } catch (e) {
      setLoadError('Unable to load MAC bindings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setBindings([]);
      setConfirmId(null);
      load();
    }
  }, [visible, internetId]);

  const remove = async (id) => {
    setRemoving(id);
    try {
      const res = await OneBssApi.removeInternetMacBinding(internetId, id);
      if (okRes(res)) {
        toast.success(res.data.message || 'MAC binding removed');
        setBindings((prev) => prev.filter((b) => b.id !== id));
      } else {
        toast.error(errMsg(res, 'Failed to remove MAC binding'));
      }
    } catch (e) {
      toast.error('Failed to remove MAC binding');
    } finally {
      setRemoving(null);
      setConfirmId(null);
    }
  };

  return (
    <ModalShell
      visible={visible}
      title={`MAC Bindings — ${username || ''}`}
      icon="globe"
      onClose={onClose}
      maxWidth={600}
      busy={!!removing}
      footer={
        <>
          <Btn label="Refresh" kind="ghost" icon="refresh-cw" onPress={load} disabled={loading || !!removing} />
          <Btn label="Close" onPress={onClose} disabled={!!removing} />
        </>
      }
    >
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : bindings.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={22} color="#10b981" />
          <Text style={styles.emptyText}>No MAC bindings on this account.</Text>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.thRow]}>
            <Text style={[styles.th, { flex: 2 }]}>MAC</Text>
            <Text style={[styles.th, { flex: 1.5 }]}>IP</Text>
            <Text style={[styles.th, { flex: 1 }]}>Type</Text>
            <Text style={[styles.th, { flex: 1.6, textAlign: 'right' }]}> </Text>
          </View>
          {bindings.map((b) => (
            <View key={b.id} style={styles.tr}>
              <Text style={[styles.td, { flex: 2, fontWeight: '700' }]} selectable>{b.mac || '—'}</Text>
              <Text style={[styles.td, { flex: 1.5 }]} selectable>{b.ip || '—'}</Text>
              <Text style={[styles.td, { flex: 1 }]}>{b.type || '—'}</Text>
              <View style={{ flex: 1.6, alignItems: 'flex-end' }}>
                {confirmId === b.id ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={styles.smallGhost} onPress={() => setConfirmId(null)} disabled={removing === b.id}>
                      <Text style={styles.smallGhostText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallDanger} onPress={() => remove(b.id)} disabled={removing === b.id}>
                      {removing === b.id ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.smallDangerText}>Yes, remove</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.smallOutline} onPress={() => setConfirmId(b.id)} disabled={!!removing}>
                    <Feather name="trash-2" size={12} color="#dc2626" />
                    <Text style={styles.smallOutlineText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};

// =====================================================================
// SESSION HISTORY
// =====================================================================
const toYmd = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

const parseSize = (value) => {
  if (!value) return 0;
  const [num, unit] = String(value).trim().split(/\s+/);
  const n = parseFloat(num);
  if (isNaN(n)) return 0;
  switch ((unit || '').toUpperCase()) {
    case 'B': return n / (1024 * 1024);
    case 'KB': return n / 1024;
    case 'MB': return n;
    case 'GB': return n * 1024;
    case 'TB': return n * 1024 * 1024;
    default: return 0;
  }
};
const fmtSize = (mb) => (mb >= 1024 * 1024 ? `${(mb / 1048576).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`);

const DateField = ({ value, onChange }) =>
  Platform.OS === 'web' ? (
    React.createElement('input', {
      type: 'date',
      value,
      max: toYmd(new Date()),
      onChange: (e) => onChange(e.target.value),
      style: { height: 38, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: '#000' },
    })
  ) : (
    <TextInput style={[sharedStyles.input, { width: 140 }]} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" />
  );

const SESSION_COLS = [
  { key: 'from_time', label: 'Login Time', flex: 1.6 },
  { key: 'to_time', label: 'End Time', flex: 1.6 },
  { key: 'login_ip_address', label: 'Login IP', flex: 1.3 },
  { key: 'package_name', label: 'Package', flex: 1.5 },
  { key: 'upload_data', label: 'Upload', flex: 1 },
  { key: 'download_data', label: 'Download', flex: 1 },
  { key: 'total_data', label: 'Total', flex: 1 },
  { key: 'termination_call', label: 'Reason', flex: 1.4 },
];

export const SessionHistoryModal = ({ visible, onClose, internetId, username }) => {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [start, setStart] = useState(toYmd(monthAgo));
  const [end, setEnd] = useState(toYmd(today));
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    if (!start || !end) return toast.info('Pick both dates');
    if (start > end) return toast.warning('"From" must be on or before "To"');
    setLoading(true);
    setLoadError('');
    setSelected(null);
    try {
      const res = await OneBssApi.getInternetSessionHistory(internetId, start, end);
      if (okRes(res)) {
        const list = res.data.results?.sessionList || [];
        setSessions([...list].sort((a, b) => String(b.from_time || '').localeCompare(String(a.from_time || ''))));
      } else {
        setSessions([]);
        setLoadError(errMsg(res, 'Unable to load sessions'));
      }
    } catch (e) {
      setLoadError('Unable to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setSessions([]);
      load();
    }
  }, [visible, internetId]);

  const sum = sessions.reduce(
    (acc, s) => ({ up: acc.up + parseSize(s.upload_data), down: acc.down + parseSize(s.download_data), total: acc.total + parseSize(s.total_data) }),
    { up: 0, down: 0, total: 0 }
  );

  return (
    <ModalShell visible={visible} title={`Session History — ${username || ''}`} icon="list" onClose={onClose} maxWidth={1100} footer={<Btn label="Close" onPress={onClose} />}>
      <View style={styles.toolbar}>
        <View>
          <Text style={sharedStyles.label}>FROM</Text>
          <DateField value={start} onChange={setStart} />
        </View>
        <View>
          <Text style={sharedStyles.label}>TO</Text>
          <DateField value={end} onChange={setEnd} />
        </View>
        <View style={{ justifyContent: 'flex-end' }}>
          <Btn label={loading ? 'Loading…' : 'Load Sessions'} icon="search" onPress={load} disabled={loading} />
        </View>
      </View>

      <View style={styles.statRow}>
        {[
          ['Sessions', String(sessions.length)],
          ['Upload', fmtSize(sum.up)],
          ['Download', fmtSize(sum.down)],
          ['Total Usage', fmtSize(sum.total)],
        ].map(([l, v]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statLabel}>{l}</Text>
            <Text style={styles.statValue}>{v}</Text>
          </View>
        ))}
      </View>

      {loadError ? <Note tone="error" text={loadError} /> : null}

      {selected ? (
        <View style={styles.detailBox}>
          <TouchableOpacity style={styles.backLink} onPress={() => setSelected(null)}>
            <Feather name="arrow-left" size={14} color={COLORS.primary} />
            <Text style={styles.backLinkText}>Back to sessions</Text>
          </TouchableOpacity>
          {[
            ['Username', selected.username], ['Login Time', selected.from_time], ['End Time', selected.to_time],
            ['Login IP', selected.login_ip_address], ['NAS IP', selected.nas_ip_address], ['NAS Port', selected.nas_port_id],
            ['Protocol', selected.protocol], ['Package', selected.package_name], ['Profile', selected.profile_name],
            ['Upload', selected.upload_data], ['Download', selected.download_data], ['Total', selected.total_data],
            ['Termination', selected.termination_call], ['Session ID', selected.session],
          ].map(([l, v]) => <KV key={l} label={l} value={v} />)}
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: 1000, width: '100%' }}>
            <View style={[styles.tr, styles.thRow]}>
              {SESSION_COLS.map((c) => <Text key={c.key} style={[styles.th, { flex: c.flex }]}>{c.label}</Text>)}
              <Text style={[styles.th, { flex: 0.7 }]}> </Text>
            </View>
            {sessions.length === 0 ? (
              <Text style={[styles.emptyText, { padding: 16, textAlign: 'center' }]}>No sessions in this date range.</Text>
            ) : (
              sessions.map((s, i) => (
                <View key={`${s.session || i}_${i}`} style={styles.tr}>
                  {SESSION_COLS.map((c) => <Text key={c.key} style={[styles.td, { flex: c.flex }]}>{s[c.key] || '—'}</Text>)}
                  <View style={{ flex: 0.7 }}>
                    <TouchableOpacity style={styles.smallGhost} onPress={() => setSelected(s)}>
                      <Text style={styles.smallGhostText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </ModalShell>
  );
};

// =====================================================================
// VERIFY CUSTOMER — required before Recharge / Advance Renewal
// =====================================================================
export const VerifyCustomerModal = ({ visible, onClose, internetId, username, customerName, onVerified }) => {
  const [saving, setSaving] = useState(false);
  const verify = async () => {
    setSaving(true);
    try {
      const res = await OneBssApi.verifyInternetCustomer(internetId);
      if (okRes(res)) {
        toast.success(res.data.message || 'Customer verified successfully');
        if (onVerified) await onVerified();
        onClose();
      } else {
        toast.error(errMsg(res, 'Verification failed'));
      }
    } catch (e) {
      toast.error('Unable to verify customer');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell
      visible={visible}
      title="Verify Customer"
      icon="user-check"
      onClose={onClose}
      maxWidth={440}
      busy={saving}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Verify Customer" icon="check" onPress={verify} loading={saving} />
        </>
      }
    >
      <Text style={{ fontSize: 13, color: COLORS.textMain, lineHeight: 20 }}>
        Mark this internet account as <Text style={{ fontWeight: '700' }}>Verified</Text>?
      </Text>
      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary }}>
        <KV label="Customer" value={customerName} />
        <KV label="Username" value={username} bold />
      </View>
      <Note text="Recharge and Advance Renewal are available only after the customer is verified." />
    </ModalShell>
  );
};

// =====================================================================
// DOCUMENTS — Super Admin only (gated by the caller)
// =====================================================================
export const DocumentsModal = ({ visible, onClose, customer }) => {
  const docs = (Array.isArray(customer?.documents) ? customer.documents : [])
    .map((d) => ({ ...d, url: fixDocUrl(d.url) }))
    .filter((d) => d.url);
  return (
    <ModalShell visible={visible} title="Customer Documents" icon="file-text" onClose={onClose} maxWidth={760} footer={<Btn label="Close" onPress={onClose} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <View style={[styles.kycTag, { backgroundColor: customer?.aadhar_verified ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.14)' }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: customer?.aadhar_verified ? '#047857' : '#b45309' }}>
            {customer?.aadhar_verified ? 'Aadhaar verified' : 'Aadhaar not verified'}
          </Text>
        </View>
        {customer?.verification_channel ? (
          <View style={[styles.kycTag, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>via {customer.verification_channel}</Text>
          </View>
        ) : null}
      </View>
      {docs.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="file" size={22} color="#94a3b8" />
          <Text style={styles.emptyText}>No documents uploaded for this customer.</Text>
        </View>
      ) : (
        <View style={styles.docGrid}>
          {docs.map((d) => (
            <View key={d.key || d.url} style={styles.docCard}>
              {isImageUrl(d.url) ? (
                <DocThumb url={d.url} />
              ) : (
                <View style={[styles.docThumb, styles.docThumbIcon]}>
                  <Feather name="file-text" size={34} color="#94a3b8" />
                  <Text style={styles.docExt}>{(d.url.split('.').pop() || '').slice(0, 4).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.docLabel} numberOfLines={1}>{d.label || d.key}</Text>
              <TouchableOpacity style={styles.smallOutlineBlue} onPress={() => openExternal(d.url)}>
                <Feather name="external-link" size={12} color="#2563eb" />
                <Text style={styles.smallOutlineBlueText}>Open</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};

const DocThumb = ({ url }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.docThumb, styles.docThumbIcon]}>
        <Feather name="image" size={30} color="#cbd5e1" />
        <Text style={styles.docExt}>Preview unavailable</Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={styles.docThumb} resizeMode="cover" onError={() => setFailed(true)} />;
};

const styles = StyleSheet.create({
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  pwText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.textMain, letterSpacing: 0.5, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  iconBtn: { padding: 6, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 16 },
  errText: { fontSize: 11, color: '#dc2626', marginTop: 4 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 13, color: '#64748b' },
  table: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', gap: 8 },
  thRow: { backgroundColor: COLORS.bgSecondary },
  th: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 12, color: COLORS.textMain },

  smallOutline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#ffffff' },
  smallOutlineText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  smallDanger: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#dc2626', minWidth: 84, alignItems: 'center' },
  smallDangerText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  smallGhost: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)', alignSelf: 'flex-start' },
  smallGhostText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  smallOutlineBlue: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#bfdbfe', alignSelf: 'flex-start' },
  smallOutlineBlueText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },

  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  stat: { flexGrow: 1, flexBasis: 140, padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.textMain, marginTop: 4 },
  detailBox: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backLinkText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  kycTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  docCard: { width: 210, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', gap: 8 },
  docThumb: { width: '100%', height: 150, borderRadius: 8, backgroundColor: '#f1f5f9' },
  docThumbIcon: { justifyContent: 'center', alignItems: 'center', gap: 6 },
  docExt: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  docLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
});
