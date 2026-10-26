import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note } from '../internet/shared';
import { parseApiDate, formatApiDate } from '../CustomerAccountsOverview';
import { FtaIncluded } from './FtaIncluded';
import { pickFta, ownedChannels, overlapReason, selectedConflicts } from './packRules';

const IPTV = '#8b5cf6';
const money = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? '—' : `₹${n.toFixed(2)}`;
};
const toYmdHms = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
};

// Tab order requested: DPO (default) | A-la-carte | Broadcasters
const TABS = [
  { key: 'DPO', label: 'DPO', icon: 'package' },
  { key: 'A-la-carte', label: 'A-la-carte', icon: 'tv' },
  { key: 'Broadcaster', label: 'Broadcasters', short: 'Broadcast', icon: 'radio' },
];

// One list for any pack type. mode 'single' = radio (DPO), 'multi' = checkbox (add-ons).
const PackList = ({ packs, mode, isSelected, onPress, disabled, emptyText, searchLabel, blockReason, conflictOf, fta }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return packs;
    const words = t.split(/\s+/);
    return packs.filter((p) => {
      const hay = [p.plan_name, p.type, ...(Array.isArray(p.channels) ? p.channels.map((ch) => ch?.name || ch?.channel_name || ch) : [])].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [packs, q]);

  if (packs.length === 0) return <Text style={[styles.muted, { padding: 16, textAlign: 'center' }]}>{emptyText}</Text>;

  return (
    <View style={disabled && { opacity: 0.5 }}>
      {packs.length > 1 ? (
        <View style={styles.searchBox}>
          <Feather name="search" size={13} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder={`Search ${searchLabel}…`}
            placeholderTextColor="#94a3b8"
            editable={!disabled}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ('')}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {filtered.length === 0 ? <Text style={[styles.muted, { padding: 14, textAlign: 'center' }]}>No package matches “{q.trim()}”.</Text> : null}
        {filtered.map((p) => {
          const on = isSelected(p.sub_plan_id);
          // not selectable: a channel of it is already in the DPO / FTA / another add-on
          const blocked = !on && blockReason ? blockReason(p) : null;
          const clash = on && conflictOf ? conflictOf(p) : null;
          return (
            <TouchableOpacity
              key={p.sub_plan_id}
              style={[styles.row, on && styles.rowOn, blocked && styles.rowBlocked, clash && styles.rowClash]}
              onPress={() => !disabled && !blocked && onPress(p.sub_plan_id)}
              disabled={disabled || !!blocked}
            >
              {mode === 'single' ? (
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              ) : (
                <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Feather name="check" size={12} color="#ffffff" /> : null}</View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowName, on && { color: '#5b21b6', fontWeight: '700' }, blocked && { color: '#94a3b8' }]} numberOfLines={1}>{p.plan_name}</Text>
                {mode === 'single' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.rowSub}>{p.plan_validity} days</Text>
                    <FtaIncluded compact fta={fta} />
                  </View>
                ) : null}
                {blocked ? <Text style={styles.rowBlockedText} numberOfLines={2}>{blocked}</Text> : null}
                {clash ? <Text style={styles.rowClashText} numberOfLines={2}>{clash} — remove it</Text> : null}
              </View>
              <Text style={[styles.rowPrice, blocked && { color: '#94a3b8' }]}>{money(p.price)}</Text>
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 ? <Text style={[styles.muted, { padding: 12 }]}>No match for “{q}”.</Text> : null}
      </ScrollView>
    </View>
  );
};

/**
 * IPTV Recharge / Advance Renewal with a package set, shown as side-by-side tabs:
 *   DPO (default tab, exactly one) | A-la-carte (any) | Broadcasters (any)
 * Prices are the operator's mapped prices (from iptv_recharge_plans.php); the total is what
 * the wallet is debited. The STB's current packs are pre-selected.
 *
 * Props: visible, onClose, account (raw iptv_accounts[i]), onConfirm(subPlanIds) -> Promise<boolean>
 */
export const IptvRechargeModal = ({ visible, onClose, account, onConfirm }) => {
  const { width } = useWindowDimensions();
  const wide = width >= 920;
  const compact = width < 520;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [plans, setPlans] = useState({ DPO: [], FTA: [], Broadcaster: [], 'A-la-carte': [] });
  const [period, setPeriod] = useState(null); // { mode, days, start, end, parts, internet } from the API
  const [pending, setPending] = useState([]); // months already paid, waiting for the auto-renewal
  const [stb, setStb] = useState(null);
  const [currentSource, setCurrentSource] = useState('none');
  const [dpoId, setDpoId] = useState(null);
  const [addons, setAddons] = useState(new Set());
  const [tab, setTab] = useState('DPO');
  const [submitting, setSubmitting] = useState(false);
  // customer's internet accounts: with more than one the operator picks which one the IPTV
  // dates follow (alignId); the period is reloaded for it
  const [internetAccounts, setInternetAccounts] = useState([]);
  const [alignId, setAlignId] = useState(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAlignId(null);
      setInternetAccounts([]);
    }
  }, [visible]);

  // pick another internet account: reload only the period (pack choices stay)
  const chooseInternet = async (id) => {
    if (!account || String(id) === String(alignId)) return;
    setAlignId(id);
    setPeriodLoading(true);
    const res = await OneBssApi.getIptvRechargePlans(account.id, id);
    setPeriodLoading(false);
    if (res.ok && res.data?.data) setPeriod(res.data.data.period || null);
  };

  useEffect(() => {
    if (!visible || !account) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      setDpoId(null);
      setPeriod(null);
      setPending([]);
      setAddons(new Set());
      setTab('DPO');
      setAlignId(null);
      try {
        const res = await OneBssApi.getIptvRechargePlans(account.id);
        if (cancelled) return;
        const body = res.data || {};
        if (!res.ok || body.success === false) {
          setLoadError(body.message || `Could not load IPTV packages (HTTP ${res.status}).`);
          return;
        }
        const d = body.data || {};
        const grouped = {
          DPO: d.plans?.DPO || [],
          FTA: d.plans?.FTA || [],
          Broadcaster: d.plans?.Broadcaster || [],
          'A-la-carte': d.plans?.['A-la-carte'] || [],
        };
        setPlans(grouped);
        setStb(d.stb || null);
        setPeriod(d.period || null);
        setPending((d.pending_schedule || []).filter((r) => r.status === 'waiting'));
        const accs = Array.isArray(d.internet_accounts) ? d.internet_accounts : [];
        setInternetAccounts(accs);
        // one internet account (or none): nothing to ask
        if (accs.length === 1) setAlignId(accs[0].internet_id);
        setCurrentSource(d.current?.source || 'none');

        // pre-select the STB's current packs
        const current = new Set((d.current?.sub_plan_ids || []).map(Number));
        const curDpo = grouped.DPO.find((p) => current.has(p.sub_plan_id));
        setDpoId(curDpo ? curDpo.sub_plan_id : null);
        setAddons(new Set([...grouped.Broadcaster, ...grouped['A-la-carte']].filter((p) => current.has(p.sub_plan_id)).map((p) => p.sub_plan_id)));
      } catch (e) {
        if (!cancelled) setLoadError('Could not load IPTV packages.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, account?.id]);

  const dpo = plans.DPO.find((p) => p.sub_plan_id === dpoId) || null;
  // FTA: added automatically with the DPO (chargeable); never without a DPO
  const ftaPack = pickFta(plans.FTA);
  const fta = dpo ? ftaPack : null;
  const ftaMissing = !!dpo && !ftaPack;
  const base = dpo; // one DPO is required
  const selectedOf = (type) => plans[type].filter((p) => addons.has(p.sub_plan_id));
  const alacarte = selectedOf('A-la-carte');
  const broadcasters = selectedOf('Broadcaster');
  const basePacks = [dpo, fta].filter(Boolean);
  const lines = base ? [...basePacks, ...alacarte, ...broadcasters] : [];
  // Prices are per 30 days; the recharge runs till the customer's internet expiry (else 30
  // days) and is charged per day — same rounding as the server (per pack, to paise).
  const days = period?.days > 0 ? Number(period.days) : 30;
  const charge = (p) => Math.round((Number(p.price || 0) * days * 100) / 30) / 100;
  const charged = (arr) => arr.map((p) => ({ ...p, monthly: p.price, price: charge(p) }));
  const monthlyTotal = lines.reduce((s, p) => s + Number(p.price || 0), 0);
  const total = lines.reduce((s, p) => s + charge(p), 0);
  const parts = period?.parts || [];
  const hasPending = pending.length > 0;
  // channels already given by the base packs + selected add-ons; an add-on repeating one is blocked
  const owned = ownedChannels([...basePacks, ...alacarte, ...broadcasters]);
  const conflicts = selectedConflicts(basePacks, [...broadcasters, ...alacarte]);
  const hasConflict = conflicts.size > 0;
  const sum = (arr) => arr.reduce((s, p) => s + charge(p), 0);

  // Same rule the backend uses: still active -> advance from current expiry, else from now
  const expiry = parseApiDate(stb?.expiration || account?.expriration || account?.expiration);
  const isAdvance = stb ? !!stb.is_active : !!(expiry && expiry.getTime() > Date.now());
  // Advance renewal (STB still active) renews the CURRENT packs only — no changes allowed.
  const locked = isAdvance;
  const start = period?.start ? parseApiDate(period.start) : isAdvance && expiry ? new Date(expiry) : new Date();
  const end = period?.end ? parseApiDate(period.end) : (() => {
    const e = new Date(start);
    e.setDate(e.getDate() + 30);
    e.setHours(23, 59, 59, 0);
    return e;
  })();

  const toggle = (id) =>
    setAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearType = (type) =>
    setAddons((prev) => {
      const next = new Set(prev);
      plans[type].forEach((p) => next.delete(p.sub_plan_id));
      return next;
    });

  const needsInternetChoice = internetAccounts.length > 1 && !alignId;
  const confirm = async () => {
    if (!base || ftaMissing || hasConflict || hasPending || submitting || needsInternetChoice || periodLoading) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(lines.map((p) => p.sub_plan_id), { internetId: alignId });
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!account) return null;
  const stbLabel = account.pioneer_stb_id ? `STB ${account.pioneer_stb_id}` : `IPTV #${account.id}`;
  const title = isAdvance ? 'Advance Renewal' : 'Recharge';

  const tabBadge = (key) => {
    if (key === 'DPO') return String(basePacks.length);
    return String(selectedOf(key).length);
  };

  const listPanel = (
    <View style={wide ? { flex: 1.35, minWidth: 0 } : { alignSelf: 'stretch' }}>
      {/* TABS — side by side */}
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const locked = t.key !== 'DPO' && !base;
          return (
            <TouchableOpacity key={t.key} style={[styles.tab, compact && styles.tabCompact, active && styles.tabActive]} onPress={() => setTab(t.key)}>
              {!compact || locked ? <Feather name={locked ? 'lock' : t.icon} size={13} color={active ? '#ffffff' : '#475569'} /> : null}
              <Text style={[styles.tabText, compact && { fontSize: 12 }, active && styles.tabTextActive]} numberOfLines={1}>{compact && t.short ? t.short : t.label}</Text>
              <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, active && { color: IPTV }]}>{tabBadge(t.key)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* TAB CONTENT — only that tab's packs */}
      <View style={styles.tabBody}>
        <View style={styles.tabHead}>
          <Text style={styles.tabHint}>
            {tab === 'DPO'
              ? 'Required · one DPO pack (the FTA base pack is added with it)'
              : base
              ? `Optional · select any number · ${selectedOf(tab).length} selected${selectedOf(tab).length ? ` (${money(sum(selectedOf(tab)))})` : ''}`
              : 'Select a DPO package first'}
          </Text>
          {tab !== 'DPO' && base && selectedOf(tab).length ? (
            <TouchableOpacity onPress={() => clearType(tab)}><Text style={styles.clearLink}>Clear</Text></TouchableOpacity>
          ) : null}
        </View>
        {tab === 'DPO' ? (
          <>
            {/* FTA base pack: added (locked) with the DPO; can't be taken alone */}
            {ftaPack ? (
              <View style={[styles.ftaRow, fta && styles.rowOn, !fta && { opacity: 0.6 }]}>
                <View style={[styles.checkbox, fta && styles.checkboxOn]}>{fta ? <Feather name={dpo ? 'lock' : 'check'} size={11} color="#ffffff" /> : null}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.rowName, fta && { color: '#5b21b6', fontWeight: '700' }]} numberOfLines={1}>{ftaPack.plan_name}</Text>
                  <Text style={styles.rowSub}>{ftaPack.included ? 'FTA base pack · included in the DPO price' : dpo ? 'FTA base pack · added with the DPO' : 'FTA base pack · added automatically when you choose a DPO'}</Text>
                </View>
                <Text style={[styles.rowPrice, ftaPack.included && { color: '#6d28d9' }]}>{ftaPack.included ? 'Included' : money(ftaPack.price)}</Text>
              </View>
            ) : null}
            <PackList
              key="DPO"
              packs={plans.DPO}
              mode="single"
              isSelected={(id) => id === dpoId}
              onPress={(id) => setDpoId((cur) => (cur === id ? null : id))}
              disabled={submitting}
              emptyText="No DPO package is assigned to this operator."
              searchLabel="DPO packages"
              fta={ftaPack}
            />
          </>
        ) : (
          <PackList
            key={tab}
            packs={plans[tab]}
            mode="multi"
            isSelected={(id) => addons.has(id)}
            onPress={toggle}
            disabled={!base || submitting}
            blockReason={(p) => overlapReason(p, owned)}
            conflictOf={(p) => conflicts.get(p.sub_plan_id) || null}
            emptyText={`No ${TABS.find((t) => t.key === tab).label.toLowerCase()} are assigned to this operator.`}
            searchLabel={tab === 'Broadcaster' ? 'broadcasters' : 'channels'}
          />
        )}
        {tab === 'DPO' && base ? (
          <TouchableOpacity style={styles.nextLink} onPress={() => setTab('A-la-carte')}>
            <Text style={styles.nextLinkText}>Next: A-la-carte</Text>
            <Feather name="arrow-right" size={13} color={IPTV} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const summaryGroup = (label, items, removable) =>
    items.length ? (
      <View style={{ marginBottom: 6 }}>
        <Text style={styles.groupLabel}>{label}</Text>
        {items.map((p) => (
          <View key={p.sub_plan_id} style={styles.billRow}>
            <Text style={styles.billName} numberOfLines={1}>{p.plan_name}</Text>
            <Text style={[styles.billPrice, p.included && { color: '#6d28d9' }]}>{p.included ? 'Included' : money(p.price)}</Text>
            {removable ? (
              <TouchableOpacity onPress={() => !submitting && toggle(p.sub_plan_id)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Feather name="x" size={13} color="#94a3b8" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 13 }} />
            )}
          </View>
        ))}
      </View>
    ) : null;

  const summaryPanel = (
    <View style={[styles.summaryBox, wide ? { flex: 1, marginLeft: 16 } : { marginTop: 14 }]}>
      <Text style={styles.summaryTitle}>Summary</Text>
      {!base ? (
        <Text style={styles.muted}>Select a DPO package to start.</Text>
      ) : (
        <>
          {ftaMissing ? <FtaIncluded fta={null} /> : null}
          {summaryGroup('DPO', charged([dpo]), false)}
          {fta ? summaryGroup(fta.included ? 'FTA (included in the DPO price)' : 'FTA (added with the DPO)', charged([fta]).map((p) => ({ ...p, included: !!fta.included })), false) : null}
          {summaryGroup(`A-la-carte (${alacarte.length})`, charged(alacarte), !locked)}
          {summaryGroup(`Broadcasters (${broadcasters.length})`, charged(broadcasters), !locked)}
          <View style={[styles.billRow, styles.billTotal]}>
            <Text style={[styles.billName, { fontWeight: '800' }]}>Total ({lines.length} pack{lines.length > 1 ? 's' : ''})</Text>
            <Text style={[styles.billPrice, { fontSize: 16, fontWeight: '800' }]}>{money(total)}</Text>
            <View style={{ width: 13 }} />
          </View>
          <Text style={styles.calcLine}>
            {money(monthlyTotal)} / 30 days × {days} day{days > 1 ? 's' : ''}
            {period?.mode === 'internet' && period?.internet ? ` (till internet ${period.internet.username} expires)` : ' (no active internet — standard 30 days)'}
          </Text>
          <KV label="Period" value={`${isAdvance ? formatApiDate(toYmdHms(start)) : 'Today'} → ${formatApiDate(toYmdHms(end))}`} />

        </>
      )}
    </View>
  );

  return (
    <ModalShell
      visible={visible}
      title={`${title} — ${stbLabel}`}
      icon={isAdvance ? 'fast-forward' : 'refresh-cw'}
      iconColor={IPTV}
      onClose={onClose}
      maxWidth={wide ? 980 : 640}
      busy={submitting}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={submitting} />
          <Btn
            label={`${isAdvance ? 'Confirm Advance Renewal' : 'Confirm Recharge'}${base ? ` · ${money(total)}` : ''}`}
            kind="orange"
            onPress={confirm}
            loading={submitting}
            disabled={!base || ftaMissing || hasConflict || hasPending || loading || needsInternetChoice || periodLoading}
          />
        </>
      }
    >
      <View style={styles.headerStrip}>
        {/* paid-till date when the STB is paid for longer than Pioneer shows, else Pioneer's expiry */}
        <KV label="Current expiry" value={stb?.expected_expiry ? formatApiDate(stb.expected_expiry) : expiry ? formatApiDate(stb?.expiration || account.expriration) : 'Not active'} />
        <KV label="Type" value={isAdvance ? 'Advance renewal (STB still active)' : 'Recharge (STB expired / new)'} />
      </View>

      {/* several internet accounts: which one should the IPTV dates follow? */}
      {!loading && internetAccounts.length > 1 ? (
        <View style={styles.alignBox}>
          <Text style={styles.alignTitle}>Align IPTV with which internet account?</Text>
          <Text style={styles.muted}>This customer has {internetAccounts.length} internet accounts. The IPTV period runs till the chosen account's expiry.</Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {internetAccounts.map((a) => {
              const on = String(alignId) === String(a.internet_id);
              return (
                <TouchableOpacity key={a.internet_id} style={[styles.alignRow, on && styles.alignRowOn]} onPress={() => chooseInternet(a.internet_id)} disabled={submitting}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.rowName, on && { color: '#5b21b6', fontWeight: '700' }]} numberOfLines={1}>{a.username}</Text>
                    <Text style={styles.rowSub}>{a.is_active ? `Active till ${formatApiDate(a.expiration)}` : `Expired ${a.expiration ? formatApiDate(a.expiration) : ''} — IPTV would be 30 days`}</Text>
                  </View>
                  {on && periodLoading ? <ActivityIndicator size="small" color={IPTV} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {needsInternetChoice ? <Text style={[styles.rowSub, { color: '#b45309', marginTop: 6 }]}>Choose an internet account to continue.</Text> : null}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={IPTV} />
          <Text style={styles.muted}>Loading packages…</Text>
        </View>
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : hasPending ? (
        <Note
          tone="error"
          text={`This STB is already paid till ${formatApiDate(pending[pending.length - 1].end_date)}. It can be recharged after that.`}
        />
      ) : plans.DPO.length === 0 ? (
        <Note text="No DPO package is assigned to this operator yet. Ask your admin to map IPTV packages before recharging." />
      ) : locked ? (
        !base ? (
          <Note
            tone="error"
            text="This STB is still active but its current packs are not known, so it cannot be renewed in advance. Sync the STB first, or recharge with new packs after it expires."
          />
        ) : (
          <>
            <View style={{ marginTop: 12 }}>{summaryPanel}</View>
            <Note
              tone="info"
              text={`Advance renewal keeps the current packs. The new period starts when the current one ends (${formatApiDate(stb?.expiration || account.expriration)}). To change packs, recharge after it expires.`}
            />
          </>
        )
      ) : (
        <>
          {currentSource === 'local' || currentSource === 'pioneer' ? (
            <Note tone="info" text={`The STB's current packages are pre-selected (${currentSource === 'local' ? 'last recharge' : 'live from Pioneer'}). Change them if needed.`} />
          ) : null}
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-start' : 'stretch', marginTop: 12 }}>
            {listPanel}
            {summaryPanel}
          </View>
          {hasConflict ? <Note tone="error" text="Some selected add-ons repeat channels the customer already gets (marked in red). Remove them to continue — Pioneer refuses such a renewal." /> : null}
          <Note text="The wallet is debited when the recharge starts. If Pioneer does not confirm it, the account shows Recheck." />
        </>
      )}
    </ModalShell>
  );
};

const styles = StyleSheet.create({
  alignBox: { marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.05)' },
  alignTitle: { fontSize: 13, fontWeight: '800', color: '#4c1d95', marginBottom: 2 },
  alignRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#ffffff' },
  alignRowOn: { borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: '#7c3aed' },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7c3aed' },
  headerStrip: { padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  muted: { fontSize: 12, color: '#64748b' },

  tabBar: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10, backgroundColor: '#f1f5f9' },
  tab: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 8 },
  tabCompact: { gap: 4, paddingHorizontal: 4 },
  tabActive: { backgroundColor: IPTV, boxShadow: '0 1px 4px rgba(139,92,246,0.35)' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#475569', flexShrink: 1 },
  tabTextActive: { color: '#ffffff' },
  tabBadge: { minWidth: 20, paddingHorizontal: 5, height: 18, borderRadius: 9, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  tabBadgeActive: { backgroundColor: '#ffffff' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#475569' },

  tabBody: { marginTop: 10 },
  tabHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  tabHint: { fontSize: 12, color: '#64748b', flex: 1 },
  clearLink: { fontSize: 12, fontWeight: '700', color: IPTV },
  nextLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 8 },
  nextLinkText: { fontSize: 12, fontWeight: '700', color: IPTV },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', borderRadius: 8, paddingHorizontal: 10, height: 36, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  list: { maxHeight: 330, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowOn: { backgroundColor: '#f5f3ff' },
  rowBlocked: { backgroundColor: '#f8fafc' },
  calcLine: { fontSize: 11, color: '#64748b', marginBottom: 6 },
  scheduleBox: { marginTop: 6, padding: 8, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', gap: 2 },
  scheduleText: { fontSize: 11, color: '#5b21b6' },
  rowBlockedText: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  rowClash: { backgroundColor: '#fef2f2' },
  rowClashText: { fontSize: 11, color: '#b91c1c', fontWeight: '600', marginTop: 2 },
  ftaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', borderRadius: 10, marginBottom: 8 },
  rowName: { fontSize: 13, color: COLORS.textMain },
  rowSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  rowPrice: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: IPTV },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: IPTV },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: IPTV, borderColor: IPTV },

  summaryBox: { alignSelf: 'stretch', padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMain, marginBottom: 8 },
  groupLabel: { fontSize: 10, fontWeight: '800', color: IPTV, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, marginBottom: 2 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  billName: { flex: 1, fontSize: 12, color: COLORS.textMain },
  billPrice: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  billTotal: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', marginTop: 4, paddingTop: 8, marginBottom: 4 },
});