// PayU wallet top-up — browser side.
//
// Flow (PayU's standard hosted checkout — works on every browser and phone, incl. UPI apps):
//   1. pg/payu_initiate.php stores the order and makes the hash with the merchant salt
//      (nothing secret is ever in the browser);
//   2. the browser posts those fields to PayU's secure payment page;
//   3. PayU sends the browser to pg/payu_callback.php, which checks the payment with PayU
//      itself, credits the wallet once, and returns to the app at #payu=<txnid>;
//   4. the app asks pg/payu_payments.php?txnid=…&check=1 for the result and shows it.
// The 10-minute cron (cron/payu_reconcile.php) and PayU's webhook catch payments whose
// browser never came back.

import { OneBssApi } from './oneBssApi';

const PENDING_KEY = 'onebss_pending_payu_txn';

/** Posts the server's fields to PayU's payment page (leaves the app). */
export const redirectToPayU = (paymentUrl, fields) => {
  if (typeof document === 'undefined') return false;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = paymentUrl;
  form.style.display = 'none';
  Object.entries(fields || {}).forEach(([name, value]) => {
    if (value === undefined || value === null) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  return true;
};

export const rememberPendingPayU = (txnid, amount) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ txnid, amount, at: Date.now() }));
  } catch (e) {
    // storage may be blocked; the return URL carries the txnid anyway
  }
};

export const forgetPendingPayU = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    // ignore
  }
};

/** Operator-friendly text for an initiate / status error from the server. */
export const payuErrorText = (res, fallback) => {
  const msg = String(res?.data?.message || '');
  if (res?.status === 0) return 'No internet connection. Check your connection and try again.';
  if (/not configured/i.test(msg)) return 'Online top-up is not available right now. Please contact your administrator.';
  if (res?.status >= 500) return 'The payment service is busy. Please try again in a minute.';
  return msg || fallback;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the server for the result of one payment, a few times while PayU is still settling it.
 * Resolves { ok, payment, walletBalance, message }. payment.status: success | pending |
 * initiated | failed | expired | review.
 */
export const waitForPayUResult = async (txnid, { tries = 4, gapMs = 3000 } = {}) => {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    if (i > 0) await sleep(gapMs);
    const res = await OneBssApi.payuPayment(txnid, true);
    if (!res.ok) {
      last = { ok: false, payment: null, walletBalance: null, message: payuErrorText(res, 'Could not check the payment.') };
      if (res.status === 404 || res.status === 401 || res.status === 403) break;
      continue;
    }
    const payment = res.data.payment;
    last = { ok: true, payment, walletBalance: res.data.wallet_balance, message: payment?.error_message || payment?.note || '' };
    // final, or PayU has no payment for it at all (operator left PayU's page without paying)
    if (['success', 'failed', 'expired', 'review', 'initiated'].includes(payment?.status)) break;
  }
  if (last?.payment?.status === 'success' && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('onebss:wallet-changed', {
        detail: { partner_id: last.payment.partner_id, amount: last.payment.amount, balance_after: last.walletBalance, txnid },
      })
    );
  }
  return last || { ok: false, payment: null, walletBalance: null, message: 'Could not check the payment.' };
};
