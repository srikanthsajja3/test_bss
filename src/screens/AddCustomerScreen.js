// add_customer.js — Add Internet Customer screen (React Native / Expo, same stack as CustomerScreen)
//
// Same flow as InternetCustomerForm (web project):
//
//   0. GET kyc_provider_mapping.php?partner_id=...  -> { success, partner_id, providers: [...] }
//      providers empty (nothing assigned by superadmin/admin) -> "Not configured, please contact your admin".
//      The operator cannot add a customer in that case.
//
//   STEP 1  Package, Sub plan, Username, Password, Mobile, Email
//           then the verification methods ASSIGNED to this operator:
//             - DigiLocker   (popup + polling)
//             - Aadhaar OTP  (ScoreMe: Aadhaar number -> OTP -> verify)
//             - Manual Entry (ONLY when superadmin/admin assigned 'manual')
//           1 method assigned  -> used directly, no picker
//           2+ methods assigned -> picker
//           Buttons stay disabled until every STEP 1 field is filled.
//
//   STEP 2  Aadhaar verified (or manual): first/last name, gender, DOB, billing address,
//           installation address, email, package, sub plan, username, password
//           -> add_internet_customer.php        (Aadhaar: user_id = cust_id returned by the verification)
//           -> add_internet_customer_manual.php (Manual: multipart/form-data with father name, pincode,
//              optional Aadhaar no., customer photo + ID proof front/back images)
//
// Usage:
//   import AddCustomerScreen from './add_customer';
//   <AddCustomerScreen user={user} onCancel={() => setShowAdd(false)} onSuccess={(data) => { setShowAdd(false); reload(); }} />
//   Link an Internet account to an existing customer:
//   <AddCustomerScreen user={user} mode="link" existingUser={customer} ... />

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';
import { toast } from 'react-toastify';

// ---------------------------------------------------------------------------
// Config (same timings as the web InternetCustomerForm)
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS_EARLY = 3000;          // first 2 minutes
const POLL_INTERVAL_MS_LATE = 8000;           // after that
const EARLY_WINDOW_MS = 2 * 60 * 1000;
const POLL_TIMEOUT_MS = 25 * 60 * 1000;       // 25 minutes
const SCOREME_RESEND_SECONDS = 120;           // ScoreMe resend window (EAS517)

const METHOD_META = {
  digilocker: { label: 'DigiLocker', icon: 'shield' },
  scoreme: { label: 'Aadhaar OTP', icon: 'smartphone' },
  manual: { label: 'Manual Entry', icon: 'edit-3' },
};
const METHOD_ORDER = ['digilocker', 'scoreme', 'manual'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const onlyDigits = (v) => String(v ?? '').replace(/\D/g, '');
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

// OneBssApi returns { ok, status, data } where data is the PHP JSON body.
const isOk = (res) => !!(res && res.ok && res.data && res.data.success);
// Server errors can contain an HTML page (e.g. an upstream "403 Forbidden") — show plain text only.
const cleanText = (v) =>
  String(v || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
const errMsg = (res, fallback) =>
  cleanText(res && res.data && (res.data.error || res.data.message)) || fallback;

// { success, partner_id, providers: ['digilocker','manual','scoreme'] }
const parseProviders = (body) => {
  const list = Array.isArray(body?.providers)
    ? body.providers
    : Array.isArray(body?.data?.providers)
      ? body.data.providers
      : Array.isArray(body?.data)
        ? body.data
        : [];
  const names = list
    .map((p) => (typeof p === 'string' ? p : p?.provider || p?.name || ''))
    .map((s) => String(s).toLowerCase().trim());
  return METHOD_ORDER.filter((m) => names.includes(m));
};

// internet_plan_mapping.php ->
//   { success, data: [ { plan_id, plan_name, subplans: [ { sub_plan_id, sub_plan_name, plan_validity, is_mapped, mapped_price } ] } ] }
// Returns ONLY sub plans mapped to this operator (is_mapped === true) at the operator's mapped_price,
// and ONLY packages that have at least one mapped sub plan.
const isMapped = (v) => v === true || v === 1 || v === '1' || v === 'true';

const parsePackages = (body) => {
  const raw = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return raw
    .filter((p) => p && typeof p === 'object' && (p.plan_id ?? p.id) !== undefined)
    .map((p) => {
      const id = String(p.plan_id ?? p.id);
      const subs = Array.isArray(p.subplans) ? p.subplans : Array.isArray(p.sub_plans) ? p.sub_plans : [];
      return {
        id,
        name: String(p.plan_name || p.name || `Package ${id}`),
        subPlans: subs
          .filter((s) => s && isMapped(s.is_mapped) && (s.sub_plan_id ?? s.id) !== undefined)
          .map((s) => ({
            id: String(s.sub_plan_id ?? s.id),
            name: String(s.sub_plan_name || s.name || `Sub plan ${s.sub_plan_id ?? s.id}`),
            price: s.mapped_price ?? '',
            validity: s.plan_validity ?? '',
          })),
      };
    })
    .filter((p) => p.subPlans.length > 0);
};

// Small building blocks (module level so inputs keep focus while typing)
const Label = ({ children }) => <Text style={styles.fieldLabel}>{children}</Text>;

const Input = ({ value, onChangeText, onBlur, inputRef, onSubmitEditing, placeholder, disabled, readOnly, keyboardType, secure, multiline, maxLength, autoCapitalize = 'none', error }) => (
  <TextInput
    ref={inputRef}
    onBlur={onBlur}
    onSubmitEditing={onSubmitEditing}
    style={[styles.formInput, multiline && styles.formInputMulti, (disabled || readOnly) && styles.formInputDisabled, error && styles.formInputError]}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={COLORS.textDim}
    editable={!disabled && !readOnly}
    keyboardType={keyboardType || 'default'}
    secureTextEntry={!!secure}
    multiline={!!multiline}
    maxLength={maxLength}
    autoCapitalize={autoCapitalize}
  />
);

const Chips = ({ items, selected, onSelect, disabled }) => (
  <View style={styles.chipWrap}>
    {items.map((it) => {
      const active = String(selected) === String(it.id);
      return (
        <TouchableOpacity
          key={it.id}
          disabled={disabled}
          style={[styles.chip, active && styles.chipActive, disabled && !active && { opacity: 0.5 }]}
          onPress={() => onSelect(it.id)}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>{it.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

// ---------------------------------------------------------------------------
// Photo upload (manual entry)
// ---------------------------------------------------------------------------
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;      // add_internet_customer_manual.php limit
const COMPRESS_ABOVE_BYTES = 1.2 * 1024 * 1024; // phone photos are resized below this
const MAX_IMAGE_SIDE = 1600;

const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Web: open the browser's file picker (camera on phones). Must be called directly from a tap.
const pickImageFileWeb = () =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    input.onchange = () => resolve((input.files && input.files[0]) || null);
    input.click();
  });

// Shrink big photos to max 1600px JPEG so 3 photos fit the server's upload limits.
const prepareImageFile = async (file) => {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error('Only JPEG or PNG images are allowed.');
  if (file.size <= COMPRESS_ABOVE_BYTES) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
};

// value: { file, uri, name, size } | null
const PhotoPicker = ({ label, hint, value, onChange, error }) => {
  const [busy, setBusy] = useState(false);

  const pick = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      toast.error('Photo upload is available in the web app. (For the mobile app, add expo-image-picker.)');
      return;
    }
    // open the picker synchronously on the tap, process the file afterwards
    pickImageFileWeb().then(async (raw) => {
      if (!raw) return;
      setBusy(true);
      try {
        const file = await prepareImageFile(raw);
        if (file.size > MAX_UPLOAD_BYTES) throw new Error('Image must be under 5 MB.');
        if (value?.uri) URL.revokeObjectURL(value.uri);
        onChange({ file, uri: URL.createObjectURL(file), name: file.name, size: file.size });
      } catch (e) {
        toast.error(`${label}: ${e.message || 'could not use this image'}`);
      } finally {
        setBusy(false);
      }
    });
  };

  const remove = () => {
    if (value?.uri) URL.revokeObjectURL(value.uri);
    onChange(null);
  };

  return (
    <View style={styles.photoItem}>
      <Text style={styles.fieldLabel}>
        {label} <Text style={{ color: COLORS.accentRose }}>*</Text>
      </Text>
      {value ? (
        <View style={[styles.photoBox, styles.photoBoxFilled]}>
          <Image source={{ uri: value.uri }} style={styles.photoThumb} resizeMode="cover" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.photoName} numberOfLines={1}>{value.name}</Text>
            <Text style={styles.hint}>{formatBytes(value.size)}</Text>
            <View style={[styles.actionsRow, { marginTop: 6, gap: 12 }]}>
              <TouchableOpacity onPress={pick} disabled={busy}><Text style={styles.linkText}>Change</Text></TouchableOpacity>
              <TouchableOpacity onPress={remove} disabled={busy}><Text style={[styles.linkText, { color: COLORS.accentRose }]}>Remove</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={[styles.photoBox, styles.photoBoxEmpty, error && { borderColor: COLORS.accentRose }]} onPress={pick} disabled={busy}>
          {busy ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Feather name="camera" size={20} color={COLORS.textMuted} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.photoName}>{busy ? 'Preparing image…' : 'Tap to upload'}</Text>
            <Text style={styles.hint}>{hint || 'JPEG or PNG, max 5 MB'}</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

// DOB typed as digits -> YYYY-MM-DD
const formatDobInput = (v) => {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

const ageFromDob = (dob) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
};

// ---------------------------------------------------------------------------
// Date of birth: type it (YYYY-MM-DD) OR pick it from a calendar
// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;          // m is 0-based
const parseIso = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
};
const yearsAgo = (n) => {
  const t = new Date();
  return new Date(t.getFullYear() - n, t.getMonth(), t.getDate());
};

// Calendar popup. mode: 'day' | 'month' | 'year' (tap the title to jump to month / year lists).
const DatePickerModal = ({ visible, value, maxDate, minDate, onSelect, onClose, title }) => {
  const [mode, setMode] = useState('day');
  const [viewYear, setViewYear] = useState(maxDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(maxDate.getMonth());

  useEffect(() => {
    if (!visible) return;
    const start = parseIso(value) || maxDate;
    setViewYear(start.getFullYear());
    setViewMonth(start.getMonth());
    // no date yet: start on the year list — much faster than paging back 30 years
    setMode(parseIso(value) ? 'day' : 'year');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selected = parseIso(value);
  const minY = minDate.getFullYear();
  const maxY = maxDate.getFullYear();
  const beforeMin = (y, m, d) => new Date(y, m, d) < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  const afterMax = (y, m, d) => new Date(y, m, d) > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());

  const canPrev = new Date(viewYear, viewMonth, 1) > new Date(minY, minDate.getMonth(), 1);
  const canNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate;
  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const years = [];
  for (let y = maxY; y >= minY; y -= 1) years.push(y);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.calOverlay}>
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.calCard}>
          <Text style={styles.calTitle}>{title || 'Select date'}</Text>

          {/* header */}
          <View style={styles.calHeader}>
            {mode === 'day' ? (
              <TouchableOpacity style={[styles.calNav, !canPrev && styles.btnDisabled]} disabled={!canPrev} onPress={() => shiftMonth(-1)}>
                <Feather name="chevron-left" size={18} color={COLORS.textMain} />
              </TouchableOpacity>
            ) : <View style={styles.calNav} />}
            <View style={styles.calHeaderTitles}>
              {mode !== 'year' && mode === 'day' ? (
                <TouchableOpacity onPress={() => setMode('month')}>
                  <Text style={styles.calHeaderText}>{MONTHS_LONG[viewMonth]}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => setMode(mode === 'year' ? 'day' : 'year')} style={styles.calYearBtn}>
                <Text style={styles.calHeaderText}>{viewYear}</Text>
                <Feather name={mode === 'year' ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
            {mode === 'day' ? (
              <TouchableOpacity style={[styles.calNav, !canNext && styles.btnDisabled]} disabled={!canNext} onPress={() => shiftMonth(1)}>
                <Feather name="chevron-right" size={18} color={COLORS.textMain} />
              </TouchableOpacity>
            ) : <View style={styles.calNav} />}
          </View>

          {mode === 'year' ? (
            <ScrollView style={styles.calScroll} contentContainerStyle={styles.calGrid}>
              {years.map((y) => {
                const active = y === viewYear;
                return (
                  <TouchableOpacity key={y} style={[styles.calYearCell, active && styles.calCellActive]} onPress={() => { setViewYear(y); setMode('month'); }}>
                    <Text style={[styles.calCellText, active && styles.calCellTextActive]}>{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {mode === 'month' ? (
            <View style={styles.calGrid}>
              {MONTHS.map((mName, m) => {
                const disabled = new Date(viewYear, m, 1) > maxDate || new Date(viewYear, m + 1, 0) < minDate;
                const active = m === viewMonth;
                return (
                  <TouchableOpacity
                    key={mName}
                    disabled={disabled}
                    style={[styles.calMonthCell, active && styles.calCellActive, disabled && styles.calCellDisabled]}
                    onPress={() => { setViewMonth(m); setMode('day'); }}
                  >
                    <Text style={[styles.calCellText, active && styles.calCellTextActive]}>{mName}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {mode === 'day' ? (
            <>
              <View style={styles.calWeekRow}>
                {WEEKDAYS.map((w) => <Text key={w} style={styles.calWeekday}>{w}</Text>)}
              </View>
              <View style={styles.calGrid}>
                {cells.map((d, i) => {
                  if (!d) return <View key={`e${i}`} style={styles.calDayCell} />;
                  const disabled = afterMax(viewYear, viewMonth, d) || beforeMin(viewYear, viewMonth, d);
                  const active = selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
                  return (
                    <TouchableOpacity
                      key={d}
                      disabled={disabled}
                      style={[styles.calDayCell, active && styles.calCellActive, disabled && styles.calCellDisabled]}
                      onPress={() => { onSelect(toIso(viewYear, viewMonth, d)); onClose(); }}
                    >
                      <Text style={[styles.calCellText, active && styles.calCellTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={[styles.actionsRow, { justifyContent: 'space-between', marginTop: 12 }]}>
            <Text style={[styles.hint, { fontSize: 11 }]}>Must be 18 or older</Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Text box (type YYYY-MM-DD, dashes added automatically) + calendar button.
const DobField = ({ value, onChange, minAge = 18 }) => {
  const [open, setOpen] = useState(false);
  const maxDate = yearsAgo(minAge);
  const minDate = new Date(1920, 0, 1);
  const parsed = parseIso(value);
  const age = parsed ? ageFromDob(value) : null;
  const complete = String(value || '').length === 10;
  const error = complete && (!parsed || age < minAge || parsed < minDate);

  return (
    <>
      <View style={styles.dobRow}>
        <View style={{ flex: 1 }}>
          <Input
            value={value}
            onChangeText={(v) => onChange(formatDobInput(v))}
            placeholder="YYYY-MM-DD"
            keyboardType="number-pad"
            maxLength={10}
            error={error}
          />
        </View>
        <TouchableOpacity style={styles.calBtn} onPress={() => setOpen(true)}>
          <Feather name="calendar" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
      {parsed && !error ? (
        <Text style={[styles.hint, { fontSize: 11 }]}>
          {parsed.getDate()} {MONTHS_LONG[parsed.getMonth()]} {parsed.getFullYear()} · {age} years
        </Text>
      ) : error ? (
        <Text style={[styles.hint, { fontSize: 11, color: COLORS.accentRose }]}>
          {!parsed ? 'Not a valid date' : age < minAge ? `Customer must be at least ${minAge} years old` : 'Check the year'}
        </Text>
      ) : (
        <Text style={[styles.hint, { fontSize: 11 }]}>Type it or tap the calendar</Text>
      )}
      <DatePickerModal
        visible={open}
        value={value}
        maxDate={maxDate}
        minDate={minDate}
        title="Date of birth"
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

// Dropdown (no extra library). The option list floats over the page in a transparent
// Modal, anchored under the field, so it never pushes other fields down.
// Opens upward when there isn't enough room below.
const DROPDOWN_ITEM_H = 41;
const DROPDOWN_MAX_H = 240;

const Dropdown = ({ items, selected, onSelect, placeholder, disabled, emptyText }) => {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null); // { x, y, w, h } of the field in the window
  const triggerRef = useRef(null);
  const { height: winH } = useWindowDimensions();
  const current = items.find((it) => String(it.id) === String(selected));
  const isDisabled = disabled || items.length === 0;

  useEffect(() => {
    if (isDisabled) setOpen(false);
  }, [isDisabled]);

  const openMenu = () => {
    const node = triggerRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, w, h) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  const close = () => setOpen(false);

  let listPos = { top: 80, left: 16, right: 16 }; // fallback if the field can't be measured
  if (anchor) {
    const listH = Math.min(items.length * DROPDOWN_ITEM_H + 2, DROPDOWN_MAX_H);
    const below = winH - (anchor.y + anchor.h) - 8;
    const openUp = below < listH && anchor.y > below;
    listPos = {
      left: anchor.x,
      width: anchor.w,
      top: openUp ? Math.max(8, anchor.y - listH - 4) : anchor.y + anchor.h + 4,
    };
  }

  return (
    <View ref={triggerRef} collapsable={false}>
      <TouchableOpacity
        style={[styles.dropdownBox, open && styles.dropdownBoxOpen, isDisabled && styles.formInputDisabled]}
        onPress={() => (open ? close() : openMenu())}
        disabled={isDisabled}
      >
        <Text style={[styles.dropdownText, !current && { color: COLORS.textDim }]} numberOfLines={1}>
          {current ? current.label : items.length === 0 && emptyText ? emptyText : placeholder}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        {/* tap anywhere outside the list to close */}
        <TouchableOpacity style={styles.dropdownBackdrop} activeOpacity={1} onPress={close} />
        <View style={[styles.dropdownList, listPos]}>
          <ScrollView style={{ maxHeight: DROPDOWN_MAX_H }} keyboardShouldPersistTaps="handled">
            {items.map((it) => {
              const active = String(it.id) === String(selected);
              return (
                <TouchableOpacity
                  key={it.id}
                  style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                  onPress={() => {
                    onSelect(it.id);
                    close();
                  }}
                >
                  <Text style={[styles.dropdownItemText, active && { color: COLORS.primary, fontWeight: '700' }]} numberOfLines={1}>
                    {it.label}
                  </Text>
                  {active ? <Feather name="check" size={14} color={COLORS.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Error boundary: a render error shows a message instead of a white screen
// ---------------------------------------------------------------------------

class AddCustomerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.log('AddCustomerScreen crashed:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={[styles.container, { padding: 24 }]}>
          <View style={styles.errorBanner}>
            <Feather name="alert-triangle" size={16} color={COLORS.accentRose} />
            <Text style={styles.errorText}>Add Customer failed to load: {String(this.state.error?.message || this.state.error)}</Text>
          </View>
          {this.props.onCancel ? (
            <TouchableOpacity style={styles.backBtn} onPress={this.props.onCancel}>
              <Feather name="arrow-left" size={16} color={COLORS.textMain} />
              <Text style={styles.backBtnText}>Back to Subscribers List</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const AddCustomerScreenInner = ({ user, operatorId: operatorIdProp, mode = 'new', existingUser, onSuccess, onCancel }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const operatorId = operatorIdProp || user?.partner_id || user?.operator_id;

  const applyToken = useCallback(() => {
    if (user?.token) setApiConfig(undefined, user.token);
  }, [user]);

  // =========================================================
  // KYC PROVIDER MAPPING (assigned by superadmin/admin)
  // =========================================================
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState('');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [chosenProvider, setChosenProvider] = useState(null); // 'digilocker' | 'scoreme' | 'manual'

  const loadProviders = useCallback(async () => {
    if (!operatorId) {
      setAvailableProviders([]);
      setProvidersError('Operator not found for this login.');
      setProvidersLoading(false);
      return;
    }
    setProvidersLoading(true);
    setProvidersError('');
    applyToken();
    try {
      const res = await OneBssApi.getKycProviderMapping(operatorId);
      if (!isOk(res)) {
        setAvailableProviders([]);
        setProvidersError(errMsg(res, 'Unable to load KYC configuration'));
        return;
      }
      const providers = parseProviders(res.data);
      setAvailableProviders(providers);
      // Only one assigned -> use it directly, no picker (same as web form)
      setChosenProvider(providers.length === 1 ? providers[0] : null);
    } catch (e) {
      setAvailableProviders([]);
      setProvidersError('Unable to load KYC configuration');
    } finally {
      setProvidersLoading(false);
    }
  }, [operatorId, applyToken]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // =========================================================
  // INTERNET ACCOUNT DETAILS
  // =========================================================
  const [username, setUsername] = useState('');
  // Availability check against the Internet gateway (check_internet_username.php),
  // run as soon as the operator LEAVES the Username field (onBlur).
  // status: idle | unchecked | checking | available | taken | invalid | error
  const [usernameCheck, setUsernameCheck] = useState({ status: 'idle', message: '', value: '' });
  const usernameSeqRef = useRef(0);
  const usernameInputRef = useRef(null);

  const onUsernameChange = (v) => {
    const clean = v.replace(/\s/g, '');
    setUsernameCheck((prev) => {
      if (prev.value === clean.trim() && prev.status !== 'idle') return prev; // unchanged
      usernameSeqRef.current += 1; // cancel any in-flight check for the old value
      return clean.trim() ? { status: 'unchecked', message: '', value: clean.trim() } : { status: 'idle', message: '', value: '' };
    });
    setUsername(clean);
  };

  const refocusUsername = () => {
    setTimeout(() => {
      try {
        usernameInputRef.current && usernameInputRef.current.focus();
      } catch (e) { /* ignore */ }
    }, 0);
  };

  const checkUsername = async () => {
    const value = username.trim();
    if (!value) {
      setUsernameCheck({ status: 'idle', message: '', value: '' });
      return;
    }
    // already checked this exact value
    if (usernameCheck.value === value && ['checking', 'available', 'taken', 'invalid'].includes(usernameCheck.status)) return;

    if (!/^[A-Za-z0-9._@-]{3,64}$/.test(value)) {
      setUsernameCheck({ status: 'invalid', message: 'Use 3-64 characters: letters, numbers, . _ - @ (no spaces).', value });
      refocusUsername();
      return;
    }
    if (!operatorId) return;

    const seq = ++usernameSeqRef.current;
    setUsernameCheck({ status: 'checking', message: 'Checking availability…', value });
    try {
      if (user?.token) setApiConfig(undefined, user.token);
      const res = await OneBssApi.checkInternetUsername(value, operatorId);
      if (seq !== usernameSeqRef.current || !mountedRef.current) return; // username changed meanwhile
      const d = res?.data || {};
      if (res?.ok && d.success) {
        if (d.available) {
          setUsernameCheck({ status: 'available', message: 'Username is available', value });
        } else {
          const msg = cleanText(d.message) || 'This username is already assigned. Please enter another username.';
          setUsernameCheck({ status: d.reason === 'invalid' ? 'invalid' : 'taken', message: msg, value });
          toast.error(`"${value}" — ${msg}`);
          refocusUsername();
        }
      } else {
        const why = errMsg(res, '').replace(/\.+$/, '');
        setUsernameCheck({ status: 'error', message: `Couldn't check availability${why ? ` — ${why}` : ''}. It will be checked again when the customer is added.`, value });
      }
    } catch (e) {
      if (seq === usernameSeqRef.current) setUsernameCheck({ status: 'error', message: "Couldn't check availability right now.", value });
    }
  };

  // Blocks the flow until the username has been checked and is free.
  // A failed check (gateway/network down) does not block — add_internet_customer rejects duplicates anyway.
  const usernameBlocked = ['unchecked', 'checking', 'taken', 'invalid'].includes(usernameCheck.status);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mobile, setMobile] = useState(onlyDigits(existingUser?.MobileNumber || existingUser?.mobile || ''));
  const [email, setEmail] = useState(existingUser?.EmailId || existingUser?.email || '');

  // =========================================================
  // INTERNET PLANS
  // =========================================================
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedSubPlanId, setSelectedSubPlanId] = useState('');
  const selectedPackage = packages.find((p) => p.id === String(selectedPackageId)) || null;
  const subPlans = selectedPackage ? selectedPackage.subPlans : [];

  useEffect(() => {
    if (!operatorId) return;
    let alive = true;
    (async () => {
      setPackagesLoading(true);
      applyToken();
      try {
        const res = await OneBssApi.getInternetPlans(operatorId);
        if (!alive) return;
        if (!res?.ok || res.data?.success === false) {
          setPackages([]);
          toast.error(errMsg(res, 'Failed to load internet packages'));
          return;
        }
        const list = parsePackages(res.data);
        setPackages(list);
        // keep the current selection if it still exists
        setSelectedPackageId((cur) => (cur && list.some((p) => p.id === String(cur)) ? cur : ''));
      } catch (e) {
        if (alive) {
          setPackages([]);
          toast.error('Failed to load internet packages');
        }
      } finally {
        if (alive) setPackagesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [operatorId, applyToken]);

  const selectPackage = (id) => {
    setSelectedPackageId(String(id));
    setSelectedSubPlanId('');
  };

  // =========================================================
  // CUSTOMER DETAILS (STEP 2)
  // =========================================================
  const [firstName, setFirstName] = useState(existingUser?.name || existingUser?.first_name || '');
  const [lastName, setLastName] = useState(existingUser?.lastName || existingUser?.last_name || '');
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [installationAddress, setInstallationAddress] = useState('');
  // Manual entry only
  const [fatherName, setFatherName] = useState('');
  const [pincode, setPincode] = useState('');
  const [aadhaarManual, setAadhaarManual] = useState('');      // optional, stored masked, NOT verified
  const [sameAsBilling, setSameAsBilling] = useState(false);
  const [photos, setPhotos] = useState({ profile: null, front: null, back: null });
  const [photoErrors, setPhotoErrors] = useState({});
  const setPhoto = (key) => (val) => {
    setPhotos((p) => ({ ...p, [key]: val }));
    setPhotoErrors((e) => ({ ...e, [key]: false }));
  };
  const effectiveInstallation = sameAsBilling ? billingAddress : installationAddress;

  // =========================================================
  // VERIFICATION STATE
  // =========================================================
  const [verification, setVerification] = useState(null); // Aadhaar verified response
  const [manualMode, setManualMode] = useState(false);     // manual entry chosen and continued
  const inStep2 = !!verification || manualMode;

  // DigiLocker
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const popupRef = useRef(null);
  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(0);
  const clientIdRef = useRef('');
  const repeatErrRef = useRef({ msg: '', count: 0 });
  const [pollStatus, setPollStatus] = useState(''); // last 'not ready yet' message from the server
  const [pollError, setPollError] = useState('');   // verification stopped with this error
  const mountedRef = useRef(true);

  // ScoreMe
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [resendAt, setResendAt] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!resendAt) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [resendAt]);
  const resendSecondsLeft = resendAt ? Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)) : 0;

  // Submit
  const [submitting, setSubmitting] = useState(false);

  // Clean up poll / popup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      try {
        if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      } catch (e) { /* ignore */ }
    };
  }, []);

  // =========================================================
  // VERIFY BUTTON CONDITION
  // =========================================================
  const canVerify =
    username.trim() !== '' &&
    !usernameBlocked &&
    password.trim() !== '' &&
    /^[0-9]{10}$/.test(mobile) &&
    isEmail(email) &&
    !!selectedPackage &&
    selectedSubPlanId !== '';

  const step1Hint =
    usernameCheck.status === 'taken' || usernameCheck.status === 'invalid'
      ? 'Enter a different username to continue.'
      : usernameCheck.status === 'checking' || usernameCheck.status === 'unchecked'
        ? 'Checking username availability…'
        : 'Enter username, password, mobile number, email, package and sub-plan to continue.';

  // =========================================================
  // VERIFIED -> prefill STEP 2
  // =========================================================
  const applyVerificationResult = (data) => {
    setVerification(data);
    const c = data.customer || {};
    const nameParts = String(c.full_name || c.name || '').trim().split(/\s+/).filter(Boolean);
    const first = nameParts.shift() || '';
    const last = nameParts.join(' ');
    setFirstName((prev) => prev || first);
    setLastName((prev) => prev || last);
    const g = String(c.gender || '').toUpperCase();
    setGender(g === 'M' || g === 'MALE' ? 'male' : g === 'F' || g === 'FEMALE' ? 'female' : '');
    setDob(c.dob || '');
    setBillingAddress(c.full_address || '');
    setInstallationAddress((prev) => prev || c.full_address || '');
    toast.success('Aadhaar verification successful ✅');
  };

  // =========================================================
  // DIGILOCKER: POPUP + POLL
  // =========================================================
  const stopPolling = () => {
    setPolling(false);
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const closePopup = () => {
    try {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    } catch (e) { /* ignore */ }
  };

  const popupClosed = () => {
    try {
      return !!(popupRef.current && popupRef.current.closed);
    } catch (e) {
      return false;
    }
  };

  // BSS digilocker_download_aadhaar.php needs { client_id, operator_id, user_id? }.
  // user_id = existing customer's cust_id (link mode) -> attach verification to that customer.
  const downloadAadhaar = (clientId) =>
    OneBssApi.digilockerDownloadAadhaar(
      clientId,
      operatorId,
      mode === 'link' && existingUser?.id ? existingUser.id : null
    );

  // While the customer hasn't finished DigiLocker, Surepass answers "not ready" and we keep
  // polling. These answers can never succeed by waiting, so stop and show them instead.
  const isFatalDownloadError = (res) => {
    if (!res) return false;
    if (res.status === 401 || res.status === 403) return true;
    const msg = String(errMsg(res, ''));
    if (/operator_id is required|client_id required|not enabled|not configured|customer not found|date of birth|adult|minor|18 years|years old|\bage\b|unable to create/i.test(msg)) return true;
    // Our own PHP failing the same way (HTTP 5xx) 3 times in a row won't fix itself by waiting.
    if (res.status >= 500) {
      const last = repeatErrRef.current;
      repeatErrRef.current = { msg, count: last.msg === msg ? last.count + 1 : 1 };
      return repeatErrRef.current.count >= 3;
    }
    repeatErrRef.current = { msg: '', count: 0 };
    return false;
  };

  const failVerification = (res) => {
    stopPolling();
    closePopup();
    const msg = res?.status === 401 ? 'Session expired. Please log in again.' : errMsg(res, 'Aadhaar verification failed');
    setPollError(msg);
    toast.error(msg);
  };

  const pollOnceFinal = async (clientId) => {
    try {
      applyToken();
      const res = await downloadAadhaar(clientId);
      if (!mountedRef.current) return;
      if (isOk(res)) applyVerificationResult(res.data);
      else if (isFatalDownloadError(res)) failVerification(res);
      else toast.info('Verification window was closed before completing.');
    } catch (e) {
      toast.error('Unable to confirm verification status.');
    } finally {
      if (mountedRef.current) stopPolling();
    }
  };

  const scheduleNextPoll = (clientId) => {
    if (!mountedRef.current) return;
    if (Date.now() > pollDeadlineRef.current) {
      stopPolling();
      toast.error("We didn't hear back from DigiLocker in time. If you completed verification, please try again.");
      return;
    }
    // Popup closed by the user -> one last poll to catch a just-completed verification, then stop.
    if (popupClosed()) {
      pollTimerRef.current = setTimeout(() => pollOnceFinal(clientId), 1500);
      return;
    }
    const elapsed = Date.now() - (pollDeadlineRef.current - POLL_TIMEOUT_MS);
    const next = elapsed < EARLY_WINDOW_MS ? POLL_INTERVAL_MS_EARLY : POLL_INTERVAL_MS_LATE;
    pollTimerRef.current = setTimeout(() => pollOnce(clientId), next);
  };

  const pollOnce = async (clientId) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      applyToken();
      const res = await downloadAadhaar(clientId);
      if (!mountedRef.current) return;
      if (isOk(res)) {
        stopPolling();
        setPollError('');
        applyVerificationResult(res.data);
        closePopup();
        return;
      }
      if (isFatalDownloadError(res)) {
        failVerification(res);
        return;
      }
      setPollStatus(errMsg(res, 'Waiting for the customer to finish DigiLocker'));
      scheduleNextPoll(clientId);
    } catch (e) {
      scheduleNextPoll(clientId);
    }
  };

  const checkNow = () => {
    if (polling && clientIdRef.current) pollOnce(clientIdRef.current);
  };

  // digilocker_done.html (the DigiLocker redirect_url page) posts
  // { type: 'onebss:digilocker:done' } to this window just before it closes.
  // Only trust it from the popup we opened ourselves, then check right away
  // instead of waiting for the next poll.
  useEffect(() => {
    if (!polling || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onMessage = (event) => {
      if (!popupRef.current || event.source !== popupRef.current) return;
      if (!event.data || event.data.type !== 'onebss:digilocker:done') return;
      if (clientIdRef.current) {
        setPollStatus('DigiLocker finished — fetching Aadhaar details…');
        pollOnce(clientIdRef.current);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  const handleVerifyAadhaar = async () => {
    if (!canVerify) {
      toast.error('Enter username, mobile number, password, package, and sub-plan first');
      return;
    }
    if (starting || polling) return;

    // Web: open a blank popup synchronously on the tap so the browser doesn't block it,
    // then point it at the DigiLocker URL once we have it.
    let popup = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      popup = window.open('', 'digilocker_verify', 'width=480,height=720');
      if (!popup) {
        toast.error('Popup blocked — please allow popups for this site and try again');
        return;
      }
    }

    setStarting(true);
    try {
      applyToken();
      const res = await OneBssApi.digilockerInitialize(operatorId);
      if (!mountedRef.current) return;
      const data = res?.data || {};
      const url = data.url || data.data?.url;
      const clientId = data.client_id || data.data?.client_id;

      if (!isOk(res) || !url || !clientId) {
        toast.error(errMsg(res, 'Unable to start verification'));
        if (popup) popup.close();
        return;
      }

      if (popup) {
        popup.location.href = url;
        popupRef.current = popup;
      } else {
        popupRef.current = null;
        Linking.openURL(url).catch(() => toast.error('Unable to open DigiLocker'));
      }

      clientIdRef.current = clientId;
      repeatErrRef.current = { msg: '', count: 0 };
      setPollError('');
      setPollStatus('');
      setPolling(true);
      pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
      pollTimerRef.current = setTimeout(() => pollOnce(clientId), POLL_INTERVAL_MS_EARLY);
    } catch (e) {
      toast.error('Unable to start verification');
      if (popup) popup.close();
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  const handleCancelVerification = () => {
    stopPolling();
    closePopup();
  };

  // =========================================================
  // SCOREME (Aadhaar OTP)
  // =========================================================
  const handleScoremeSendOtp = async () => {
    if (!/^\d{12}$/.test(aadhaarNumber)) {
      toast.error('Enter a valid 12-digit Aadhaar number');
      return;
    }
    if (sendingOtp || resendSecondsLeft > 0) return;
    setSendingOtp(true);
    try {
      applyToken();
      const res = await OneBssApi.scoremeSendOtp(aadhaarNumber, operatorId);
      if (!mountedRef.current) return;
      if (!isOk(res)) {
        toast.error(errMsg(res, 'Unable to send OTP'));
        return;
      }
      toast.success(res.data.message || 'OTP sent to the registered mobile number');
      setOtpSent(true);
      setOtp('');
      setResendAt(Date.now() + SCOREME_RESEND_SECONDS * 1000);
    } catch (e) {
      toast.error('Unable to send OTP');
    } finally {
      if (mountedRef.current) setSendingOtp(false);
    }
  };

  const handleScoremeVerifyOtp = async () => {
    if (!otp.trim()) {
      toast.error('Enter the OTP first');
      return;
    }
    if (verifyingOtp) return;
    setVerifyingOtp(true);
    try {
      applyToken();
      const res = await OneBssApi.scoremeVerifyOtp(aadhaarNumber, otp.trim(), operatorId);
      if (!mountedRef.current) return;
      if (!isOk(res)) {
        toast.error(errMsg(res, 'OTP verification failed'));
        return;
      }
      // Same response shape as DigiLocker
      applyVerificationResult(res.data);
    } catch (e) {
      toast.error('OTP verification failed');
    } finally {
      if (mountedRef.current) setVerifyingOtp(false);
    }
  };

  const chooseDifferentMethod = () => {
    handleCancelVerification();
    setChosenProvider(null);
    setOtpSent(false);
    setOtp('');
    setAadhaarNumber('');
    setResendAt(null);
  };

  // =========================================================
  // MANUAL (only if assigned)
  // =========================================================
  const handleContinueManual = () => {
    if (!availableProviders.includes('manual')) return; // never allowed unless assigned
    if (!canVerify) {
      toast.error(step1Hint);
      return;
    }
    setManualMode(true);
  };

  const backFromManual = () => {
    setManualMode(false);
    if (availableProviders.length > 1) setChosenProvider(null);
  };

  // =========================================================
  // FINAL VALIDATION + SUBMIT
  // =========================================================
  const validate = () => {
    if (!manualMode && !(verification?.cust_id || verification?.verification_id)) {
      toast.error('Please verify Aadhaar first');
      return false;
    }
    if (manualMode && !availableProviders.includes('manual')) {
      toast.error('Manual entry is not enabled for your account');
      return false;
    }
    if (!firstName.trim()) { toast.error('First name is required'); return false; }
    if (!lastName.trim()) { toast.error('Last name is required'); return false; }
    if (manualMode) {
      if (!gender) { toast.error('Select gender'); return false; }
      const age = ageFromDob(dob);
      if (age === null) { toast.error('Enter date of birth as YYYY-MM-DD'); return false; }
      if (age < 18) { toast.error('Customer must be at least 18 years old'); return false; }
      if (!billingAddress.trim()) { toast.error('Billing address is required'); return false; }
      if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) { toast.error('Pincode must be 6 digits'); return false; }
      if (aadhaarManual && !/^\d{12}$/.test(aadhaarManual)) { toast.error('Aadhaar number must be 12 digits'); return false; }
      const missing = { profile: !photos.profile, front: !photos.front, back: !photos.back };
      if (missing.profile || missing.front || missing.back) {
        setPhotoErrors(missing);
        toast.error('Upload the customer photo and both sides of the ID proof');
        return false;
      }
    }
    if (!effectiveInstallation.trim()) { toast.error('Installation address is required'); return false; }
    if (!selectedPackage) { toast.error('Please select a package'); return false; }
    if (!selectedSubPlanId) { toast.error('Please select a sub-plan'); return false; }
    if (!username.trim() || !password.trim()) { toast.error('Username and password are required'); return false; }
    if (usernameCheck.status === 'taken' || usernameCheck.status === 'invalid') { toast.error(usernameCheck.message || 'Please enter another username'); return false; }
    if (usernameCheck.status === 'checking' || usernameCheck.status === 'unchecked') { checkUsername(); toast.info('Checking the username — try again in a moment'); return false; }
    if (!/^[0-9]{10}$/.test(mobile)) { toast.error('Enter a valid 10-digit mobile number'); return false; }
    if (!isEmail(email)) { toast.error('Enter a valid email'); return false; }
    return true;
  };

  // add_internet_customer_manual.php is multipart/form-data: text fields + 3 image files.
  const buildManualFormData = (common) => {
    const fields = {
      ...common,
      gender: gender === 'male' ? 'M' : gender === 'female' ? 'F' : '',
      dob,
      father_name: fatherName.trim(),
      pincode,
      aadhaar_number: aadhaarManual,
      billing_address: billingAddress.trim(),
      customer_type: 'individual',
    };
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== null && v !== undefined && String(v) !== '') fd.append(k, String(v));
    });
    fd.append('customer_photo', photos.profile.file, photos.profile.name);
    fd.append('aadhaar_front', photos.front.file, photos.front.name);
    fd.append('aadhaar_back', photos.back.file, photos.back.name);
    return fd;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);

    const common = {
      // BSS: digilocker_download_aadhaar.php creates the Customer_demographics row and returns
      // cust_id; add_internet_customer.php takes that same value as user_id.
      user_id:
        mode === 'link'
          ? existingUser?.id ?? null
          : manualMode
            ? null
            : verification?.cust_id ?? null, // only a real cust_id — never guess from another id
      operator_id: operatorId,
      package_id: selectedPackage.id,
      sub_plan_id: selectedSubPlanId,
      username: username.trim(),
      password,
      mobile,
      email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      installation_address: effectiveInstallation.trim(),
    };

    try {
      applyToken();
      const res = manualMode
        ? await OneBssApi.addInternetCustomerManual(buildManualFormData(common))
        : await OneBssApi.addInternetCustomer({
            ...common,
            verification_id: verification.verification_id ?? verification.cust_id,
          });

      if (!mountedRef.current) return;

      if (res?.data?.raw !== undefined) {
        console.error('Non-JSON response:', res.data.raw);
        toast.error('Server returned an invalid response');
        return;
      }
      if (!isOk(res)) {
        toast.error(errMsg(res, 'Failed to add Internet customer'));
        return;
      }
      toast.success('Internet account created successfully');
      onSuccess && onSuccess(res.data);
    } catch (e) {
      toast.error('Server error while adding customer');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  // =========================================================
  // RENDER HELPERS
  // =========================================================
  const field = (child, full) => <View style={[styles.fieldItem, full || isMobile ? styles.fieldFull : styles.fieldHalf]}>{child}</View>;

  const subPlanLabel = (s) => {
    const days = s.validity !== '' && s.validity !== undefined && s.validity !== null ? ` (${s.validity} days)` : '';
    const n = Number(s.price);
    const price = s.price !== '' && s.price !== null && s.price !== undefined ? ` — ₹${Number.isFinite(n) ? n.toLocaleString('en-IN') : s.price}` : '';
    return `${s.name}${days}${price}`;
  };

  const renderPlanPickers = (locked) => (
    <>
      {field(
        <>
          <Label>PACKAGE</Label>
          {packagesLoading ? (
            <View style={styles.loadingRow}><ActivityIndicator size="small" color={COLORS.primary} /><Text style={styles.hint}>Loading packages...</Text></View>
          ) : (
            <Dropdown
              items={packages.map((p) => ({ id: p.id, label: p.name }))}
              selected={selectedPackageId}
              onSelect={selectPackage}
              placeholder="-- Select Package --"
              emptyText="No packages are mapped to this operator"
              disabled={locked}
            />
          )}
        </>
      )}
      {field(
        <>
          <Label>SUB PLAN</Label>
          <Dropdown
            items={subPlans.map((s) => ({ id: s.id, label: subPlanLabel(s) }))}
            selected={selectedSubPlanId}
            onSelect={(id) => setSelectedSubPlanId(String(id))}
            placeholder={selectedPackage ? '-- Select Sub Plan --' : 'Select a package first'}
            disabled={locked || !selectedPackage}
          />
        </>
      )}
    </>
  );

  const renderAccountFields = (locked) => (
    <>
      {field(
        <>
          <Label>USERNAME</Label>
          <Input
            inputRef={usernameInputRef}
            value={username}
            onChangeText={onUsernameChange}
            onBlur={checkUsername}
            onSubmitEditing={checkUsername}
            placeholder="Internet Username"
            disabled={locked}
            error={usernameCheck.status === 'taken' || usernameCheck.status === 'invalid'}
          />
          {usernameCheck.status !== 'idle' && usernameCheck.status !== 'unchecked' ? (
            <View style={styles.usernameStatus}>
              {usernameCheck.status === 'checking' ? (
                <ActivityIndicator size="small" color={COLORS.textMuted} />
              ) : (
                <Feather
                  name={usernameCheck.status === 'available' ? 'check-circle' : usernameCheck.status === 'error' ? 'alert-circle' : 'x-circle'}
                  size={13}
                  color={usernameCheck.status === 'available' ? COLORS.accentEmerald : usernameCheck.status === 'error' ? COLORS.accentAmber : COLORS.accentRose}
                />
              )}
              <Text
                style={[
                  styles.usernameStatusText,
                  {
                    color:
                      usernameCheck.status === 'available'
                        ? COLORS.accentEmerald
                        : usernameCheck.status === 'error'
                          ? COLORS.accentAmber
                          : usernameCheck.status === 'checking'
                            ? COLORS.textMuted
                            : COLORS.accentRose,
                  },
                ]}
              >
                {usernameCheck.message}
              </Text>
            </View>
          ) : null}
        </>
      )}
      {field(
        <>
          <Label>PASSWORD</Label>
          <View style={styles.passwordWrap}>
            <View style={{ flex: 1 }}>
              <Input value={password} onChangeText={setPassword} placeholder="Password" secure={!showPassword} disabled={locked} />
            </View>
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </>
  );

  const header = (
    <View style={styles.screenControlHeader}>
      {onCancel ? (
        <TouchableOpacity style={styles.backBtn} onPress={() => { handleCancelVerification(); onCancel(); }}>
          <Feather name="arrow-left" size={16} color={COLORS.textMain} />
          <Text style={styles.backBtnText}>Back to Subscribers List</Text>
        </TouchableOpacity>
      ) : <View />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={styles.subHeaderTitle}>{mode === 'link' ? 'Add Internet Account' : 'Add Internet Customer'}</Text>
        <View style={styles.operatorBadge}>
          <Feather name="shield" size={13} color={COLORS.primary} />
          <Text style={styles.operatorBadgeText}>Operator ID: #{operatorId || user?.partner_id || '1114'}</Text>
        </View>
      </View>
    </View>
  );

  const wrap = (children) => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 14 : 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      {children}
    </ScrollView>
  );

  // =========================================================
  // RENDER: gate on KYC mapping
  // =========================================================
  if (providersLoading) {
    return wrap(
      <View style={styles.card}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.hint}>Checking KYC configuration...</Text>
        </View>
      </View>
    );
  }

  if (providersError) {
    return wrap(
      <View style={[styles.card, styles.centerCard]}>
        <Feather name="alert-circle" size={32} color={COLORS.accentRose} />
        <Text style={[styles.cardTitle, { marginTop: 10 }]}>Unable to load KYC configuration</Text>
        <Text style={[styles.hint, { marginTop: 4, textAlign: 'center' }]}>{providersError}</Text>
        <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 14 }]} onPress={loadProviders}>
          <Feather name="refresh-cw" size={14} color={COLORS.primary} />
          <Text style={styles.secondaryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (availableProviders.length === 0) {
    return wrap(
      <View style={[styles.card, styles.centerCard]}>
        <Feather name="lock" size={36} color={COLORS.accentAmber} />
        <Text style={[styles.cardTitle, { marginTop: 12 }]}>Not configured</Text>
        <Text style={[styles.hint, { marginTop: 6, textAlign: 'center' }]}>
          Customer verification is not configured for your account. Please contact your admin.
        </Text>
      </View>
    );
  }

  // =========================================================
  // RENDER: STEP 2 — verified / manual
  // =========================================================
  if (inStep2) {
    const masked = verification?.customer?.masked_aadhaar;
    return wrap(
      <View style={styles.card}>
        {verification ? (
          <View style={styles.verifiedBox}>
            <Feather name="check-circle" size={18} color={COLORS.accentEmerald} />
            <Text style={styles.verifiedTitle}>Aadhaar verified{masked ? ` — ${masked}` : ''}</Text>
          </View>
        ) : (
          <View style={styles.manualBox}>
            <Feather name="edit-3" size={16} color={COLORS.accentAmber} />
            <Text style={[styles.verifiedTitle, { flex: 1 }]}>Manual entry — customer details are entered by the operator</Text>
            <TouchableOpacity onPress={backFromManual}>
              <Text style={styles.linkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionTitleHeader}>CUSTOMER DETAILS</Text>
        <View style={styles.formGrid}>
          {field(<><Label>FIRST NAME<Text style={{ color: COLORS.accentRose }}> *</Text></Label><Input value={firstName} onChangeText={setFirstName} placeholder="First Name" autoCapitalize="words" /></>)}
          {field(<><Label>LAST NAME<Text style={{ color: COLORS.accentRose }}> *</Text></Label><Input value={lastName} onChangeText={setLastName} placeholder="Last Name" autoCapitalize="words" /></>)}
          {field(
            <>
              <Label>GENDER{manualMode ? <Text style={{ color: COLORS.accentRose }}> *</Text> : null}</Label>
              <Chips items={[{ id: 'male', label: 'Male' }, { id: 'female', label: 'Female' }]} selected={gender} onSelect={setGender} />
            </>
          )}
          {field(
            <>
              <Label>DATE OF BIRTH{manualMode ? <Text style={{ color: COLORS.accentRose }}> *</Text> : null}</Label>
              {manualMode ? (
                <DobField value={dob} onChange={setDob} />
              ) : (
                <Input value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" maxLength={10} />
              )}
            </>
          )}
          {manualMode ? field(<><Label>FATHER / GUARDIAN NAME</Label><Input value={fatherName} onChangeText={setFatherName} placeholder="Father / Guardian Name" autoCapitalize="words" /></>) : null}
          {manualMode
            ? field(
                <>
                  <Label>AADHAAR NUMBER (OPTIONAL)</Label>
                  <Input value={aadhaarManual} onChangeText={(v) => setAadhaarManual(onlyDigits(v).slice(0, 12))} placeholder="12 digits — stored masked, not verified" keyboardType="number-pad" maxLength={12} />
                </>
              )
            : null}
          {field(
            <>
              <Label>{verification ? 'BILLING ADDRESS (FROM AADHAAR)' : 'BILLING ADDRESS'}{manualMode ? <Text style={{ color: COLORS.accentRose }}> *</Text> : null}</Label>
              <Input value={billingAddress} onChangeText={setBillingAddress} placeholder="Billing Address" readOnly={!!verification} multiline autoCapitalize="sentences" />
            </>,
            true
          )}
          {field(
            <>
              <View style={styles.labelRow}>
                <Label>INSTALLATION ADDRESS</Label>
                <TouchableOpacity style={styles.checkRow} onPress={() => setSameAsBilling((v) => !v)}>
                  <Feather name={sameAsBilling ? 'check-square' : 'square'} size={14} color={sameAsBilling ? COLORS.primary : COLORS.textMuted} />
                  <Text style={styles.hint}>Same as billing address</Text>
                </TouchableOpacity>
              </View>
              <Input value={effectiveInstallation} onChangeText={setInstallationAddress} placeholder="Installation Address" readOnly={sameAsBilling} multiline autoCapitalize="sentences" />
            </>,
            true
          )}
          {manualMode ? field(<><Label>PINCODE</Label><Input value={pincode} onChangeText={(v) => setPincode(onlyDigits(v).slice(0, 6))} placeholder="6-digit pincode" keyboardType="number-pad" maxLength={6} /></>) : null}
          {field(<><Label>MOBILE NUMBER</Label><Input value={mobile} readOnly /></>)}
          {field(<><Label>EMAIL ID</Label><Input value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" /></>)}
        </View>

        {manualMode ? (
          <>
            <Text style={styles.sectionTitleHeader}>PHOTOS & ID PROOF</Text>
            <View style={styles.photoRow}>
              <PhotoPicker label="CUSTOMER PHOTO" hint="Clear face photo" value={photos.profile} onChange={setPhoto('profile')} error={photoErrors.profile} />
              <PhotoPicker label="ID PROOF — FRONT" hint="Aadhaar / ID front side" value={photos.front} onChange={setPhoto('front')} error={photoErrors.front} />
              <PhotoPicker label="ID PROOF — BACK" hint="Aadhaar / ID back side" value={photos.back} onChange={setPhoto('back')} error={photoErrors.back} />
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitleHeader}>INTERNET ACCOUNT</Text>
        <View style={styles.formGrid}>
          {renderPlanPickers(false)}
          {renderAccountFields(false)}
        </View>

        <View style={[styles.actionsRow, { justifyContent: 'flex-end' }]}>
          {onCancel ? (
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, (submitting || !selectedPackage || !selectedSubPlanId || usernameBlocked) && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || !selectedPackage || !selectedSubPlanId || usernameBlocked}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="user-plus" size={14} color="#fff" />}
            <Text style={styles.primaryBtnText}>{submitting ? 'Creating...' : 'Add Internet Customer'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // =========================================================
  // RENDER: STEP 1 — account + plan, then verification methods
  // =========================================================
  const locked = polling || starting;
  const showPicker = availableProviders.length > 1 && !chosenProvider;

  return wrap(
    <View style={styles.card}>
      <Text style={styles.sectionTitleHeader}>INTERNET ACCOUNT</Text>
      <View style={styles.formGrid}>
        {renderPlanPickers(locked)}
        {renderAccountFields(locked)}
        {field(
          <>
            <Label>MOBILE NUMBER</Label>
            <Input
              value={mobile}
              onChangeText={(v) => setMobile(onlyDigits(v).slice(0, 10))}
              placeholder="Mobile Number"
              keyboardType="phone-pad"
              maxLength={10}
              readOnly={mode === 'link' || locked}
            />
          </>
        )}
        {field(<><Label>EMAIL ID</Label><Input value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" disabled={locked} /></>)}
      </View>

      <View style={styles.divider} />
      <Text style={styles.sectionTitleHeader}>CUSTOMER VERIFICATION</Text>

      {/* Picker: only when more than one method is assigned */}
      {showPicker ? (
        <>
          <Text style={[styles.hint, { marginBottom: 8 }]}>Choose how to verify the customer:</Text>
          <View style={styles.methodRow}>
            {availableProviders.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.methodBtn, isMobile && { minWidth: '100%' }, !canVerify && styles.btnDisabled]}
                onPress={() => setChosenProvider(p)}
                disabled={!canVerify}
              >
                <Feather name={METHOD_META[p].icon} size={16} color={COLORS.primary} />
                <Text style={styles.methodLabel}>{METHOD_META[p].label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!canVerify ? <Text style={[styles.hint, { marginTop: 8 }]}>{step1Hint}</Text> : null}
        </>
      ) : null}

      {/* DigiLocker */}
      {chosenProvider === 'digilocker' && pollError && !polling ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.accentRose} />
          <Text style={styles.errorText}>DigiLocker verification failed: {pollError}</Text>
        </View>
      ) : null}

      {chosenProvider === 'digilocker' ? (
        !polling ? (
          <TouchableOpacity style={[styles.primaryBtn, styles.selfStart, (!canVerify || starting) && styles.btnDisabled]} disabled={!canVerify || starting} onPress={handleVerifyAadhaar}>
            {starting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="shield" size={14} color="#fff" />}
            <Text style={styles.primaryBtnText}>{starting ? 'Starting verification...' : 'Verify Aadhaar with DigiLocker'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingBox}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.verifiedTitle}>Waiting for Aadhaar verification…</Text>
            <Text style={[styles.hint, { textAlign: 'center' }]}>
              Complete the verification in the DigiLocker window. This page will update automatically once you're done.
            </Text>
            {pollStatus ? <Text style={[styles.hint, { fontSize: 11, textAlign: 'center' }]}>Status: {pollStatus}</Text> : null}
            <View style={[styles.actionsRow, { justifyContent: 'center' }]}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={checkNow}>
                <Feather name="refresh-cw" size={14} color={COLORS.primary} />
                <Text style={styles.secondaryBtnText}>I've completed it — check now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelVerification}>
                <Text style={styles.cancelBtnText}>Cancel Verification</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      ) : null}

      {/* ScoreMe */}
      {chosenProvider === 'scoreme' ? (
        <View style={styles.formGrid}>
          {field(
            <>
              <Label>AADHAAR NUMBER</Label>
              <Input
                value={aadhaarNumber}
                onChangeText={(v) => setAadhaarNumber(onlyDigits(v).slice(0, 12))}
                placeholder="12-digit Aadhaar number"
                keyboardType="number-pad"
                maxLength={12}
                disabled={otpSent || verifyingOtp}
              />
            </>
          )}
          {!otpSent ? (
            field(
              <TouchableOpacity
                style={[styles.primaryBtn, styles.selfStart, (!canVerify || sendingOtp || !/^\d{12}$/.test(aadhaarNumber)) && styles.btnDisabled]}
                disabled={!canVerify || sendingOtp || !/^\d{12}$/.test(aadhaarNumber)}
                onPress={handleScoremeSendOtp}
              >
                {sendingOtp ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.primaryBtnText}>{sendingOtp ? 'Sending OTP...' : 'Send OTP'}</Text>
              </TouchableOpacity>,
              true
            )
          ) : (
            <>
              {field(
                <>
                  <Label>ENTER OTP</Label>
                  <Input value={otp} onChangeText={(v) => setOtp(onlyDigits(v))} placeholder="OTP sent to the registered mobile" keyboardType="number-pad" disabled={verifyingOtp} />
                </>
              )}
              {field(
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={[styles.primaryBtn, (verifyingOtp || !otp.trim()) && styles.btnDisabled]} disabled={verifyingOtp || !otp.trim()} onPress={handleScoremeVerifyOtp}>
                    {verifyingOtp ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Text style={styles.primaryBtnText}>{verifyingOtp ? 'Verifying...' : 'Verify OTP'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.secondaryBtn, (sendingOtp || resendSecondsLeft > 0) && styles.btnDisabled]} disabled={sendingOtp || resendSecondsLeft > 0} onPress={handleScoremeSendOtp}>
                    <Text style={styles.secondaryBtnText}>{resendSecondsLeft > 0 ? `Resend in ${resendSecondsLeft}s` : 'Resend OTP'}</Text>
                  </TouchableOpacity>
                </View>,
                true
              )}
            </>
          )}
        </View>
      ) : null}

      {/* Manual — only reachable when 'manual' is assigned */}
      {chosenProvider === 'manual' && availableProviders.includes('manual') ? (
        <TouchableOpacity style={[styles.primaryBtn, styles.selfStart, !canVerify && styles.btnDisabled]} disabled={!canVerify} onPress={handleContinueManual}>
          <Feather name="edit-3" size={14} color="#fff" />
          <Text style={styles.primaryBtnText}>Continue with Manual Entry</Text>
        </TouchableOpacity>
      ) : null}

      {chosenProvider && !canVerify && !polling ? <Text style={[styles.hint, { marginTop: 8 }]}>{step1Hint}</Text> : null}

      {chosenProvider && availableProviders.length > 1 && !polling ? (
        <TouchableOpacity style={{ marginTop: 12 }} onPress={chooseDifferentMethod}>
          <Text style={styles.linkText}>← Choose a different verification method</Text>
        </TouchableOpacity>
      ) : null}

      {onCancel && !polling ? (
        <View style={[styles.actionsRow, { justifyContent: 'flex-end', marginTop: 16 }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
};

export const AddCustomerScreen = (props) => (
  <AddCustomerErrorBoundary onCancel={props.onCancel}>
    <AddCustomerScreenInner {...props} />
  </AddCustomerErrorBoundary>
);

export default AddCustomerScreen;

// ---------------------------------------------------------------------------
// Styles (same look as CustomerScreen)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bgPrimary },
  content: { width: '100%', paddingHorizontal: '3%', paddingVertical: 20 },

  screenControlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, alignSelf: 'flex-start' },
  backBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  operatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  operatorBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subHeaderTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textMain },

  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 14, padding: 20, marginBottom: 20 },
  centerCard: { alignItems: 'center', paddingVertical: 36 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, textAlign: 'center' },
  sectionTitleHeader: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 12 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 14 },
  hint: { fontSize: 12, color: COLORS.textMuted },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(244, 63, 94, 0.08)', borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.3)', borderRadius: 10, marginBottom: 14 },
  errorText: { flex: 1, color: COLORS.accentRose, fontSize: 12, fontWeight: '700' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },

  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  fieldItem: { gap: 4 },
  fieldHalf: { flexBasis: '48%', flexGrow: 1, minWidth: 220 },
  fieldFull: { flexBasis: '100%', width: '100%' },
  fieldLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  formInput: { height: 36, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 8, paddingHorizontal: 10, fontSize: 12, color: COLORS.textMain, backgroundColor: COLORS.bgSecondary, outlineStyle: 'none' },
  formInputMulti: { height: 64, paddingTop: 8, textAlignVertical: 'top' },
  formInputDisabled: { opacity: 0.7 },
  dobRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calBtn: { height: 36, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.35)', backgroundColor: 'rgba(16, 185, 129, 0.08)' },
  calOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  calCard: { width: '100%', maxWidth: 340, backgroundColor: '#ffffff', borderRadius: 14, padding: 16, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.25)', elevation: 10 },
  calTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  calHeaderTitles: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  calHeaderText: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  calYearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)' },
  calNav: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calScroll: { maxHeight: 260 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calWeekRow: { flexDirection: 'row', marginBottom: 2 },
  calWeekday: { width: '14.2857%', textAlign: 'center', fontSize: 10, fontWeight: '700', color: COLORS.textMuted, paddingVertical: 4 },
  calDayCell: { width: '14.2857%', height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calMonthCell: { width: '33.333%', height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calYearCell: { width: '25%', height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  calCellActive: { backgroundColor: COLORS.primary },
  calCellDisabled: { opacity: 0.3 },
  calCellText: { fontSize: 13, color: COLORS.textMain },
  calCellTextActive: { color: '#ffffff', fontWeight: '700' },
  formInputError: { borderColor: COLORS.accentRose },
  usernameStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  usernameStatusText: { fontSize: 11, fontWeight: '600', flex: 1 },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyeBtn: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.bgSecondary },

  dropdownBox: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 8, paddingHorizontal: 10, backgroundColor: COLORS.bgSecondary },
  dropdownBoxOpen: { borderColor: COLORS.primary },
  dropdownText: { flex: 1, fontSize: 12, color: COLORS.textMain },
  dropdownBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' },
  dropdownList: { position: 'absolute', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: 8, backgroundColor: '#ffffff', overflow: 'hidden', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)', elevation: 8 },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  dropdownItemActive: { backgroundColor: 'rgba(16, 185, 129, 0.08)' },
  dropdownItemText: { fontSize: 12, color: COLORS.textMain },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  photoItem: { flexGrow: 1, flexBasis: 220, gap: 4 },
  photoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, minHeight: 84 },
  photoBoxEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.glassBorder, backgroundColor: COLORS.bgSecondary },
  photoBoxFilled: { borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.35)', backgroundColor: 'rgba(16, 185, 129, 0.05)' },
  photoThumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: '#e2e8f0' },
  photoName: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)' },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  chipTextActive: { color: '#ffffff' },

  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  methodBtn: { flex: 1, minWidth: 160, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.06)' },
  methodLabel: { fontSize: 13, fontWeight: '700', color: COLORS.primary },

  verifiedBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: 'rgba(16, 185, 129, 0.08)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', marginBottom: 16 },
  manualBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, backgroundColor: 'rgba(245, 158, 11, 0.08)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', marginBottom: 16 },
  verifiedTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  waitingBox: { alignItems: 'center', gap: 8, padding: 18, borderRadius: 10, borderWidth: 1, borderColor: COLORS.glassBorder, backgroundColor: COLORS.bgSecondary },
  linkText: { fontSize: 12, fontWeight: '700', color: COLORS.primary, textDecorationLine: 'underline' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  selfStart: { alignSelf: 'flex-start' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.25)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  secondaryBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
  cancelBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
});