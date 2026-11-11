import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, ScrollView, Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../../constants/theme';
import { OneBssApi } from '../../services/oneBssApi';
import { ModalShell, Btn, KV, Note, Dropdown, SearchSelect, sharedStyles, fixDocUrl, isImageUrl, openExternal } from './shared';

const errMsg = (res, fallback) => res?.data?.message || (res?.status ? `${fallback} (HTTP ${res.status})` : fallback);
const okRes = (res) => res && res.ok && res.data && res.data.success !== false;

const copy = (text, what) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(String(text || ''));
      toast.success(`${what} copied`);
    }
  } catch (e) {}
};

// =====================================================================
// PASSWORD — view current RADIUS password + set a new one
// =====================================================================
export const PasswordModal = ({ visible, onClose, internetId, username, inline = false }) => {
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reveal, setReveal] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await OneBssApi.viewInternetPassword(internetId);
      if (okRes(res)) setCurrent(res.data.results?.password || '');
      else setLoadError(errMsg(res, 'Unable to fetch password'));
    } catch (e) {
      setLoadError('Unable to fetch password');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setPw('');
      setPw2('');
      setReveal(false);
      setCurrent('');
      load();
    }
  }, [visible, internetId]);

  const save = async () => {
    if (pw.trim().length < 4) return toast.info('New password must be at least 4 characters');
    if (pw !== pw2) return toast.warning('Passwords do not match');
    setSaving(true);
    try {
      const res = await OneBssApi.changeInternetPassword(internetId, pw.trim());
      if (okRes(res)) {
        toast.success(res.data.message || 'Password changed successfully');
        setPw('');
        setPw2('');
        load();
      } else {
        toast.error(errMsg(res, 'Failed to change password'));
      }
    } catch (e) {
      toast.error('Unable to change password');
    } finally {
      setSaving(false);
    }
  };

  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <ModalShell
      visible={visible}
      title={inline ? 'Password' : `Password — ${username || ''}`}
      icon="key"
      onClose={onClose}
      busy={saving}
      inline={inline}
      footer={
        <>
          {inline ? null : <Btn label="Close" kind="ghost" onPress={onClose} disabled={saving} />}
          <Btn label="Change Password" onPress={save} loading={saving} disabled={!pw || !pw2 || mismatch} />
        </>
      }
    >
      <Text style={sharedStyles.label}>CURRENT PASSWORD</Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : (
        <View style={styles.pwRow}>
          <Text style={styles.pwText} selectable>{reveal ? current || '—' : current ? '•'.repeat(Math.min(current.length, 12)) : '—'}</Text>
          <TouchableOpacity onPress={() => setReveal((r) => !r)} style={styles.iconBtn}>
            <Feather name={reveal ? 'eye-off' : 'eye'} size={15} color="#475569" />
          </TouchableOpacity>
          {current ? (
            <TouchableOpacity onPress={() => copy(current, 'Password')} style={styles.iconBtn}>
              <Feather name="copy" size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={styles.divider} />

      <Text style={sharedStyles.label}>NEW PASSWORD</Text>
      <TextInput style={sharedStyles.input} value={pw} onChangeText={setPw} secureTextEntry={!reveal} placeholder="Minimum 4 characters" placeholderTextColor="#94a3b8" />
      <Text style={[sharedStyles.label, { marginTop: 12 }]}>CONFIRM PASSWORD</Text>
      <TextInput style={[sharedStyles.input, mismatch && { borderColor: '#f87171' }]} value={pw2} onChangeText={setPw2} secureTextEntry={!reveal} placeholder="Re-enter password" placeholderTextColor="#94a3b8" />
      {mismatch ? <Text style={styles.errText}>Passwords do not match</Text> : null}
      <Note tone="info" text="The customer's PPPoE session may need to reconnect with the new password." />
    </ModalShell>
  );
};

// =====================================================================
// NETWORKING — RADIUS network bindings: list + add + remove
// (MAC Bind / MAC Login, Static IP / IP Login / IP Bind, NAS Port ID, IPv6 Prefix)
// =====================================================================
export const NETWORKING_TYPES = [
  { value: 1, label: 'MAC Bind', field: 'mac', hint: 'Locks the account to this router MAC.' },
  { value: 2, label: 'MAC Login', field: 'mac', hint: 'Lets this MAC log in without a username/password.' },
  { value: 0, label: 'Static IP', field: 'ip', hint: 'Always hands out this IPv4 address to the account. Pick it from your NAS’s IP pool.' },
  { value: 3, label: 'IP Login', field: 'ip', hint: 'Lets this IPv4 address log in without a username/password. Pick it from your NAS’s IP pool.' },
  { value: 4, label: 'IP Bind', field: 'ip', hint: 'Locks the account to this IPv4 address. Pick it from your NAS’s IP pool.' },
  { value: 5, label: 'NAS Port ID', field: 'nas', hint: 'Locks the account to this NAS port (e.g. eth 0/1/0/12:100).' },
  { value: 6, label: 'IPv6 Prefix', field: 'ipv6', hint: 'Framed and/or delegated IPv6 prefix for the account.' },
];
const netTypeOf = (code) => NETWORKING_TYPES.find((t) => t.value === Number(code));

const MAC_RE = /^[0-9A-Fa-f]{2}([:-]?)[0-9A-Fa-f]{2}(\1[0-9A-Fa-f]{2}){4}$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PREFIX_RE = /^[0-9A-Fa-f:]*:[0-9A-Fa-f:]*\/(12[0-8]|1[01]\d|[1-9]?\d)$/;
const formatMac = (v) => {
  const hex = String(v || '').replace(/[^0-9A-Fa-f]/g, '');
  return hex.length === 12 ? hex.toUpperCase().match(/.{2}/g).join(':') : String(v || '').trim();
};

/** The value(s) a binding row holds, as one line for the table. */
const bindingValue = (b) => {
  const t = netTypeOf(b.acctype);
  const field = t ? t.field : null;
  if (field === 'mac') return b.mac || '—';
  if (field === 'ip') return b.ip || '—';
  if (field === 'nas') return b.nas_port_id || '—';
  if (field === 'ipv6') {
    const parts = [];
    if (b.framed_ip_prefix) parts.push(`Framed ${b.framed_ip_prefix}`);
    if (b.delegated_ip_prefix) parts.push(`Delegated ${b.delegated_ip_prefix}`);
    return parts.join('  ·  ') || '—';
  }
  return [b.mac, b.ip, b.nas_port_id, b.framed_ip_prefix, b.delegated_ip_prefix].filter(Boolean).join(' · ') || '—';
};

const EMPTY_FORM = { mac: '', ip: '', nas: '', framed: '', delegated: '' };

export const NetworkingModal = ({ visible, onClose, internetId, username, inline = false }) => {
  const [loading, setLoading] = useState(false);
  const [bindings, setBindings] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [removing, setRemoving] = useState(null);

  const [adding, setAdding] = useState(false); // form open
  const [type, setType] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // IP types: NAS -> pool -> free IP, from the pools given to the customer's operator
  const [ipOpts, setIpOpts] = useState(null); // response of internet_ip_options.php
  const [ipLoading, setIpLoading] = useState(false);
  const [ipError, setIpError] = useState('');
  const [nasSel, setNasSel] = useState(null);
  const [poolSel, setPoolSel] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await OneBssApi.getInternetNetworking(internetId);
      if (okRes(res)) setBindings(Array.isArray(res.data.results) ? res.data.results : []);
      else setLoadError(errMsg(res, 'Unable to load networking'));
    } catch (e) {
      setLoadError('Unable to load networking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setBindings([]);
      setConfirmId(null);
      setAdding(false);
      setForm(EMPTY_FORM);
      setType(1);
      setIpOpts(null);
      setIpError('');
      setNasSel(null);
      setPoolSel(null);
      load();
    }
  }, [visible, internetId]);

  const setF = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const typeInfo = netTypeOf(type);
  const isIpType = typeInfo.field === 'ip';

  const loadIpOptions = async (nasId, poolId) => {
    setIpLoading(true);
    setIpError('');
    try {
      const res = await OneBssApi.getInternetIpOptions(internetId, nasId, poolId);
      if (okRes(res)) {
        setIpOpts(res.data);
        setNasSel(res.data.nas_id || null);   // the server auto-selects when there is only one
        setPoolSel(res.data.ippool_id || null);
        if (!res.data.nas?.length) setIpError(res.data.message || 'No IP pool is given to this operator yet.');
      } else {
        setIpError(errMsg(res, 'Unable to load IP pools'));
      }
    } catch (e) {
      setIpError('Unable to load IP pools');
    } finally {
      setIpLoading(false);
    }
  };

  // open the IP picker: start from the NAS level (keeps the current NAS/pool when re-opened)
  useEffect(() => {
    if (adding && isIpType) {
      setForm((f) => ({ ...f, ip: '' }));
      loadIpOptions(nasSel, poolSel);
    }
  }, [adding, isIpType]);

  const pickNas = (v) => {
    setForm((f) => ({ ...f, ip: '' }));
    setPoolSel(null);
    loadIpOptions(Number(v), null);
  };
  const pickPool = (v) => {
    setForm((f) => ({ ...f, ip: '' }));
    loadIpOptions(nasSel, Number(v));
  };

  // client-side check — the server validates again
  const formError = (() => {
    const f = typeInfo.field;
    if (f === 'mac') return !form.mac.trim() ? 'empty' : MAC_RE.test(form.mac.trim()) ? '' : 'Enter a valid MAC address (AA:BB:CC:DD:EE:FF)';
    if (f === 'ip') return !form.ip.trim() || !ipOpts?.ipopid ? 'empty' : IPV4_RE.test(form.ip.trim()) ? '' : 'Choose an IP from the list';
    if (f === 'nas') return form.nas.trim() ? '' : 'empty';
    if (f === 'ipv6') {
      const fr = form.framed.trim();
      const de = form.delegated.trim();
      if (!fr && !de) return 'empty';
      if (fr && !IPV6_PREFIX_RE.test(fr)) return 'Framed prefix must look like 2001:db8:1::/64';
      if (de && !IPV6_PREFIX_RE.test(de)) return 'Delegated prefix must look like 2001:db8:100::/56';
      return '';
    }
    return 'empty';
  })();

  // same type + same value already on the account (RADIUS would store it twice)
  const duplicate = (() => {
    if (formError) return false;
    const f = typeInfo.field;
    const norm = (v) => String(v || '').trim().toLowerCase();
    return bindings.some((b) => {
      if (Number(b.acctype) !== type) return false;
      if (f === 'mac') return formatMac(b.mac) === formatMac(form.mac);
      if (f === 'ip') return norm(b.ip) === norm(form.ip);
      if (f === 'nas') return norm(b.nas_port_id) === norm(form.nas);
      if (f === 'ipv6') return norm(b.framed_ip_prefix) === norm(form.framed) && norm(b.delegated_ip_prefix) === norm(form.delegated);
      return false;
    });
  })();

  const add = async () => {
    if (formError || duplicate) return;
    const f = typeInfo.field;
    const payload = { type };
    if (f === 'mac') payload.mac = formatMac(form.mac);
    if (f === 'ip') {
      payload.ip_address = form.ip.trim();
      payload.ipopid = ipOpts?.ipopid;
    }
    if (f === 'nas') payload.nas_port_id = form.nas.trim();
    if (f === 'ipv6') {
      payload.framed_ip_prefix = form.framed.trim();
      payload.delegated_ip_prefix = form.delegated.trim();
    }
    setSaving(true);
    try {
      const res = await OneBssApi.addInternetNetworking(internetId, payload);
      if (okRes(res)) {
        toast.success(res.data.message || `${typeInfo.label} added`);
        setForm(EMPTY_FORM);
        setAdding(false);
        load(); // RADIUS assigns the binding id — reload to get it
      } else {
        toast.error(errMsg(res, 'Failed to add binding'));
      }
    } catch (e) {
      toast.error('Failed to add binding');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    setRemoving(id);
    try {
      const res = await OneBssApi.removeInternetNetworking(internetId, id);
      if (okRes(res)) {
        toast.success(res.data.message || 'Binding removed');
        setBindings((prev) => prev.filter((b) => b.id !== id));
      } else {
        toast.error(errMsg(res, 'Failed to remove binding'));
      }
    } catch (e) {
      toast.error('Failed to remove binding');
    } finally {
      setRemoving(null);
      setConfirmId(null);
    }
  };

  const busy = !!removing || saving;
  const input = (value, onChange, placeholder, extra = {}) => (
    <TextInput
      style={sharedStyles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      autoCapitalize="none"
      autoCorrect={false}
      editable={!saving}
      onSubmitEditing={add}
      {...extra}
    />
  );

  return (
    <ModalShell
      visible={visible}
      title={inline ? 'Networking' : `Networking — ${username || ''}`}
      icon="globe"
      onClose={onClose}
      maxWidth={680}
      busy={busy}
      inline={inline}
      footer={
        <>
          <Btn label="Refresh" kind="ghost" icon="refresh-cw" onPress={load} disabled={loading || busy} />
          {adding ? null : <Btn label="Add Binding" icon="plus" onPress={() => setAdding(true)} disabled={loading || busy || !!loadError} />}
          {inline ? null : <Btn label="Close" kind="ghost" onPress={onClose} disabled={busy} />}
        </>
      }
    >
      {adding ? (
        <View style={styles.addBox}>
          <Text style={sharedStyles.label}>BINDING TYPE</Text>
          <Dropdown
            value={type}
            options={NETWORKING_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            onChange={(v) => { setType(Number(v)); setForm(EMPTY_FORM); }}
            disabled={saving}
          />
          <Text style={styles.hintText}>{typeInfo.hint}</Text>

          {typeInfo.field === 'mac' ? (
            <>
              <Text style={[sharedStyles.label, { marginTop: 12 }]}>MAC ADDRESS</Text>
              {input(form.mac, setF('mac'), 'AA:BB:CC:DD:EE:FF')}
            </>
          ) : typeInfo.field === 'ip' ? (
            <>
              {ipError && !ipOpts?.nas?.length ? (
                <View style={{ marginTop: 12 }}><Note tone="warn" text={ipError} /></View>
              ) : (
                <>
                  <Text style={[sharedStyles.label, { marginTop: 12 }]}>1 · NAS</Text>
                  {ipOpts?.nas?.length > 1 ? (
                    <Dropdown
                      value={nasSel || ''}
                      options={ipOpts.nas.map((n) => ({ value: n.nas_id, label: `${n.nas_name || `NAS #${n.nas_id}`} — ${n.nas_ip} (${n.area})` }))}
                      onChange={pickNas}
                      disabled={saving || ipLoading}
                      placeholder="Choose the NAS"
                    />
                  ) : ipOpts?.nas?.length === 1 ? (
                    <View style={styles.autoBox}>
                      <Feather name="server" size={13} color="#4f46e5" />
                      <Text style={styles.autoText}>{ipOpts.nas[0].nas_name || `NAS #${ipOpts.nas[0].nas_id}`} — {ipOpts.nas[0].nas_ip} ({ipOpts.nas[0].area})</Text>
                      <Text style={styles.autoTag}>only NAS</Text>
                    </View>
                  ) : ipLoading ? <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginVertical: 8 }} /> : null}

                  {nasSel ? (
                    <>
                      <Text style={[sharedStyles.label, { marginTop: 12 }]}>2 · IP POOL</Text>
                      {ipOpts?.pools?.length > 1 ? (
                        <Dropdown
                          value={poolSel || ''}
                          options={ipOpts.pools.map((p) => ({ value: p.ippool_id, label: `${p.ip_start} – ${p.ip_end}  (${p.free} free)` }))}
                          onChange={pickPool}
                          disabled={saving || ipLoading}
                          placeholder="Choose the IP pool"
                        />
                      ) : ipOpts?.pools?.length === 1 ? (
                        <View style={styles.autoBox}>
                          <Feather name="layers" size={13} color="#4f46e5" />
                          <Text style={styles.autoText}>{ipOpts.pools[0].ip_start} – {ipOpts.pools[0].ip_end} ({ipOpts.pools[0].free} free)</Text>
                          <Text style={styles.autoTag}>only pool</Text>
                        </View>
                      ) : null}
                    </>
                  ) : null}

                  {poolSel && ipOpts?.ipopid ? (
                    <>
                      <Text style={[sharedStyles.label, { marginTop: 12 }]}>3 · IP ADDRESS ({ipOpts.free_total} free)</Text>
                      {ipLoading ? (
                        <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
                      ) : ipOpts.free_total === 0 ? (
                        <Note tone="warn" text="Every IP of this pool is already given to a customer." />
                      ) : (
                        <SearchSelect
                          value={form.ip}
                          onChange={(v) => setForm((f) => ({ ...f, ip: String(v) }))}
                          options={ipOpts.free_ips.map((ip) => ({ value: ip, label: ip }))}
                          placeholder="Choose a free IP"
                          searchPlaceholder="Type part of the IP…"
                          emptyText="No free IP matches"
                          accent="#4f46e5"
                          disabled={saving}
                        />
                      )}
                      {ipOpts.truncated ? <Text style={styles.hintText}>Showing the first {ipOpts.free_ips.length} free IPs.</Text> : null}
                      {ipOpts.current_ips?.length ? <Text style={styles.hintText}>This customer already uses {ipOpts.current_ips.join(', ')} — an IP can be used only once (Static IP, IP Login or IP Bind).</Text> : null}
                    </>
                  ) : null}
                  {ipError && ipOpts?.nas?.length ? <Text style={styles.errText}>{ipError}</Text> : null}
                </>
              )}
            </>
          ) : typeInfo.field === 'nas' ? (
            <>
              <Text style={[sharedStyles.label, { marginTop: 12 }]}>NAS PORT ID</Text>
              {input(form.nas, setF('nas'), 'e.g. eth 0/1/0/12:100')}
            </>
          ) : (
            <>
              <Text style={[sharedStyles.label, { marginTop: 12 }]}>FRAMED IPV6 PREFIX</Text>
              {input(form.framed, setF('framed'), 'e.g. 2001:db8:1::/64')}
              <Text style={[sharedStyles.label, { marginTop: 12 }]}>DELEGATED IPV6 PREFIX</Text>
              {input(form.delegated, setF('delegated'), 'e.g. 2001:db8:100::/56')}
              <Text style={styles.hintText}>Fill one or both.</Text>
            </>
          )}

          {formError && formError !== 'empty' ? <Text style={styles.errText}>{formError}</Text> : null}
          {duplicate ? <Text style={styles.errText}>This {typeInfo.label} binding is already on the account.</Text> : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <Btn label="Cancel" kind="ghost" onPress={() => { setAdding(false); setForm(EMPTY_FORM); }} disabled={saving} />
            <Btn label={`Add ${typeInfo.label}`} icon="plus" onPress={add} loading={saving} disabled={!!formError || duplicate} />
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />
      ) : loadError ? (
        <Note tone="error" text={loadError} />
      ) : bindings.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="check-circle" size={22} color="#10b981" />
          <Text style={styles.emptyText}>No network bindings on this account.</Text>
        </View>
      ) : (
        <View style={styles.table}>
          <View style={[styles.tr, styles.thRow]}>
            <Text style={[styles.th, { flex: 1.2 }]}>Type</Text>
            <Text style={[styles.th, { flex: 2.6 }]}>Value</Text>
            <Text style={[styles.th, { flex: 1.6, textAlign: 'right' }]}> </Text>
          </View>
          {bindings.map((b) => (
            <View key={b.id} style={styles.tr}>
              <View style={{ flex: 1.2 }}>
                <View style={[styles.pill, { backgroundColor: '#eff6ff' }]}>
                  <Text style={[styles.pillText, { color: '#1d4ed8' }]}>{netTypeOf(b.acctype)?.label || b.type || '—'}</Text>
                </View>
              </View>
              <Text style={[styles.td, { flex: 2.6, fontWeight: '700', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]} selectable>{bindingValue(b)}</Text>
              <View style={{ flex: 1.6, alignItems: 'flex-end' }}>
                {confirmId === b.id ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={styles.smallGhost} onPress={() => setConfirmId(null)} disabled={removing === b.id}>
                      <Text style={styles.smallGhostText}>No</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallDanger} onPress={() => remove(b.id)} disabled={removing === b.id}>
                      {removing === b.id ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.smallDangerText}>Yes, remove</Text>}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.smallOutline} onPress={() => setConfirmId(b.id)} disabled={busy}>
                    <Feather name="trash-2" size={12} color="#dc2626" />
                    <Text style={styles.smallOutlineText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};

// old name, kept so existing imports keep working
export const MacBindingsModal = NetworkingModal;

// =====================================================================
// SESSION HISTORY
// =====================================================================
const toYmd = (d) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

const parseSize = (value) => {
  if (!value) return 0;
  const [num, unit] = String(value).trim().split(/\s+/);
  const n = parseFloat(num);
  if (isNaN(n)) return 0;
  switch ((unit || '').toUpperCase()) {
    case 'B': return n / (1024 * 1024);
    case 'KB': return n / 1024;
    case 'MB': return n;
    case 'GB': return n * 1024;
    case 'TB': return n * 1024 * 1024;
    default: return 0;
  }
};
const fmtSize = (mb) => (mb >= 1024 * 1024 ? `${(mb / 1048576).toFixed(2)} TB` : mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`);

const DateField = ({ value, onChange }) =>
  Platform.OS === 'web' ? (
    React.createElement('input', {
      type: 'date',
      value,
      max: toYmd(new Date()),
      onChange: (e) => onChange(e.target.value),
      style: { height: 38, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, padding: '0 10px', fontSize: 13, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', color: '#000' },
    })
  ) : (
    <TextInput style={[sharedStyles.input, { width: 140 }]} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" />
  );

const SESSION_COLS = [
  { key: 'from_time', label: 'Login Time', flex: 1.6 },
  { key: 'to_time', label: 'End Time', flex: 1.6 },
  { key: 'login_ip_address', label: 'Login IP', flex: 1.3 },
  { key: 'package_name', label: 'Package', flex: 1.5 },
  { key: 'upload_data', label: 'Upload', flex: 1 },
  { key: 'download_data', label: 'Download', flex: 1 },
  { key: 'total_data', label: 'Total', flex: 1 },
  { key: 'termination_call', label: 'Reason', flex: 1.4 },
];

export const SessionHistoryModal = ({ visible, onClose, internetId, username, inline = false }) => {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [start, setStart] = useState(toYmd(monthAgo));
  const [end, setEnd] = useState(toYmd(today));
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    if (!start || !end) return toast.info('Pick both dates');
    if (start > end) return toast.warning('"From" must be on or before "To"');
    setLoading(true);
    setLoadError('');
    setSelected(null);
    try {
      const res = await OneBssApi.getInternetSessionHistory(internetId, start, end);
      if (okRes(res)) {
        const list = res.data.results?.sessionList || [];
        setSessions([...list].sort((a, b) => String(b.from_time || '').localeCompare(String(a.from_time || ''))));
      } else {
        setSessions([]);
        setLoadError(errMsg(res, 'Unable to load sessions'));
      }
    } catch (e) {
      setLoadError('Unable to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setSessions([]);
      load();
    }
  }, [visible, internetId]);

  const sum = sessions.reduce(
    (acc, s) => ({ up: acc.up + parseSize(s.upload_data), down: acc.down + parseSize(s.download_data), total: acc.total + parseSize(s.total_data) }),
    { up: 0, down: 0, total: 0 }
  );

  return (
    <ModalShell visible={visible} inline={inline} title={inline ? 'Session History' : `Session History — ${username || ''}`} icon="list" onClose={onClose} maxWidth={1100} footer={inline ? null : <Btn label="Close" onPress={onClose} />}>
      <View style={styles.toolbar}>
        <View>
          <Text style={sharedStyles.label}>FROM</Text>
          <DateField value={start} onChange={setStart} />
        </View>
        <View>
          <Text style={sharedStyles.label}>TO</Text>
          <DateField value={end} onChange={setEnd} />
        </View>
        <View style={{ justifyContent: 'flex-end' }}>
          <Btn label={loading ? 'Loading…' : 'Load Sessions'} icon="search" onPress={load} disabled={loading} />
        </View>
      </View>

      <View style={styles.statRow}>
        {[
          ['Sessions', String(sessions.length)],
          ['Upload', fmtSize(sum.up)],
          ['Download', fmtSize(sum.down)],
          ['Total Usage', fmtSize(sum.total)],
        ].map(([l, v]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statLabel}>{l}</Text>
            <Text style={styles.statValue}>{v}</Text>
          </View>
        ))}
      </View>

      {loadError ? <Note tone="error" text={loadError} /> : null}

      {selected ? (
        <View style={styles.detailBox}>
          <TouchableOpacity style={styles.backLink} onPress={() => setSelected(null)}>
            <Feather name="arrow-left" size={14} color={COLORS.primary} />
            <Text style={styles.backLinkText}>Back to sessions</Text>
          </TouchableOpacity>
          {[
            ['Username', selected.username], ['Login Time', selected.from_time], ['End Time', selected.to_time],
            ['Login IP', selected.login_ip_address], ['NAS IP', selected.nas_ip_address], ['NAS Port', selected.nas_port_id],
            ['Protocol', selected.protocol], ['Package', selected.package_name], ['Profile', selected.profile_name],
            ['Upload', selected.upload_data], ['Download', selected.download_data], ['Total', selected.total_data],
            ['Termination', selected.termination_call], ['Session ID', selected.session],
          ].map(([l, v]) => <KV key={l} label={l} value={v} />)}
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={{ minWidth: 1000, width: '100%' }}>
            <View style={[styles.tr, styles.thRow]}>
              {SESSION_COLS.map((c) => <Text key={c.key} style={[styles.th, { flex: c.flex }]}>{c.label}</Text>)}
              <Text style={[styles.th, { flex: 0.7 }]}> </Text>
            </View>
            {sessions.length === 0 ? (
              <Text style={[styles.emptyText, { padding: 16, textAlign: 'center' }]}>No sessions in this date range.</Text>
            ) : (
              sessions.map((s, i) => (
                <View key={`${s.session || i}_${i}`} style={styles.tr}>
                  {SESSION_COLS.map((c) => <Text key={c.key} style={[styles.td, { flex: c.flex }]}>{s[c.key] || '—'}</Text>)}
                  <View style={{ flex: 0.7 }}>
                    <TouchableOpacity style={styles.smallGhost} onPress={() => setSelected(s)}>
                      <Text style={styles.smallGhostText}>View</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </ModalShell>
  );
};

// =====================================================================
// AUTHENTICATION LOGS — RADIUS Access-Accept / Access-Reject attempts
// =====================================================================
const AUTH_PAGE = 50;
const AUTH_COLS = [
  { key: 'authdate', label: 'Time', flex: 1.4 },
  { key: 'reply', label: 'Result', flex: 1.1 },
  { key: 'reason', label: 'Reason', flex: 2.2 },
  { key: 'mac', label: 'MAC', flex: 1.4 },
  { key: 'nasipaddress', label: 'NAS IP', flex: 1.2 },
  { key: 'nasportid', label: 'NAS Port', flex: 1.2 },
  { key: 'framedipaddress', label: 'Framed IP', flex: 1.1 },
  { key: 'username_org', label: 'Username sent', flex: 1.3 },
];
const AUTH_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'accept', label: 'Accepted' },
  { id: 'reject', label: 'Rejected' },
];

const ResultPill = ({ log }) => {
  const ok = !!log.accepted;
  return (
    <View style={[styles.pill, { backgroundColor: ok ? '#dcfce7' : '#fee2e2' }]}>
      <Feather name={ok ? 'check-circle' : 'x-circle'} size={11} color={ok ? '#15803d' : '#b91c1c'} />
      <Text style={[styles.pillText, { color: ok ? '#15803d' : '#b91c1c' }]}>{ok ? 'ACCEPT' : log.reply ? 'REJECT' : '—'}</Text>
    </View>
  );
};

export const AuthLogsModal = ({ visible, onClose, internetId, username, inline = false }) => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(AUTH_PAGE);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    setSelected(null);
    try {
      const res = await OneBssApi.getInternetAuthLogs(internetId);
      if (okRes(res)) {
        setLogs(Array.isArray(res.data.results?.logs) ? res.data.results.logs : []);
        setSummary(res.data.results?.summary || null);
      } else {
        setLogs([]);
        setSummary(null);
        setLoadError(errMsg(res, 'Unable to load authentication logs'));
      }
    } catch (e) {
      setLoadError('Unable to load authentication logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setLogs([]);
      setSummary(null);
      setFilter('all');
      setSearch('');
      setShown(AUTH_PAGE);
      load();
    }
  }, [visible, internetId]);
  useEffect(() => setShown(AUTH_PAGE), [filter, search]);

  const needle = search.trim().toLowerCase();
  const filtered = logs.filter((l) => {
    if (filter === 'accept' && !l.accepted) return false;
    if (filter === 'reject' && l.accepted) return false;
    if (!needle) return true;
    return [l.reason, l.mac, l.nasipaddress, l.nasportid, l.framedipaddress, l.username_org, l.authdate].some((v) => String(v || '').toLowerCase().includes(needle));
  });
  const visibleRows = filtered.slice(0, shown);
  const latest = logs[0] || null;
  const counts = { all: logs.length, accept: summary?.accepted ?? 0, reject: summary?.rejected ?? 0 };

  return (
    <ModalShell
      visible={visible}
      title={inline ? 'Authentication Logs' : `Authentication Logs — ${username || ''}`}
      icon="shield"
      onClose={onClose}
      maxWidth={1150}
      inline={inline}
      footer={
        <>
          <Btn label={loading ? 'Loading…' : 'Refresh'} icon="refresh-cw" kind="ghost" onPress={load} disabled={loading} />
          {inline ? null : <Btn label="Close" onPress={onClose} />}
        </>
      }
    >
      <View style={styles.statRow}>
        {[
          ['Attempts', String(summary?.total ?? logs.length)],
          ['Accepted', String(summary?.accepted ?? 0)],
          ['Rejected', String(summary?.rejected ?? 0)],
          ['Last attempt', latest?.authdate || '—'],
        ].map(([l, v]) => (
          <View key={l} style={styles.stat}>
            <Text style={styles.statLabel}>{l}</Text>
            <Text style={[styles.statValue, l === 'Last attempt' && { fontSize: 14 }]}>{v}</Text>
          </View>
        ))}
      </View>

      {latest && !loading ? (
        <Note
          tone={latest.accepted ? 'success' : 'error'}
          text={latest.accepted ? `Last login was accepted at ${latest.authdate}.` : `Last login was rejected at ${latest.authdate}${latest.reason ? ` — ${latest.reason}` : ''}`}
        />
      ) : null}
      {loadError ? <Note tone="error" text={loadError} /> : null}

      <View style={[styles.toolbar, { alignItems: 'center', marginTop: 4 }]}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {AUTH_FILTERS.map((f) => (
            <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipOn]} onPress={() => setFilter(f.id)}>
              <Text style={[styles.chipText, filter === f.id && { color: '#ffffff' }]}>{f.label} ({counts[f.id]})</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.searchBox}>
          <Feather name="search" size={14} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search reason, MAC, NAS…"
            placeholderTextColor="#94a3b8"
          />
        </View>
      </View>

      {selected ? (
        <View style={styles.detailBox}>
          <TouchableOpacity style={styles.backLink} onPress={() => setSelected(null)}>
            <Feather name="arrow-left" size={14} color={COLORS.primary} />
            <Text style={styles.backLinkText}>Back to logs</Text>
          </TouchableOpacity>
          {[
            ['Time', selected.authdate], ['Result', selected.reply], ['Reason', selected.reason], ['MAC', selected.mac],
            ['NAS IP', selected.nasipaddress], ['NAS Port', selected.nasportid], ['Framed IP', selected.framedipaddress],
            ['Called Station', selected.calledstationid], ['Username sent', selected.username_org],
          ].map(([l, v]) => <KV key={l} label={l} value={v || '—'} />)}
        </View>
      ) : loading && logs.length === 0 ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.table}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={{ minWidth: 1040, width: '100%' }}>
              <View style={[styles.tr, styles.thRow]}>
                {AUTH_COLS.map((c) => <Text key={c.key} style={[styles.th, { flex: c.flex }]}>{c.label}</Text>)}
                <Text style={[styles.th, { flex: 0.6 }]}> </Text>
              </View>
              {filtered.length === 0 ? (
                <Text style={[styles.emptyText, { padding: 16, textAlign: 'center' }]}>
                  {logs.length === 0 ? 'No authentication attempts found.' : 'No attempts match this filter.'}
                </Text>
              ) : (
                visibleRows.map((l, i) => (
                  <View key={`${l.authdate}_${i}`} style={[styles.tr, !l.accepted && { backgroundColor: '#fffafa' }]}>
                    {AUTH_COLS.map((c) =>
                      c.key === 'reply' ? (
                        <View key={c.key} style={{ flex: c.flex }}><ResultPill log={l} /></View>
                      ) : (
                        <Text key={c.key} style={[styles.td, { flex: c.flex }, c.key === 'reason' && !l.accepted && { color: '#b91c1c' }]} numberOfLines={2}>
                          {l[c.key] || '—'}
                        </Text>
                      )
                    )}
                    <View style={{ flex: 0.6 }}>
                      <TouchableOpacity style={styles.smallGhost} onPress={() => setSelected(l)}>
                        <Text style={styles.smallGhostText}>View</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      )}
      {!selected && filtered.length > shown ? (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Btn label={`Show more (${filtered.length - shown} left)`} kind="ghost" onPress={() => setShown((n) => n + AUTH_PAGE)} />
        </View>
      ) : null}
    </ModalShell>
  );
};

// =====================================================================
// VERIFY CUSTOMER — required before Recharge / Advance Renewal
// =====================================================================
export const VerifyCustomerModal = ({ visible, onClose, internetId, username, customerName, onVerified }) => {
  const [saving, setSaving] = useState(false);
  const verify = async () => {
    setSaving(true);
    try {
      const res = await OneBssApi.verifyInternetCustomer(internetId);
      if (okRes(res)) {
        toast.success(res.data.message || 'Customer verified successfully');
        if (onVerified) await onVerified();
        onClose();
      } else {
        toast.error(errMsg(res, 'Verification failed'));
      }
    } catch (e) {
      toast.error('Unable to verify customer');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell
      visible={visible}
      title="Verify Customer"
      icon="user-check"
      onClose={onClose}
      maxWidth={440}
      busy={saving}
      footer={
        <>
          <Btn label="Cancel" kind="ghost" onPress={onClose} disabled={saving} />
          <Btn label="Verify Customer" icon="check" onPress={verify} loading={saving} />
        </>
      }
    >
      <Text style={{ fontSize: 13, color: COLORS.textMain, lineHeight: 20 }}>
        Mark this internet account as <Text style={{ fontWeight: '700' }}>Verified</Text>?
      </Text>
      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary }}>
        <KV label="Customer" value={customerName} />
        <KV label="Username" value={username} bold />
      </View>
      <Note text="Recharge and Advance Renewal are available only after the customer is verified." />
    </ModalShell>
  );
};

// =====================================================================
// DOCUMENTS — Super Admin only (gated by the caller)
// =====================================================================
export const DocumentsModal = ({ visible, onClose, customer, inline = false }) => {
  const docs = (Array.isArray(customer?.documents) ? customer.documents : [])
    .map((d) => ({ ...d, url: fixDocUrl(d.url) }))
    .filter((d) => d.url);
  return (
    <ModalShell visible={visible} inline={inline} title="Customer Documents" icon="file-text" onClose={onClose} maxWidth={760} footer={inline ? null : <Btn label="Close" onPress={onClose} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <View style={[styles.kycTag, { backgroundColor: customer?.aadhar_verified ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.14)' }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: customer?.aadhar_verified ? '#047857' : '#b45309' }}>
            {customer?.aadhar_verified ? 'Aadhaar verified' : 'Aadhaar not verified'}
          </Text>
        </View>
        {customer?.verification_channel ? (
          <View style={[styles.kycTag, { backgroundColor: 'rgba(0,0,0,0.05)' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>via {customer.verification_channel}</Text>
          </View>
        ) : null}
      </View>
      {docs.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="file" size={22} color="#94a3b8" />
          <Text style={styles.emptyText}>No documents uploaded for this customer.</Text>
        </View>
      ) : (
        <View style={styles.docGrid}>
          {docs.map((d) => (
            <View key={d.key || d.url} style={styles.docCard}>
              {isImageUrl(d.url) ? (
                <DocThumb url={d.url} />
              ) : (
                <View style={[styles.docThumb, styles.docThumbIcon]}>
                  <Feather name="file-text" size={34} color="#94a3b8" />
                  <Text style={styles.docExt}>{(d.url.split('.').pop() || '').slice(0, 4).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.docLabel} numberOfLines={1}>{d.label || d.key}</Text>
              <TouchableOpacity style={styles.smallOutlineBlue} onPress={() => openExternal(d.url)}>
                <Feather name="external-link" size={12} color="#2563eb" />
                <Text style={styles.smallOutlineBlueText}>Open</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
};

const DocThumb = ({ url }) => {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <View style={[styles.docThumb, styles.docThumbIcon]}>
        <Feather name="image" size={30} color="#cbd5e1" />
        <Text style={styles.docExt}>Preview unavailable</Text>
      </View>
    );
  }
  return <Image source={{ uri: url }} style={styles.docThumb} resizeMode="cover" onError={() => setFailed(true)} />;
};

const styles = StyleSheet.create({
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  pwText: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.textMain, letterSpacing: 0.5, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  iconBtn: { padding: 6, borderRadius: 6, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 16 },
  errText: { fontSize: 11, color: '#dc2626', marginTop: 4 },
  hintText: { fontSize: 11, color: '#64748b', marginTop: 6 },
  autoBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, borderRadius: 8, borderWidth: 1, borderColor: '#e0e7ff', backgroundColor: '#f5f7ff' },
  autoText: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  autoTag: { fontSize: 10, fontWeight: '800', color: '#4f46e5', textTransform: 'uppercase' },
  addBox: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#f8fbff', marginBottom: 14 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyText: { fontSize: 13, color: '#64748b' },
  table: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', gap: 8 },
  thRow: { backgroundColor: COLORS.bgSecondary },
  th: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 12, color: COLORS.textMain },

  smallOutline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#ffffff' },
  smallOutlineText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  smallDanger: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#dc2626', minWidth: 84, alignItems: 'center' },
  smallDangerText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  smallGhost: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)', alignSelf: 'flex-start' },
  smallGhostText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  smallOutlineBlue: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#bfdbfe', alignSelf: 'flex-start' },
  smallOutlineBlueText: { fontSize: 12, fontWeight: '700', color: '#2563eb' },

  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  stat: { flexGrow: 1, flexBasis: 140, padding: 12, borderRadius: 10, backgroundColor: COLORS.bgSecondary, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.textMain, marginTop: 4 },
  detailBox: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backLinkText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  kycTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  docCard: { width: 210, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', gap: 8 },
  docThumb: { width: '100%', height: 150, borderRadius: 8, backgroundColor: '#f1f5f9' },
  docThumbIcon: { justifyContent: 'center', alignItems: 'center', gap: 6 },
  docExt: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  docLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  pillText: { fontSize: 10, fontWeight: '800' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f1f5f9' },
  chipOn: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, minWidth: 220, flexGrow: 1, maxWidth: 360, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
});
