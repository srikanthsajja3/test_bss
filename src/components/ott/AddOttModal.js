import React, { useEffect, useRef, useState } from 'react';
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

const LABELS = { first_name: 'FIRST NAME', last_name: 'LAST NAME', email: 'EMAIL', dob: 'DATE OF BIRTH', state: 'STATE', gender: 'GENDER' };

/**
 * Registers an existing customer for OTT (ott_add_customer.php) straight away with the data we
 * already have (Aadhaar / RADIUS) — no form. Only when a field OTTAggre needs is not on file
 * (usually the email) does it ask for just that field.
 * Props: visible, onClose, customer, onAdded()
 */
export const AddOttModal = ({ visible, onClose, customer, onAdded }) => {
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState('loading'); // loading | creating | ask | error
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null); // what we know (name, mobile, …)
  const [ask, setAsk] = useState([]); // the fields to ask for
  const [form, setForm] = useState({});
  const [partnerId, setPartnerId] = useState(null);
  const startedFor = useRef(null);

  const create = async (pid, extra = {}) => {
    setPhase('creating');
    setError('');
    const res = await OneBssApi.addOttCustomer({ cust_id: customer.cust_id, partner_id: pid, ...extra });
    if (res.ok && res.data?.success !== false) {
      toast.success(res.data?.message || 'OTT account created.');
      onAdded && onAdded(res.data);
      onClose();
      return;
    }
    const miss = Array.isArray(res.data?.missing) ? res.data.missing : [];
    if (miss.length) {
      setAsk(miss);
      setError(res.data?.message || '');
      setPhase('ask');
      return;
    }
    setError(res.data?.message || 'Could not create the OTT account.');
    setPhase('error');
  };

  useEffect(() => {
    if (!visible || !customer) { startedFor.current = null; return undefined; }
    if (startedFor.current === customer.cust_id) return undefined; // once per opening
    startedFor.current = customer.cust_id;
    let cancelled = false;
    (async () => {
      setPhase('loading'); setError(''); setAsk([]); setForm({});
      const res = await OneBssApi.getOttRegisterPrefill(customer.cust_id);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.data?.message || 'Could not load the customer.');
        setPhase('error');
        return;
      }
      const d = res.data?.data || {};
      setInfo(d);
      setPartnerId(d.partner_id || null);
      if (!d.ott_ready) {
        setError('OTT is not set up for this operator yet — add the OTTAggre franchise id on the partner first.');
        setPhase('error');
        return;
      }
      const miss = Array.isArray(d.missing) ? d.missing : [];
      if (miss.length) {
        setAsk(miss);
        setPhase('ask');
        return;
      }
      create(d.partner_id || null); // everything is on file: register right away
    })();
    return () => { cancelled = true; };
  }, [visible, customer?.cust_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const stillMissing = ask.filter((k) => !String(form[k] || '').trim());
  const busy = phase === 'creating' || phase === 'loading';
  const name = info ? `${info.first_name || ''} ${info.last_name || ''}`.trim() : '';

  if (!customer) return null;
  return (
    <ModalShell
      visible={visible}
      title="Add OTT account"
      icon="play-circle"
      iconColor={OTT}
      onClose={onClose}
      maxWidth={560}
      busy={busy}
      footer={
        phase === 'ask' ? (
          <>
            <Btn label="Cancel" kind="ghost" onPress={onClose} />
            <Btn label="Create OTT account" kind="primary" onPress={() => create(partnerId, form)} disabled={stillMissing.length > 0} />
          </>
        ) : phase === 'error' ? (
          <Btn label="Close" kind="ghost" onPress={onClose} />
        ) : null
      }
    >
      {busy ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={OTT} />
          <Text style={styles.muted}>{phase === 'loading' ? 'Checking the customer…' : `Creating the OTT account${name ? ` for ${name}` : ''}…`}</Text>
        </View>
      ) : phase === 'error' ? (
        <Note tone="error" text={error} />
      ) : (
        <>
          <Note tone="info" text={error || 'Everything else is taken from the customer\'s Aadhaar / account details. Enter the missing detail to create the OTT account.'} />
          {info ? (
            <Text style={[styles.muted, { marginTop: 10 }]}>
              {name ? <Text style={{ fontWeight: '700', color: COLORS.textMain }}>{name}</Text> : null}
              {info.mobile ? ` · ${info.mobile}` : ''}
            </Text>
          ) : null}
          <View style={[styles.grid, width < 600 && { flexDirection: 'column' }]}>
            {ask.map((k) => (
              <Field key={k} label={`${LABELS[k] || k.toUpperCase()} *`}>
                {k === 'gender' ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {GENDERS.map((g) => (
                      <TouchableOpacity key={g} style={[styles.chip, form.gender === g && styles.chipOn]} onPress={() => set('gender')(g)}>
                        <Text style={[styles.chipText, form.gender === g && { color: '#ffffff' }]}>{g}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : k === 'state' && typeof document !== 'undefined' ? (
                  <select value={form.state || ''} onChange={(e) => set('state')(e.target.value)} style={webInput}>
                    <option value="">Select state…</option>
                    {STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                ) : k === 'dob' && typeof document !== 'undefined' ? (
                  <input type="date" value={form.dob || ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob')(e.target.value)} style={webInput} />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={form[k] || ''}
                    onChangeText={set(k)}
                    placeholder={k === 'email' ? 'name@example.com' : k === 'dob' ? 'YYYY-MM-DD' : ''}
                    keyboardType={k === 'email' ? 'email-address' : 'default'}
                    autoCapitalize={k === 'email' ? 'none' : 'words'}
                    placeholderTextColor="#94a3b8"
                  />
                )}
              </Field>
            ))}
          </View>
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
