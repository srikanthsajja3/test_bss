// HDFC SmartGateway wallet top-up — browser side.
//
// Flow (HDFC SmartGateway / Juspay hosted checkout):
//   1. pg/hdfc_initiate.php creates a session with HDFC SmartGateway (/session)
//      and gets a hosted checkout URL (payment_links.web);
//   2. the browser redirects to the HDFC payment page;
//   3. after payment, HDFC redirects the browser to pg/hdfc_callback.php, which verifies
//      the order with HDFC SmartGateway, credits the wallet once, and redirects to #hdfc=<txnid>;
//   4. the app asks pg/hdfc_payments.php?txnid=…&check=1 for the result and shows it.

import { OneBssApi } from './oneBssApi';

const PENDING_KEY = 'onebss_pending_hdfc_txn';

/** Redirects the browser to HDFC SmartGateway's payment page. */
export const redirectToHdfc = (paymentUrl) => {
  if (typeof window === 'undefined' || !paymentUrl) return false;
  window.location.href = paymentUrl;
  return true;
};

export const rememberPendingHdfc = (txnid, amount) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ txnid, amount, at: Date.now() }));
  } catch (e) {
    // storage may be blocked; return URL carries the txnid anyway
  }
};

export const forgetPendingHdfc = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {}
};

/** Operator-friendly text for an initiate / status error from the server. */
export const hdfcErrorText = (res, fallback) => {
  const msg = String(res?.data?.message || '');
  if (res?.status === 0) return 'No internet connection. Check your connection and try again.';
  if (/not configured/i.test(msg)) return 'HDFC SmartGateway is not configured right now. Please contact your administrator.';
  if (res?.status >= 500) return 'The payment service is busy. Please try again in a minute.';
  return msg || fallback;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the server for the result of one payment, polling while HDFC settles it.
 * Resolves { ok, payment, walletBalance, message }.
 */
export const waitForHdfcResult = async (txnid, { tries = 4, gapMs = 3000 } = {}) => {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    if (i > 0) await sleep(gapMs);
    const res = await OneBssApi.hdfcPayment(txnid, true);
    if (!res.ok) {
      last = { ok: false, payment: null, walletBalance: null, message: hdfcErrorText(res, 'Could not check the payment.') };
      if (res.status === 404 || res.status === 401 || res.status === 403) break;
      continue;
    }
    const payment = res.data.payment;
    last = { ok: true, payment, walletBalance: res.data.wallet_balance, message: payment?.error_message || payment?.note || '' };
    // If completed or failed, stop polling
    if (['success', 'failed', 'expired', 'review'].includes(payment?.status)) break;
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
