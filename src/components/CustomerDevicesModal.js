import React, { useState, useEffect } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { OneBssApi } from '../services/oneBssApi';

// ONU details for one internet account (read-only).
// Source: olt/internet_get_onu_details.php — RADIUS gives the customer's MAC, the NMS says which
// OLT / PON / ONU (and switch port) it sits behind, with the last optical readings.
// No web login or terminal here: device access lives on the Partners page.

const val = (v, suffix = '') => (v === null || v === undefined || v === '' ? '—' : `${v}${suffix}`);

// Typical GPON/EPON receive window: good above -25 dBm, weak down to -28, bad below that.
const rxTone = (dbm) => {
  const n = Number(dbm);
  if (dbm === null || dbm === undefined || dbm === '' || Number.isNaN(n)) return { fg: '#334155', label: '' };
  if (n >= -25) return { fg: '#15803d', label: 'Good' };
  if (n >= -28) return { fg: '#b45309', label: 'Weak' };
  return { fg: '#dc2626', label: 'Low' };
};

const ago = (seconds) => {
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};

const Row = ({ label, value, valueStyle }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, valueStyle]} selectable>{value}</Text>
  </View>
);

const Block = ({ icon, title, children }) => (
  <View style={styles.block}>
    <View style={styles.blockHead}>
      <Feather name={icon} size={14} color="#0284c7" />
      <Text style={styles.blockTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

export const CustomerDevicesModal = ({ visible, onClose, customer, inline = false }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // ONU not mapped: no MAC bound in RADIUS yet, or the MAC is not seen on any OLT / switch
  const [notMapped, setNotMapped] = useState('');

  const internetId = customer?.internet_id || customer?.internet_accounts?.[0]?.internet_id || null;
  const title = customer?.username || customer?.full_name || customer?.name || (internetId ? `Internet #${internetId}` : 'Subscriber');

  const load = async (live = false) => {
    if (!internetId) {
      setError('This subscriber has no internet account, so there is no ONU to show.');
      return;
    }
    setLoading(true);
    setError('');
    setNotMapped('');
    const res = await OneBssApi.getOnuDetails(internetId, live);
    if (res.ok && res.data?.found === false) {
      setData(res.data);
      setNotMapped(`MAC ${res.data.mac || ''} is not seen on any OLT or switch yet.`.replace('MAC  is', 'The MAC is'));
    } else if (res.ok) {
      setData(res.data);
    } else if (res.status === 404 || res.status === 422) {
      // 404: no MAC bound for this connection; 422: MAC on file is invalid
      setData(null);
      setNotMapped(res.data?.message || 'No MAC address is bound to this connection yet.');
    } else {
      setData(null);
      setError(res.data?.message || 'Could not fetch ONU details.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (visible) {
      setData(null);
      load(false);
    }
  }, [visible, internetId]);

  if (!visible) return null;

  const found = data?.found;
  const onu = data?.onu || {};
  const olt = data?.olt || {};
  const opt = data?.optical || {};
  const sw = data?.switch;
  const fresh = data?.freshness || {};
  const rx = rxTone(opt.rx_power_dbm);
  const onuOnline = String(onu.status || '').toLowerCase();
  const isUp = ['online', 'up', 'working', 'active'].includes(onuOnline);

  // inline: a card inside the account page (ONU Details tab); otherwise a modal
  const wrap = (children) => (inline ? (
    <View style={[styles.card, { width: '100%', maxHeight: undefined, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }]}>{children}</View>
  ) : (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { width: isMobile ? '96%' : 640 }]}>{children}</View>
      </View>
    </Modal>
  ));

  return wrap(
    <>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <View style={styles.headerIcon}><Feather name="hard-drive" size={18} color="#0284c7" /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>ONU details</Text>
                <Text style={styles.sub} numberOfLines={1}>{title}{data?.mac ? ` · MAC ${data.mac}` : ''}</Text>
              </View>
            </View>
            {inline ? null : <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Feather name="x" size={20} color="#64748b" /></TouchableOpacity>}
          </View>

          <ScrollView style={[styles.body, inline && { maxHeight: undefined }]}>
            {loading && !data ? (
              <View style={styles.center}><ActivityIndicator size="small" color="#0284c7" /><Text style={styles.muted}>Looking up the ONU…</Text></View>
            ) : notMapped ? (
              <View style={styles.notMapped}>
                <View style={styles.notMappedIcon}><Feather name="link-2" size={22} color="#b45309" /></View>
                <Text style={styles.notMappedTitle}>ONU not mapped</Text>
                <Text style={styles.notMappedText}>{notMapped}</Text>
                <Text style={styles.notMappedHint}>
                  Once the customer's router is online and its MAC is bound in RADIUS, the ONU appears here. Use “Read live from OLT” to check again.
                </Text>
              </View>
            ) : error ? (
              <View style={styles.notice}><Feather name="info" size={14} color="#b45309" /><Text style={styles.noticeText}>{error}</Text></View>
            ) : data ? (
              <>
                <View style={styles.statusStrip}>
                  <View style={[styles.statusPill, { backgroundColor: isUp ? '#dcfce7' : '#f1f5f9' }]}>
                    <View style={[styles.dot, { backgroundColor: isUp ? '#16a34a' : '#94a3b8' }]} />
                    <Text style={[styles.statusText, { color: isUp ? '#15803d' : '#475569' }]}>{val(onu.status).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.rxBig, { color: rx.fg }]}>{val(opt.rx_power_dbm, ' dBm')}</Text>
                  {rx.label ? <Text style={[styles.rxLabel, { color: rx.fg }]}>RX {rx.label}</Text> : null}
                  <Text style={styles.freshText}>
                    {fresh.data_age_seconds !== undefined && fresh.data_age_seconds !== null ? `Read ${ago(fresh.data_age_seconds)}` : ''}
                    {fresh.stale ? ' · may be outdated' : ''}
                  </Text>
                </View>

                <Block icon="cpu" title="ONU">
                  <Row label="Name" value={val(onu.name)} />
                  <Row label="Interface / PON" value={val(onu.interface || onu.pon)} />
                  <Row label="ONU ID" value={val(onu.id)} />
                  <Row label="Model / type" value={val(onu.type)} />
                  <Row label="Serial / physical ID" value={val(onu.serial || onu.physical_id)} />
                  <Row label="ONU MAC" value={val(onu.onu_mac)} />
                  <Row label="VLAN" value={val(onu.vlan)} />
                </Block>

                <Block icon="activity" title="Optical">
                  <Row label="RX power" value={val(opt.rx_power_dbm, ' dBm')} valueStyle={{ color: rx.fg, fontWeight: '700' }} />
                  <Row label="TX power" value={val(opt.tx_power_dbm, ' dBm')} />
                  <Row label="Temperature" value={val(opt.temperature_c, ' °C')} />
                  <Row label="Voltage" value={val(opt.voltage_v, ' V')} />
                  <Row label="Bias current" value={val(opt.bias_ma, ' mA')} />
                </Block>

                <Block icon="server" title="OLT">
                  <Row label="OLT" value={val(olt.name)} />
                  <Row label="IP" value={val(olt.ip)} />
                  <Row label="Location" value={val(olt.location)} />
                </Block>

                {sw ? (
                  <Block icon="git-branch" title="Switch port">
                    <Row label="Switch" value={val(sw.device_name)} />
                    <Row label="Port" value={val(sw.port)} />
                    <Row label="VLAN" value={val(sw.vlan)} />
                    <Row label="Last seen" value={val(sw.last_seen)} />
                  </Block>
                ) : null}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.btnPrimary, (loading || !internetId) && { opacity: 0.6 }]} onPress={() => load(true)} disabled={loading || !internetId}>
              {loading ? <ActivityIndicator size="small" color="#ffffff" /> : <Feather name="refresh-cw" size={13} color="#ffffff" />}
              <Text style={styles.btnPrimaryText}>{loading ? 'Reading…' : 'Read live from OLT'}</Text>
            </TouchableOpacity>
            {inline ? null : (
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose}>
                <Text style={styles.btnGhostText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
    </>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, maxHeight: '92%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(14,165,233,0.12)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 6 },
  body: { padding: 16 },
  center: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  muted: { fontSize: 12, color: '#64748b' },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  noticeText: { flex: 1, fontSize: 13, color: '#92400e' },
  statusStrip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: 12, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rxBig: { fontSize: 20, fontWeight: '700' },
  rxLabel: { fontSize: 11, fontWeight: '700' },
  freshText: { fontSize: 11, color: '#64748b', marginLeft: 'auto' },
  notMapped: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12 },
  notMappedIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(245,158,11,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  notMappedTitle: { fontSize: 16, fontWeight: '700', color: '#92400e' },
  notMappedText: { fontSize: 13, color: '#475569', marginTop: 6, textAlign: 'center' },
  notMappedHint: { fontSize: 12, color: '#64748b', marginTop: 8, textAlign: 'center', maxWidth: 420 },
  block: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, marginBottom: 10 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  blockTitle: { fontSize: 12, fontWeight: '700', color: '#0f172a', letterSpacing: 0.3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  rowLabel: { fontSize: 12, color: '#64748b' },
  rowValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  btnPrimary: { backgroundColor: '#0284c7' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#cbd5e1' },
  btnGhostText: { color: '#334155', fontSize: 13, fontWeight: '700' },
});
