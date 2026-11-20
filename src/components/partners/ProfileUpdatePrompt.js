import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../../services/oneBssApi';
import { isStaffUser } from '../../services/staffAccess';
import { ModalShell, Btn, Note } from '../internet/shared';

const FIELDS = [
  { key: 'partner_name', label: 'Your name', icon: 'user', max: 100 },
  { key: 'company_name', label: 'Company name', icon: 'briefcase', max: 150 },
  { key: 'partner_mobile', label: 'Mobile number', icon: 'phone', max: 10, keyboard: 'phone-pad' },
  { key: 'partner_email', label: 'Email', icon: 'mail', max: 100, keyboard: 'email-address' },
  { key: 'partner_region', label: 'Region', icon: 'map-pin', max: 150 },
];

/**
 * A partner (operator / distributor / sub-distributor login, not staff) whose one-time details
 * edit was opened by the super admin sees a banner; the form opens once by itself per session.
 * Saving closes the access again (partner_profile.php).
 */
export const ProfileUpdatePrompt = ({ user }) => {
  const role = String(user?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
  const eligible = !!user?.partner_id && role !== 'superadmin' && !isStaffUser(user) && !user?.is_impersonation;
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eligible) return undefined;
    let alive = true;
    OneBssApi.getMyProfile().then((res) => {
      const pr = res.ok && res.data?.success ? res.data.profile : null;
      if (!alive || !pr || !pr.can_edit) return;
      setProfile(pr);
      setForm(Object.fromEntries(FIELDS.map((f) => [f.key, pr[f.key] || ''])));
      let shown = false;
      try { shown = sessionStorage.getItem('onebss_profile_prompt') === String(pr.partner_id); } catch (e) {}
      if (!shown) {
        setOpen(true);
        try { sessionStorage.setItem('onebss_profile_prompt', String(pr.partner_id)); } catch (e) {}
      }
    });
    return () => { alive = false; };
  }, [eligible, user?.partner_id]);

  if (!eligible || !profile) return null;

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: k === 'partner_mobile' ? v.replace(/\D/g, '').slice(0, 10) : v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = async () => {
    const errs = {};
    FIELDS.forEach((f) => { if (!String(form[f.key] || '').trim()) errs[f.key] = `Enter the ${f.label.toLowerCase()}`; });
    if (!errs.partner_mobile && !/^[6-9]\d{9}$/.test(form.partner_mobile)) errs.partner_mobile = 'Enter a valid 10-digit mobile number';
    if (!errs.partner_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(form.partner_email).trim())) errs.partner_email = 'Enter a valid email';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    const res = await OneBssApi.saveMyProfile(form);
    setBusy(false);
    if (!res.ok || res.data?.success === false) {
      if (res.data?.errors) setErrors(res.data.errors);
      toast.error(res.data?.message || 'Could not update your details');
      return;
    }
    toast.success(res.data?.message || 'Your details are updated');
    setOpen(false);
    setProfile(null); // one time only: the banner goes away
  };

  return (
    <>
      <View style={s.banner}>
        <Feather name="edit-3" size={16} color="#1d4ed8" />
        <Text style={s.bannerText}>Please check and update your details — you can do this once.</Text>
        <TouchableOpacity style={s.bannerBtn} onPress={() => setOpen(true)}>
          <Text style={s.bannerBtnText}>Update details</Text>
        </TouchableOpacity>
      </View>
      <ModalShell
        visible={open}
        title="Update your details"
        icon="user-check"
        onClose={() => !busy && setOpen(false)}
        busy={busy}
        footer={(
          <>
            <Btn label="Later" kind="ghost" onPress={() => setOpen(false)} disabled={busy} />
            <Btn label="Save details" icon="check" onPress={save} loading={busy} />
          </>
        )}
      >
        <Note tone="info" text="The super admin has allowed you to update these details one time. After you save, editing closes again." />
        {FIELDS.map((f) => (
          <View key={f.key} style={{ marginTop: 12 }}>
            <Text style={s.label}>{f.label}</Text>
            <View style={[s.inputWrap, errors[f.key] && s.inputErr]}>
              <Feather name={f.icon} size={14} color="#64748b" />
              <TextInput
                style={s.input}
                value={String(form[f.key] ?? '')}
                onChangeText={(v) => set(f.key, v)}
                maxLength={f.max}
                keyboardType={f.keyboard || 'default'}
                autoCapitalize={f.key === 'partner_email' ? 'none' : 'words'}
                editable={!busy}
              />
            </View>
            {errors[f.key] ? <Text style={s.err}>{errors[f.key]}</Text> : null}
          </View>
        ))}
      </ModalShell>
    </>
  );
};

const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 16, marginTop: 12 },
  bannerText: { flex: 1, minWidth: 180, color: '#1e3a8a', fontSize: 13, fontWeight: '600' },
  bannerBtn: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  bannerBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff' },
  inputErr: { borderColor: '#ef4444' },
  input: { flex: 1, paddingVertical: 9, fontSize: 14, color: '#0f172a', outlineStyle: 'none' },
  err: { color: '#dc2626', fontSize: 11, marginTop: 3 },
});
