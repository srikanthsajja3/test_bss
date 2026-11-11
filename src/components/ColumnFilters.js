import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * Controls for a table's filter row (one control under each column header).
 * Every value is sent to the server, so the filters cover all pages, not just the rows on screen.
 *
 *   <ColSearch value onChange placeholder />                 text box (parent debounces)
 *   <ColSelect value options=[{value,label}] onChange placeholder />
 *   <ColDateRange value={{ preset, from, to }} onChange />    Today / Last 7 Days / ... / Custom Range
 *   dateRangeParams(value) -> { exp_from, exp_to }           (Y-m-d, both days included)
 */

const ACCENT = '#2563eb';
const BORDER = '#cbd5e1';
const H = 34;

// ---- dates (device local time; the app is used in IST) ----
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : s;
};

export const DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'next7', label: 'Next 7 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'next30', label: 'Next 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'next_month', label: 'Next Month' },
  { id: 'custom', label: 'Custom Range' },
];

export const presetRange = (id) => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const month = (offset) => {
    const a = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    const b = new Date(t.getFullYear(), t.getMonth() + offset + 1, 0);
    return [a, b];
  };
  const r = {
    today: [t, t],
    yesterday: [addDays(t, -1), addDays(t, -1)],
    tomorrow: [addDays(t, 1), addDays(t, 1)],
    last7: [addDays(t, -6), t],
    next7: [t, addDays(t, 6)],
    last30: [addDays(t, -29), t],
    next30: [t, addDays(t, 29)],
    this_month: month(0),
    last_month: month(-1),
    next_month: month(1),
  }[id];
  return r ? { from: ymd(r[0]), to: ymd(r[1]) } : null;
};

/** Query params for a ColDateRange value. Presets are re-worked out each time, so "Today" stays today. */
export const dateRangeParams = (v) => {
  if (!v || !v.preset) return {};
  const r = v.preset === 'custom' ? { from: v.from, to: v.to } : presetRange(v.preset);
  if (!r) return {};
  return { exp_from: r.from || undefined, exp_to: r.to || undefined };
};

export const dateRangeLabel = (v) => {
  if (!v || !v.preset) return '';
  if (v.preset !== 'custom') return (DATE_PRESETS.find((p) => p.id === v.preset) || {}).label || '';
  if (v.from && v.to) return v.from === v.to ? shortDate(v.from) : `${shortDate(v.from)} – ${shortDate(v.to)}`;
  if (v.from) return `From ${shortDate(v.from)}`;
  if (v.to) return `Till ${shortDate(v.to)}`;
  return 'Custom Range';
};

// ---- popover under a trigger (rendered in a Modal so table scroll areas never clip it) ----
const usePopover = (minWidth = 180) => {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const { width: winW, height: winH } = useWindowDimensions();
  const open = () => {
    const show = (x, y, w, h) => setPos({ x, y, w, h });
    if (ref.current?.measureInWindow) ref.current.measureInWindow(show);
    else show(16, 120, minWidth, H);
  };
  const close = () => setPos(null);
  let panel = null;
  if (pos) {
    const width = Math.min(Math.max(pos.w, minWidth), winW - 16);
    const left = Math.max(8, Math.min(pos.x, winW - width - 8));
    const below = winH - (pos.y + pos.h) - 12;
    const above = pos.y - 12;
    const up = below < 260 && above > below;
    const maxHeight = Math.max(180, Math.min(440, up ? above : below));
    panel = up ? { left, width, bottom: winH - pos.y + 4, maxHeight } : { left, width, top: pos.y + pos.h + 4, maxHeight };
  }
  return { ref, isOpen: !!pos, open, close, panel };
};

const Trigger = React.forwardRef(({ label, placeholder, active, isOpen, onPress, onClear, icon = 'chevron-down' }, ref) => (
  <TouchableOpacity
    ref={ref}
    activeOpacity={0.8}
    onPress={onPress}
    style={[s.box, active && s.boxActive, isOpen && { borderColor: ACCENT }]}
  >
    <Text style={[s.boxText, !active && s.placeholder]} numberOfLines={1}>{active ? label : placeholder}</Text>
    {active && onClear ? (
      <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={s.clearBtn}>
        <Feather name="x" size={12} color="#64748b" />
      </TouchableOpacity>
    ) : (
      <Feather name={icon} size={14} color={active ? ACCENT : '#64748b'} />
    )}
  </TouchableOpacity>
));

export const ColSearch = ({ value, onChange, placeholder = 'Search' }) => (
  <View style={[s.box, !!value && s.boxActive]}>
    <Feather name="search" size={12} color={value ? ACCENT : '#94a3b8'} />
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      autoCorrect={false}
      autoCapitalize="none"
    />
    {value ? (
      <TouchableOpacity onPress={() => onChange('')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
        <Feather name="x" size={12} color="#64748b" />
      </TouchableOpacity>
    ) : null}
  </View>
);

/** Dropdown. options: [{ value, label }]; the first "all" choice is added here (value ''). */
export const ColSelect = ({ value, options = [], onChange, placeholder = 'Select', allLabel = 'All', searchable }) => {
  const pop = usePopover(200);
  const [q, setQ] = useState('');
  const showSearch = searchable ?? options.length > 8;
  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const active = value !== '' && value !== undefined && value !== null && !!selected;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => String(o.label).toLowerCase().includes(t)) : options;
  }, [options, q]);
  useEffect(() => { if (!pop.isOpen) setQ(''); }, [pop.isOpen]);
  const pick = (v) => { onChange(v); pop.close(); };

  return (
    <>
      <Trigger ref={pop.ref} label={selected?.label} placeholder={placeholder} active={active} isOpen={pop.isOpen} onPress={pop.open} onClear={() => onChange('')} />
      <Modal visible={pop.isOpen} transparent animationType="none" onRequestClose={pop.close}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={pop.close} />
        {pop.panel ? (
          <View style={[s.panel, pop.panel]}>
            {showSearch ? (
              <View style={s.panelSearch}>
                <Feather name="search" size={13} color="#94a3b8" />
                <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Search…" placeholderTextColor="#94a3b8" autoFocus />
              </View>
            ) : null}
            <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
              {!q ? <Item label={allLabel} selected={!active} onPress={() => pick('')} /> : null}
              {list.map((o) => (
                <Item key={String(o.value)} label={o.label} selected={active && String(o.value) === String(value)} onPress={() => pick(o.value)} />
              ))}
              {list.length === 0 ? <Text style={s.empty}>No match</Text> : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
};

const Item = ({ label, selected, onPress }) => {
  const [hover, setHover] = useState(false);
  return (
    <TouchableOpacity
      onPress={onPress}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={[s.item, hover && s.itemHover, selected && s.itemSel]}
    >
      <Text style={[s.itemText, selected && s.itemTextSel]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
};

const DateInput = ({ value, onChange, min, max }) => {
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'date',
      value: value || '',
      min: min || undefined,
      max: max || undefined,
      onChange: (e) => onChange(e.target.value),
      style: {
        height: 34, width: '100%', boxSizing: 'border-box', padding: '0 8px', fontSize: 13, color: '#0f172a',
        border: `1px solid ${BORDER}`, borderRadius: 8, backgroundColor: '#fff', fontFamily: 'inherit',
      },
    });
  }
  return <TextInput style={[s.box, s.input]} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />;
};

/** Expiry date filter: preset list like Today / Next 7 Days / This Month, or a custom from–to range. */
export const ColDateRange = ({ value, onChange, placeholder = 'Select date' }) => {
  const pop = usePopover(210);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const active = !!value?.preset;
  useEffect(() => {
    if (pop.isOpen) {
      setCustom(value?.preset === 'custom');
      setFrom(value?.from || '');
      setTo(value?.to || '');
    }
  }, [pop.isOpen]);
  const pick = (id) => {
    if (id === 'custom') {
      setCustom(true);
      return;
    }
    onChange({ preset: id });
    pop.close();
  };
  const apply = () => {
    if (!from && !to) return;
    const [a, b] = from && to && from > to ? [to, from] : [from, to];
    onChange({ preset: 'custom', from: a, to: b });
    pop.close();
  };

  return (
    <>
      <Trigger ref={pop.ref} label={dateRangeLabel(value)} placeholder={placeholder} active={active} isOpen={pop.isOpen} onPress={pop.open} onClear={() => onChange(null)} icon="calendar" />
      <Modal visible={pop.isOpen} transparent animationType="none" onRequestClose={pop.close}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={pop.close} />
        {pop.panel ? (
          <View style={[s.panel, pop.panel]}>
            <ScrollView style={{ flexGrow: 0 }}>
              {DATE_PRESETS.map((p) => (
                <Item
                  key={p.id}
                  label={p.label}
                  selected={p.id === 'custom' ? custom : !custom && value?.preset === p.id}
                  onPress={() => pick(p.id)}
                />
              ))}
              {custom ? (
                <View style={s.customBox}>
                  <Text style={s.customLbl}>From</Text>
                  <DateInput value={from} onChange={setFrom} />
                  <Text style={[s.customLbl, { marginTop: 8 }]}>To</Text>
                  <DateInput value={to} onChange={setTo} min={from} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setCustom(false)}>
                      <Text style={[s.btnText, { color: '#334155' }]}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, (!from && !to) && { opacity: 0.5 }]} disabled={!from && !to} onPress={apply}>
                      <Text style={s.btnText}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </>
  );
};

/** Wraps one filter cell so it lines up with its column header (same flex / minWidth). */
export const FilterCell = ({ flex, minWidth, children }) => (
  <View style={{ flex, minWidth, paddingRight: 8, justifyContent: 'center' }}>{children}</View>
);

const s = StyleSheet.create({
  box: {
    height: H, borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: '#ffffff',
    paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0,
  },
  boxActive: { borderColor: ACCENT, backgroundColor: '#eff6ff' },
  boxText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#0f172a' },
  placeholder: { color: '#64748b', fontWeight: '500' },
  clearBtn: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dbeafe' },
  input: { flex: 1, minWidth: 0, fontSize: 12.5, color: '#0f172a', paddingVertical: 0, height: H - 2, outlineStyle: 'none' },
  panel: {
    position: 'absolute', backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 4, overflow: 'hidden', boxShadow: '0px 10px 28px rgba(15, 23, 42, 0.16)', elevation: 8,
  },
  panelSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 8, marginVertical: 6,
    paddingHorizontal: 8, height: 32, borderWidth: 1, borderColor: BORDER, borderRadius: 6,
  },
  item: { paddingHorizontal: 14, paddingVertical: 10 },
  itemHover: { backgroundColor: '#f1f5f9' },
  itemSel: { backgroundColor: '#0284c7' },
  itemText: { fontSize: 13.5, color: '#1e293b' },
  itemTextSel: { color: '#ffffff', fontWeight: '600' },
  empty: { padding: 12, fontSize: 12.5, color: '#64748b', textAlign: 'center' },
  customBox: { padding: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  customLbl: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  btn: { flex: 1, height: 32, borderRadius: 6, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
});
