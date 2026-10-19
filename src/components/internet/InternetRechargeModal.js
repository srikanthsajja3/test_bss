import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note, Dropdown } from './shared';
import { formatApiDate } from '../CustomerAccountsOverview';

const money = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? '—' : `₹${n.toFixed(2)}`;
};

// Keep only sub-plans with is_mapped === true, and drop plans left with none.
export const filterMappedPlans = (plans) =>
  (Array.isArray(plans) ? plans : [])
    .map((p) => ({
      ...p,
      subplans: (Array.isArray(p.subplans) ? p.subplans : []).filter((sp) => sp.is_mapped === true || sp.is_mapped === 1 || sp.is_mapped === '1'),
    }))
    .filter((p) => p.subplans.length > 0);

/**
 * Recharge / Advance Renewal modal for one internet account.
 * Plans come from internet_plan_mapping.php?partner_id=<account's operator>, filtered to mapped
 * sub-plans. The account's current package / sub-plan (from customer_lookup) is pre-selected
 * when it is mapped; the user can pick any other mapped package + sub-plan.
 *
 * Props:
 *  visible, onClose
 *  account      raw internet_accounts[i] (internet_id, partner_id, package_id, subplan_id, username, expiration…)
 *  advance      true = Advance Renewal (plan still running), false = Recharge
 *  onConfirm(packageId, subPlanId) -> Promise<boolean>   performs the recharge; true closes the modal
 */
export const InternetRechargeModal = ({ visible, onClose, account, advance, onConfirm }) => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [planId, setPlanId] = useState(null);
  const [subPlanId, setSubPlanId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentNotMapped, setCurrentNotMapped] = useState(false);

  useEffect(() => {
    if (!visible || !account) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      setPlans([]);
      setPlanId(null);
      setSubPlanId(null);
      setCurrentNotMapped(false);
      try {
        const res = await OneBssApi.getInternetPlans(account.partner_id);
        if (cancelled) return;
        const body = res.data || {};
        if (!res.ok || body.success === false) {
          setLoadError(body.message || `Could not load plans (HTTP ${res.status}).`);
          return;
        }
        const mapped = filterMappedPlans(Array.isArray(body.data) ? body.data : body.data?.data);
        setPlans(mapped);
        if (mapped.length === 0) return;

        // Pre-select the account's current package / sub-plan if it is mapped
        const curPlan = mapped.find((p) => String(p.plan_id) === String(account.package_id));
        const curSub = curPlan?.subplans.find((sp) => String(sp.sub_plan_id) === String(account.subplan_id));
        if (curPlan && curSub) {
          setPlanId(curPlan.plan_id);
          setSubPlanId(curSub.sub_plan_id);
        } else if (advance) {
          // Advance renewal is only for the current package — nothing to pre-select.
          setCurrentNotMapped(true);
        } else {
          setCurrentNotMapped(true);
          const p = curPlan || mapped[0];
          setPlanId(p.plan_id);
          setSubPlanId(p.subplans[0].sub_plan_id);
        }
      } catch (e) {
        if (!cancelled) setLoadError('Could not load plans.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, account?.internet_id, account?.partner_id]);

  const selectedPlan = useMemo(() => plans.find((p) => p.plan_id === planId) || null, [plans, planId]);
  const selectedSub = useMemo(() => selectedPlan?.subplans.find((sp) => sp.sub_plan_id === subPlanId) || null, [selectedPlan, subPlanId]);
  const isChange = selectedPlan && (String(selectedPlan.plan_id) !== String(account?.package_id) || String(selectedSub?.sub_plan_id) !== String(account?.subplan_id));

  const choosePlan = (p) => {
    if (submitting) return;
    setPlanId(p.plan_id);
    // keep the same duration if the new plan has one, else first sub-plan
    const sameValidity = p.subplans.find((sp) => selectedSub && sp.plan_validity === selectedSub.plan_validity);
    setSubPlanId((sameValidity || p.subplans[0]).sub_plan_id);
  };

  const confirm = async () => {
    if (!selectedPlan || !selectedSub || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(selectedPlan.plan_id, selectedSub.sub_plan_id);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!account) return null;
  const title = advance ? 'Advance Renewal' : 'Recharge';
  const currentPlanText = [account.package_name || (account.package_id ? `Package #${account.package_id}` : ''), account.subplan_name || (account.subplan_id ? `Sub plan #${account.subplan_id}` : '')].filter(Boolean).join(' · ');

  return (
    <ModalShell
      visible={visible}
      title={`${title} — ${account.username || `Internet #${account.internet_id}`}`}
      icon={advance ? 'fast-forward' : 'refresh-cw'}
      iconColor="#f97316"
      onClose={onClose}
      maxWidth={560}
      busy={submitting}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={submitting} />
          <Btn
            label={advance ? 'Confirm Advance Renewal' : 'Confirm Recharge'}
            kind="orange"
            onPress={confirm}
            loading={submitting}
            disabled={!selectedSub || loading || (advance && currentNotMapped)}
          />
        </>
      }
    >
      <View style={styles.summary}>
        <KV label="Current plan" value={currentPlanText} />
        <KV label="Current expiry" value={formatApiDate(account.expiration)} />
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.muted}>Loading plans…</Text>
        </View>
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : plans.length === 0 ? (
        <Note text="No internet plans are mapped to this operator yet. Ask your admin to map plans before recharging." />
      ) : (
        advance ? (
          // ADVANCE RENEWAL: the current package only — no package / duration choice.
          currentNotMapped || !selectedSub ? (
            <Note
              tone="error"
              text="This account's current package is not in this operator's plan list, so it cannot be renewed in advance. Ask the admin to map the package, or recharge with a new package after the plan expires."
            />
          ) : (
            <>
              <View style={[styles.summary, { marginTop: 16 }]}>
                <KV label="Renewing" value={`${selectedPlan.plan_name} · ${selectedSub.sub_plan_name}`} bold />
                <KV label="Validity" value={`${selectedSub.plan_validity} days, added after the current expiry`} />
                <KV label="Wallet debit" value={money(selectedSub.mapped_price ?? selectedSub.base_price)} bold />
              </View>
              <Note
                tone="info"
                text={`Advance renewal keeps the current package. The new period starts when the current one ends (${formatApiDate(account.expiration)}). To change the package, recharge after it expires.`}
              />
            </>
          )
        ) : (
        <>
          {currentNotMapped ? (
            <Note tone="info" text="The account's current plan is not mapped for this operator, so another plan has been pre-selected. Please confirm the package and sub plan." />
          ) : null}

          <Text style={styles.sectionLabel}>PACKAGE ({plans.length})</Text>
          <Dropdown
            value={planId}
            disabled={submitting}
            options={plans.map((p) => ({
              value: p.plan_id,
              label: `${p.plan_name}${p.data ? ` · ${p.data}` : ''}${String(p.plan_id) === String(account.package_id) ? '  (current)' : ''}`,
            }))}
            onChange={(id) => {
              const p = plans.find((x) => x.plan_id === id);
              if (p) choosePlan(p);
            }}
          />

          {selectedPlan ? (
            <>
              <Text style={styles.sectionLabel}>SUB PLAN ({selectedPlan.subplans.length})</Text>
              <Dropdown
                value={subPlanId}
                disabled={submitting}
                options={selectedPlan.subplans.map((sp) => ({
                  value: sp.sub_plan_id,
                  label: `${sp.sub_plan_name} — ${sp.plan_validity} days — ${money(sp.mapped_price ?? sp.base_price)}${String(selectedPlan.plan_id) === String(account.package_id) && String(sp.sub_plan_id) === String(account.subplan_id) ? '  (current)' : ''}`,
                }))}
                onChange={(id) => setSubPlanId(id)}
              />
            </>
          ) : null}

          {selectedSub ? (
            <View style={[styles.summary, { marginTop: 16 }]}>
              <KV label="New plan" value={`${selectedPlan.plan_name} · ${selectedSub.sub_plan_name}`} bold />
              <KV label="Validity" value={`${selectedSub.plan_validity} days`} />
              <KV label="Wallet debit" value={money(selectedSub.mapped_price ?? selectedSub.base_price)} bold />

            </View>
          ) : null}

          <Note
            text={
              'Recharge: the plan starts now.' +
              (isChange ? ' The account will be moved to the selected package.' : '') +
              ' The operator wallet is debited immediately.'
            }
          />
        </>
        )
      )}
    </ModalShell>
  );
};

const styles = StyleSheet.create({
  summary: { padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  muted: { fontSize: 11, color: '#64748b', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
});
