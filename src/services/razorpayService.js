// Razorpay wallet top-up — client side.
//
// Flow (Razorpay Standard Checkout):
//   1. pg/razorpay/razorpay_initiate.php creates the order with Razorpay API and stores it in razorpay_payments.
//   2. Browser opens Razorpay Checkout modal (or redirects).
//   3. On payment completion, handler verifies and confirms the payment with pg/razorpay/razorpay_payments.php?txnid=...&check=1.
//   4. The server confirms status directly with Razorpay API and credits the partner wallet once.

import { OneBssApi } from './oneBssApi';

const PENDING_KEY = 'onebss_pending_razorpay_txn';

const loadScript = (src) => {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(false);
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Opens Razorpay standard checkout popup on web, or falls back to redirect.
 * orderData: { key_id, amount_paise, order_id, currency, prefill, notes, txnid, checkout_url, callback_url }
 */
export const openRazorpayCheckout = async (orderData, { onSuccess, onDismiss, onFailure } = {}) => {
  if (typeof window === 'undefined') return false;

  const scriptLoaded = await loadScript(orderData.checkout_url || 'https://checkout.razorpay.com/v1/checkout.js');
  if (!scriptLoaded || !window.Razorpay) {
    if (orderData.callback_url) {
      redirectToRazorpay(orderData.callback_url, orderData);
      return true;
    }
    return false;
  }

  const options = {
    key: orderData.key_id,
    amount: orderData.amount_paise,
    currency: orderData.currency || 'INR',
    name: 'OneBSS',
    description: 'Wallet Top-up',
    order_id: orderData.order_id,
    prefill: orderData.prefill || {},
    notes: orderData.notes || {},
    theme: {
      color: '#0284c7',
    },
    handler: async (response) => {
      // response: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
      if (onSuccess) {
        onSuccess(response);
      }
    },
    modal: {
      ondismiss: () => {
        if (onDismiss) onDismiss();
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (response) => {
    if (onFailure) onFailure(response?.error);
  });
  rzp.open();
  return true;
};

/** Posts/redirects the browser to Razorpay checkout if modal unavailable. */
export const redirectToRazorpay = (callbackUrl, orderData) => {
  if (typeof window !== 'undefined') {
    window.location.href = `${callbackUrl}?txnid=${encodeURIComponent(orderData.txnid)}&order_id=${encodeURIComponent(orderData.order_id)}`;
  }
};

export const rememberPendingRazorpay = (txnid, amount) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ txnid, amount, at: Date.now() }));
  } catch (e) {
    // ignore
  }
};

export const forgetPendingRazorpay = () => {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    // ignore
  }
};

/** Operator-friendly error text. */
export const razorpayErrorText = (res, fallback) => {
  const msg = String(res?.data?.message || '');
  if (res?.status === 0) return 'No internet connection. Check your connection and try again.';
  if (/not configured/i.test(msg)) return 'Online top-up via Razorpay is not available right now. Please contact your administrator.';
  if (res?.status >= 500) return 'The payment service is busy. Please try again in a minute.';
  return msg || fallback;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the server for the result of one payment, a few times while Razorpay is settling it.
 */
export const waitForRazorpayResult = async (txnid, { tries = 5, gapMs = 2500, payData = null } = {}) => {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    if (i > 0) await sleep(gapMs);
    const res = await OneBssApi.razorpayPayment(txnid, true, payData);
    if (!res.ok) {
      last = { ok: false, payment: null, walletBalance: null, message: razorpayErrorText(res, 'Could not check the payment.') };
      if (res.status === 404 || res.status === 401 || res.status === 403) break;
      continue;
    }
    const payment = res.data.payment;
    last = { ok: true, payment, walletBalance: res.data.wallet_balance, message: payment?.error_message || payment?.note || '' };
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
