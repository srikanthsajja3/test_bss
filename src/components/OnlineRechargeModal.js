import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

const money = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : `₹${Number(v).toFixed(2)}`);
const fmtDate = (v) => {
  if (!v || String(v).startsWith('0000')) return 'never activated';
  const d = new Date(String(v).replace(' ', 'T'));
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Online recharge for one customer account (customer_online_recharge.php).
 * Off by default. Turning it on shows the account's current package and asks for the customer
 * price, which must be greater than the operator price. The package can only be changed once the
 * current package has expired (the new one gets the same price check).
 *
 * Combo (service 'combo'): accountId = internet_id, iptvAccountId = the STB; the "package" is a
 * combo plan and the operator price is the combo price.
 *
 * Props: visible, onClose, service ('internet' | 'iptv' | 'combo'), accountId, iptvAccountId, accountLabel, onSaved()
 */
export const OnlineRechargeModal = ({ visible, onClose, service, accountId, iptvAccountId = null, accountLabel, onSaved }) => {
  const isCombo = service === 'combo';
  const pkgWord = isCombo ? 'combo' : 'package';
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [price, setPrice] = useState('');
  const [subPlanId, setSubPlanId] = useState(null); // chosen package (null = current one)

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const res = await OneBssApi.getOnlineRecharge(service, accountId, iptvAccountId);
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.data?.message || 'Could not load online recharge settings.');
      return;
    }
    const d = res.data?.data;
    setInfo(d);
    setEnabled(!!d?.enabled);
    const savedMatches = d?.saved && d?.current_package && d.saved.sub_plan_id === d.current_package.sub_plan_id;
    // prefill the saved price when it belongs to the package shown (current, or the saved choice on an expired account)
    const savedShown = savedMatches || !d?.current_package || (d?.is_expired && d?.saved?.sub_plan_id);
    setPrice(d?.saved?.customer_price != null && savedShown ? String(d.saved.customer_price) : '');
    // an expired account whose saved package differs keeps showing the saved choice
    setSubPlanId(d?.saved?.sub_plan_id && d?.is_expired && !savedMatches ? d.saved.sub_plan_id : null);
  };

  useEffect(() => {
    if (visible && accountId) load();
  }, [visible, service, accountId, iptvAccountId]);

  const packages = info?.packages || [];
  const current = info?.current_package || null;
  const chosen = useMemo(() => {
    if (subPlanId && (!current || subPlanId !== current.sub_plan_id)) return packages.find((p) => p.sub_plan_id === subPlanId) || null;
    return current;
  }, [subPlanId, current, packages]);
  const operatorPrice = chosen?.operator_price;
  const priceNum = Number(price);
  const priceOk = price !== '' && !isNaN(priceNum) && operatorPrice !== null && operatorPrice !== undefined && priceNum > Number(operatorPrice);

  const save = async () => {
    if (!enabled) {
      setSaving(true);
      const res = await OneBssApi.saveOnlineRecharge(service, accountId, { enabled: false }, iptvAccountId);
      setSaving(false);
      if (!res.ok) return toast.error(res.data?.message || 'Could not turn off online recharge.');
      toast.success(res.data?.message || 'Online recharge turned off.');
      if (onSaved) onSaved();
      onClose();
      return;
    }
    if (!chosen) return toast.warn(info?.can_change_package ? `Choose a ${pkgWord}.` : isCombo ? 'No combo matches the current plans. A combo can be chosen after they expire.' : 'This account has no package yet.');
    if (operatorPrice === null || operatorPrice === undefined) {
      return toast.warn(info?.is_expired ? 'That package is not one of the operator\'s packages — choose another one.' : 'The current package is not one of the operator\'s packages. It can be changed after it expires.');
    }
    if (!priceOk) return toast.warn(`Customer price must be greater than the operator price (${money(operatorPrice)}).`);
    setSaving(true);
    const body = { enabled: true, customer_price: priceNum };
    if (current?.sub_plan_id !== chosen.sub_plan_id) {
      body.plan_id = chosen.plan_id;
      body.sub_plan_id = chosen.sub_plan_id;
    }
    const res = await OneBssApi.saveOnlineRecharge(service, accountId, body, iptvAccountId);
    setSaving(false);
    if (!res.ok) return toast.error(res.data?.message || 'Could not save online recharge settings.');
    toast.success(res.data?.message || 'Online recharge saved.');
    if (onSaved) onSaved();
    onClose();
  };

  if (!visible) return null;
  const accent = isCombo ? '#db2777' : service === 'iptv' ? '#8b5cf6' : '#0284c7';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { width: isMobile ? '96%' : 560 }]}>
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: `${accent}1a` }]}>
              <Feather name="smartphone" size={18} color={accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>{isCombo ? 'Combo online recharge' : 'Online recharge'}</Text>
              <Text style={styles.sub} numberOfLines={1}>{accountLabel || (isCombo ? `Internet #${accountId} + IPTV #${iptvAccountId}` : `${service === 'iptv' ? 'IPTV' : 'Internet'} #${accountId}`)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            {loading ? (
              <ActivityIndicator size="large" color={accent} style={{ marginVertical: 30 }} />
            ) : loadError ? (
              <View style={styles.warn}><Feather name="alert-triangle" size={14} color="#b45309" /><Text style={styles.warnText}>{loadError}</Text></View>
            ) : info && info.applicable === false ? (
              <View style={styles.warn}><Feather name="info" size={14} color="#b45309" /><Text style={styles.warnText}>{info.not_applicable_reason || 'Combo online recharge is not available for these accounts.'}</Text></View>
            ) : info ? (
              <>
                {/* on / off */}
                <TouchableOpacity style={[styles.toggleRow, enabled && { borderColor: 'rgba(16,185,129,0.45)', backgroundColor: 'rgba(16,185,129,0.06)' }]} onPress={() => setEnabled((v) => !v)}>
                  <View style={[styles.switch, { backgroundColor: enabled ? '#10b981' : '#cbd5e1', alignItems: enabled ? 'flex-end' : 'flex-start' }]}>
                    <View style={styles.knob} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>{isCombo ? 'Allow this customer to recharge the combo online' : 'Allow this customer to recharge online'}</Text>
                    <Text style={styles.toggleHint}>{enabled ? 'On — set the price the customer pays.' : 'Off (default) — only you can recharge this account.'}</Text>
                  </View>
                </TouchableOpacity>

                {(info.warnings || []).map((w) => (
                  <View key={w} style={styles.warn}><Feather name="alert-triangle" size={14} color="#b45309" /><Text style={styles.warnText}>{w}</Text></View>
                ))}

                {enabled ? (
                  <>
                    {/* current package */}
                    <View style={styles.box}>
                      <Text style={styles.label}>{isCombo ? 'CURRENT COMBO' : 'CURRENT PACKAGE'}</Text>
                      <Text style={styles.pkgName}>{current ? current.plan_name : isCombo ? 'No combo matches the current plans' : 'No package yet'}</Text>
                      <Text style={styles.pkgMeta}>
                        {current ? `${current.validity_days || 30} days · ${isCombo ? 'Combo price' : 'Operator price'} ${money(current.operator_price)}` : ''}
                        {current && !isCombo ? '  ·  ' : ''}
                        {isCombo ? '' : info.is_expired ? `Expired (${fmtDate(info.expiration)})` : `Active till ${fmtDate(info.expiration)}`}
                      </Text>
                      {isCombo && info.combo ? (
                        <Text style={styles.pkgMeta}>
                          Internet {info.combo.internet_active ? `active till ${fmtDate(info.combo.internet_expiration)}` : `expired (${fmtDate(info.combo.internet_expiration)})`}
                          {'  ·  '}
                          IPTV {info.combo.iptv_active ? `active till ${fmtDate(info.combo.iptv_expiration)}` : `expired (${fmtDate(info.combo.iptv_expiration)})`}
                        </Text>
                      ) : null}
                      {!info.can_change_package ? (
                        <Text style={styles.note}>{isCombo ? 'The combo can be changed after the plans expire.' : 'The package can be changed after it expires.'}</Text>
                      ) : isCombo && (info.combo?.internet_active || info.combo?.iptv_active) ? (
                        <Text style={styles.note}>{info.combo.internet_active ? 'Internet' : 'IPTV'} is still active, so only combos that keep its current plan are listed.</Text>
                      ) : null}
                    </View>

                    {/* package change — only when expired */}
                    {info.can_change_package ? (
                      <View>
                        <Text style={styles.label}>{isCombo ? 'COMBO FOR ONLINE RECHARGE' : 'PACKAGE FOR ONLINE RECHARGE'}</Text>
                        {packages.length === 0 ? (
                          <Text style={styles.note}>{isCombo ? 'No combo of this operator can be used for these accounts now.' : 'This operator has no packages assigned yet.'}</Text>
                        ) : (
                          <View style={{ gap: 6, marginTop: 6 }}>
                            {packages.map((p) => {
                              const on = chosen && chosen.sub_plan_id === p.sub_plan_id;
                              const isCurrent = current && current.sub_plan_id === p.sub_plan_id;
                              return (
                                <TouchableOpacity
                                  key={p.sub_plan_id}
                                  style={[styles.pkgRow, on && { borderColor: accent, backgroundColor: `${accent}0d` }]}
                                  onPress={() => setSubPlanId(isCurrent ? null : p.sub_plan_id)}
                                >
                                  <Feather name={on ? 'check-circle' : 'circle'} size={16} color={on ? accent : '#94a3b8'} />
                                  <Text style={styles.pkgRowName} numberOfLines={1}>{p.plan_name}{isCurrent ? '  (current)' : ''}</Text>
                                  <Text style={styles.pkgRowMeta}>{p.validity_days}d · {money(p.operator_price)}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    ) : null}

                    {/* customer price */}
                    <View>
                      <Text style={styles.label}>CUSTOMER PRICE {chosen && chosen !== current ? `— ${chosen.plan_name}` : ''}</Text>
                      <View style={styles.priceRow}>
                        <Text style={styles.rupee}>₹</Text>
                        <TextInput
                          style={[styles.priceInput, price !== '' && !priceOk && { borderColor: '#ef4444' }]}
                          value={price}
                          onChangeText={(v) => setPrice(v.replace(/[^0-9.]/g, ''))}
                          keyboardType="numeric"
                          placeholder={operatorPrice != null ? `more than ${Number(operatorPrice).toFixed(2)}` : '0.00'}
                          placeholderTextColor={COLORS.textDim}
                        />
                      </View>
                      <Text style={[styles.note, price !== '' && !priceOk && { color: '#b91c1c' }]}>
                        Must be greater than the {isCombo ? 'combo' : 'operator'} price {money(operatorPrice)}.
                        {priceOk ? `  Your margin: ${money(priceNum - Number(operatorPrice))}` : ''}
                      </Text>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: accent }, (saving || loading || !!loadError || (enabled && !priceOk)) && { opacity: 0.55 }]}
              onPress={save}
              disabled={saving || loading || !!loadError}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="check" size={15} color="#fff" />}
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, overflow: 'hidden', maxWidth: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  headerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  sub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  closeBtn: { padding: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  switch: { width: 40, height: 22, borderRadius: 11, padding: 2 },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  toggleHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  box: { padding: 12, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  label: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 0.4 },
  pkgName: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginTop: 4 },
  pkgMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  note: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  pkgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#ffffff' },
  pkgRowName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  pkgRowMeta: { fontSize: 12, color: COLORS.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  rupee: { fontSize: 16, fontWeight: '700', color: COLORS.textMain },
  priceInput: { flex: 1, height: 40, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, paddingHorizontal: 10, fontSize: 15, fontWeight: '700', color: COLORS.textMain, backgroundColor: '#ffffff' },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  warnText: { flex: 1, fontSize: 12, color: '#92400e' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#eef2f7' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  cancelText: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  saveText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
});
