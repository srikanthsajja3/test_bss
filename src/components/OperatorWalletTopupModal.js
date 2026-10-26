import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { OneBssApi } from '../services/oneBssApi';
import { redirectToPayU, rememberPendingPayU, forgetPendingPayU, waitForPayUResult, payuErrorText } from '../services/payuService';
import { parseApiDate, formatApiDate } from './CustomerAccountsOverview';

/**
 * Operator › Add money to wallet (PayU).
 * The server creates the order and the PayU hash (pg/payu_initiate.php); the operator pays on
 * PayU's secure page and comes back to #payu=<txnid>; the server checks the payment with PayU
 * and credits the wallet once. `resumeTxnid` = show the result of the payment we came back from.
 */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 200000;
const PRESETS = [500, 1000, 2000, 5000, 10000, 25000];
const GREEN = '#059669';

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d) => (parseApiDate(d) ? formatApiDate(d) : '—');

const STATUS = {
  success: { label: 'Credited', fg: '#047857', bg: '#dcfce7' },
  initiated: { label: 'Not paid', fg: '#64748b', bg: '#f1f5f9' },
  pending: { label: 'Confirming', fg: '#b45309', bg: '#fef3c7' },
  failed: { label: 'Failed', fg: '#b91c1c', bg: '#fee2e2' },
  expired: { label: 'Not paid', fg: '#64748b', bg: '#f1f5f9' },
  review: { label: 'Under review', fg: '#9d174d', bg: '#fce7f3' },
};

export const OperatorWalletTopupModal = ({ visible, onClose, user = null, partner = null, onSuccess = null, resumeTxnid = null }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 600;
  const me = partner || user || {};
  const partnerId = me.partner_id;
  const partnerName = me.partner_name || me.company_name || me.username || 'Operator';

  const [step, setStep] = useState('form'); // form | redirecting | checking | result
  const [balance, setBalance] = useState(me.wallet_balance !== undefined && me.wallet_balance !== null ? Number(me.wallet_balance) : null);
  const [amount, setAmount] = useState('1000');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const mounted = useRef(true);
  const stepRef = useRef('form');
  const lastTxn = useRef(null);
  stepRef.current = step;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSide = useCallback(() => {
    if (!partnerId) return;
    OneBssApi.getWallet(partnerId, 1, 1).then((res) => {
      if (mounted.current && res.ok && res.data?.wallet_balance !== undefined) setBalance(Number(res.data.wallet_balance));
    });
    OneBssApi.payuPayments({ limit: 3 }).then((res) => {
      if (mounted.current && res.ok) setRecent(res.data.payments || []);
    });
  }, [partnerId]);

  const check = useCallback(async (txnid) => {
    setStep('checking');
    setError('');
    const r = await waitForPayUResult(txnid);
    if (!mounted.current) return;
    const status = r.payment?.status || 'unknown';
    // shown once; anything still open is finished by PayU's webhook / the 10-minute check
    forgetPendingPayU();
    if (status === 'success') {
      if (r.walletBalance !== null && r.walletBalance !== undefined) setBalance(Number(r.walletBalance));
      toast.success(`${money(r.payment.amount)} added to your wallet`);
      if (onSuccess) onSuccess({ amount: r.payment.amount, txnid, balanceAfter: r.walletBalance });
    }
    setResult({ ...r, status, txnid });
    setStep('result');
    loadSide();
  }, [onSuccess, loadSide]);

  // browser "Back" from PayU's page restores this page as it was ("Taking you to PayU…"):
  // check what happened to that payment instead
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onShow = (e) => {
      if (e.persisted && stepRef.current === 'redirecting' && lastTxn.current) check(lastTxn.current);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [check]);

  // each time it opens: fresh form, or the result of the payment we came back from
  useEffect(() => {
    if (!visible) return;
    setError('');
    setRemark('');
    setResult(null);
    loadSide();
    if (resumeTxnid) check(resumeTxnid);
    else setStep('form');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resumeTxnid]);

  const amt = Number(amount);
  const amountValid = amount !== '' && !Number.isNaN(amt) && amt >= MIN_AMOUNT && amt <= MAX_AMOUNT;
  const amountHint = amount === '' || Number.isNaN(amt)
    ? `Enter between ${whole(MIN_AMOUNT)} and ${whole(MAX_AMOUNT)}`
    : amt < MIN_AMOUNT
      ? `Minimum ${whole(MIN_AMOUNT)}`
      : amt > MAX_AMOUNT
        ? `Maximum ${whole(MAX_AMOUNT)} per payment`
        : `New balance after payment: ${balance === null ? '—' : money(balance + amt)}`;

  const pay = async () => {
    if (step !== 'form' || !amountValid) return;
    setError('');
    setStep('redirecting');
    const res = await OneBssApi.payuInitiate(Math.round(amt * 100) / 100, remark);
    if (!mounted.current) return;
    if (!res.ok || !res.data?.fields || !res.data?.payment_url) {
      setStep('form');
      setError(payuErrorText(res, 'Could not start the payment. Please try again.'));
      return;
    }
    rememberPendingPayU(res.data.txnid, res.data.amount);
    lastTxn.current = res.data.txnid;
    redirectToPayU(res.data.payment_url, res.data.fields);
  };

  const tryAgain = () => {
    if (result?.payment?.amount) setAmount(String(Number(result.payment.amount)));
    setResult(null);
    setStep('form');
  };

  if (!visible) return null;

  const busy = step === 'redirecting' || step === 'checking';
  const r = result;
  const ok = r?.status === 'success';
  const waiting = ['pending', 'unknown'].includes(r?.status);
  const notPaid = r?.status === 'initiated';
  const tone = ok ? GREEN : waiting ? '#d97706' : r?.status === 'review' ? '#be185d' : notPaid ? '#64748b' : '#dc2626';
  const title = ok ? 'Money added to your wallet' : waiting ? 'Waiting for PayU to confirm' : r?.status === 'review' ? 'Payment under review' : 'Payment not completed';
  const sub = ok
    ? 'Your wallet has been credited.'
    : notPaid
      ? 'PayU has no completed payment for this top-up yet. If you did pay, your wallet is credited automatically as soon as PayU confirms it.'
      : waiting
      ? 'If money was taken from your account, your wallet will be credited automatically as soon as PayU confirms it — usually within a few minutes. You can close this window.'
      : r?.status === 'review'
        ? 'PayU reported a different amount than ordered, so the wallet was not credited. Our team will check it and contact you.'
        : r?.message && !/^Payment (failure|failed)/i.test(r.message)
          ? `${r.message}. If any money was deducted, your bank will return it.`
          : 'The payment did not go through. If any money was deducted, your bank will return it.';

  const row = (label, value, strong) =>
    value ? (
      <View style={st.kv}>
        <Text style={st.kvLabel}>{label}</Text>
        <Text style={[st.kvValue, strong && { color: GREEN, fontWeight: '800' }]} selectable numberOfLines={2}>{value}</Text>
      </View>
    ) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={[st.overlay, isMobile && { justifyContent: 'flex-end', padding: 0 }]}>
        <View style={[st.card, isMobile ? st.cardMobile : { width: 480 }]}>
          {/* header */}
          <View style={st.header}>
            <View style={st.headerIcon}>
              <Ionicons name="wallet-outline" size={20} color={GREEN} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.title}>Add money to wallet</Text>
              <Text style={st.subtitle} numberOfLines={1}>{partnerName}{partnerId ? ` · #${partnerId}` : ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={st.closeBtn} disabled={busy} accessibilityLabel="Close">
              <Feather name="x" size={18} color={busy ? '#cbd5e1' : '#64748b'} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: isMobile ? 560 : 620 }} contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
            {step === 'redirecting' || step === 'checking' ? (
              <View style={st.center}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={st.centerTitle}>{step === 'redirecting' ? 'Taking you to PayU…' : 'Checking your payment…'}</Text>
                <Text style={st.centerSub}>
                  {step === 'redirecting' ? 'You will pay on PayU’s secure page and come back here automatically.' : 'Confirming the payment with PayU. This takes a few seconds.'}
                </Text>
              </View>
            ) : step === 'result' && r ? (
              <View style={{ alignItems: 'center' }}>
                <View style={[st.resultIcon, { backgroundColor: `${tone}1a` }]}>
                  <Feather name={ok ? 'check' : waiting ? 'clock' : r.status === 'review' ? 'alert-triangle' : 'x'} size={30} color={tone} />
                </View>
                <Text style={st.resultTitle}>{title}</Text>
                {r.payment ? <Text style={[st.resultAmount, { color: ok ? GREEN : '#0f172a' }]}>{ok ? '+ ' : ''}{money(r.payment.amount)}</Text> : null}
                <Text style={st.resultSub}>{sub}</Text>
                <View style={st.receipt}>
                  {row('Transaction ID', r.txnid)}
                  {row('Paid using', r.payment?.mode)}
                  {row('Bank reference', r.payment?.bank_ref_num)}
                  {row('Remark', r.payment?.remark)}
                  {ok ? row('Wallet balance', money(r.payment?.balance_after ?? r.walletBalance), true) : null}
                  {row('Date & time', when(r.payment?.credited_at || r.payment?.created_at))}
                </View>
              </View>
            ) : (
              <>
                <View style={st.balance}>
                  <Text style={st.balanceLabel}>Current balance</Text>
                  <Text style={st.balanceValue}>{balance === null ? '—' : money(balance)}</Text>
                </View>

                <View>
                  <Text style={st.label}>Amount</Text>
                  <View style={[st.amountBox, !amountValid && amount !== '' && { borderColor: '#fca5a5' }]}>
                    <Text style={st.rupee}>₹</Text>
                    <TextInput
                      style={st.amountInput}
                      value={amount}
                      onChangeText={(v) => {
                        setError('');
                        setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2})\d+/, '$1'));
                      }}
                      onSubmitEditing={pay}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder="0"
                      placeholderTextColor="#cbd5e1"
                      accessibilityLabel="Amount in rupees"
                    />
                  </View>
                  <Text style={[st.hint, !amountValid && amount !== '' && { color: '#dc2626' }]}>{amountHint}</Text>
                  <View style={st.presets}>
                    {PRESETS.map((v) => {
                      const on = Number(amount) === v;
                      return (
                        <TouchableOpacity key={v} style={[st.preset, on && st.presetOn]} onPress={() => { setError(''); setAmount(String(v)); }}>
                          <Text style={[st.presetText, on && { color: GREEN }]}>{whole(v)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View>
                  <Text style={st.label}>Remark <Text style={{ color: '#94a3b8', fontWeight: '500' }}>(optional)</Text></Text>
                  <TextInput
                    style={st.remark}
                    value={remark}
                    onChangeText={setRemark}
                    placeholder="e.g. Weekly top-up"
                    placeholderTextColor="#94a3b8"
                    maxLength={120}
                  />
                </View>

                <View style={st.secure}>
                  <Feather name="shield" size={15} color={GREEN} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.secureTitle}>Pay securely on PayU</Text>
                    <Text style={st.secureText}>UPI · Debit / credit card · Net banking · Wallets. You return here automatically, and your wallet is credited as soon as PayU confirms the payment.</Text>
                  </View>
                </View>

                {error ? (
                  <View style={st.error}>
                    <Feather name="alert-circle" size={14} color="#b91c1c" />
                    <Text style={st.errorText}>{error}</Text>
                  </View>
                ) : null}

                {recent.length ? (
                  <View>
                    <Text style={st.label}>Recent top-ups</Text>
                    {recent.map((p) => {
                      const c = STATUS[p.status] || STATUS.initiated;
                      return (
                        <View key={p.txnid} style={st.recentRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={st.recentAmount}>{money(p.amount)}</Text>
                            <Text style={st.recentDate} numberOfLines={1}>{when(p.created_at)}</Text>
                          </View>
                          <View style={[st.pill, { backgroundColor: c.bg }]}>
                            <Text style={[st.pillText, { color: c.fg }]}>{c.label}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {/* footer */}
          {step === 'form' ? (
            <View style={st.footer}>
              <TouchableOpacity style={st.btnGhost} onPress={onClose}>
                <Text style={st.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnPay, !amountValid && { opacity: 0.45 }]} onPress={pay} disabled={!amountValid}>
                <Feather name="lock" size={14} color="#ffffff" />
                <Text style={st.btnPayText}>Pay {amountValid ? money(amt) : ''}</Text>
              </TouchableOpacity>
            </View>
          ) : step === 'result' ? (
            <View style={st.footer}>
              {waiting || notPaid ? (
                <TouchableOpacity style={st.btnGhost} onPress={() => check(r.txnid)}>
                  <Feather name="refresh-cw" size={13} color="#334155" />
                  <Text style={st.btnGhostText}>Check again</Text>
                </TouchableOpacity>
              ) : null}
              {notPaid || (!ok && !waiting && r?.status !== 'review') ? (
                <TouchableOpacity style={st.btnGhost} onPress={tryAgain}>
                  <Feather name="rotate-ccw" size={13} color="#334155" />
                  <Text style={st.btnGhostText}>Try again</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[st.btnPay, { backgroundColor: ok ? GREEN : '#0f172a' }]} onPress={onClose}>
                <Text style={st.btnPayText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', maxWidth: '100%', boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)', elevation: 10 },
  cardMobile: { width: '100%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', outlineStyle: 'none' },
  body: { padding: 18, gap: 16 },
  balance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  balanceLabel: { fontSize: 12.5, color: '#64748b', fontWeight: '600' },
  balanceValue: { fontSize: 16, color: '#0f172a', fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: GREEN, backgroundColor: '#ffffff' },
  rupee: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginRight: 6 },
  amountInput: { flex: 1, minWidth: 0, fontSize: 26, fontWeight: '800', color: '#0f172a', outlineStyle: 'none' },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  preset: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  presetOn: { borderColor: GREEN, backgroundColor: '#ecfdf5' },
  presetText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  remark: { height: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 13.5, color: '#0f172a', outlineStyle: 'none' },
  secure: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  secureTitle: { fontSize: 13, fontWeight: '700', color: '#065f46' },
  secureText: { fontSize: 12, color: '#047857', marginTop: 2, lineHeight: 17 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 12.5, color: '#991b1b', lineHeight: 18 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  recentAmount: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  recentDate: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  center: { alignItems: 'center', paddingVertical: 36, gap: 10 },
  centerTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  centerSub: { fontSize: 12.5, color: '#64748b', textAlign: 'center', maxWidth: 320, lineHeight: 18 },
  resultIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  resultTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 12, textAlign: 'center' },
  resultAmount: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  resultSub: { fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 380 },
  receipt: { alignSelf: 'stretch', marginTop: 16, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  kvLabel: { fontSize: 12.5, color: '#64748b' },
  kvValue: { flexShrink: 1, fontSize: 12.5, color: '#0f172a', fontWeight: '600', textAlign: 'right' },
  footer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#ffffff' },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 42, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  btnGhostText: { fontSize: 13.5, fontWeight: '700', color: '#334155' },
  btnPay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, height: 42, minWidth: 110, borderRadius: 10, backgroundColor: GREEN },
  btnPayText: { fontSize: 14, fontWeight: '800', color: '#ffffff' },
});
