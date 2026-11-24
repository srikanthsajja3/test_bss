// SubscriberCard.js — the card view of the Internet / IPTV / OTT subscriber lists.
// Shows only the basics (who, status, plan, expiry, mobile, operator/branch); everything else is on
// the customer's page. Cards sit in a responsive grid (1 column on phones, 2–4 on wider screens).
//
// Also: useListLayout(user) — the person's choice of "cards" or "table" for these lists, remembered
// in this browser per login. The very first time it is "table" (list).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, Animated, Easing } from 'react-native';
import { Feather, FontAwesome } from '@expo/vector-icons';

const web = Platform.OS === 'web';

// ---- remembered layout choice -------------------------------------------------------------
const layoutKey = (user) => `onebss_list_layout:${user?.username || user?.partner_id || 'me'}`;
const readLayout = (user) => {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(layoutKey(user)) : null;
    return v === 'table' || v === 'cards' ? v : 'table'; // first visit: list
  } catch (e) {
    return 'table';
  }
};
export function useListLayout(user) {
  const [layout, setLayoutState] = useState(() => readLayout(user));
  const setLayout = useCallback((v) => {
    setLayoutState(v);
    try { localStorage.setItem(layoutKey(user), v); } catch (e) { /* private window etc. */ }
  }, [user]);
  return [layout, setLayout];
}

// ---- Table / Cards switch -----------------------------------------------------------------
export const LayoutSwitch = ({ value, onChange, compact }) => (
  <View style={s.switch} accessibilityRole="radiogroup">
    {[['cards', 'grid', 'Cards'], ['table', 'list', 'Table']].map(([v, icon, label]) => {
      const on = value === v;
      return (
        <TouchableOpacity key={v} onPress={() => onChange(v)} style={[s.switchBtn, on && s.switchBtnOn]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${label} view`}>
          <Feather name={icon} size={13} color={on ? '#0f172a' : '#64748b'} />
          {!compact ? <Text style={[s.switchText, on && s.switchTextOn]}>{label}</Text> : null}
        </TouchableOpacity>
      );
    })}
  </View>
);

// ---- grid -----------------------------------------------------------------------------------
// Lays children out in equal columns that fit the available width (min ~330px a card).
export const CardGrid = ({ children, minWidth = 330, gap = 12 }) => {
  const [w, setW] = useState(0);
  const cols = w ? Math.max(1, Math.min(4, Math.floor((w + gap) / (minWidth + gap)))) : 1;
  const cw = w ? (w - gap * (cols - 1)) / cols : '100%';
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {React.Children.toArray(children).map((c, i) => <View key={c.key || i} style={{ width: cw }}>{c}</View>)}
    </View>
  );
};

// ---- online dot: green with a soft pulsing glow; offline: plain grey ------------------------
const OnlineDot = ({ online }) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!online) return undefined;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: !web }));
    loop.start();
    return () => loop.stop();
  }, [online, pulse]);
  return (
    <View style={s.onlineWrap} pointerEvents="none">
      {online ? (
        <Animated.View style={[s.onlineHalo, {
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        }]} />
      ) : null}
      <View style={[s.onlineDot, online ? s.onlineDotOn : { backgroundColor: '#cbd5e1' }]} />
    </View>
  );
};

// ---- the card -----------------------------------------------------------------------------
const TAG = {
  ok: { bg: '#ecfdf5', fg: '#047857' },
  warn: { bg: '#fffbeb', fg: '#b45309' },
  bad: { bg: '#fff1f2', fg: '#be123c' },
  muted: { bg: '#f1f5f9', fg: '#475569' },
};

const Cell = ({ label, value, sub, tag, onPress, onCopy, valueColor, full }) => {
  const body = (
    <>
      <Text style={s.cellLabel}>{label}</Text>
      <View style={s.cellValueRow}>
        <Text style={[s.cellValue, valueColor && { color: valueColor }]} numberOfLines={1}>{value || '—'}</Text>
        {onCopy && value ? (
          <TouchableOpacity onPress={onCopy} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} accessibilityLabel={`Copy ${label}`}>
            <Feather name="copy" size={11} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>
      {sub || tag ? (
        <View style={s.cellSubRow}>
          {sub ? <Text style={s.cellSub} numberOfLines={1}>{sub}</Text> : null}
          {tag ? (
            <View style={[s.tag, { backgroundColor: (TAG[tag.tone] || TAG.muted).bg }]}>
              <Text style={[s.tagText, { color: (TAG[tag.tone] || TAG.muted).fg }]} numberOfLines={1}>{tag.text}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );
  return onPress ? (
    <TouchableOpacity style={[s.cell, full && s.cellFull]} onPress={onPress}>{body}</TouchableOpacity>
  ) : (
    <View style={[s.cell, full && s.cellFull]}>{body}</View>
  );
};

/**
 * props:
 *   title, titleColor, strike, subtitle, accent (avatar colour)
 *   online: true | false | undefined (no dot)
 *   status: { label, bg, fg, dot }
 *   selected, onSelect (shows a checkbox when given)
 *   onOpen: open the customer
 *   cells: [{ label, value, sub, tag: { text, tone: ok|warn|bad|muted }, onPress, onCopy, valueColor, full }]
 *   badge: node on the footer's left (e.g. Aadhaar)
 *   actions: [{ icon, label, onPress, color, brand }]  (icon buttons; label is the tooltip)
 *   openLabel
 */
export const SubscriberCard = ({
  title, titleColor = '#0f172a', strike, subtitle, accent = '#10b981', online, status,
  selected, onSelect, onOpen, cells = [], badge, actions = [], openLabel = 'Open',
}) => {
  const initial = String(subtitle || title || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[s.card, selected && s.cardSel]}>
      {/* header */}
      <View style={s.head}>
        {onSelect ? (
          <TouchableOpacity onPress={onSelect} hitSlop={{ top: 10, bottom: 10, left: 10, right: 6 }} accessibilityLabel={selected ? 'Unselect' : 'Select'}>
            <Feather name={selected ? 'check-square' : 'square'} size={17} color={selected ? '#2563eb' : '#cbd5e1'} />
          </TouchableOpacity>
        ) : null}
        <Pressable onPress={onOpen} style={({ hovered }) => [s.who, hovered && web && { opacity: 0.85 }]}>
          <View style={[s.avatar, { backgroundColor: `${accent}1a` }]}>
            <Text style={[s.avatarText, { color: accent }]}>{initial}</Text>
            {online !== undefined && online !== null ? <OnlineDot online={!!online} /> : null}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: titleColor }, strike && s.strike]} numberOfLines={1}>{title}</Text>
            <Text style={s.subtitle} numberOfLines={1}>{subtitle || '—'}</Text>
          </View>
        </Pressable>
        {status ? (
          <View style={[s.status, { backgroundColor: status.bg }]}>
            {status.dot ? <View style={[s.statusDot, { backgroundColor: status.dot }]} /> : null}
            <Text style={[s.statusText, { color: status.fg }]} numberOfLines={1}>{status.label}</Text>
          </View>
        ) : null}
      </View>

      {/* the basics, two per row */}
      <View style={s.cells}>
        {cells.filter(Boolean).map((c) => <Cell key={c.label} {...c} />)}
      </View>

      {/* footer */}
      <View style={s.foot}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' }}>{badge}</View>
        {actions.filter(Boolean).map((a) => (
          <TouchableOpacity key={a.label} onPress={a.onPress} style={s.iconBtn} accessibilityLabel={a.label} title={a.label}>
            {a.brand ? <FontAwesome name={a.icon} size={14} color={a.color || '#475569'} /> : <Feather name={a.icon} size={14} color={a.color || '#475569'} />}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onOpen} style={s.openBtn} accessibilityLabel={openLabel}>
          <Text style={s.openText}>{openLabel}</Text>
          <Feather name="arrow-right" size={13} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

/** Small footer badge: verified (green) or a "Verify" button (red outline). */
export const VerifyBadge = ({ verified, label = 'Aadhaar', onVerify }) => (verified ? (
  <View style={[s.vb, { backgroundColor: '#ecfdf5' }]}>
    <Feather name="check-circle" size={11} color="#059669" />
    <Text style={[s.vbText, { color: '#047857' }]}>{label} verified</Text>
  </View>
) : onVerify ? (
  <TouchableOpacity onPress={onVerify} style={[s.vb, { borderWidth: 1, borderColor: '#fecdd3', backgroundColor: '#fff1f2' }]}>
    <Feather name="shield" size={11} color="#e11d48" />
    <Text style={[s.vbText, { color: '#be123c' }]}>Verify {label}</Text>
  </TouchableOpacity>
) : null);

const s = StyleSheet.create({
  switch: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 3, gap: 2 },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 28, borderRadius: 6 },
  switchBtnOn: { backgroundColor: '#ffffff', ...(web ? { boxShadow: '0 1px 2px rgba(15,23,42,0.12)' } : { elevation: 1 }) },
  switchText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  switchTextOn: { color: '#0f172a' },

  card: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', ...(web ? { boxShadow: '0 1px 2px rgba(15,23,42,0.05)' } : null) },
  cardSel: { borderColor: '#93c5fd', backgroundColor: '#f8fbff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, ...(web ? { cursor: 'pointer' } : null) },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800' },
  onlineWrap: { position: 'absolute', right: -1, bottom: -1, width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  onlineHalo: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  onlineDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#ffffff' },
  onlineDotOn: { backgroundColor: '#22c55e', ...(web ? { boxShadow: '0 0 6px 1px rgba(34,197,94,0.75)' } : { shadowColor: '#22c55e', shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 3 }) },
  title: { fontSize: 14, fontWeight: '700' },
  strike: { textDecorationLine: 'line-through' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, maxWidth: 120 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },

  cells: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  cell: { width: '50%', paddingRight: 10, marginBottom: 10, minWidth: 0 },
  cellFull: { width: '100%' },
  cellLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  cellValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  cellValue: { fontSize: 13, fontWeight: '600', color: '#1e293b', flexShrink: 1 },
  cellSubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  cellSub: { fontSize: 11.5, color: '#64748b', flexShrink: 1 },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  tagText: { fontSize: 10.5, fontWeight: '700' },

  foot: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 9 },
  iconBtn: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#0f766e' },
  openText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  vb: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 6 },
  vbText: { fontSize: 11, fontWeight: '700' },
});
