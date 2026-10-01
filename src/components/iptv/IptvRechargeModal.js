import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note } from '../internet/shared';
import { parseApiDate, formatApiDate } from '../CustomerAccountsOverview';

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
const PackList = ({ packs, mode, isSelected, onPress, disabled, emptyText, searchLabel }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? packs.filter((p) => String(p.plan_name).toLowerCase().includes(t)) : packs;
  }, [packs, q]);

  if (packs.length === 0) return <Text style={[styles.muted, { padding: 16, textAlign: 'center' }]}>{emptyText}</Text>;

  return (
    <View style={disabled && { opacity: 0.5 }}>
      {packs.length > 6 ? (
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
        {filtered.map((p) => {
          const on = isSelected(p.sub_plan_id);
          return (
            <TouchableOpacity
              key={p.sub_plan_id}
              style={[styles.row, on && styles.rowOn]}
              onPress={() => !disabled && onPress(p.sub_plan_id)}
              disabled={disabled}
            >
              {mode === 'single' ? (
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              ) : (
                <View style={[styles.checkbox, on && styles.checkboxOn]}>{on ? <Feather name="check" size={12} color="#ffffff" /> : null}</View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.rowName, on && { color: '#5b21b6', fontWeight: '700' }]} numberOfLines={1}>{p.plan_name}</Text>
                {mode === 'single' ? <Text style={styles.rowSub}>{p.plan_validity} days</Text> : null}
              </View>
              <Text style={styles.rowPrice}>{money(p.price)}</Text>
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
  const [plans, setPlans] = useState({ DPO: [], Broadcaster: [], 'A-la-carte': [] });
  const [stb, setStb] = useState(null);
  const [currentSource, setCurrentSource] = useState('none');
  const [dpoId, setDpoId] = useState(null);
  const [addons, setAddons] = useState(new Set());
  const [tab, setTab] = useState('DPO');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible || !account) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      setDpoId(null);
      setAddons(new Set());
      setTab('DPO');
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
          Broadcaster: d.plans?.Broadcaster || [],
          'A-la-carte': d.plans?.['A-la-carte'] || [],
        };
        setPlans(grouped);
        setStb(d.stb || null);
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
  const selectedOf = (type) => plans[type].filter((p) => addons.has(p.sub_plan_id));
  const alacarte = selectedOf('A-la-carte');
  const broadcasters = selectedOf('Broadcaster');
  const lines = dpo ? [dpo, ...alacarte, ...broadcasters] : [];
  const total = lines.reduce((s, p) => s + Number(p.price || 0), 0);
  const sum = (arr) => arr.reduce((s, p) => s + Number(p.price || 0), 0);

  // Same rule the backend uses: still active -> advance from current expiry, else from now
  const expiry = parseApiDate(stb?.expiration || account?.expriration || account?.expiration);
  const isAdvance = stb ? !!stb.is_active : !!(expiry && expiry.getTime() > Date.now());
  const validity = dpo?.plan_validity > 0 ? dpo.plan_validity : 30;
  const start = isAdvance && expiry ? new Date(expiry) : new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + validity);
  end.setHours(23, 59, 59, 0);

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

  const confirm = async () => {
    if (!dpo || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(lines.map((p) => p.sub_plan_id));
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!account) return null;
  const stbLabel = account.pioneer_stb_id ? `STB ${account.pioneer_stb_id}` : `IPTV #${account.id}`;
  const title = isAdvance ? 'Advance Renewal' : 'Recharge';

  const tabBadge = (key) => {
    if (key === 'DPO') return dpo ? '1' : '0';
    return String(selectedOf(key).length);
  };

  const listPanel = (
    <View style={wide ? { flex: 1.35, minWidth: 0 } : { alignSelf: 'stretch' }}>
      {/* TABS — side by side */}
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const locked = t.key !== 'DPO' && !dpo;
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
              ? 'Required · choose exactly one base pack'
              : dpo
              ? `Optional · select any number · ${selectedOf(tab).length} selected${selectedOf(tab).length ? ` (${money(sum(selectedOf(tab)))})` : ''}`
              : 'Select a DPO package first'}
          </Text>
          {tab !== 'DPO' && dpo && selectedOf(tab).length ? (
            <TouchableOpacity onPress={() => clearType(tab)}><Text style={styles.clearLink}>Clear</Text></TouchableOpacity>
          ) : null}
        </View>
        {tab === 'DPO' ? (
          <PackList
            key="DPO"
            packs={plans.DPO}
            mode="single"
            isSelected={(id) => id === dpoId}
            onPress={(id) => setDpoId(id)}
            disabled={submitting}
            emptyText="No DPO package is assigned to this operator."
            searchLabel="DPO packages"
          />
        ) : (
          <PackList
            key={tab}
            packs={plans[tab]}
            mode="multi"
            isSelected={(id) => addons.has(id)}
            onPress={toggle}
            disabled={!dpo || submitting}
            emptyText={`No ${TABS.find((t) => t.key === tab).label.toLowerCase()} are assigned to this operator.`}
            searchLabel={tab === 'Broadcaster' ? 'broadcasters' : 'channels'}
          />
        )}
        {tab === 'DPO' && dpo ? (
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
            <Text style={styles.billPrice}>{money(p.price)}</Text>
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
      {!dpo ? (
        <Text style={styles.muted}>Select a DPO package to start.</Text>
      ) : (
        <>
          {/* FTA PACK INCLUDED NOTICE (ITEM 9) */}
          <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: 8, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="check-circle" size={14} color="#10b981" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>FTA (Free-To-Air) Pack Included (₹0.00)</Text>
          </View>
          {summaryGroup('DPO', [dpo], false)}
          {summaryGroup(`A-la-carte (${alacarte.length})`, alacarte, true)}
          {summaryGroup(`Broadcasters (${broadcasters.length})`, broadcasters, true)}
          <View style={[styles.billRow, styles.billTotal]}>
            <Text style={[styles.billName, { fontWeight: '800' }]}>Total ({lines.length} pack{lines.length > 1 ? 's' : ''})</Text>
            <Text style={[styles.billPrice, { fontSize: 16, fontWeight: '800' }]}>{money(total)}</Text>
            <View style={{ width: 13 }} />
          </View>
          <KV label="Period" value={`${isAdvance ? formatApiDate(toYmdHms(start)) : 'Today'} → ${formatApiDate(toYmdHms(end))}`} />
          <KV label="Validity" value={`${validity} days`} />
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
            label={`${isAdvance ? 'Confirm Advance Renewal' : 'Confirm Recharge'}${dpo ? ` · ${money(total)}` : ''}`}
            kind="orange"
            onPress={confirm}
            loading={submitting}
            disabled={!dpo || loading}
          />
        </>
      }
    >
      <View style={styles.headerStrip}>
        <KV label="Current expiry" value={expiry ? formatApiDate(stb?.expiration || account.expriration) : 'Not active'} />
        <KV label="Type" value={isAdvance ? 'Advance renewal (STB still active)' : 'Recharge (STB expired / new)'} />
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={IPTV} />
          <Text style={styles.muted}>Loading packages…</Text>
        </View>
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : plans.DPO.length === 0 ? (
        <Note text="No DPO package is assigned to this operator yet. Ask your admin to map IPTV packages before recharging." />
      ) : (
        <>
          {currentSource === 'local' || currentSource === 'pioneer' ? (
            <Note tone="info" text={`The STB's current packages are pre-selected (${currentSource === 'local' ? 'last recharge' : 'live from Pioneer'}). Change them if needed.`} />
          ) : null}
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-start' : 'stretch', marginTop: 12 }}>
            {listPanel}
            {summaryPanel}
          </View>
          <Note
            text={
              (isAdvance
                ? 'Advance renewal starts when the current plan ends. If the packs differ from the current ones, Pioneer schedules the new pack set from that date.'
                : 'Recharge starts now.') + ' The operator wallet is debited immediately; if Pioneer rejects the renewal, the full amount is refunded.'
            }
          />
        </>
      )}
    </ModalShell>
  );
};

const styles = StyleSheet.create({
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