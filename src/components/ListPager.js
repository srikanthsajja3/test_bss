import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

/** Per-page chooser: a dropdown (web <select>); elsewhere a button that steps through the sizes. */
const PerPage = ({ value, sizes, onChange, compact }) => {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return (
      <View style={s.selectWrap}>
        {!compact ? <Text style={s.muted}>Per page</Text> : null}
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Rows per page"
          style={{ height: 32, padding: '0 26px 0 10px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontSize: 12.5, fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}
        >
          {sizes.map((n) => <option key={n} value={n}>{compact ? `${n} / page` : n}</option>)}
        </select>
      </View>
    );
  }
  const next = sizes[(sizes.indexOf(value) + 1) % sizes.length];
  return (
    <TouchableOpacity style={s.navBtn} onPress={() => onChange(next)}>
      <Text style={s.navText}>{value} / page</Text>
    </TouchableOpacity>
  );
};

/**
 * The bar above the subscriber tables (Internet, IPTV, OTT).
 *   desktop: "Showing 1 to 100 of 55,043 subscribers"  ·  Per page [100▾]  ·  Previous  Page 1 of 551  Next
 *   phone:   "1–100 of 55,043 subscribers"
 *            [100 / page ▾]                ‹  1 / 551  ›          (one line)
 */
export const ListPager = ({ isMobile, loading, total, shown, page, pages, pageSize, sizes = [100, 250, 500, 1000], onPage, onPageSize, noun = 'subscribers', extra }) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min((page - 1) * pageSize + shown, total);
  const prev = (
    <TouchableOpacity style={[s.navBtn, isMobile && s.iconBtn, page <= 1 && s.off]} disabled={page <= 1} onPress={() => onPage(Math.max(1, page - 1))} accessibilityLabel="Previous page">
      {isMobile ? <Feather name="chevron-left" size={16} color="#0f172a" /> : <Text style={s.navText}>Previous</Text>}
    </TouchableOpacity>
  );
  const next = (
    <TouchableOpacity style={[s.navBtn, isMobile && s.iconBtn, page >= pages && s.off]} disabled={page >= pages} onPress={() => onPage(Math.min(pages, page + 1))} accessibilityLabel="Next page">
      {isMobile ? <Feather name="chevron-right" size={16} color="#0f172a" /> : <Text style={s.navText}>Next</Text>}
    </TouchableOpacity>
  );
  if (isMobile) {
    return (
      <View style={s.barMobile}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
          <Text style={s.muted} numberOfLines={1}>{fmt(from)}–{fmt(to)} of {fmt(total)} {noun}{extra || ''}</Text>
        </View>
        <View style={s.rowMobile}>
          {onPageSize ? <PerPage value={pageSize} sizes={sizes} onChange={onPageSize} compact /> : <View />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {prev}
            <Text style={s.pageText}>{fmt(page)} / {fmt(pages)}</Text>
            {next}
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={s.bar}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        {loading ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        <Text style={s.muted}>Showing {fmt(from)} to {fmt(to)} of {fmt(total)} {noun}{extra || ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {onPageSize ? <PerPage value={pageSize} sizes={sizes} onChange={onPageSize} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {prev}
          <Text style={s.pageText}>Page {fmt(page)} of {fmt(pages)}</Text>
          {next}
        </View>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#ffffff' },
  barMobile: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#ffffff' },
  rowMobile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 12, color: '#64748b' },
  navBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  iconBtn: { width: 32, height: 32, paddingHorizontal: 0, paddingVertical: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  off: { opacity: 0.4 },
  navText: { fontSize: 12, fontWeight: '600', color: '#0f172a' },
  pageText: { fontSize: 12.5, fontWeight: '700', color: '#0f172a', paddingHorizontal: 4 },
});
