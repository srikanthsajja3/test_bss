import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note } from '../internet/shared';
import { formatApiDate } from '../CustomerAccountsOverview';

export const OTT = '#0ea5e9';
const money = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? '—' : `₹${n.toFixed(2)}`;
};

/**
 * OTT Recharge / Advance Renewal. Packages come from ott_recharge_plans.php at the operator's
 * price. While the current package is running only that package + duration can be renewed.
 *
 * Props: visible, onClose, account (raw ott_accounts[i]), onConfirm(subPlanId, plan) -> Promise<boolean>
 */
export const OttRechargeModal = ({ visible, onClose, account, onConfirm }) => {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState([]);
  const [acc, setAcc] = useState(null);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !account) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setSelected(null);
      const res = await OneBssApi.getOttRechargePlans(account.id);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.data?.message || `Could not load OTT packages (HTTP ${res.status}).`);
        return;
      }
      const d = res.data?.data || {};
      setPlans(d.plans || []);
      setAcc(d.account || null);
      // advance renewal: preselect the current package
      if (d.account?.is_active && d.account?.sub_plan_id) setSelected(d.account.sub_plan_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, account?.id]);

  const isAdvance = !!acc?.is_active;
  const plan = plans.find((p) => p.sub_plan_id === selected) || null;

  const confirm = async () => {
    if (!plan || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(plan.sub_plan_id, plan);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!account) return null;

  const table = (
    <View style={{ flex: 1 }}>
      <View style={[styles.tr, styles.thRow]}>
        <Text style={[styles.th, { width: 30 }]} />
        <Text style={[styles.th, { flex: 1.6 }]}>Package</Text>
        <Text style={[styles.th, { width: 90 }]}>Duration</Text>
        <Text style={[styles.th, { width: 70 }]}>Screens</Text>
        <Text style={[styles.th, { width: 90, textAlign: 'right' }]}>Price</Text>
      </View>
      {plans.length === 0 ? (
        <Text style={[styles.muted, { padding: 14 }]}>No OTT packages are assigned to this operator yet. Ask your admin to map them under Partners › OTT Plans.</Text>
      ) : (
        plans.map((p) => {
          const on = p.sub_plan_id === selected;
          const locked = isAdvance && p.sub_plan_id !== acc?.sub_plan_id;
          return (
            <TouchableOpacity
              key={p.sub_plan_id}
              style={[styles.tr, on && styles.trOn, locked && { opacity: 0.45 }]}
              onPress={() => !locked && !submitting && setSelected(p.sub_plan_id)}
              disabled={locked || submitting}
            >
              <View style={{ width: 30 }}>
                <View style={[styles.radio, on && { borderColor: OTT }]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </View>
              <View style={{ flex: 1.6, minWidth: 0, paddingRight: 8 }}>
                <Text style={[styles.td, { fontWeight: '700' }]} numberOfLines={1}>{p.plan_name}</Text>
                {p.providers_list ? <Text style={styles.tdSub} numberOfLines={2}>{p.providers_list}</Text> : null}
              </View>
              <Text style={[styles.td, { width: 90 }]}>{p.duration}</Text>
              <Text style={[styles.td, { width: 70 }]}>{p.screens ?? '—'}</Text>
              <Text style={[styles.td, { width: 90, textAlign: 'right', fontWeight: '800' }]}>{money(p.price)}</Text>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  return (
    <ModalShell
      visible={visible}
      title={`${isAdvance ? 'Advance Renewal' : 'Recharge'} — OTT ${account.subscriber_id || `#${account.id}`}`}
      icon={isAdvance ? 'fast-forward' : 'play-circle'}
      iconColor={OTT}
      onClose={onClose}
      maxWidth={wide ? 760 : 640}
      busy={submitting}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={submitting} />
          <Btn
            label={`${isAdvance ? 'Confirm Advance Renewal' : 'Confirm Recharge'}${plan ? ` · ${money(plan.price)}` : ''}`}
            kind="orange"
            onPress={confirm}
            loading={submitting}
            disabled={!plan || loading}
          />
        </>
      }
    >
      <View style={styles.headerStrip}>
        <KV label="Current package" value={acc?.package_name ? `${acc.package_name} · ${acc.duration || ''}` : 'None yet'} />
        <KV label="Current expiry" value={acc?.expiration ? formatApiDate(acc.expiration) : 'Not active'} />
        <KV label="Type" value={isAdvance ? 'Advance renewal (package still running)' : 'Recharge'} />
      </View>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={OTT} />
          <Text style={styles.muted}>Loading OTT packages…</Text>
        </View>
      ) : error ? (
        <Note tone="error" text={error} />
      ) : (
        <>
          {isAdvance ? <Note tone="info" text="The current package is still running, so only it can be renewed in advance. Other packages can be chosen after it expires." /> : null}
          <View style={styles.tableBox}>
            {wide ? table : <ScrollView horizontal contentContainerStyle={{ width: 560 }}>{table}</ScrollView>}
          </View>
          <Note text="The wallet is debited when the recharge starts. If OTTAggre does not confirm it, the account shows Recheck." />
        </>
      )}
    </ModalShell>
  );
};

const styles = StyleSheet.create({
  muted: { fontSize: 12, color: '#64748b' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  headerStrip: { padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', marginBottom: 10 },
  tableBox: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden', marginTop: 10 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#ffffff' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 8 },
  trOn: { backgroundColor: '#f0f9ff' },
  th: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 12, color: COLORS.textMain },
  tdSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: OTT },
});
