import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { PlanPriceTable } from './PlanPriceTable';
import { PlanCardList } from './PlanCardList';

/**
 * Read-only "Plans & Setup" of one operator, for admins (super / sub distributors).
 * Admins can't change plans, so instead of the editable plan pages this shows, in tables,
 * what the operator has been given: internet plans, IPTV packs, combos, OTT packages,
 * IPTV branches and KYC providers — with the admin's own margin and the operator price.
 * Props: partner, viewerId
 */
const TABS = [
  { id: 'internet', label: 'Internet', icon: 'wifi', color: '#0284c7' },
  { id: 'iptv', label: 'IPTV', icon: 'tv', color: '#7c3aed' },
  { id: 'combo', label: 'Combo', icon: 'layers', color: '#db2777' },
  { id: 'ott', label: 'OTT', icon: 'play-circle', color: '#0ea5e9' },
  { id: 'branches', label: 'IPTV Branches', icon: 'git-branch', color: '#0891b2' },
  { id: 'kyc', label: 'KYC Providers', icon: 'shield', color: '#9333ea' },
];

const listOf = (res) => (Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : []);

const loaders = {
  internet: async (pid) => {
    const res = await OneBssApi.getInternetPlans(pid);
    const chain = Array.isArray(res?.data?.admin_chain) ? res.data.admin_chain : [];
    const groups = listOf(res)
      .map((plan) => ({
        key: plan.plan_id,
        title: plan.plan_name,
        meta: `Data: ${plan.data || 'Unlimited'} | Plan ID: #${plan.plan_id}`,
        rows: (plan.subplans || plan.sub_plans || [])
          .filter((sp) => sp.is_mapped)
          .map((sp) => ({ kind: 'plan', id: sp.sub_plan_id, title: sp.sub_plan_name, validity: sp.plan_validity || 30, mappedPrice: sp.mapped_price, margins: sp.margins })),
      }))
      .filter((g) => g.rows.length);
    return { ok: res.ok, groups, chain, message: res.data?.message };
  },
  iptv: async (pid) => {
    const res = await OneBssApi.getIptvPlans(pid);
    const chain = Array.isArray(res?.data?.admin_chain) ? res.data.admin_chain : [];
    const byPack = new Map();
    listOf(res)
      .filter((p) => p.is_mapped)
      .forEach((p) => {
        const key = p.plan_id || p.sub_plan_id;
        if (!byPack.has(key)) byPack.set(key, { key, title: p.plan_name, typeLabel: p.type || 'A-la-carte', meta: `Pack ID: #${key}`, rows: [] });
        byPack.get(key).rows.push({ kind: 'plan', id: p.sub_plan_id || p.plan_id, title: `${p.plan_validity || 30} Days`, mappedPrice: p.mapped_price, margins: p.margins });
      });
    return { ok: res.ok, groups: [...byPack.values()], chain, message: res.data?.message };
  },
  combo: async (pid) => {
    const res = await OneBssApi.getComboPlans(pid);
    const chain = Array.isArray(res?.data?.admin_chain) ? res.data.admin_chain : [];
    const rows = listOf(res).map((c) => ({
      kind: 'plan',
      id: c.combo_id,
      title: c.combo_name,
      subtitle: `${c.internet?.plan_name || 'Internet'}${c.internet?.sub_plan_name ? ` (${c.internet.sub_plan_name})` : ''} + ${c.iptv?.plan_name || 'IPTV'}${c.is_active ? '' : ' · inactive'}`,
      validity: c.iptv?.validity_days || c.internet?.validity,
      mappedPrice: c.price,
      margins: c.margins,
    }));
    return { ok: res.ok, rows, chain, message: res.data?.message };
  },
  ott: async (pid) => {
    const res = await OneBssApi.getOttPlanMapping(pid);
    const byPkg = new Map();
    listOf(res)
      .filter((r) => r.is_mapped)
      .forEach((r) => {
        const key = r.plan_id || r.plan_name;
        if (!byPkg.has(key)) byPkg.set(key, { key, title: r.plan_name, meta: r.providers_list || '', rows: [] });
        byPkg.get(key).rows.push({ kind: 'plan', id: r.sub_plan_id, title: r.duration || `${r.validity_days} days`, subtitle: r.screens ? `${r.screens} screen${r.screens > 1 ? 's' : ''}` : '', mappedPrice: r.mapped_price ?? r.base_price });
      });
    return { ok: res.ok, groups: [...byPkg.values()], chain: [], message: res.data?.message, franchise: res.data?.franchise_id };
  },
  branches: async (pid) => {
    const res = await OneBssApi.getIptvBranchMapping(pid);
    const items = listOf(res)
      .filter((b) => b.is_assigned === true || b.is_assigned == 1 || b.is_mapped === true || b.is_mapped == 1)
      .map((b) => ({ key: String(b.branch_id ?? b.id ?? b.branch_code), name: b.branch_name || b.name || `Branch #${b.branch_id ?? b.id}`, code: b.branch_code || b.code || '' }));
    return { ok: res.ok, items, message: res.data?.message };
  },
  kyc: async (pid) => {
    const res = await OneBssApi.kycProviders(pid);
    const list = Array.isArray(res?.data?.providers) ? res.data.providers : Array.isArray(res?.data?.data?.providers) ? res.data.data.providers : [];
    return { ok: res.ok, items: list.map((p) => ({ key: String(p), name: String(p) })), message: res.data?.message };
  },
};

export const OperatorPlansView = ({ partner, viewerId }) => {
  const pid = partner?.partner_id || partner?.id;
  const [tab, setTab] = useState('internet');
  const [cache, setCache] = useState({});

  const cacheKey = `${pid}:${tab}`;
  useEffect(() => {
    if (!pid || cache[cacheKey]) return undefined;
    let alive = true;
    loaders[tab](pid)
      .catch(() => ({ ok: false, rows: [], items: [], chain: [] }))
      .then((r) => {
        if (!alive) return;
        setCache((prev) => ({ ...prev, [cacheKey]: r }));
      });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  const cur = TABS.find((t) => t.id === tab);
  const data = cache[cacheKey];

  const renderBody = () => {
    if (!data) return <ActivityIndicator size="small" color={cur.color} style={{ marginVertical: 28 }} />;
    if (!data.ok && data.message) return <Text style={s.note}>{data.message}</Text>;
    if (tab === 'branches' || tab === 'kyc') {
      return (
        <View style={s.card}>
          <View style={[s.tr, s.thRow]}>
            <Text style={[s.th, { width: 44 }]}>#</Text>
            <Text style={[s.th, { flex: 1 }]}>{tab === 'kyc' ? 'Provider' : 'Branch'}</Text>
            {tab === 'branches' ? <Text style={[s.th, { width: 140 }]}>Code</Text> : null}
          </View>
          {data.items.map((it, i) => (
            <View key={it.key} style={s.tr}>
              <Text style={[s.td, { width: 44, color: '#94a3b8' }]}>{i + 1}</Text>
              <Text style={[s.td, { flex: 1, fontWeight: '600', textTransform: tab === 'kyc' ? 'capitalize' : 'none' }]}>{it.name}</Text>
              {tab === 'branches' ? <Text style={[s.td, { width: 140, color: '#64748b' }]}>{it.code || '—'}</Text> : null}
            </View>
          ))}
          {!data.items.length ? <Text style={s.note}>{tab === 'kyc' ? 'No KYC providers assigned.' : 'No IPTV branches assigned.'}</Text> : null}
        </View>
      );
    }
    if (tab === 'combo') {
      return (
        <PlanPriceTable
          rows={data.rows}
          chain={data.chain || []}
          mode="view"
          viewerId={viewerId}
          accent={cur.color}
          emptyText="No combo plans are assigned to this operator yet."
        />
      );
    }
    // internet / IPTV / OTT: package cards (same design as the assign pages), options in a table when opened
    if (!data.groups || !data.groups.length) {
      return (
        <View style={s.card}>
          <Text style={s.note}>{`No ${cur.label} plans are assigned to this operator yet.`}</Text>
        </View>
      );
    }
    return (
      <PlanCardList
        key={cacheKey}
        groups={data.groups}
        icon={tab === 'internet' ? 'zap' : cur.icon}
        accent={tab === 'internet' ? '#06b6d4' : cur.color}
        mode="view"
        chain={data.chain || []}
        viewerId={viewerId}
      />
    );
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <TouchableOpacity key={t.id} onPress={() => setTab(t.id)} style={[s.tab, on && { backgroundColor: `${t.color}14`, borderColor: t.color }]}>
              <Feather name={t.icon} size={14} color={on ? t.color : '#64748b'} />
              <Text style={[s.tabText, on && { color: t.color }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {renderBody()}
      <Text style={s.foot}>View only — plans, prices and setup are managed by the super admin.</Text>
    </View>
  );
};

const s = StyleSheet.create({
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  tabText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 12 },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 13, color: COLORS.textMain },
  note: { fontSize: 12.5, color: '#64748b', padding: 20, textAlign: 'center' },
  foot: { fontSize: 11.5, color: '#94a3b8', marginTop: 10 },
});
