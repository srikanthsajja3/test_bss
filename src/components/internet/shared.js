import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, ScrollView, Platform, useWindowDimensions, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

// ---------------------------------------------------------------------------
// URLs from customer_lookup.php currently come back doubled, e.g.
// (base prefix + full URL + full URL again). Until that's fixed server-side,
// take the LAST absolute URL in the string, which is the real file.
// ---------------------------------------------------------------------------
export const fixDocUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const s = value.trim();
  const idx = Math.max(s.lastIndexOf('https://'), s.lastIndexOf('http://'));
  return idx > 0 ? s.slice(idx) : s;
};

export const isImageUrl = (url) => /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url || '');

export const openExternal = (url) => {
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    // eslint-disable-next-line global-require
    require('react-native').Linking.openURL(url);
  }
};

export const isSuperAdmin = (user) => {
  const role = String(user?.role || user?.account_role || '').toLowerCase().replace(/[\s_-]/g, '');
  return role === 'superadmin';
};

export const isAccountVerified = (acc) => {
  if (!acc) return false;
  // KYC status comes only from the server (Customer_demographics.aadhar_verified).
  const v = acc.verified ?? acc.aadhar_verified ?? acc.aadhaar_verified ?? acc.is_aadhar_verified ?? acc.is_aadhaar_verified;
  if (v === true || v === 1 || v === '1' || v === 'true' || String(v).trim().toLowerCase() === 'verified') {
    return true;
  }
  const k = String(acc.kyc || '').toLowerCase();
  if (!/\b(un|not|non)[\s_-]?verified\b|pending|failed/.test(k) && /\b(verified|aadhaar|scoreme|digilocker)\b/.test(k)) {
    return true;
  }
  return false;
};

// Customer photo with graceful fallback to initials / icon
export const CustomerPhoto = ({ uri, size = 56, radius = 14, initials = '', dark = true }) => {
  const [failed, setFailed] = useState(false);
  const src = fixDocUrl(uri);
  const box = { width: size, height: size, borderRadius: radius };
  if (src && !failed) {
    return (
      <Image
        source={{ uri: src }}
        style={[box, { backgroundColor: '#e2e8f0' }]}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[box, { justifyContent: 'center', alignItems: 'center', backgroundColor: dark ? '#0f172a' : '#f1f5f9', borderWidth: dark ? 0 : 1, borderColor: 'rgba(0,0,0,0.1)' }]}>
      {initials ? (
        <Text style={{ color: dark ? '#ffffff' : '#64748b', fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
      ) : (
        <Feather name="user" size={size * 0.5} color={dark ? '#ffffff' : '#64748b'} />
      )}
    </View>
  );
};

// Generic modal frame used by all account-action modals
export const ModalShell = ({ visible, title, icon, iconColor = COLORS.primary, onClose, maxWidth = 480, children, footer, busy = false, inline = false }) => {
  const { height } = useWindowDimensions();
  // inline: the same panel as a card inside the page (account detail tabs) — no overlay, no close
  if (inline) {
    return (
      <View style={styles.inlineCard}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            {icon ? <Feather name={icon} size={18} color={iconColor} /> : null}
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
        </View>
        <View style={{ padding: 18 }}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
      <View style={styles.overlay}>
        <View style={[styles.card, { maxWidth, maxHeight: height - 40 }]}>
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              {icon ? <Feather name={icon} size={18} color={iconColor} /> : null}
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity onPress={() => !busy && onClose()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 18 }}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
};

export const Btn = ({ label, onPress, kind = 'primary', disabled, loading, icon }) => {
  const k = BTN[kind] || BTN.primary;
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: k.bg, borderColor: k.border }, (disabled || loading) && { opacity: 0.55 }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {icon ? <Feather name={icon} size={14} color={k.fg} /> : null}
      <Text style={[styles.btnText, { color: k.fg }]}>{loading ? 'Please wait…' : label}</Text>
    </TouchableOpacity>
  );
};

const BTN = {
  primary: { bg: COLORS.primary, fg: '#ffffff', border: COLORS.primary },
  orange: { bg: '#f97316', fg: '#ffffff', border: '#f97316' },
  danger: { bg: '#ffffff', fg: '#dc2626', border: '#fca5a5' },
  ghost: { bg: 'rgba(0,0,0,0.05)', fg: COLORS.textMuted, border: 'transparent' },
};

export const KV = ({ label, value, bold }) => (
  <View style={styles.kv}>
    <Text style={styles.kvLabel}>{label}</Text>
    <Text style={[styles.kvValue, bold && { fontWeight: '700' }]} selectable>{value === undefined || value === null || value === '' ? '—' : String(value)}</Text>
  </View>
);

export const Note = ({ text, tone = 'warn' }) => {
  const t = tone === 'error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icon: 'alert-circle' } : tone === 'info' ? { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af', icon: 'info' } : tone === 'success' ? { bg: '#f0fdf4', bd: '#bbf7d0', fg: '#166534', icon: 'check-circle' } : { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', icon: 'info' };
  return (
    <View style={[styles.note, { backgroundColor: t.bg, borderColor: t.bd }]}>
      <Feather name={t.icon} size={13} color={t.fg} style={{ marginTop: 2 }} />
      <Text style={[styles.noteText, { color: t.fg }]}>{text}</Text>
    </View>
  );
};

// Dropdown: native <select> on web (keyboard type-ahead, handles long lists),
// a scrollable picker sheet elsewhere.
// options: [{ value, label }]
// Search field used by the recharge popups to filter package lists.
export const SearchBox = ({ value, onChange, placeholder = 'Search…', disabled, count, style }) => (
  <View style={[styles.searchBox, disabled && { opacity: 0.6 }, style]}>
    <Feather name="search" size={14} color="#94a3b8" />
    <TextInput
      style={styles.searchInput}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      editable={!disabled}
      autoCorrect={false}
      autoCapitalize="none"
    />
    {value && typeof count === 'number' ? <Text style={styles.searchCount}>{count} found</Text> : null}
    {value ? (
      <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={14} color="#64748b" />
      </TouchableOpacity>
    ) : null}
  </View>
);

/** True when every word of q appears in one of the texts (case-insensitive). */
export const matchesSearch = (q, ...texts) => {
  const words = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = texts.filter((t) => t !== null && t !== undefined).join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
};

/**
 * SearchSelect: a dropdown with a search box at the top of its list.
 * options: [{ value, label, sub?, search?, disabled? }]
 *   sub    — a grey second line under the label
 *   search — extra text to match on (not shown)
 * Keyboard (web): type to filter, ↑ / ↓ to move, Enter to pick, Esc to close.
 */
export const SearchSelect = ({
  value,
  options = [],
  onChange,
  disabled,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No match',
  accent = '#f97316',
}) => {
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [pos, setPos] = useState(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const selected = options.find((o) => String(o.value) === String(value));
  const shown = useMemo(() => options.filter((o) => matchesSearch(q, o.label, o.sub, o.search)), [options, q]);

  // focus the search box once the list is on screen (autoFocus is unreliable inside Modal on web)
  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => inputRef.current?.focus?.(), 30);
    return () => clearTimeout(t);
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const i = shown.findIndex((o) => String(o.value) === String(value) && !o.disabled);
    setHi(i >= 0 ? i : Math.max(0, shown.findIndex((o) => !o.disabled)));
  }, [open, q]);

  const openMenu = () => {
    if (disabled) return;
    const show = (x, y, w, h) => {
      setPos({ x, y, w, h });
      setQ('');
      setOpen(true);
    };
    if (triggerRef.current?.measureInWindow) triggerRef.current.measureInWindow(show);
    else show(16, 120, Math.min(420, winW - 32), 42);
  };
  const close = () => setOpen(false);
  const pick = (o) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
  };
  const move = (dir) => {
    if (!shown.length) return;
    let i = hi;
    for (let n = 0; n < shown.length; n += 1) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setHi(i);
    listRef.current?.scrollTo?.({ y: Math.max(0, i * 46 - 92), animated: false });
  };
  const onKey = (e) => {
    const k = e.nativeEvent?.key;
    if (k === 'ArrowDown') { e.preventDefault?.(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault?.(); move(-1); }
    else if (k === 'Enter') { e.preventDefault?.(); pick(shown[hi]); }
    else if (k === 'Escape') close();
  };

  // place the list under the field, or above it when there is no room below
  let panel = null;
  if (pos) {
    const width = Math.min(Math.max(pos.w, 260), winW - 16);
    const left = Math.max(8, Math.min(pos.x, winW - width - 8));
    const below = winH - (pos.y + pos.h) - 12;
    const above = pos.y - 12;
    const up = below < 240 && above > below;
    const maxH = Math.max(160, Math.min(360, up ? above : below));
    panel = up ? { left, width, bottom: winH - pos.y + 4, maxHeight: maxH } : { left, width, top: pos.y + pos.h + 4, maxHeight: maxH };
  }

  return (
    <>
      <TouchableOpacity
        ref={triggerRef}
        activeOpacity={0.8}
        style={[styles.ssTrigger, open && { borderColor: accent }, disabled && { opacity: 0.6, backgroundColor: '#f1f5f9' }]}
        onPress={openMenu}
        disabled={disabled}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, color: selected ? COLORS.textMain : '#94a3b8' }} numberOfLines={1}>
            {selected ? selected.label : placeholder}
          </Text>
          {selected?.sub ? <Text style={styles.ssSub} numberOfLines={1}>{selected.sub}</Text> : null}
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#64748b" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
        {panel ? (
          <View style={[styles.ssPanel, panel]}>
            <View style={styles.ssSearch}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                value={q}
                onChangeText={setQ}
                placeholder={searchPlaceholder}
                placeholderTextColor="#94a3b8"
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                onKeyPress={onKey}
                onSubmitEditing={() => pick(shown[hi])}
              />
              {q ? (
                <TouchableOpacity onPress={() => setQ('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="x" size={14} color="#64748b" />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView ref={listRef} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
              {shown.length === 0 ? (
                <Text style={{ padding: 14, fontSize: 13, color: '#64748b', textAlign: 'center' }}>{emptyText}</Text>
              ) : (
                shown.map((o, i) => {
                  const sel = String(o.value) === String(value);
                  return (
                    <TouchableOpacity
                      key={String(o.value)}
                      disabled={o.disabled}
                      onPress={() => pick(o)}
                      onMouseEnter={() => !o.disabled && setHi(i)}
                      style={[styles.ssItem, i === hi && { backgroundColor: '#f8fafc' }, sel && { backgroundColor: `${accent}14` }, o.disabled && { opacity: 0.45 }]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, color: sel ? accent : COLORS.textMain, fontWeight: sel ? '700' : '500' }} numberOfLines={2}>{o.label}</Text>
                        {o.sub ? <Text style={styles.ssSub} numberOfLines={1}>{o.sub}</Text> : null}
                      </View>
                      {sel ? <Feather name="check" size={15} color={accent} /> : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            {q && shown.length ? <Text style={styles.ssCount}>{shown.length} of {options.length}</Text> : null}
          </View>
        ) : null}
      </Modal>
    </>
  );
};

export const Dropdown = ({ value, options, onChange, disabled, placeholder = 'Select…' }) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value));

  if (Platform.OS === 'web') {
    return React.createElement(
      'select',
      {
        value: selected ? String(selected.value) : '',
        disabled,
        onChange: (e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        },
        style: {
          width: '100%', height: 42, padding: '0 12px', fontSize: 14, color: '#000',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          border: '1px solid rgba(0,0,0,0.18)', borderRadius: 8, backgroundColor: disabled ? '#f1f5f9' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
        },
      },
      !selected ? React.createElement('option', { value: '', disabled: true }, placeholder) : null,
      options.map((o) => React.createElement('option', { key: String(o.value), value: String(o.value) }, o.label))
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[sharedStyles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, disabled && { opacity: 0.6 }]}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={{ fontSize: 14, color: selected ? COLORS.textMain : '#94a3b8', flex: 1 }} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color="#64748b" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.card, { maxWidth: 420, maxHeight: '70%' }]}>
            <ScrollView>
              {options.map((o) => {
                const sel = String(o.value) === String(value);
                return (
                  <TouchableOpacity
                    key={String(o.value)}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: sel ? '#fff7ed' : '#ffffff' }}
                    onPress={() => { onChange(o.value); setOpen(false); }}
                  >
                    <Text style={{ fontSize: 14, color: sel ? '#c2410c' : COLORS.textMain, fontWeight: sel ? '700' : '500' }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export const sharedStyles = StyleSheet.create({
  input: { height: 40, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, paddingHorizontal: 12, fontSize: 13, color: COLORS.textMain, backgroundColor: '#ffffff', outlineStyle: 'none' },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6, letterSpacing: 0.3 },
});

const styles = StyleSheet.create({
  inlineCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', overflow: 'hidden', width: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
  btnText: { fontSize: 13, fontWeight: '700' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  kvLabel: { fontSize: 12, color: '#64748b' },
  kvValue: { fontSize: 12, fontWeight: '600', color: COLORS.textMain, textAlign: 'right', flexShrink: 1 },
  note: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, marginTop: 12 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, paddingHorizontal: 10, height: 38, backgroundColor: '#ffffff', marginBottom: 8 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none', height: 36 },
  searchCount: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  ssTrigger: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)', borderRadius: 8, backgroundColor: '#ffffff' },
  ssPanel: { position: 'absolute', backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', overflow: 'hidden', boxShadow: '0 12px 32px rgba(15,23,42,0.18)', elevation: 10 },
  ssSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  ssItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 46, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  ssSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  ssCount: { fontSize: 11, color: '#64748b', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fafafa' },
});
