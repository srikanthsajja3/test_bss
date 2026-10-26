import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { toast } from 'react-toastify';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';
import { redirectToPayU, rememberPendingPayU, forgetPendingPayU, waitForPayUResult, payuErrorText } from '../services/payuService';
import { parseApiDate, formatApiDate } from '../components/CustomerAccountsOverview';

/**
 * Operator › Wallet: add money through PayU (top) and every wallet transaction (below).
 * Paying: the server creates the order + PayU hash (pg/payu_initiate.php), the operator pays on
 * PayU's page and comes back to #payu=<txnid>; the server confirms with PayU and credits once.
 * `resumeTxnid`: the payment we just came back from. On success `onPaid()` (App goes to the
 * dashboard; the header balance refreshes); otherwise the result is shown here.
 */
const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 200000;
const PRESETS = [1000, 2000, 5000, 10000, 25000];
const GREEN = '#059669';
const PAGE_SIZE = 20;

const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (d) => (parseApiDate(d) ? formatApiDate(d) : '—');

const PAY_STATUS = {
  success: { label: 'Credited', fg: '#047857', bg: '#dcfce7' },
  initiated: { label: 'Not paid', fg: '#64748b', bg: '#f1f5f9' },
  pending: { label: 'Confirming', fg: '#b45309', bg: '#fef3c7' },
  failed: { label: 'Failed', fg: '#b91c1c', bg: '#fee2e2' },
  expired: { label: 'Not paid', fg: '#64748b', bg: '#f1f5f9' },
  review: { label: 'Under review', fg: '#9d174d', bg: '#fce7f3' },
};

/** A short, readable title for a ledger row. */
const describe = (t) => {
  const remark = String(t.Remark || '').trim();
  if (/^PayU top-up/i.test(remark)) return { title: 'Added via PayU', detail: remark.replace(/^PayU top-up\s*/i, '') };
  if (t.recharge_id) return { title: remark || 'Recharge', detail: `Recharge #${t.recharge_id}` };
  if (t.txn_type === 'credit') return { title: remark || 'Money added', detail: t.created_by_username ? `By ${t.created_by_username}` : '' };
  return { title: remark || 'Deducted', detail: t.created_by_username ? `By ${t.created_by_username}` : '' };
};

export const WalletScreen = ({ user, refreshSignal, resumeTxnid = null, onResumeHandled, onPaid }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const wide = width >= 1100;
  const partnerId = user?.partner_id;

  // ---- balance + add money ----
  const [balance, setBalance] = useState(null);
  const [amount, setAmount] = useState('');
  const [remark, setRemark] = useState('');
  const [paying, setPaying] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState(null); // { phase: 'checking' } | { status, payment, message, txnid }
  const lastTxn = useRef(null);
  const payingRef = useRef(false);
  payingRef.current = paying;

  // ---- history ----
  const [tab, setTab] = useState('ledger'); // ledger | online
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const loadHistory = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    const res = tab === 'ledger'
      ? await OneBssApi.getWalletHistory(partnerId, { page, limit: PAGE_SIZE, type, q: query })
      : await OneBssApi.payuPayments({ page, limit: PAGE_SIZE, q: query });
    setLoading(false);
    if (!res.ok) {
      setListError(res.data?.message || 'Could not load transactions.');
      return;
    }
    setListError('');
    if (tab === 'ledger') {
      setRows(res.data.transactions || []);
      setTotal(Number(res.data.total || 0));
      if (res.data.wallet_balance !== undefined) setBalance(Number(res.data.wallet_balance));
    } else {
      setRows(res.data.payments || []);
      setTotal(Number(res.data.total || 0));
    }
  }, [partnerId, tab, page, type, query]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, refreshSignal]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onChange = () => loadHistory();
    window.addEventListener('onebss:wallet-changed', onChange);
    return () => window.removeEventListener('onebss:wallet-changed', onChange);
  }, [loadHistory]);

  // ---- result of a payment we came back from ----
  const check = useCallback(async (txnid) => {
    setResult({ phase: 'checking', txnid });
    const r = await waitForPayUResult(txnid);
    forgetPendingPayU();
    const status = r.payment?.status || 'unknown';
    if (status === 'success') {
      setResult(null);
      toast.success(`${money(r.payment.amount)} added to your wallet`);
      if (onPaid) onPaid(r);
      return;
    }
    setResult({ status, payment: r.payment, message: r.message, txnid });
    loadHistory();
  }, [onPaid, loadHistory]);

  useEffect(() => {
    if (!resumeTxnid) return;
    check(resumeTxnid);
    if (onResumeHandled) onResumeHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeTxnid]);

  // browser "Back" from PayU's page restores this page mid-redirect: check that payment instead
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onShow = (e) => {
      if (e.persisted && payingRef.current && lastTxn.current) {
        setPaying(false);
        check(lastTxn.current);
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, [check]);

  const amt = Number(amount);
  const amountValid = amount !== '' && !Number.isNaN(amt) && amt >= MIN_AMOUNT && amt <= MAX_AMOUNT;
  const amountHint = amount === '' || Number.isNaN(amt)
    ? ''
    : amt < MIN_AMOUNT
      ? `Minimum ${whole(MIN_AMOUNT)}`
      : amt > MAX_AMOUNT
        ? `Maximum ${whole(MAX_AMOUNT)} per payment`
        : `Balance after: ${balance === null ? '—' : money(balance + amt)}`;

  const pay = async () => {
    if (paying || !amountValid) return;
    setFormError('');
    setResult(null);
    setPaying(true);
    const res = await OneBssApi.payuInitiate(Math.round(amt * 100) / 100, remark);
    if (!res.ok || !res.data?.fields || !res.data?.payment_url) {
      setPaying(false);
      setFormError(payuErrorText(res, 'Could not start the payment. Please try again.'));
      return;
    }
    rememberPendingPayU(res.data.txnid, res.data.amount);
    lastTxn.current = res.data.txnid;
    redirectToPayU(res.data.payment_url, res.data.fields);
  };

  const retry = () => {
    if (result?.payment?.amount) setAmount(String(Number(result.payment.amount)));
    setResult(null);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ---- result banner ----
  const banner = (() => {
    if (!result) return null;
    if (result.phase === 'checking') {
      return (
        <View style={[s.banner, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}>
          <ActivityIndicator size="small" color={GREEN} />
          <Text style={[s.bannerTitle, { flex: 1 }]}>Checking your payment with PayU…</Text>
        </View>
      );
    }
    const st = result.status;
    const waiting = st === 'pending' || st === 'unknown';
    const notPaid = st === 'initiated' || st === 'expired';
    const conf = waiting
      ? { icon: 'clock', fg: '#92400e', bg: '#fffbeb', bd: '#fde68a', title: 'Waiting for PayU to confirm your payment', text: 'If money was taken from your account, it will be added to your wallet automatically within a few minutes.' }
      : st === 'review'
        ? { icon: 'alert-triangle', fg: '#9d174d', bg: '#fdf2f8', bd: '#fbcfe8', title: 'Payment under review', text: 'PayU reported a different amount than ordered, so the wallet was not credited. Our team will check it.' }
        : notPaid
          ? { icon: 'info', fg: '#334155', bg: '#f8fafc', bd: '#e2e8f0', title: 'Payment not completed', text: 'No payment was received for this top-up.' }
          : { icon: 'x-circle', fg: '#991b1b', bg: '#fef2f2', bd: '#fecaca', title: 'Payment failed', text: `${result.message && !/^Payment (failure|failed)/i.test(result.message) ? `${result.message}. ` : ''}If any money was deducted, your bank will return it.` };
    return (
      <View style={[s.banner, { backgroundColor: conf.bg, borderColor: conf.bd }]}>
        <Feather name={conf.icon} size={18} color={conf.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.bannerTitle, { color: conf.fg }]}>
            {conf.title}{result.payment ? ` · ${money(result.payment.amount)}` : ''}
          </Text>
          <Text style={[s.bannerText, { color: conf.fg }]}>{conf.text}</Text>
          <Text style={s.bannerRef} selectable>Txn {result.txnid}</Text>
        </View>
        <View style={s.bannerActions}>
          {waiting || notPaid ? (
            <TouchableOpacity style={s.bannerBtn} onPress={() => check(result.txnid)}>
              <Text style={s.bannerBtnText}>Check again</Text>
            </TouchableOpacity>
          ) : null}
          {!waiting && st !== 'review' ? (
            <TouchableOpacity style={s.bannerBtn} onPress={retry}>
              <Text style={s.bannerBtnText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setResult(null)} style={{ padding: 4 }} accessibilityLabel="Dismiss">
            <Feather name="x" size={16} color="#64748b" />
          </TouchableOpacity>
        </View>
      </View>
    );
  })();

  // ---- rows ----
  const ledgerRow = (t) => {
    const credit = t.txn_type === 'credit';
    const d = describe(t);
    const failed = t.txn_status && t.txn_status !== 'success';
    const amountText = `${credit ? '+' : '−'} ${money(t.txn_amount)}`;
    return (
      <View key={t.ledger_id} style={s.row}>
        <View style={[s.rowIcon, { backgroundColor: credit ? '#ecfdf5' : '#fef2f2' }]}>
          <Feather name={credit ? 'arrow-down-left' : 'arrow-up-right'} size={15} color={credit ? GREEN : '#dc2626'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{d.title}</Text>
          <Text style={s.rowSub} numberOfLines={1}>
            {[when(t.txn_timestamp), d.detail, `#${t.ledger_id}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {!isMobile ? <Text style={[s.rowBalance]}>{money(t.balance_after_txn)}</Text> : null}
        <View style={{ alignItems: 'flex-end', minWidth: isMobile ? 96 : 130 }}>
          <Text style={[s.rowAmount, { color: failed ? '#94a3b8' : credit ? GREEN : '#0f172a' }, failed && { textDecorationLine: 'line-through' }]}>{amountText}</Text>
          {isMobile ? <Text style={s.rowSub}>Bal {money(t.balance_after_txn)}</Text> : failed ? <Text style={[s.rowSub, { color: '#dc2626' }]}>Failed</Text> : null}
        </View>
      </View>
    );
  };

  const paymentRow = (p) => {
    const c = PAY_STATUS[p.status] || PAY_STATUS.initiated;
    return (
      <View key={p.txnid} style={s.row}>
        <View style={[s.rowIcon, { backgroundColor: '#f1f5f9' }]}>
          <Feather name="credit-card" size={15} color="#475569" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowTitle} numberOfLines={1} selectable>{p.txnid}</Text>
          <Text style={s.rowSub} numberOfLines={1}>
            {[when(p.created_at), p.mode, p.bank_ref_num ? `Ref ${p.bank_ref_num}` : null].filter(Boolean).join(' · ')}
          </Text>
          {p.error_message && p.status !== 'success' ? <Text style={[s.rowSub, { color: '#b91c1c' }]} numberOfLines={2}>{p.error_message}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, minWidth: isMobile ? 96 : 130 }}>
          <Text style={s.rowAmount}>{money(p.amount)}</Text>
          <View style={[s.pill, { backgroundColor: c.bg }]}><Text style={[s.pillText, { color: c.fg }]}>{c.label}</Text></View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: COLORS.bgPrimary }} contentContainerStyle={{ padding: isMobile ? 12 : 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      {banner}

      {/* ---- add money ---- */}
      <View style={[s.card, wide && { flexDirection: 'row' }]}>
        <View style={[s.balancePane, wide ? { width: 300, borderRightWidth: 1, borderBottomWidth: 0 } : null]}>
          <View style={s.balanceIcon}><Ionicons name="wallet-outline" size={22} color={GREEN} /></View>
          <Text style={s.balanceLabel}>Wallet balance</Text>
          <Text style={s.balanceValue}>{balance === null ? '—' : money(balance)}</Text>
          <Text style={s.balanceSub}>{user?.partner_name || 'Operator'}{partnerId ? ` · #${partnerId}` : ''}</Text>
        </View>

        <View style={{ flex: 1, padding: isMobile ? 16 : 20, gap: 14 }}>
          <Text style={s.h2}>Add money</Text>
          <View style={[{ gap: 14 }, !isMobile && { flexDirection: 'row', alignItems: 'flex-start' }]}>
            <View style={{ flex: 1.3, minWidth: 0 }}>
              <Text style={s.label}>Amount</Text>
              <View style={[s.amountBox, amount !== '' && !amountValid && { borderColor: '#fca5a5' }]}>
                <Text style={s.rupee}>₹</Text>
                <TextInput
                  style={s.amountInput}
                  value={amount}
                  onChangeText={(v) => {
                    setFormError('');
                    setAmount(v.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2})\d+/, '$1'));
                  }}
                  onSubmitEditing={pay}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="Enter amount"
                  placeholderTextColor="#cbd5e1"
                  editable={!paying}
                  accessibilityLabel="Amount in rupees"
                />
              </View>
              <Text style={[s.hint, amount !== '' && !amountValid && { color: '#dc2626' }]}>{amountHint}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.label}>Remark <Text style={{ color: '#94a3b8', fontWeight: '500' }}>(optional)</Text></Text>
              <TextInput style={s.remark} value={remark} onChangeText={setRemark} placeholder="e.g. Weekly top-up" placeholderTextColor="#94a3b8" maxLength={120} editable={!paying} />
            </View>
          </View>

          <View style={s.presets}>
            {PRESETS.map((v) => {
              const on = Number(amount) === v;
              return (
                <TouchableOpacity key={v} style={[s.preset, on && s.presetOn]} onPress={() => { setFormError(''); setAmount(String(v)); }} disabled={paying}>
                  <Text style={[s.presetText, on && { color: GREEN }]}>{whole(v)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {formError ? (
            <View style={s.error}>
              <Feather name="alert-circle" size={14} color="#b91c1c" />
              <Text style={s.errorText}>{formError}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[s.btnPay, (!amountValid || paying) && { opacity: 0.5 }, isMobile && { alignSelf: 'stretch' }]} onPress={pay} disabled={!amountValid || paying}>
            {paying ? <ActivityIndicator size="small" color="#ffffff" /> : <Feather name="lock" size={14} color="#ffffff" />}
            <Text style={s.btnPayText}>{paying ? 'Opening PayU…' : `Pay ${amountValid ? money(amt) : ''}`}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ---- transactions ---- */}
      <View style={s.card}>
        <View style={[s.listHead, isMobile && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={s.tabs}>
            {[
              { id: 'ledger', label: 'Transactions' },
              { id: 'online', label: 'Online payments' },
            ].map((t) => (
              <TouchableOpacity key={t.id} style={[s.tab, tab === t.id && s.tabOn]} onPress={() => { setTab(t.id); setPage(1); setRows([]); }}>
                <Text style={[s.tabText, tab === t.id && s.tabTextOn]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[{ flexDirection: 'row', gap: 8, alignItems: 'center' }, isMobile && { flexWrap: 'wrap' }]}>
            {tab === 'ledger' ? (
              <View style={s.seg}>
                {[
                  { id: '', label: 'All' },
                  { id: 'credit', label: 'Credits' },
                  { id: 'debit', label: 'Debits' },
                ].map((f) => (
                  <TouchableOpacity key={f.id || 'all'} style={[s.segBtn, type === f.id && s.segOn]} onPress={() => { setType(f.id); setPage(1); }}>
                    <Text style={[s.segText, type === f.id && { color: '#0f172a' }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={[s.search, isMobile && { flex: 1, minWidth: 180 }]}>
              <Feather name="search" size={14} color="#94a3b8" />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                onSubmitEditing={() => { setQuery(search.trim()); setPage(1); }}
                placeholder={tab === 'ledger' ? 'Search remark or #id' : 'Search txn or bank ref'}
                placeholderTextColor="#94a3b8"
              />
              {search ? <TouchableOpacity onPress={() => { setSearch(''); setQuery(''); setPage(1); }}><Feather name="x" size={14} color="#94a3b8" /></TouchableOpacity> : null}
            </View>
          </View>
        </View>

        {!isMobile && tab === 'ledger' ? (
          <View style={[s.row, s.headRow]}>
            <View style={{ width: 34 }} />
            <Text style={[s.th, { flex: 1 }]}>Details</Text>
            <Text style={[s.th, { width: 130, textAlign: 'right', paddingRight: 24 }]}>Balance after</Text>
            <Text style={[s.th, { width: 130, textAlign: 'right' }]}>Amount</Text>
          </View>
        ) : null}

        {loading && !rows.length ? (
          <ActivityIndicator size="small" color={GREEN} style={{ marginVertical: 30 }} />
        ) : listError ? (
          <Text style={[s.empty, { color: '#b91c1c' }]}>{listError}</Text>
        ) : !rows.length ? (
          <Text style={s.empty}>{query || type ? 'No transactions match.' : tab === 'ledger' ? 'No transactions yet.' : 'No online payments yet.'}</Text>
        ) : (
          <View style={loading && { opacity: 0.6 }}>{rows.map((r) => (tab === 'ledger' ? ledgerRow(r) : paymentRow(r)))}</View>
        )}

        {total > PAGE_SIZE ? (
          <View style={s.pager}>
            <Text style={s.rowSub}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity disabled={page <= 1} onPress={() => setPage((x) => x - 1)} style={[s.pageBtn, page <= 1 && { opacity: 0.4 }]} accessibilityLabel="Previous page"><Feather name="chevron-left" size={15} color="#334155" /></TouchableOpacity>
              <TouchableOpacity disabled={page >= pages} onPress={() => setPage((x) => x + 1)} style={[s.pageBtn, page >= pages && { opacity: 0.4 }]} accessibilityLabel="Next page"><Feather name="chevron-right" size={15} color="#334155" /></TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  balancePane: { padding: 20, gap: 4, backgroundColor: '#f8fffb', borderColor: '#e2e8f0', borderBottomWidth: 1, justifyContent: 'center' },
  balanceIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  balanceLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  balanceValue: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  balanceSub: { fontSize: 12.5, color: '#64748b' },
  h2: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  rupee: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginRight: 6 },
  amountInput: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '800', color: '#0f172a', outlineStyle: 'none' },
  hint: { fontSize: 12, color: '#64748b', marginTop: 6 },
  remark: { height: 50, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', fontSize: 14, color: '#0f172a', outlineStyle: 'none' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  presetOn: { borderColor: GREEN, backgroundColor: '#ecfdf5' },
  presetText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { flex: 1, fontSize: 12.5, color: '#991b1b', lineHeight: 18 },
  btnPay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 24, height: 46, minWidth: 200, borderRadius: 10, backgroundColor: GREEN },
  btnPayText: { fontSize: 14.5, fontWeight: '800', color: '#ffffff' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  bannerText: { fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  bannerRef: { fontSize: 11.5, color: '#64748b', marginTop: 4 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  bannerBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  bannerBtnText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  tabOn: { backgroundColor: '#ecfdf5' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  tabTextOn: { color: GREEN },
  seg: { flexDirection: 'row', padding: 3, borderRadius: 8, backgroundColor: '#f1f5f9' },
  segBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  segOn: { backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(15,23,42,0.08)' },
  segText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, width: 230, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textMain, outlineStyle: 'none' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headRow: { paddingVertical: 8, backgroundColor: '#f8fafc' },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  rowBalance: { width: 130, textAlign: 'right', paddingRight: 24, fontSize: 13, color: '#475569' },
  rowAmount: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  empty: { padding: 28, textAlign: 'center', fontSize: 13, color: '#64748b' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  pageBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
