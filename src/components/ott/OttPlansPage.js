import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { PlanCardList } from '../plans/PlanCardList';

const OTT = '#0ea5e9';
const money = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : `₹${Number(v).toFixed(2)}`);

/**
 * Partner › OTT Plans: sync OTTAggre packages for the operator's franchise, choose which ones the
 * operator sells and at what price (full replace, like IPTV plans), and see the franchise wallet.
 * Props: partner, onBack
 */
export const OttPlansPage = ({ partner, onBack }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [franchise, setFranchise] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [prices, setPrices] = useState({});
  const [search, setSearch] = useState('');
  const [wallet, setWallet] = useState(null);
  const [expanded, setExpanded] = useState([]);

  const load = async () => {
    setLoading(true);
    const res = await OneBssApi.getOttPlanMapping(partner.partner_id);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not load OTT plans.');
      return;
    }
    const list = res.data?.data || [];
    setRows(list);
    setFranchise(res.data?.franchise_id || null);
    setSelected(new Set(list.filter((r) => r.is_mapped).map((r) => r.sub_plan_id)));
    const p = {};
    list.forEach((r) => {
      p[r.sub_plan_id] = r.mapped_price !== null && r.mapped_price !== undefined ? String(r.mapped_price) : String(r.base_price ?? '');
    });
    setPrices(p);
    if (res.data?.franchise_id) {
      const w = await OneBssApi.getOttWalletBalance(partner.partner_id);
      setWallet(w.ok ? w.data?.balance : null);
    }
  };
  useEffect(() => {
    load();
  }, [partner?.partner_id]);

  const sync = async () => {
    setSyncing(true);
    const res = await OneBssApi.syncOttPlans(partner.partner_id);
    setSyncing(false);
    if (res.ok) {
      toast.success(res.data?.message || 'OTT packages synced.');
      load();
    } else {
      toast.error(res.data?.message || 'OTT package sync failed.');
    }
  };

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.plan_name} ${r.duration} ${r.providers_list || ''}`.toLowerCase().includes(t)) : rows;
  }, [rows, search]);
  const allOn = filtered.length > 0 && filtered.every((r) => selected.has(r.sub_plan_id));
  const toggle = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      filtered.forEach((r) => (allOn ? n.delete(r.sub_plan_id) : n.add(r.sub_plan_id)));
      return n;
    });

  const save = async () => {
    setSaving(true);
    const plans = [...selected].map((id) => ({ ott_sub_plan_id: id, ...(prices[id] !== '' && prices[id] !== undefined ? { price: Number(prices[id]) } : {}) }));
    const res = await OneBssApi.assignOttPlans(partner.partner_id, plans);
    setSaving(false);
    if (res.ok) {
      toast.success(res.data?.message || 'OTT plans assigned.');
      load();
    } else {
      toast.error(res.data?.message || 'Could not assign OTT plans.');
    }
  };

  // One card per OTT package (like internet plans); its durations are the options in the price table.
  const groups = useMemo(() => {
    const byPkg = new Map();
    filtered.forEach((r) => {
      const key = r.plan_id || r.ott_package_id || r.plan_name;
      if (!byPkg.has(key)) byPkg.set(key, { key, title: r.plan_name, meta: r.providers_list || `Package #${r.ott_package_id || key}`, rows: [] });
      byPkg.get(key).rows.push({
        kind: 'plan',
        id: r.sub_plan_id,
        title: r.duration || `${r.validity_days} days`,
        subtitle: [r.screens ? `${r.screens} screen${r.screens > 1 ? 's' : ''}` : null, `List ${money(r.list_price)}`, `OTTAggre cost ${money(r.transfer_price)}`].filter(Boolean).join(' · '),
        basePrice: r.base_price,
        mappedPrice: r.mapped_price,
      });
    });
    return [...byPkg.values()];
  }, [filtered]);

  const cards = (
    <PlanCardList
      groups={groups}
      expandedKeys={expanded}
      onToggleExpand={(key) => setExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
      forceExpanded={search.trim().length > 0}
      onToggleGroup={(g, allSelected) =>
        setSelected((prev) => {
          const n = new Set(prev);
          g.rows.forEach((r) => (allSelected ? n.delete(r.id) : n.add(r.id)));
          return n;
        })
      }
      icon="play-circle"
      accent={OTT}
      mode="edit"
      chain={[]}
      selectedIds={[...selected]}
      onToggle={toggle}
      saPriceOf={(r) => prices[r.id] ?? ''}
      onSaPriceChange={(id, v) => {
        setPrices((p) => ({ ...p, [id]: v }));
        if (!selected.has(id)) toggle(id);
      }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24 }}>
        <TouchableOpacity style={styles.back} onPress={onBack}>
          <Feather name="arrow-left" size={16} color={COLORS.textMain} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, maxWidth: '100%' }}>
            <View style={styles.headIcon}><Feather name="play-circle" size={22} color={OTT} /></View>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text style={[styles.title, isMobile && { fontSize: 18 }]}>OTT Plans</Text>
              <Text style={styles.sub}>
                {partner.partner_name} (#{partner.partner_id}) · {franchise ? `Franchise ${franchise}` : 'no OTT franchise id'}
                {wallet !== null && wallet !== undefined ? ` · OTTAggre wallet ${money(wallet)}` : ''}
              </Text>
            </View>
          </View>
        </View>

        {!franchise && !loading ? (
          <View style={styles.warn}>
            <Feather name="alert-triangle" size={14} color="#b45309" />
            <Text style={styles.warnText}>Add this operator's OTTAggre franchise id (Edit Details › OTT) before syncing packages.</Text>
          </View>
        ) : null}

        <View style={[styles.toolbar, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={[styles.search, isMobile && { width: '100%' }]}>
            <Feather name="search" size={14} color="#94a3b8" />
            <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search packages…" placeholderTextColor="#94a3b8" />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TouchableOpacity style={styles.btnLight} onPress={sync} disabled={syncing || !franchise}>
              {syncing ? <ActivityIndicator size="small" color={OTT} /> : <Feather name="refresh-cw" size={14} color={OTT} />}
              <Text style={[styles.btnLightText, { color: OTT }]}>Sync Packages</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnLight} onPress={() => setExpanded(groups.map((g) => g.key))} disabled={!groups.length}>
              <Text style={[styles.btnLightText, { color: OTT }]}>Expand All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnLight} onPress={() => setExpanded([])} disabled={!groups.length}>
              <Text style={styles.btnLightText}>Collapse All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnLight} onPress={toggleAll} disabled={!filtered.length}>
              <Feather name={allOn ? 'square' : 'check-square'} size={14} color="#334155" />
              <Text style={styles.btnLightText}>{allOn ? 'Deselect All' : `Select All (${filtered.length})`}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnMain, (saving || loading) && { opacity: 0.6 }]} onPress={save} disabled={saving || loading}>
              {saving ? <ActivityIndicator size="small" color="#ffffff" /> : <Feather name="check-circle" size={14} color="#ffffff" />}
              <Text style={styles.btnMainText}>Assign OTT Plans ({selected.size})</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={OTT} style={{ marginVertical: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.card}>
            <Text style={[styles.sub, { padding: 20, textAlign: 'center' }]}>{rows.length ? 'No package matches.' : 'No OTT packages yet — press Sync Packages.'}</Text>
          </View>
        ) : (
          cards
        )}
        <Text style={[styles.sub, { marginTop: 10 }]}>
          OTTAggre takes its cost from the franchise wallet on every activation; the operator pays the operator price from their OneBSS wallet.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ffffff' },
  backText: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  headRow: { marginVertical: 14 },
  headIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(14,165,233,0.12)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.textMain },
  sub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  warn: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', marginBottom: 12 },
  warnText: { fontSize: 12, color: '#92400e', flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, minWidth: 220, flexGrow: 1, maxWidth: 380, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  btnLight: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  btnLightText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  btnMain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: OTT },
  btnMainText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  priceInput: { width: 90, height: 32, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', textAlign: 'right', fontSize: 13, fontWeight: '700', color: COLORS.textMain, backgroundColor: '#ffffff' },
});
