import { sha512 } from 'js-sha512';
import { OneBssApi, getOriginalSession, isJwtExpired } from './oneBssApi.js';

// PayU Integration Credentials & Endpoints
// Docs: https://docs.payu.in/docs/introduction
export const PAYU_CONFIG = {
  // 'production' for live payments, 'test' for sandbox testing
  ENVIRONMENT: 'production',
  BASE_URL: 'https://bss.polfibernet.in',

  // Production credentials (Live)
  PROD: {
    KEY: '2fdi7P',
    SALT: 'MJm8soxbyA1bmLzGaexpHbmQe119ka3y',
    CLIENT_ID: 'cee0d9d0f46b0755b58ac4c9a48bcfb6bc2b34d1dbbdb170643c323b7ae45a39',
    CLIENT_SECRET: '2047db37f7bd810e3af9a62e6fdd9dd292cb91cc612c02898fd76d8c990c1151',
    paymentUrl: 'https://secure.payu.in/_payment',
    boltJsUrl: 'https://jssdk.payu.in/bolt/bolt.min.js',
    oauthUrl: 'https://accounts.payu.in/oauth/token',
  },

  // Test / Sandbox credentials
  TEST: {
    KEY: 'wOPQUA',
    SALT: 'B6Ws6EYEjEdreAWtu1o81wee01RtBUBW',
    CLIENT_ID: 'a0d086b71104020416e33b70d6a40f3c3881bf793c4086df003e98fbdd5932cb',
    CLIENT_SECRET: '0ec9fda6a90fa887830558608ac9d188a85f9679f0bc044e66545347217e8330',
    paymentUrl: 'https://test.payu.in/_payment',
    boltJsUrl: 'https://jssdk-uat.payu.in/bolt/bolt.min.js',
    oauthUrl: 'https://accounts.payu.in/oauth/token',
  },

  get KEY() {
    return this.ENVIRONMENT === 'production' ? this.PROD.KEY : this.TEST.KEY;
  },
  get SALT() {
    return this.ENVIRONMENT === 'production' ? this.PROD.SALT : this.TEST.SALT;
  },
  get CLIENT_ID() {
    return this.ENVIRONMENT === 'production' ? this.PROD.CLIENT_ID : this.TEST.CLIENT_ID;
  },
  get CLIENT_SECRET() {
    return this.ENVIRONMENT === 'production' ? this.PROD.CLIENT_SECRET : this.TEST.CLIENT_SECRET;
  },
};

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Get current active payment POST URL based on environment.
 */
export const getPayUPaymentUrl = (env = PAYU_CONFIG.ENVIRONMENT) => {
  return env === 'production'
    ? PAYU_CONFIG.PROD.paymentUrl
    : PAYU_CONFIG.TEST.paymentUrl;
};

/**
 * Get PayU Bolt JS SDK URL based on environment.
 */
export const getPayUBoltJsUrl = (env = PAYU_CONFIG.ENVIRONMENT) => {
  return env === 'production'
    ? PAYU_CONFIG.PROD.boltJsUrl
    : PAYU_CONFIG.TEST.boltJsUrl;
};

/**
 * Generate a unique transaction reference id for Operator Wallet Topup.
 */
export const generatePayUTxnId = (partnerId) => {
  const cleanId = String(partnerId || '0').replace(/[^a-zA-Z0-9]/g, '');
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `TXN_OP_${cleanId}_${timestamp}_${randomSuffix}`;
};

/**
 * Calculate the SHA-512 payment request hash according to PayU's specification:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
export const calculatePayUHash = ({
  txnid,
  amount,
  productinfo = 'OperatorWalletTopup',
  firstname = 'Operator',
  email = 'operator@polfibernet.in',
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  key,
  salt,
}) => {
  const activeKey = key || PAYU_CONFIG.KEY;
  const activeSalt = salt || PAYU_CONFIG.SALT;
  const formattedAmount = Number(amount).toFixed(2);
  const cleanFirstname = String(firstname || 'Operator').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 50) || 'Operator';
  const cleanEmail = String(email || 'operator@polfibernet.in').trim();
  const cleanProductInfo = String(productinfo || 'OperatorWalletTopup').replace(/[^a-zA-Z0-9_]/g, '_').trim();

  // Exactly 17 elements (16 pipe separators) according to PayU specification:
  // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
  const hashString = [
    activeKey,
    txnid,
    formattedAmount,
    cleanProductInfo,
    cleanFirstname,
    cleanEmail,
    udf1 || '',
    udf2 || '',
    udf3 || '',
    udf4 || '',
    udf5 || '',
    '', '', '', '', '', // 5 empty slots representing udf6-udf10 (generating ||||||)
    activeSalt,
  ].join('|');

  return sha512(hashString);
};

/**
 * Verify reverse SHA-512 hash returned in payment response:
 * sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export const verifyPayUResponseHash = ({
  status,
  txnid,
  amount,
  productinfo = 'OperatorWalletTopup',
  firstname = 'Operator',
  email = 'operator@polfibernet.in',
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  responseHash,
  key,
  salt,
}) => {
  if (!responseHash) return false;
  const activeKey = key || PAYU_CONFIG.KEY;
  const activeSalt = salt || PAYU_CONFIG.SALT;
  const formattedAmount = Number(amount).toFixed(2);
  const cleanFirstname = String(firstname || 'Operator').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 50) || 'Operator';
  const cleanEmail = String(email || 'operator@polfibernet.in').trim();
  const cleanProductInfo = String(productinfo || 'OperatorWalletTopup').replace(/[^a-zA-Z0-9_]/g, '_').trim();

  const hashString = [
    activeSalt,
    status,
    '', '', '', '', '', // 5 empty slots
    udf5 || '',
    udf4 || '',
    udf3 || '',
    udf2 || '',
    udf1 || '',
    cleanEmail,
    cleanFirstname,
    cleanProductInfo,
    formattedAmount,
    txnid,
    activeKey,
  ].join('|');

  const calculated = sha512(hashString).toLowerCase();
  return calculated === String(responseHash).trim().toLowerCase();
};

/**
 * Fetch OAuth 2.0 access token using Client ID & Client Secret
 * (for server-to-server APIs and payment verification).
 */
export const getPayUOAuthAccessToken = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedAccessToken && now < tokenExpiresAt - 60000) {
    return { ok: true, token: cachedAccessToken };
  }

  const tokenUrl = PAYU_CONFIG.ENVIRONMENT === 'production'
    ? PAYU_CONFIG.ENDPOINTS.prodOAuth
    : PAYU_CONFIG.ENDPOINTS.testOAuth;

  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: PAYU_CONFIG.CLIENT_ID,
      client_secret: PAYU_CONFIG.CLIENT_SECRET,
      scope: 'create_payment_links read_payment_links',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      cachedAccessToken = data.access_token;
      tokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
      return { ok: true, token: cachedAccessToken };
    }
    return { ok: false, message: data.error_description || data.message || 'Failed to authenticate with PayU' };
  } catch (err) {
    return { ok: false, message: err?.message || 'PayU OAuth request failed' };
  }
};

let currentLoadedSdkUrl = null;

/**
 * Dynamically loads PayU Bolt JS SDK for the active environment (Production or Sandbox).
 * If switching environments, cleans up the previous script to ensure correct gateway routing.
 */
export const loadPayUBoltSdk = (targetEnv = PAYU_CONFIG.ENVIRONMENT) => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('Window not available'));

    const targetUrl = getPayUBoltJsUrl(targetEnv);

    // If matching SDK already loaded
    if (window.bolt && typeof window.bolt.launch === 'function' && currentLoadedSdkUrl === targetUrl) {
      return resolve(window.bolt);
    }

    // Clean up any existing bolt scripts if environment changed
    const existing = document.querySelectorAll('script[src*="bolt.min.js"]');
    existing.forEach((el) => {
      if (el.src !== targetUrl) {
        try {
          el.parentNode?.removeChild(el);
          window.bolt = null;
        } catch (e) {}
      }
    });

    const script = document.createElement('script');
    script.src = targetUrl;
    script.async = true;
    script.onload = () => {
      currentLoadedSdkUrl = targetUrl;
      if (window.bolt && typeof window.bolt.launch === 'function') {
        resolve(window.bolt);
      } else {
        reject(new Error('PayU Bolt SDK loaded but bolt object not found'));
      }
    };
    script.onerror = () => reject(new Error(`Could not load PayU Bolt script from ${targetUrl}`));
    document.body.appendChild(script);
  });
};

/**
 * Prepare full transaction payload ready for PayU checkout.
 */
export const preparePayUPaymentData = ({
  partner,
  amount,
  user,
  customTxnId,
  remark = '',
}) => {
  const partnerId = String(partner?.partner_id || user?.partner_id || '0');
  const txnid = customTxnId || generatePayUTxnId(partnerId);
  const formattedAmount = Number(amount).toFixed(2);
  const firstname = (partner?.partner_name || user?.partner_name || user?.username || 'Operator')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim() || 'Operator';
  const email = (partner?.partner_email || user?.partner_email || user?.email || 'operator@polfibernet.in').trim();
  const phone = (partner?.partner_mobile || user?.partner_mobile || user?.mobile || '9876543210').replace(/[^0-9]/g, '').slice(-10);
  const productinfo = 'OperatorWalletTopup';

  const surl = 'https://demo.onebss.in/b_bss/pg/payu_callback.php';
  const furl = 'https://demo.onebss.in/b_bss/pg/payu_callback.php';

  const cleanRemark = String(remark || '').replace(/[^a-zA-Z0-9 _\-.,]/g, '').slice(0, 100);
  const udf1 = partnerId;
  const udf2 = cleanRemark;
  const udf3 = '';
  const udf4 = '';
  const udf5 = '';

  const activeKey = PAYU_CONFIG.KEY;
  const activeSalt = PAYU_CONFIG.SALT;

  const hash = calculatePayUHash({
    txnid,
    amount: formattedAmount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    key: activeKey,
    salt: activeSalt,
  });

  return {
    key: activeKey,
    txnid,
    amount: formattedAmount,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    hash,
    udf1,
    udf2,
    udf3: '',
    udf4: '',
    udf5: '',
    service_provider: 'payu_paisa',
  };
};

/**
 * Credits the operator's wallet in OneBSS backend upon verified PayU payment.
 */
export const recordPayUWalletTopup = async ({
  partnerId,
  amount,
  txnid,
  mode = 'PayU Online (UPI/Cards/NetBanking)',
  bankRef = '',
  payuResponse = {},
  remark = '',
}) => {
  // 1. First, call our dedicated server-side PayU verification & credit endpoint
  try {
    const verifyRes = await fetch('https://demo.onebss.in/b_bss/pg/payu_verify.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: Number(partnerId),
        amount: Number(amount),
        txnid,
        bank_ref_num: bankRef,
        payu_response: payuResponse,
        environment: PAYU_CONFIG.ENVIRONMENT,
        remark: remark ? String(remark).trim() : '',
      }),
    });

    const verifyData = await verifyRes.json();
    if (verifyRes.ok && verifyData.success) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('onebss:wallet-changed', {
            detail: {
              partner_id: Number(partnerId),
              amount: Number(amount),
              balance_after: verifyData.balance_after,
              txnid,
            },
          })
        );
      }
      return { ok: true, data: verifyData };
    }

    // Payment verification failed on server/PayU - DO NOT credit wallet!
    console.warn('PayU payment verification failed:', verifyData);
    return {
      ok: false,
      data: verifyData,
      message: verifyData.message || 'Payment was not verified by PayU.',
    };
  } catch (err) {
    console.error('Dedicated PG verify endpoint error:', err);
    return {
      ok: false,
      message: err?.message || 'Unable to connect to PayU verification server.',
    };
  }
};

/**
 * Launch standard hosted PayU form POST checkout in a popup window or current tab.
 */
export const launchPayUHostedCheckout = (paymentData, targetWindow = null) => {
  if (typeof document === 'undefined') return;

  const paymentUrl = getPayUPaymentUrl();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = paymentUrl;

  if (targetWindow && typeof targetWindow === 'string') {
    form.target = targetWindow;
  }

  Object.entries(paymentData).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(val);
      form.appendChild(input);
    }
  });

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => {
    try {
      document.body.removeChild(form);
    } catch (e) {}
  }, 1000);
};
