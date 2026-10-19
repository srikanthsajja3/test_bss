import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, Note } from '../internet/shared';
import { OTT } from './OttRechargeModal';

const GENDERS = ['Male', 'Female', 'Other'];

// Indian states and union territories (OTTAggre wants the subscriber's state)
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const Field = ({ label, children }) => (
  <View style={{ flex: 1, minWidth: 220 }}>
    <Text style={styles.label}>{label}</Text>
    {children}
  </View>
);

/**
 * Registers an existing customer for OTT (ott_add_customer.php). Prefilled from the customer
 * record; OTTAggre needs every field.
 * Props: visible, onClose, customer, onAdded()
 */
export const AddOttModal = ({ visible, onClose, customer, onAdded }) => {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(true);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', dob: '', state: '', gender: '' });
  const [partnerId, setPartnerId] = useState(null);
  const [mobile, setMobile] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !customer) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const res = await OneBssApi.getOttRegisterPrefill(customer.cust_id);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.data?.message || 'Could not load the customer.');
        return;
      }
      const d = res.data?.data || {};
      setReady(!!d.ott_ready);
      setPartnerId(d.partner_id || null);
      setMobile(d.mobile || '');
      setForm({ first_name: d.first_name || '', last_name: d.last_name || '', email: d.email || '', dob: d.dob || '', state: d.state || '', gender: d.gender || '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, customer?.cust_id]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const missing = ['first_name', 'last_name', 'email', 'dob', 'state', 'gender'].filter((k) => !String(form[k] || '').trim());

  const save = async () => {
    if (missing.length || saving) return;
    setSaving(true);
    try {
      const res = await OneBssApi.addOttCustomer({ cust_id: customer.cust_id, partner_id: partnerId, ...form });
      if (res.ok) {
        toast.success(res.data?.message || 'OTT account created.');
        onAdded && onAdded(res.data);
        onClose();
      } else {
        toast.error(res.data?.message || 'Could not create the OTT account.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;
  return (
    <ModalShell
      visible={visible}
      title="Add OTT account"
      icon="play-circle"
      iconColor={OTT}
      onClose={onClose}
      maxWidth={640}
      busy={saving}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Register for OTT" kind="primary" onPress={save} loading={saving} disabled={loading || !ready || missing.length > 0} />
        </>
      }
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={OTT} />
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error ? (
        <Note tone="error" text={error} />
      ) : (
        <>
          {!ready ? <Note tone="error" text="OTT is not set up for this operator yet — add the OTTAggre franchise id on the partner first." /> : null}
          <Text style={styles.muted}>Mobile: <Text style={{ fontWeight: '700', color: COLORS.textMain }}>{mobile || '—'}</Text> (the customer's own number)</Text>
          <View style={[styles.grid, width < 600 && { flexDirection: 'column' }]}>
            <Field label="FIRST NAME *">
              <TextInput style={styles.input} value={form.first_name} onChangeText={set('first_name')} placeholder="First name" placeholderTextColor="#94a3b8" />
            </Field>
            <Field label="LAST NAME *">
              <TextInput style={styles.input} value={form.last_name} onChangeText={set('last_name')} placeholder="Last name" placeholderTextColor="#94a3b8" />
            </Field>
            <Field label="EMAIL *">
              <TextInput style={styles.input} value={form.email} onChangeText={set('email')} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94a3b8" />
            </Field>
            <Field label="DATE OF BIRTH *">
              {typeof document !== 'undefined' ? (
                <input type="date" value={form.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob')(e.target.value)} style={webInput} />
              ) : (
                <TextInput style={styles.input} value={form.dob} onChangeText={set('dob')} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
              )}
            </Field>
            <Field label="STATE *">
              {typeof document !== 'undefined' ? (
                <select value={form.state} onChange={(e) => set('state')(e.target.value)} style={webInput}>
                  <option value="">Select state…</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <TextInput style={styles.input} value={form.state} onChangeText={set('state')} placeholder="State" placeholderTextColor="#94a3b8" />
              )}
            </Field>
            <Field label="GENDER *">
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {GENDERS.map((g) => (
                  <TouchableOpacity key={g} style={[styles.chip, form.gender === g && styles.chipOn]} onPress={() => set('gender')(g)}>
                    <Text style={[styles.chipText, form.gender === g && { color: '#ffffff' }]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>
          </View>
          {missing.length ? <Text style={[styles.muted, { marginTop: 10 }]}>OTTAggre needs every field above.</Text> : null}
        </>
      )}
    </ModalShell>
  );
};

const webInput = { height: 40, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', fontSize: 13, color: '#0f172a', background: '#ffffff', width: '100%', boxSizing: 'border-box' };

const styles = StyleSheet.create({
  muted: { fontSize: 12, color: '#64748b' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6, letterSpacing: 0.3 },
  input: { height: 40, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 10, fontSize: 13, color: COLORS.textMain, backgroundColor: '#ffffff' },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: OTT, borderColor: OTT },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
});
