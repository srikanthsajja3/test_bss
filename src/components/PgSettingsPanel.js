import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Switch, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../services/oneBssApi';

/**
 * Super admin › Online Payments › Gateway settings (pg/pg_settings.php).
 * Which payment gateway operators may use to top up which wallet:
 *   rows = wallets (Main / Internet / IPTV / OTT), columns = gateways (PayU, Razorpay, HDFC…).
 * A gateway whose keys are not on the server can be switched on but is not offered until it is set up.
 */
const KIND_INFO = {
  Single: { label: 'Main wallet', sub: 'Every partner; pays services without their own wallet', icon: 'credit-card', fg: '#059669' },
  Internet: { label: 'Internet wallet', sub: 'Partners with an own Internet wallet', icon: 'wifi', fg: '#2563eb' },
  IPTV: { label: 'IPTV wallet', sub: 'Partners with an own IPTV wallet', icon: 'tv', fg: '#7c3aed' },
  OTT: { label: 'OTT wallet', sub: 'Partners with an own OTT wallet', icon: 'play-circle', fg: '#0891b2' },
};

export const PgSettingsPanel = () => {
  const { width } = useWindowDimensions();
  const narrow = width < 700;
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setError('');
    const res = await OneBssApi.getPgSettings();
    if (!res.ok) {
      setError(res.data?.message || 'Could not load the settings');
      return;
    }
    setData(res.data);
    setMatrix(JSON.parse(JSON.stringify(res.data.matrix || {})));
    setDirty(false);
  };
  useEffect(() => {
    load();
  }, []);

  const toggle = (kind, gw) => {
    setMatrix((m) => ({ ...m, [kind]: { ...(m[kind] || {}), [gw]: !(m[kind] || {})[gw] } }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const res = await OneBssApi.savePgSettings(matrix);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not save');
      return;
    }
    toast.success('Payment gateways saved');
    setData((d) => ({ ...d, matrix: res.data.matrix }));
    setMatrix(res.data.matrix);
    setDirty(false);
  };

  if (error) return <Text style={s.err}>{error}</Text>;
  if (!data) return <ActivityIndicator color="#0284c7" style={{ marginVertical: 30 }} />;

  const gateways = data.gateways || [];
  const kinds = data.kinds || Object.keys(KIND_INFO);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={s.h2}>Which gateway tops up which wallet</Text>
          <Text style={s.sub}>Operators only see the gateways switched on for the wallet they are adding money to.</Text>
        </View>
        <TouchableOpacity style={[s.saveBtn, (!dirty || saving) && { opacity: 0.5 }]} onPress={save} disabled={!dirty || saving}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={14} color="#fff" />}
          <Text style={s.saveText}>Save</Text>
        </TouchableOpacity>
      </View>

      {!data.ready ? (
        <View style={s.warn}>
          <Feather name="alert-triangle" size={14} color="#92400e" />
          <Text style={s.warnText}>Run migrations/wallet_split.sql on the database to save these settings.</Text>
        </View>
      ) : null}

      {/* header row */}
      {!narrow ? (
        <View style={[s.row, s.thRow]}>
          <Text style={[s.th, { flex: 1.4 }]}>Wallet</Text>
          {gateways.map((g) => (
            <View key={g.id} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.th}>{g.label}</Text>
              <Text style={[s.thSub, !g.configured && !g.coming_soon && { color: '#b45309' }]}>
                {g.coming_soon ? 'Coming soon' : g.configured ? 'Set up' : 'Keys missing'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {kinds.map((k) => {
        const info = KIND_INFO[k] || { label: k, sub: '', icon: 'credit-card', fg: '#334155' };
        return (
          <View key={k} style={[s.row, narrow && { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
            <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.icon, { backgroundColor: `${info.fg}14` }]}><Feather name={info.icon} size={15} color={info.fg} /></View>
              <View>
                <Text style={s.kind}>{info.label}</Text>
                <Text style={s.kindSub}>{info.sub}</Text>
              </View>
            </View>
            {gateways.map((g) => {
              const on = !!(matrix[k] || {})[g.id];
              return (
                <View key={g.id} style={[{ flex: 1, alignItems: 'center' }, narrow && { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 44 }]}>
                  {narrow ? <Text style={s.kindSub}>{g.label}{g.coming_soon ? ' (coming soon)' : !g.configured ? ' (keys missing)' : ''}</Text> : null}
                  <Switch
                    value={on && !g.coming_soon}
                    onValueChange={() => toggle(k, g.id)}
                    disabled={g.coming_soon}
                    trackColor={{ false: '#cbd5e1', true: '#7dd3fc' }}
                    thumbColor={on && !g.coming_soon ? '#0284c7' : '#f8fafc'}
                    activeThumbColor="#0284c7"
                  />
                </View>
              );
            })}
          </View>
        );
      })}

      <Text style={[s.sub, { padding: 14 }]}>
        Keys are set on the server (onebss-secrets.php): PayU — PAYU_KEY / PAYU_SALT; Razorpay — RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. HDFC will be added here when it is ready.
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexWrap: 'wrap' },
  h2: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0284c7', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', margin: 14, padding: 10, borderRadius: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  warnText: { fontSize: 12.5, color: '#92400e', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 9 },
  th: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 },
  thSub: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kind: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  kindSub: { fontSize: 11.5, color: '#64748b' },
  err: { fontSize: 13, color: '#b91c1c', padding: 14 },
});
