import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';

const money = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : `₹${Number(v).toFixed(2)}`);
const SECTIONS = [
  { key: 'internet', title: 'Internet packages', icon: 'wifi', color: '#0284c7' },
  { key: 'iptv', title: 'IPTV packs', icon: 'tv', color: '#7c3aed' },
  { key: 'combo', title: 'Combo plans', icon: 'layers', color: '#db2777' },
];

/**
 * Customer prices of one operator (customer_prices.php): one price per package for ALL of the
 * operator's customers — internet sub-plans, IPTV packs and combo plans. Each must be greater
 * than the operator price. Used when the operator turns on online recharge for a customer.
 *
 * Props: partnerId (operator), partnerName, readOnly, onBack (optional)
 */
export const CustomerPricesPage = ({ partnerId, partnerName, readOnly = false, onBack }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({ internet: [], iptv: [], combo: [] });
  const [edits, setEdits] = useState({}); // "service:ref" -> string
  const [search, setSearch] = useState('');

  const apply = (d) => {
    const next = d || { internet: [], iptv: [], combo: [] };
    setData(next);
    const e = {};
    SECTIONS.forEach((s) => (next[s.key] || []).forEach((r) => {
      e[`${r.service}:${r.ref_id}`] = r.customer_price !== null && r.customer_price !== undefined ? String(r.customer_price) : '';
    }));
    setEdits(e);
  };

  const load = async () => {
    setLoading(true);
    const res = await OneBssApi.getCustomerPrices(partnerId);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not load customer prices.');
      return;
    }
    apply(res.data?.data);
  };
  useEffect(() => {
    if (partnerId) load();
  }, [partnerId]);

  const changed = useMemo(() => {
    const out = [];
    SECTIONS.forEach((s) => (data[s.key] || []).forEach((r) => {
      const key = `${r.service}:${r.ref_id}`;
      const was = r.customer_price !== null && r.customer_price !== undefined ? String(r.customer_price) : '';
      if ((edits[key] ?? '') !== was) out.push({ row: r, value: edits[key] ?? '' });
    }));
    return out;
  }, [data, edits]);

  const save = async () => {
    for (const { row, value } of changed) {
      if (value !== '' && !(Number(value) > Number(row.operator_price))) {
        toast.warn(`${row.name}: the customer price must be greater than the operator price (${money(row.operator_price)}).`);
        return;
      }
    }
    setSaving(true);
    const res = await OneBssApi.saveCustomerPrices(
      partnerId,
      changed.map(({ row, value }) => ({ service: row.service, ref_id: row.ref_id, customer_price: value === '' ? null : Number(value) }))
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(res.data?.message || 'Could not save customer prices.');
      return;
    }
    toast.success(res.data?.message || 'Customer prices saved.');
    apply(res.data?.data);
  };

  const q = search.trim().toLowerCase();
  const rowsOf = (key) => (data[key] || []).filter((r) => !q || `${r.name} ${r.detail || ''}`.toLowerCase().includes(q));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
      <ScrollView contentContainerStyle={{ padding: isMobile ? 14 : 24, width: '100%' }}>
        {onBack ? (
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Feather name="arrow-left" size={18} color={COLORS.textMain} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.head}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
            <View style={styles.headIcon}><Feather name="tag" size={22} color="#059669" /></View>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.title}>Customer Prices</Text>
              <Text style={styles.subtitle}>
                {partnerName ? `${partnerName}` : ''}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center', width: isMobile ? '100%' : 'auto' }}>
            <View style={[styles.search, isMobile && { flex: 1 }]}>
              <Feather name="search" size={14} color={COLORS.textDim} />
              <TextInput style={styles.searchInput} placeholder="Search packages..." value={search} onChangeText={setSearch} placeholderTextColor={COLORS.textDim} />
            </View>
            {!readOnly ? (
              <TouchableOpacity style={[styles.saveBtn, (!changed.length || saving) && { opacity: 0.55 }]} onPress={save} disabled={!changed.length || saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={15} color="#fff" />}
                <Text style={styles.saveText}>Save {changed.length ? `(${changed.length})` : ''}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#059669" style={{ marginVertical: 40 }} />
        ) : (
          SECTIONS.map((s) => {
            const rows = rowsOf(s.key);
            return (
              <View key={s.key} style={styles.card}>
                <View style={styles.cardHead}>
                  <Feather name={s.icon} size={15} color={s.color} />
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.count}>{(data[s.key] || []).length}</Text>
                </View>
                {rows.length === 0 ? (
                  <Text style={styles.empty}>
                    {(data[s.key] || []).length === 0
                      ? s.key === 'combo' ? 'No active combo plans for this operator.' : 'No packages assigned to this operator yet.'
                      : 'Nothing matches the search.'}
                  </Text>
                ) : (
                  <>
                    {!isMobile ? (
                      <View style={styles.thRow}>
                        <Text style={[styles.th, { flex: 2 }]}>Package</Text>
                        <Text style={[styles.th, { width: 80 }]}>Validity</Text>
                        <Text style={[styles.th, { width: 120, textAlign: 'right' }]}>Operator price</Text>
                        <Text style={[styles.th, { width: 150, textAlign: 'right' }]}>Customer price</Text>
                        <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Your margin</Text>
                      </View>
                    ) : null}
                    {rows.map((r) => {
                      const key = `${r.service}:${r.ref_id}`;
                      const val = edits[key] ?? '';
                      const bad = val !== '' && !(Number(val) > Number(r.operator_price));
                      const margin = val !== '' && !bad ? Number(val) - Number(r.operator_price) : null;
                      return (
                        <View key={key} style={[styles.tr, isMobile && { flexWrap: 'wrap', gap: 8 }]}>
                          <View style={{ flex: 2, minWidth: isMobile ? '100%' : 0 }}>
                            <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                            {r.detail ? <Text style={styles.detail} numberOfLines={1}>{r.detail}</Text> : null}
                            {r.below_operator_price ? <Text style={styles.warn}>Saved price is not above the operator price any more — raise it.</Text> : null}
                          </View>
                          <Text style={[styles.cell, { width: 80 }]}>{r.validity_days || 30} days</Text>
                          <Text style={[styles.cell, { width: 120, textAlign: 'right' }]}>{money(r.operator_price)}</Text>
                          <View style={{ width: 150, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontWeight: '700', color: COLORS.textMain }}>₹</Text>
                            <TextInput
                              style={[styles.input, bad && { borderColor: '#ef4444' }, readOnly && { backgroundColor: '#f8fafc' }]}
                              value={val}
                              editable={!readOnly}
                              onChangeText={(v) => setEdits((prev) => ({ ...prev, [key]: v.replace(/[^0-9.]/g, '') }))}
                              keyboardType="numeric"
                              placeholder={readOnly ? '—' : `> ${Number(r.operator_price).toFixed(0)}`}
                              placeholderTextColor={COLORS.textDim}
                            />
                          </View>
                          <Text style={[styles.cell, { width: 100, textAlign: 'right', color: bad ? '#b91c1c' : '#047857', fontWeight: '700' }]}>
                            {bad ? 'Too low' : margin !== null ? money(margin) : '—'}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 12 },
  backText: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  headIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.textMain },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', backgroundColor: '#ffffff', minWidth: 220 },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#059669' },
  saveText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', marginBottom: 16, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, flex: 1 },
  count: { fontSize: 11, fontWeight: '700', color: '#64748b', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  empty: { fontSize: 13, color: COLORS.textMuted, padding: 16 },
  thRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f8fafc', gap: 8 },
  th: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 },
  name: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  detail: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  warn: { fontSize: 11, color: '#b45309', marginTop: 2 },
  cell: { fontSize: 12.5, color: COLORS.textMain },
  input: { width: 100, height: 32, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 6, paddingHorizontal: 8, fontSize: 13, fontWeight: '700', textAlign: 'right', color: COLORS.textMain, backgroundColor: '#ffffff' },
});
