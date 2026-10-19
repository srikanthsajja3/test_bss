import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

/**
 * One table for assigning operator package prices (the options of one package card —
 * internet sub plans, IPTV pack validities, OTT durations; see PlanCardList).
 * Price columns sit right next to the package name; one package per row; the table scrolls
 * sideways whenever it is wider than the screen (mobile and desktop).
 *
 *   edit mode (super admin):  ☐ | Package (validity, type) | Fetched | Super admin price | one margin per admin above the operator | Operator price
 *                             (no admins above -> the input column is the operator price itself)
 *   view mode (admins, read-only): Package (validity, type) | [Your margin] | Operator price
 *
 * rows: [{ kind: 'group', key, title, subtitle, selectedCount, total, expanded, onToggleExpand, onToggleAll }]
 *     | [{ kind: 'plan', id, title, subtitle, validity, type, basePrice, mappedPrice, margins }]
 */
const W = { check: 44, fetched: 110, sa: 140, margin: 150, op: 130, mine: 120, pkg: 300 };
const money = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : `₹${Number(v).toFixed(2)}`);
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? 0 : Number(v));

export const PlanPriceTable = ({
  rows = [],
  chain = [],
  mode = 'edit',
  viewerId = null,
  selectedIds = [],
  onToggle,
  saPriceOf,
  onSaPriceChange,
  marginState = {},
  onMarginChange,
  showType = false,
  showFetched = true,
  accent = '#0284c7',
  emptyText = 'No packages.',
  bare = false,
  firstHeader = 'Package',
}) => {
  const { width: screenW } = useWindowDimensions();
  const pkgW = screenW < 768 ? 170 : W.pkg; // keep the price boxes close to the name on phones
  const edit = mode === 'edit';
  const hasChain = chain.length > 0;
  const viewerInChain = !edit && chain.some((a) => String(a.partner_id) === String(viewerId));
  const selected = new Set(selectedIds.map(String));

  const minWidth =
    (edit ? W.check : 0) + pkgW +
    (edit ? (showFetched ? W.fetched : 0) + W.sa + chain.length * W.margin + (hasChain ? W.op : 0) : (viewerInChain ? W.mine : 0) + W.op) + 28;

  const header = (
    <View style={[s.tr, s.thRow]}>
      {edit ? <View style={{ width: W.check }} /> : null}
      <Text style={[s.th, { width: pkgW }]}>{firstHeader}</Text>
      {edit && showFetched ? <Text style={[s.th, s.right, { width: W.fetched }]}>Fetched</Text> : null}
      {edit ? <Text style={[s.th, s.right, { width: W.sa, paddingLeft: 12 }]} numberOfLines={2}>{hasChain ? 'Super admin price' : 'Operator price'}</Text> : null}
      {edit
        ? chain.map((a) => (
            <View key={a.partner_id} style={{ width: W.margin, alignItems: 'flex-end', paddingLeft: 12 }}>
              <Text style={[s.th, s.right]} numberOfLines={2}>+ {a.label}</Text>
              <Text style={[s.thSub, s.right]} numberOfLines={1}>{a.partner_name} · margin</Text>
            </View>
          ))
        : null}
      {!edit && viewerInChain ? <Text style={[s.th, s.right, { width: W.mine }]}>Your margin</Text> : null}
      {!edit || hasChain ? <Text style={[s.th, s.right, { width: W.op, paddingLeft: 12 }]} numberOfLines={2}>{edit ? '= Operator price' : 'Operator price'}</Text> : null}
      <View style={s.spacer} />
    </View>
  );

  const renderPlan = (r) => {
    const on = selected.has(String(r.id));
    const sa = saPriceOf ? saPriceOf(r) : '';
    const m = marginState[r.id] || {};
    const total = num(sa) + chain.reduce((sum, a) => sum + num(m[a.partner_id]), 0);
    const own = r.margins && viewerId != null ? r.margins[viewerId] ?? r.margins[String(viewerId)] : undefined;
    return (
      <View key={`p-${r.id}`} style={[s.tr, on && edit && { backgroundColor: `${accent}0d` }]}>
        {edit ? (
          <TouchableOpacity style={{ width: W.check }} onPress={() => onToggle && onToggle(r.id)}>
            <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? accent : '#94a3b8'} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={{ width: pkgW, paddingRight: 10 }} disabled={!edit} onPress={() => onToggle && onToggle(r.id)} activeOpacity={0.7}>
          <Text style={[s.td, { fontWeight: '700' }]} numberOfLines={2}>{r.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            {(r.validityText || r.validity) && String(r.validityText || `${r.validity} days`).toLowerCase() !== String(r.title || '').toLowerCase() ? <Text style={s.meta}>{r.validityText || `${r.validity} days`}</Text> : null}
            {showType && r.type ? (
              <View style={[s.badge, { backgroundColor: `${accent}18` }]}>
                <Text style={[s.badgeText, { color: accent }]} numberOfLines={1}>{r.type}</Text>
              </View>
            ) : null}
          </View>
          {r.subtitle ? <Text style={s.sub} numberOfLines={1}>{r.subtitle}</Text> : null}
        </TouchableOpacity>
        {edit && showFetched ? <Text style={[s.td, s.right, { width: W.fetched, color: '#64748b' }]}>{money(r.basePrice)}</Text> : null}
        {edit ? (
          <View style={[s.cellInput, { width: W.sa }]}>
            <Text style={s.td}>₹</Text>
            <TextInput
              style={[s.input, on && { borderColor: accent, color: accent }]}
              value={sa === undefined || sa === null ? '' : String(sa)}
              onChangeText={(v) => onSaPriceChange && onSaPriceChange(r.id, v.replace(/[^0-9.]/g, ''))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textDim}
            />
          </View>
        ) : null}
        {edit
          ? chain.map((a) => (
              <View key={a.partner_id} style={[s.cellInput, { width: W.margin }]}>
                <Text style={s.td}>₹</Text>
                <TextInput
                  style={[s.input, on && { borderColor: accent }]}
                  value={m[a.partner_id] !== undefined ? String(m[a.partner_id]) : ''}
                  onChangeText={(v) => onMarginChange && onMarginChange(r.id, a.partner_id, v.replace(/[^0-9.]/g, ''))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.textDim}
                />
              </View>
            ))
          : null}
        {!edit && viewerInChain ? <Text style={[s.td, s.right, { width: W.mine, color: '#047857', fontWeight: '700' }]}>{own !== undefined ? money(own) : '₹0.00'}</Text> : null}
        {edit && hasChain ? <Text style={[s.td, s.right, { width: W.op, fontWeight: '800', color: accent }]}>{money(total)}</Text> : null}
        {!edit ? <Text style={[s.td, s.right, { width: W.op, fontWeight: '800', color: accent }]}>{money(r.mappedPrice)}</Text> : null}
        <View style={s.spacer} />
      </View>
    );
  };

  const renderGroup = (g) => {
    const all = g.total > 0 && g.selectedCount === g.total;
    return (
      <TouchableOpacity key={`g-${g.key}`} style={[s.tr, s.groupRow]} onPress={g.onToggleExpand} disabled={!g.onToggleExpand} activeOpacity={0.7}>
        {edit ? (
          <TouchableOpacity style={{ width: W.check }} onPress={g.onToggleAll} disabled={!g.onToggleAll}>
            <Feather name={all ? 'check-square' : g.selectedCount ? 'minus-square' : 'square'} size={18} color={g.selectedCount ? accent : '#94a3b8'} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {g.onToggleExpand ? <Feather name={g.expanded ? 'chevron-down' : 'chevron-right'} size={16} color="#475569" /> : null}
          <Text style={[s.td, { fontWeight: '800' }]}>{g.title}</Text>
          {g.subtitle ? <Text style={s.sub}>{g.subtitle}</Text> : null}
          {edit && g.selectedCount ? (
            <View style={[s.badge, { backgroundColor: 'rgba(16,185,129,0.14)' }]}>
              <Text style={[s.badgeText, { color: '#059669' }]}>{g.selectedCount} selected</Text>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={bare ? s.bare : s.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: '100%', flexGrow: 1 }}>
        <View style={{ minWidth, flexGrow: 1 }}>
          {header}
          {rows.map((r) => (r.kind === 'group' ? renderGroup(r) : renderPlan(r)))}
          {!rows.length ? <Text style={[s.sub, { padding: 24, textAlign: 'center' }]}>{emptyText}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  bare: { backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  thRow: { backgroundColor: '#f8fafc', paddingVertical: 12 },
  groupRow: { backgroundColor: '#f1f5f9' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  thSub: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  td: { fontSize: 13, color: COLORS.textMain },
  sub: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  meta: { fontSize: 11.5, color: '#475569', fontWeight: '600' },
  right: { textAlign: 'right' },
  pkg: { width: W.pkg },
  spacer: { flex: 1 },
  cellInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  input: { width: 90, height: 32, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', textAlign: 'right', fontSize: 13, fontWeight: '700', color: COLORS.textMain, backgroundColor: '#ffffff' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
