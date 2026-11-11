import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';

/**
 * Super admin › partner › Payment Gateways (pg/pg_settings.php), like KYC providers:
 * which gateways this operator may use to add money, per wallet.
 *   one wallet:        Wallet          x PayU / Razorpay / HDFC
 *   separate wallets:  Internet / IPTV / OTT  x PayU / Razorpay / HDFC
 * Nothing ticked for a wallet = no online top-up for it (the operator is told to contact the admin).
 */
const KIND = {
  Single: { label: 'Wallet', sub: 'One wallet for Internet, IPTV and OTT', icon: 'credit-card', fg: '#059669' },
  Internet: { label: 'Internet wallet', sub: 'Pays Internet recharges and the Internet part of combos', icon: 'wifi', fg: '#2563eb' },
  IPTV: { label: 'IPTV wallet', sub: 'Pays IPTV recharges and the IPTV part of combos', icon: 'tv', fg: '#7c3aed' },
  OTT: { label: 'OTT wallet', sub: 'Pays OTT recharges', icon: 'play-circle', fg: '#0891b2' },
};

/** Tile hint on the partner page (the switches themselves load when the popup opens). */
export const pgGatewaysHint = (p) => (p?.wallet_mode === 'split' ? 'Per wallet: Internet / IPTV / OTT' : 'Which gateways add money to the wallet');

export const PgGatewaysModal = ({ visible, partner, onClose }) => {
  const pid = partner?.partner_id || partner?.id;
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !pid) return;
    setData(null); setError('');
    OneBssApi.getPgSettings(pid).then((res) => {
      if (!res.ok) { setError(res.data?.message || 'Could not load the payment gateways'); return; }
      setData(res.data);
      setMatrix(JSON.parse(JSON.stringify(res.data.matrix || {})));
    });
  }, [visible, pid]);

  const kinds = data?.kinds || [];
  const gateways = data?.gateways || [];
  const toggle = (k, g) => setMatrix((m) => ({ ...m, [k]: { ...(m[k] || {}), [g]: !(m[k] || {})[g] } }));
  const noneFor = kinds.filter((k) => !gateways.some((g) => !g.coming_soon && (matrix[k] || {})[g.id]));

  const save = async () => {
    setSaving(true);
    // send only this operator's current wallets (switches of the other wallet mode stay as they are)
    const out = {};
    kinds.forEach((k) => { out[k] = {}; gateways.forEach((g) => { if (!g.coming_soon) out[k][g.id] = !!(matrix[k] || {})[g.id]; }); });
    const res = await OneBssApi.savePgSettings(pid, out);
    setSaving(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not save'); return; }
    toast.success(`Payment gateways saved for ${partner?.partner_name || 'the operator'}`);
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      title={`Payment Gateways · ${partner?.partner_name || ''}`}
      icon="credit-card"
      iconColor="#0284c7"
      onClose={onClose}
      maxWidth={620}
      busy={saving}
      footer={(
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Save gateways" icon="check" onPress={save} loading={saving} disabled={!data} />
        </>
      )}
    >
      {error ? <Note tone="error" text={error} /> : null}
      {!data && !error ? <ActivityIndicator color="#0284c7" style={{ marginVertical: 24 }} /> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          {data.ready === false ? <Note tone="error" text="Run migrations/partner_pg_mapping.sql on the server first." /> : null}
          <Note
            tone="info"
            text={data.wallet_mode === 'split'
              ? 'This operator has separate Internet, IPTV and OTT wallets. Tick the gateways it may use to add money to each.'
              : 'This operator has one wallet. Tick the gateways it may use to add money to it.'}
          />
          {kinds.map((k) => {
            const info = KIND[k] || KIND.Single;
            return (
              <View key={k} style={s.card}>
                <View style={s.head}>
                  <View style={[s.icon, { backgroundColor: `${info.fg}18` }]}><Feather name={info.icon} size={15} color={info.fg} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{info.label}</Text>
                    <Text style={s.sub}>{info.sub}</Text>
                  </View>
                </View>
                <View style={s.gwRow}>
                  {gateways.map((g) => {
                    const on = !g.coming_soon && !!(matrix[k] || {})[g.id];
                    return (
                      <TouchableOpacity
                        key={g.id}
                        disabled={g.coming_soon}
                        onPress={() => toggle(k, g.id)}
                        style={[s.gw, on && { borderColor: info.fg, backgroundColor: `${info.fg}0d` }, g.coming_soon && { opacity: 0.55 }]}
                      >
                        <Feather name={on ? 'check-square' : 'square'} size={17} color={on ? info.fg : '#94a3b8'} />
                        <View style={{ flexShrink: 1 }}>
                          <Text style={s.gwName}>{g.label}</Text>
                          <Text style={[s.gwSub, !g.coming_soon && !g.configured && { color: '#b45309' }]}>
                            {g.coming_soon ? 'Coming soon' : g.configured ? g.sub : 'Keys not set on the server'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
          {noneFor.length ? (
            <Note
              tone="warn"
              text={`No gateway for the ${noneFor.map((k) => (KIND[k] || KIND.Single).label).join(', ')}: the operator can't add money to it online and is told to contact the admin.`}
            />
          ) : null}
        </View>
      ) : null}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, gap: 10, backgroundColor: '#ffffff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  gwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gw: { flexGrow: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  gwName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  gwSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
});
