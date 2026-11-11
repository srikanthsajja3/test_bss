import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';

/**
 * Super admin: which services have their OWN wallet for this partner (wallet_mode.php), like KYC providers.
 * The main wallet is always there and pays every service that has no own wallet.
 * Switching a wallet off moves its balance to the main wallet (asked first).
 */
export const OWN_WALLETS = [
  { id: 'Internet', title: 'Internet wallet', desc: 'Internet recharges, and the Internet part of combos', icon: 'wifi', color: '#2563eb' },
  { id: 'IPTV', title: 'IPTV wallet', desc: 'IPTV recharges and add-ons, and the IPTV part of combos', icon: 'tv', color: '#7c3aed' },
  { id: 'OTT', title: 'OTT wallet', desc: 'OTT recharges', icon: 'play-circle', color: '#0891b2' },
];

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "Main wallet only" / "Main + IPTV, OTT" for tiles. */
export const walletSettingsHint = (own) => (own && own.length ? `Main + ${own.join(', ')}` : 'Main wallet only');

export const WalletSettingsModal = ({ visible, partner, onClose, onSaved }) => {
  const pid = partner?.partner_id || partner?.id;
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState(null);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // dry-run answer waiting for "yes"

  useEffect(() => {
    if (!visible || !pid) return;
    setInfo(null); setConfirm(null); setLoading(true);
    OneBssApi.getWalletMode(pid).then((res) => {
      setLoading(false);
      if (!res.ok) { toast.error(res.data?.message || 'Could not load the wallets'); return; }
      setInfo(res.data);
      setPicked(res.data.own_wallets || []);
    });
  }, [visible, pid]);

  const balanceOf = (t) => Number((info?.wallets || []).find((w) => w.type === t)?.balance || 0);
  const toggle = (id) => { setConfirm(null); setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); };
  const changed = info && [...picked].sort().join(',') !== [...(info.own_wallets || [])].sort().join(',');

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    if (!confirm) {
      const dry = await OneBssApi.setOwnWallets(pid, picked, true);
      if (!dry.ok) { setSaving(false); toast.error(dry.data?.message || 'Could not check the change'); return; }
      if ((dry.data.moved || []).length) { setSaving(false); setConfirm(dry.data); return; } // ask first: money moves
    }
    const res = await OneBssApi.setOwnWallets(pid, picked);
    setSaving(false);
    if (!res.ok) { toast.error(res.data?.message || 'Could not save'); return; }
    toast.success(res.data.message || 'Saved');
    onSaved && onSaved(res.data);
    onClose();
  };

  return (
    <ModalShell
      visible={visible}
      title={`Wallets · ${partner?.partner_name || ''}`}
      icon="credit-card"
      iconColor="#059669"
      onClose={onClose}
      maxWidth={540}
      busy={saving}
      footer={(
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label={confirm ? 'Yes, move and save' : 'Save wallets'} icon="check" onPress={save} loading={saving} disabled={!changed || loading} />
        </>
      )}
    >
      {loading || !info ? <ActivityIndicator color="#059669" style={{ marginVertical: 24 }} /> : (
        <View style={{ gap: 10 }}>
          {info.ready === false ? <Note tone="error" text="Run migrations/wallet_split.sql and migrations/wallet_per_service.sql on the server first." /> : null}
          <Note tone="info" text="Switch on a wallet for each service this operator should pay from separately. Services without their own wallet are paid from the main wallet." />
          <View style={[s.row, s.rowLocked]}>
            <Feather name="check-square" size={18} color="#94a3b8" />
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Main wallet <Text style={s.always}>· always on</Text></Text>
              <Text style={s.desc}>{picked.length === 3 ? 'Not used for recharges while all three services have their own wallet' : `Pays: ${['Internet', 'IPTV', 'OTT'].filter((t) => !picked.includes(t)).join(', ') || '—'}`}</Text>
            </View>
            <Text style={s.bal}>{rupees(balanceOf('Single'))}</Text>
          </View>
          {OWN_WALLETS.map((w) => {
            const on = picked.includes(w.id);
            const wasOn = (info.own_wallets || []).includes(w.id);
            return (
              <TouchableOpacity key={w.id} style={[s.row, on && { borderColor: w.color, backgroundColor: `${w.color}0d` }]} onPress={() => toggle(w.id)}>
                <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? w.color : '#94a3b8'} />
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${w.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={w.icon} size={15} color={w.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{w.title}</Text>
                  <Text style={s.desc}>{w.desc}</Text>
                </View>
                {wasOn ? <Text style={s.bal}>{rupees(balanceOf(w.id))}</Text> : null}
              </TouchableOpacity>
            );
          })}
          {confirm ? (
            <Note
              tone="warn"
              text={`Switching off moves the money to the main wallet: ${(confirm.moved || []).map((m) => `${rupees(m.amount)} from the ${m.from} wallet`).join('; ')}. Both sides are written to the wallet history.`}
            />
          ) : null}
        </View>
      )}
    </ModalShell>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  rowLocked: { backgroundColor: '#f8fafc' },
  title: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  always: { fontSize: 11.5, fontWeight: '600', color: '#94a3b8' },
  desc: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  bal: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
});
