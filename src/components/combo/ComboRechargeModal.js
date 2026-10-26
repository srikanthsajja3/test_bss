import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note, isAccountVerified, SearchBox, matchesSearch } from '../internet/shared';
import { parseApiDate, formatApiDate } from '../CustomerAccountsOverview';
import { FtaIncluded } from '../iptv/FtaIncluded';
import { pickFta, ownedChannels, overlapReason, selectedConflicts } from '../iptv/packRules';

const COMBO = '#ec4899';
const IPTV = '#8b5cf6';
const money = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? '—' : `₹${n.toFixed(2)}`;
};
const isActiveDate = (d) => {
  const dt = parseApiDate(d);
  return !!(dt && dt.getTime() > Date.now());
};
const internetLabel = (a) => a?.username || `Internet #${a?.internet_id}`;
const stbLabel = (a) => (a?.pioneer_stb_id ? `STB ${a.pioneer_stb_id}` : `IPTV #${a?.id}`);

// One selectable account row (used only when the customer has more than one of a kind)
const AccountOption = ({ on, title, sub, active, onPress, disabled }) => (
  <TouchableOpacity style={[styles.accRow, on && styles.accRowOn]} onPress={onPress} disabled={disabled}>
    <View style={[styles.radio, on && { borderColor: COMBO }]}>{on ? <View style={[styles.radioDot, { backgroundColor: COMBO }]} /> : null}</View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.accTitle, on && { color: '#9d174d' }]} numberOfLines={1}>{title}</Text>
      <Text style={styles.accSub} numberOfLines={1}>{sub}</Text>
    </View>
    <View style={[styles.statusPill, { backgroundColor: active ? '#dcfce7' : '#fee2e2' }]}>
      <Text style={[styles.statusPillText, { color: active ? '#15803d' : '#b91c1c' }]}>{active ? 'ACTIVE' : 'EXPIRED'}</Text>
    </View>
  </TouchableOpacity>
);

const AddonList = ({ packs, selected, onToggle, disabled, emptyText, blockReason, conflictOf, searchLabel = 'packs' }) => {
  const [q, setQ] = useState('');
  const shown = useMemo(() => packs.filter((p) => matchesSearch(q, p.plan_name)), [packs, q]);
  if (packs.length === 0) return <Text style={[styles.muted, { padding: 12, textAlign: 'center' }]}>{emptyText}</Text>;
  return (
    <>
    {packs.length > 1 ? <SearchBox value={q} onChange={setQ} placeholder={`Search ${searchLabel}…`} count={shown.length} /> : null}
    <ScrollView style={styles.addonList} nestedScrollEnabled>
      {shown.length === 0 ? <Text style={[styles.muted, { padding: 12, textAlign: 'center' }]}>No package matches “{q.trim()}”.</Text> : null}
      {shown.map((p) => {
        const on = selected.has(p.sub_plan_id);
        // not selectable: one of its channels is already in the DPO / FTA / another add-on
        const blocked = !on && blockReason ? blockReason(p) : null;
        const clash = on && conflictOf ? conflictOf(p) : null;
        return (
          <TouchableOpacity
            key={p.sub_plan_id}
            style={[styles.addonRow, on && { backgroundColor: '#f5f3ff' }, blocked && { backgroundColor: '#f8fafc' }, clash && { backgroundColor: '#fef2f2' }]}
            onPress={() => !disabled && !blocked && onToggle(p.sub_plan_id)}
            disabled={disabled || !!blocked}
          >
            <View style={[styles.checkbox, on && { backgroundColor: IPTV, borderColor: IPTV }]}>{on ? <Feather name="check" size={12} color="#ffffff" /> : null}</View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.addonName, on && { color: '#5b21b6', fontWeight: '700' }, blocked && { color: '#94a3b8' }]} numberOfLines={1}>{p.plan_name}</Text>
              {blocked ? <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }} numberOfLines={2}>{blocked}</Text> : null}
              {clash ? <Text style={{ fontSize: 11, color: '#b91c1c', fontWeight: '600', marginTop: 2 }} numberOfLines={2}>{clash} — remove it</Text> : null}
            </View>
            <Text style={[styles.addonPrice, blocked && { color: '#94a3b8' }]}>{money(p.price)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
    </>
  );
};

/**
 * Combo Recharge: renews one internet account and one STB of this customer with an operator
 * combo (internet plan + IPTV DPO), plus optional IPTV Broadcaster / A-la-carte add-ons.
 * When the customer has several internet accounts or STBs, the operator picks one of each;
 * with a single one it is selected automatically.
 *
 * Props: visible, onClose, customer (customer_lookup record with internet_accounts / iptv_accounts),
 *        onConfirm({ internet, iptv, combo, addonIds, total }) -> Promise<boolean>
 */
export const ComboRechargeModal = ({ visible, onClose, customer, onConfirm }) => {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const internetAccounts = customer?.internet_accounts || [];
  const iptvAccounts = customer?.iptv_accounts || [];

  const [internetId, setInternetId] = useState(null);
  const [iptvId, setIptvId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [opts, setOpts] = useState(null);
  const [comboId, setComboId] = useState(null);
  const [addons, setAddons] = useState(new Set());
  const [tab, setTab] = useState('A-la-carte');
  const [comboSearch, setComboSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // open: auto-select when there is only one account of a kind
  useEffect(() => {
    if (!visible) return;
    setInternetId(internetAccounts.length === 1 ? internetAccounts[0].internet_id : null);
    setIptvId(iptvAccounts.length === 1 ? iptvAccounts[0].id : null);
    setOpts(null);
    setLoadError('');
    setComboId(null);
    setAddons(new Set());
    setTab('A-la-carte');
    setComboSearch('');
  }, [visible, customer?.cust_id]);

  const internetAcc = internetAccounts.find((a) => String(a.internet_id) === String(internetId)) || null;
  const iptvAcc = iptvAccounts.find((a) => String(a.id) === String(iptvId)) || null;
  const verified = internetAcc ? isAccountVerified(internetAcc) : true;

  // load combos / add-ons for the chosen pair
  useEffect(() => {
    if (!visible || !internetId || !iptvId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      setOpts(null);
      setComboId(null);
      setAddons(new Set());
      const res = await OneBssApi.getComboRechargeOptions(internetId, iptvId);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setLoadError(res.data?.message || `Could not load combo plans (HTTP ${res.status}).`);
        return;
      }
      const d = res.data?.data || {};
      setOpts(d);
      const allowed = (d.combos || []).filter((c) => c.allowed);
      // advance renewal: preselect the only combo that matches, and the current add-ons (locked)
      if (allowed.length === 1) setComboId(allowed[0].combo_id);
      if (d.iptv?.is_active) setAddons(new Set((d.locked_addon_ids || []).map(Number)));
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, internetId, iptvId]);

  const combos = opts?.combos || [];
  const combo = combos.find((c) => c.combo_id === comboId) || null;
  const addonPacks = useMemo(() => [...(opts?.addons?.['A-la-carte'] || []), ...(opts?.addons?.Broadcaster || [])], [opts]);
  const chosenAddons = addonPacks.filter((p) => addons.has(p.sub_plan_id));
  // IPTV months = the combo's internet months (3 / 6 / 12-month combos); FTA and add-ons are
  // monthly prices, so they are charged x months. IPTV: first part now, the rest automatically.
  const months = combo ? Math.max(1, Number(combo.months || 1)) : 1;
  const xMonths = (v) => Math.round(Number(v || 0) * months * 100) / 100;
  const addonTotal = chosenAddons.reduce((s, p) => s + xMonths(p.price), 0);
  // FTA base pack: goes with the combo's DPO. Its price is INSIDE the combo price
  // (combo.fta_included); only an old, not-migrated combo charges it on top.
  const ftaPack = pickFta(opts?.fta);
  const ftaPrice = ftaPack ? xMonths(ftaPack.price) : 0;
  const ftaOnTop = !!combo && combo.fta_included === false && !ftaPack?.included;
  const total = combo ? Number(combo.price) + (ftaOnTop ? ftaPrice : 0) + addonTotal : 0;
  const iptvParts = combo?.iptv_period?.parts || [];
  const pendingMonths = (opts?.pending_schedule || []).filter((r) => r.status === 'waiting');
  // add-ons repeating a channel of the DPO / FTA / another add-on can't be taken
  const comboDpo = combo ? { plan_name: combo.iptv.plan_name, channel_ids: combo.iptv.channel_ids } : null;
  const basePacks = [comboDpo, ftaPack].filter(Boolean);
  const owned = ownedChannels([...basePacks, ...chosenAddons]);
  const conflicts = selectedConflicts(basePacks, chosenAddons);
  const addonsLocked = !!opts?.iptv?.is_active;
  const wallet = opts?.wallet_balance;
  const shortWallet = combo && wallet !== undefined && wallet !== null && Number(wallet) < total;

  const toggle = (id) =>
    setAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirm = async () => {
    if (!combo || !internetAcc || !iptvAcc || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm({ internet: internetAcc, iptv: iptvAcc, combo, addonIds: chosenAddons.map((p) => p.sub_plan_id), total });
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!customer) return null;

  const pairNotes = [];
  if (opts?.internet?.is_active) pairNotes.push(`Internet is active until ${formatApiDate(opts.internet.expiration)} — advance renewal keeps its current plan.`);
  if (opts?.iptv?.is_active) pairNotes.push(`The STB is active until ${formatApiDate(opts.iptv.expiration)} — advance renewal keeps its current DPO and add-ons.`);

  // ---------- combo table ----------
  const shownCombos = combos.filter((c) =>
    matchesSearch(comboSearch, c.combo_name, c.internet?.plan_name, c.internet?.sub_plan_name, c.iptv?.plan_name, Number(c.months) > 1 ? `${c.months} months` : `${c.internet?.validity} days`)
  );
  const comboRows = (
      <View style={{ flex: 1 }}>
        <View style={[styles.tr, styles.thRow]}>
          <Text style={[styles.th, { width: 34 }]} />
          <Text style={[styles.th, { flex: 1.5 }]}>Combo</Text>
          <Text style={[styles.th, { flex: 1.4 }]}>Internet</Text>
          <Text style={[styles.th, { flex: 1.5 }]}>IPTV (DPO)</Text>
          <Text style={[styles.th, { width: 70 }]}>Validity</Text>
          <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Price</Text>
        </View>
        {combos.length === 0 ? (
          <Text style={[styles.muted, { padding: 14 }]}>No combo plans are set up for this operator yet. Ask your admin to create them under Partners › Combo Plans.</Text>
        ) : shownCombos.length === 0 ? (
          <Text style={[styles.muted, { padding: 14 }]}>No combo matches “{comboSearch.trim()}”.</Text>
        ) : (
          shownCombos.map((c) => {
            const on = c.combo_id === comboId;
            return (
              <TouchableOpacity
                key={c.combo_id}
                style={[styles.tr, on && styles.trOn, !c.allowed && { opacity: 0.55 }]}
                onPress={() => c.allowed && !submitting && setComboId(c.combo_id)}
                disabled={!c.allowed || submitting}
              >
                <View style={{ width: 34 }}>
                  <View style={[styles.radio, on && { borderColor: COMBO }]}>{on ? <View style={[styles.radioDot, { backgroundColor: COMBO }]} /> : null}</View>
                </View>
                <View style={{ flex: 1.5, minWidth: 0, paddingRight: 8 }}>
                  <Text style={[styles.td, { fontWeight: '700' }]} numberOfLines={2}>{c.combo_name}</Text>
                  {!c.allowed && c.blocked_reason ? <Text style={styles.blocked} numberOfLines={2}>{c.blocked_reason}</Text> : null}
                </View>
                <View style={{ flex: 1.4, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.td} numberOfLines={1}>{c.internet.plan_name}</Text>
                  <Text style={styles.tdSub} numberOfLines={1}>{c.internet.sub_plan_name}</Text>
                </View>
                <View style={{ flex: 1.5, minWidth: 0, paddingRight: 8 }}>
                  <Text style={styles.td} numberOfLines={1}>{c.iptv.plan_name}</Text>
                  {/* FTA goes with the DPO */}
                  {!ftaPack ? (
                    <FtaIncluded compact fta={null} />
                  ) : c.fta_included === false && !ftaPack.included ? (
                    <Text style={styles.tdSub}>+ FTA {money(Number(ftaPack.price) * Math.max(1, Number(c.months || 1)))}</Text>
                  ) : (
                    <Text style={[styles.tdSub, { color: '#6d28d9', fontWeight: '700' }]}>FTA included</Text>
                  )}
                </View>
                <Text style={[styles.td, { width: 70 }]}>{Number(c.months) > 1 ? `${c.months} months` : `${c.internet.validity} days`}</Text>
                <View style={{ width: 110, alignItems: 'flex-end' }}>
                  <Text style={[styles.td, { fontWeight: '800', color: on ? '#9d174d' : COLORS.textMain }]}>{money(c.price)}</Text>
                  {c.saving > 0 ? <Text style={styles.save}>Save {money(c.saving)}</Text> : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
  );
  // wide screens: plain table; phones: the same table scrolls sideways
  const comboTable = wide ? (
    comboRows
  ) : (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ width: 640 }}>
      {comboRows}
    </ScrollView>
  );

  // ---------- add-ons ----------
  const addonTabs = [
    { key: 'A-la-carte', label: 'A-la-carte' },
    { key: 'Broadcaster', label: 'Broadcasters' },
  ];
  const addonPanel = (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.sectionTitle}>IPTV add-ons <Text style={styles.sectionHint}>(optional)</Text></Text>
      <View style={styles.tabBar}>
        {addonTabs.map((t) => {
          const active = tab === t.key;
          const count = (opts?.addons?.[t.key] || []).filter((p) => addons.has(p.sub_plan_id)).length;
          return (
            <TouchableOpacity key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabText, active && { color: '#ffffff' }]}>{t.label}</Text>
              <View style={[styles.tabBadge, active && { backgroundColor: '#ffffff' }]}>
                <Text style={[styles.tabBadgeText, active && { color: IPTV }]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <AddonList
        key={tab}
        packs={opts?.addons?.[tab] || []}
        selected={addons}
        onToggle={toggle}
        disabled={addonsLocked || submitting}
        blockReason={combo ? (p) => overlapReason(p, owned) : null}
        conflictOf={(p) => conflicts.get(p.sub_plan_id) || null}
        searchLabel={tab === 'Broadcaster' ? 'broadcasters' : 'channels'}
        emptyText={`No ${tab === 'Broadcaster' ? 'broadcaster packs' : 'a-la-carte channels'} are assigned to this operator.`}
      />
      {addonsLocked ? <Text style={[styles.muted, { marginTop: 6 }]}>Locked to the STB's current add-ons (advance renewal).</Text> : null}
    </View>
  );

  // ---------- summary ----------
  const summary = (
    <View style={[styles.summaryBox, wide ? { width: 300, marginLeft: 16 } : { marginTop: 16 }]}>
      <Text style={styles.sectionTitle}>Summary</Text>
      {!combo ? (
        <Text style={styles.muted}>Choose a combo plan.</Text>
      ) : (
        <>
          <View style={styles.billRow}>
            <Text style={[styles.billName, { fontWeight: '700' }]} numberOfLines={2}>{combo.combo_name}</Text>
            <Text style={styles.billPrice}>{money(combo.price)}</Text>
          </View>
          <Text style={styles.billSub}>Internet: {combo.internet.plan_name} · {combo.internet.sub_plan_name}</Text>
          <Text style={styles.billSub}>IPTV: {combo.iptv.plan_name} (DPO){ftaPack && !ftaOnTop ? ` + ${ftaPack.plan_name} (FTA)` : ''}{months > 1 ? ` × ${months} months` : ''}</Text>
          {ftaPack && ftaOnTop ? (
            <View style={[styles.billRow, { marginTop: 6 }]}>
              <Text style={styles.billName} numberOfLines={1}>FTA: {ftaPack.plan_name}{months > 1 ? ` × ${months}` : ''}</Text>
              <Text style={styles.billPrice}>{money(ftaPrice)}</Text>
            </View>
          ) : ftaPack ? null : (
            <View style={{ marginTop: 8 }}>
              <FtaIncluded fta={null} />
            </View>
          )}
          {chosenAddons.length ? <Text style={styles.groupLabel}>Add-ons ({chosenAddons.length})</Text> : null}
          {chosenAddons.map((p) => (
            <View key={p.sub_plan_id} style={styles.billRow}>
              <Text style={styles.billName} numberOfLines={1}>{p.plan_name}{months > 1 ? ` × ${months}` : ''}</Text>
              <Text style={styles.billPrice}>{money(xMonths(p.price))}</Text>
            </View>
          ))}
          <View style={[styles.billRow, styles.billTotal]}>
            <Text style={[styles.billName, { fontWeight: '800' }]}>Total</Text>
            <Text style={[styles.billPrice, { fontSize: 16, fontWeight: '800' }]}>{money(total)}</Text>
          </View>
          {wallet !== undefined && wallet !== null ? <KV label="Wallet balance" value={money(wallet)} /> : null}
          <KV label="Internet" value={opts?.internet?.is_active ? 'Advance renewal' : 'Recharge from today'} />
          <KV label="IPTV" value={combo?.iptv_period?.from ? `Advance from ${formatApiDate(combo.iptv_period.from)}` : opts?.iptv?.is_active ? `Advance from ${formatApiDate(opts.iptv.expiration)}` : 'Recharge from today'} />
          {iptvParts.length ? <KV label="IPTV till" value={formatApiDate(iptvParts[iptvParts.length - 1].end)} /> : null}
        </>
      )}
    </View>
  );

  const ready = !!(internetAcc && iptvAcc);

  return (
    <ModalShell
      visible={visible}
      title="Combo Recharge"
      icon="layers"
      iconColor={COMBO}
      onClose={onClose}
      maxWidth={wide ? 1040 : 680}
      busy={submitting}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={submitting} />
          <Btn
            label={`Confirm Combo Recharge${combo ? ` · ${money(total)}` : ''}`}
            kind="orange"
            onPress={confirm}
            loading={submitting}
            disabled={!combo || !ready || !verified || loading || shortWallet || !ftaPack || conflicts.size > 0}
          />
        </>
      }
    >
      {/* ACCOUNTS */}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <View style={wide ? { flex: 1 } : null}>
          <Text style={styles.sectionTitle}>Internet account</Text>
          {internetAccounts.length === 0 ? (
            <Note tone="error" text="This customer has no internet account." />
          ) : internetAccounts.length === 1 ? (
            <View style={styles.fixedAcc}>
              <Feather name="wifi" size={14} color={COLORS.primary} />
              <Text style={styles.accTitle} numberOfLines={1}>{internetLabel(internetAccounts[0])}</Text>
              <Text style={styles.accSub}>· {isActiveDate(internetAccounts[0].expiration) ? `active till ${formatApiDate(internetAccounts[0].expiration)}` : 'expired'}</Text>
            </View>
          ) : (
            internetAccounts.map((a) => (
              <AccountOption
                key={a.internet_id}
                on={String(a.internet_id) === String(internetId)}
                title={internetLabel(a)}
                sub={[a.package_name || a.plan_name, a.expiration ? `exp ${formatApiDate(a.expiration)}` : null].filter(Boolean).join(' · ')}
                active={isActiveDate(a.expiration)}
                onPress={() => setInternetId(a.internet_id)}
                disabled={submitting}
              />
            ))
          )}
        </View>
        <View style={wide ? { flex: 1 } : null}>
          <Text style={styles.sectionTitle}>IPTV set-top box</Text>
          {iptvAccounts.length === 0 ? (
            <Note tone="error" text="This customer has no IPTV account." />
          ) : iptvAccounts.length === 1 ? (
            <View style={styles.fixedAcc}>
              <Feather name="tv" size={14} color={IPTV} />
              <Text style={styles.accTitle} numberOfLines={1}>{stbLabel(iptvAccounts[0])}</Text>
              <Text style={styles.accSub}>· {isActiveDate(iptvAccounts[0].expriration || iptvAccounts[0].expiration) ? `active till ${formatApiDate(iptvAccounts[0].expriration || iptvAccounts[0].expiration)}` : 'expired'}</Text>
            </View>
          ) : (
            iptvAccounts.map((a) => (
              <AccountOption
                key={a.id}
                on={String(a.id) === String(iptvId)}
                title={stbLabel(a)}
                sub={[a.plan_name, (a.expriration || a.expiration) ? `exp ${formatApiDate(a.expriration || a.expiration)}` : null].filter(Boolean).join(' · ')}
                active={isActiveDate(a.expriration || a.expiration)}
                onPress={() => setIptvId(a.id)}
                disabled={submitting}
              />
            ))
          )}
        </View>
      </View>

      {!verified ? <Note tone="error" text={`Verify the customer on ${internetLabel(internetAcc)} before recharging.`} /> : null}

      {!ready ? (
        internetAccounts.length && iptvAccounts.length ? <Note tone="info" text="Choose the internet account and the set-top box to renew together." /> : null
      ) : loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COMBO} />
          <Text style={styles.muted}>Loading combo plans…</Text>
        </View>
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : opts ? (
        <>
          {pairNotes.map((t) => <Note key={t} tone="info" text={t} />)}
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-start' : 'stretch', marginTop: 14 }}>
            <View style={wide ? { flex: 1, minWidth: 0 } : null}>
              <Text style={styles.sectionTitle}>Combo plan</Text>
              {combos.length > 1 ? (
                <SearchBox value={comboSearch} onChange={setComboSearch} placeholder="Search combo, internet or DPO package…" disabled={submitting} count={shownCombos.length} />
              ) : null}
              <View style={styles.tableBox}>{comboTable}</View>
              {combo ? addonPanel : null}
            </View>
            {summary}
          </View>
          {shortWallet ? <Note tone="error" text={`Wallet balance ${money(wallet)} is less than the total ${money(total)}.`} /> : null}
          {opts?.combo_lock ? (
            <Note
              tone="info"
              text={`This customer is on the combo "${opts.combo_lock.combo_name}" till ${formatApiDate(opts.combo_lock.until)}. Only this combo can be renewed now (same package); internet and IPTV can be recharged on their own after both have expired.`}
            />
          ) : null}
          {conflicts.size > 0 ? <Note tone="error" text="Some selected add-ons repeat channels the customer already gets from the DPO / FTA / another add-on (marked in red). Remove them to continue." /> : null}
          <Note text="The wallet is debited when the recharge starts. If internet or IPTV is not confirmed, the account shows Recheck." />
        </>
      ) : null}
    </ModalShell>
  );
};

const styles = StyleSheet.create({
  muted: { fontSize: 12, color: '#64748b' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMain, marginBottom: 8 },
  sectionHint: { fontSize: 12, fontWeight: '500', color: '#64748b' },

  fixedAcc: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', flexWrap: 'wrap' },
  accRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 6, backgroundColor: '#ffffff' },
  accRowOn: { borderColor: COMBO, backgroundColor: '#fdf2f8' },
  accTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain, flexShrink: 1 },
  accSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  statusPillText: { fontSize: 9, fontWeight: '800' },

  tableBox: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#ffffff' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 8 },
  trOn: { backgroundColor: '#fdf2f8' },
  th: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 12, color: COLORS.textMain },
  tdSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  blocked: { fontSize: 10, color: '#b45309', marginTop: 2 },
  save: { fontSize: 10, fontWeight: '700', color: '#15803d', marginTop: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },

  tabBar: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10, backgroundColor: '#f1f5f9', marginBottom: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  tabActive: { backgroundColor: IPTV },
  tabText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tabBadge: { minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  addonList: { maxHeight: 240, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10 },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  addonName: { flex: 1, fontSize: 13, color: COLORS.textMain },
  addonPrice: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },

  summaryBox: { alignSelf: 'stretch', padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  groupLabel: { fontSize: 10, fontWeight: '800', color: IPTV, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, marginBottom: 2 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  billName: { flex: 1, fontSize: 12, color: COLORS.textMain },
  billSub: { fontSize: 11, color: '#64748b' },
  billPrice: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  billTotal: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', marginTop: 6, paddingTop: 8, marginBottom: 4 },
});
