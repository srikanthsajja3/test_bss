import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Image, ScrollView, Platform, useWindowDimensions } from 'react-native';
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

export const isAccountVerified = (acc) => String(acc?.verified || '').trim().toLowerCase() === 'verified';

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
export const ModalShell = ({ visible, title, icon, iconColor = COLORS.primary, onClose, maxWidth = 480, children, footer, busy = false }) => {
  const { height } = useWindowDimensions();
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
  const t = tone === 'error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b', icon: 'alert-circle' } : tone === 'info' ? { bg: '#eff6ff', bd: '#bfdbfe', fg: '#1e40af', icon: 'info' } : { bg: '#fffbeb', bd: '#fde68a', fg: '#92400e', icon: 'info' };
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
});
