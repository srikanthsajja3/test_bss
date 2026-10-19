import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, useWindowDimensions } from 'react-native';
import { toast } from 'react-toastify';
import { Feather } from '@expo/vector-icons';
import { OneBssApi } from '../../services/oneBssApi';

// OLTs and switches registered in the NMS for one operator (looked up by the operator's
// mobile number). Read-only list with status, ONU / port counts and last sync.

const STATUS = {
  up: { fg: '#15803d', bg: '#dcfce7', label: 'UP' },
  online: { fg: '#15803d', bg: '#dcfce7', label: 'ONLINE' },
  down: { fg: '#dc2626', bg: '#fee2e2', label: 'DOWN' },
  offline: { fg: '#dc2626', bg: '#fee2e2', label: 'OFFLINE' },
};
const statusStyle = (s) => STATUS[String(s || '').toLowerCase()] || { fg: '#475569', bg: '#f1f5f9', label: String(s || 'UNKNOWN').toUpperCase() };

const isOlt = (d) => /olt/i.test(String(d.type || '')) || (d.stats?.onus_total || 0) > 0;

// Opens a short-lived NMS session (web UI or browser terminal) in a new tab.
// The tab is opened first, synchronously, so pop-up blockers allow it.
const openSession = async (kind, d, phone, setBusy) => {
  let win = null;
  try {
    win = window.open('about:blank', '_blank');
  } catch (e) {}
  setBusy(kind);
  const res = kind === 'web' ? await OneBssApi.getNmsDeviceWebUrl(d.device_id, phone) : await OneBssApi.getNmsDeviceTerminal(d.device_id, phone);
  setBusy('');
  const url = res.data?.url || res.data?.web_url || res.data?.terminal_url;
  if (res.ok && url) {
    if (win) win.location.href = url;
    else window.open(url, '_blank', 'noopener');
    toast.info(`${kind === 'web' ? 'Web login' : 'Terminal'} opened for ${d.name || `device #${d.device_id}`} (link valid for a few minutes).`);
  } else {
    if (win) win.close();
    toast.error(res.data?.message || `Could not open the ${kind === 'web' ? 'web login' : 'terminal'}.`);
  }
};

const DeviceRow = ({ d, phone, compact }) => {
  const st = statusStyle(d.status);
  const olt = isOlt(d);
  const [busy, setBusy] = useState('');
  const canWeb = d.actions ? !!d.actions.web : true;
  const canTerm = d.actions ? !!d.actions.terminal : true;
  const buttons = (
    <View style={styles.btnRow}>
      <TouchableOpacity
        style={[styles.devBtn, !canWeb && styles.devBtnOff]}
        onPress={() => openSession('web', d, phone, setBusy)}
        disabled={!canWeb || !!busy}
        title={canWeb ? 'Open the device web page' : 'No web interface for this device'}
      >
        {busy === 'web' ? <ActivityIndicator size="small" color="#2563eb" /> : <Feather name="globe" size={12} color={canWeb ? '#2563eb' : '#94a3b8'} />}
        <Text style={[styles.devBtnText, { color: canWeb ? '#2563eb' : '#94a3b8' }]}>Web login</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.devBtn, { borderColor: 'rgba(15,23,42,0.25)' }, !canTerm && styles.devBtnOff]}
        onPress={() => openSession('terminal', d, phone, setBusy)}
        disabled={!canTerm || !!busy}
        title={canTerm ? 'Open a telnet/SSH terminal' : 'No login saved on the NMS for this device'}
      >
        {busy === 'terminal' ? <ActivityIndicator size="small" color="#0f172a" /> : <Feather name="terminal" size={12} color={canTerm ? '#0f172a' : '#94a3b8'} />}
        <Text style={[styles.devBtnText, { color: canTerm ? '#0f172a' : '#94a3b8' }]}>Terminal</Text>
      </TouchableOpacity>
    </View>
  );
  return (
    <View style={[styles.row, compact && { flexWrap: 'wrap' }]}>
      <View style={[styles.icon, { backgroundColor: olt ? 'rgba(14,165,233,0.12)' : 'rgba(99,102,241,0.12)' }]}>
        <Feather name={olt ? 'server' : 'git-branch'} size={15} color={olt ? '#0284c7' : '#4f46e5'} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name} numberOfLines={1}>{d.name || `Device #${d.device_id}`}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[d.model || d.type, d.ip, d.location].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View style={styles.stat}>
        <Text style={styles.statNum}>
          {olt ? `${d.stats?.onus_online ?? 0}/${d.stats?.onus_total ?? 0}` : `${d.stats?.ports_up ?? 0}/${d.stats?.ports_total ?? 0}`}
        </Text>
        <Text style={styles.statLbl}>{olt ? 'ONUs online' : 'Ports up'}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: st.bg }]}>
        <Text style={[styles.pillText, { color: st.fg }]}>{st.label}</Text>
      </View>
      {compact ? <View style={{ width: '100%', paddingLeft: 44 }}>{buttons}</View> : buttons}
    </View>
  );
};

export const PartnerDevices = ({ partner }) => {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const phone = String(partner?.partner_mobile || '').replace(/\D/g, '').slice(-10);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    if (!phone) {
      setError('This partner has no mobile number, so their devices cannot be looked up.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await OneBssApi.getNmsDevices(phone);
    if (res.ok) {
      setDevices(Array.isArray(res.data?.devices) ? res.data.devices : []);
    } else {
      setDevices([]);
      setError(res.data?.message || 'Could not load devices from the NMS.');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [phone]);

  const olts = devices.filter(isOlt);
  const switches = devices.filter((d) => !isOlt(d));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Feather name="server" size={16} color="#0284c7" />
        <Text style={styles.title}>Network Devices</Text>
        {!loading && !error ? <Text style={styles.count}>{olts.length} OLT · {switches.length} switch{switches.length === 1 ? '' : 'es'}</Text> : null}
        <TouchableOpacity onPress={load} disabled={loading} style={styles.reload} title="Reload devices">
          {loading ? <ActivityIndicator size="small" color="#0284c7" /> : <Feather name="rotate-cw" size={13} color="#0284c7" />}
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : loading && devices.length === 0 ? (
        <Text style={styles.muted}>Loading devices…</Text>
      ) : devices.length === 0 ? (
        <Text style={styles.muted}>No OLTs or switches are registered in the NMS for this operator ({phone}).</Text>
      ) : (
        <>
          {olts.length ? <Text style={styles.group}>OLTs</Text> : null}
          {olts.map((d) => <DeviceRow key={`o${d.device_id}`} d={d} phone={phone} compact={compact} />)}
          {switches.length ? <Text style={styles.group}>Switches</Text> : null}
          {switches.map((d) => <DeviceRow key={`s${d.device_id}`} d={d} phone={phone} compact={compact} />)}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', padding: 16, marginBottom: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  count: { fontSize: 12, color: '#64748b', marginLeft: 4 },
  reload: { marginLeft: 'auto', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(2,132,199,0.25)' },
  group: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  stat: { alignItems: 'flex-end', minWidth: 80 },
  statNum: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  statLbl: { fontSize: 10, color: '#64748b' },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  devBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(37,99,235,0.3)', backgroundColor: '#ffffff' },
  devBtnOff: { borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  devBtnText: { fontSize: 11, fontWeight: '700' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, minWidth: 64, alignItems: 'center' },
  pillText: { fontSize: 10, fontWeight: '700' },
  muted: { fontSize: 13, color: '#64748b' },
  error: { fontSize: 13, color: '#b45309' },
});
