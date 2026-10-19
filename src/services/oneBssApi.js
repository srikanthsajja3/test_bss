// OneBSS API client.
//
// Rules this file follows (do not add exceptions):
//   1. A failed request is NEVER turned into a success. Every function returns
//      { ok, status, duration, url, data } exactly as the server answered, and
//      `ok` is false whenever the HTTP status is not 2xx OR the body says
//      success === false. Screens must check `res.ok` and show `res.data.message`.
//   2. No hard-coded partner IDs, phone numbers or credentials. A missing
//      required argument returns a client-side error instead of falling back
//      to someone else's account.
//   3. Only the logged-in user's own token is ever sent. The original token kept
//      during impersonation is used ONLY to return to that account.

const DEFAULT_BASE_URL = 'https://demo.onebss.in/b_bss';

// Set EXPO_PUBLIC_API_BASE_URL at build time to point at another backend
// (Expo inlines process.env.EXPO_PUBLIC_* — keep this exact expression).
let BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL;
let AUTH_TOKEN = '';

const TOKEN_KEY = 'onebss_token';
const USER_KEY = 'onebss_user';
// Kept in sessionStorage (cleared when the tab closes), never sent with API calls.
const ORIGINAL_SESSION_KEY = 'onebss_original_session';
// Keys used by older builds — removed on login/logout so stale copies don't linger.
const LEGACY_KEYS = ['onebss_impersonate_token', 'onebss_super_admin_session', 'onebss_verified_cust_ids'];

const safeStorage = (kind) => {
  try {
    if (typeof window !== 'undefined' && window[kind]) return window[kind];
  } catch (e) {}
  return null;
};

export const getApiConfig = () => ({ baseUrl: BASE_URL, authToken: AUTH_TOKEN });

export const setApiConfig = (url, token) => {
  if (url) BASE_URL = url;
  if (token !== undefined) {
    AUTH_TOKEN = token || '';
    const ls = safeStorage('localStorage');
    try {
      if (ls) {
        if (token) ls.setItem(TOKEN_KEY, token);
        else ls.removeItem(TOKEN_KEY);
      }
    } catch (e) {}
  }
};

export const clearStoredSession = () => {
  AUTH_TOKEN = '';
  const ls = safeStorage('localStorage');
  const ss = safeStorage('sessionStorage');
  try {
    if (ls) {
      ls.removeItem(TOKEN_KEY);
      ls.removeItem(USER_KEY);
      LEGACY_KEYS.forEach((k) => ls.removeItem(k));
    }
    if (ss) ss.removeItem(ORIGINAL_SESSION_KEY);
  } catch (e) {}
};

// ---- impersonation: a STACK of the accounts to return to, one level at a time ----
// Super admin -> admin -> operator keeps [super admin, admin]; "Return" pops one level
// (operator -> admin -> super admin), never skipping a level.
const readSessionStack = () => {
  const ss = safeStorage('sessionStorage');
  try {
    const raw = ss && ss.getItem(ORIGINAL_SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.token ? [parsed] : []; // old single-object format
    return list.filter((s) => s && s.token);
  } catch (e) {
    return [];
  }
};
const writeSessionStack = (list) => {
  const ss = safeStorage('sessionStorage');
  try {
    if (!ss) return;
    if (list.length) ss.setItem(ORIGINAL_SESSION_KEY, JSON.stringify(list));
    else ss.removeItem(ORIGINAL_SESSION_KEY);
  } catch (e) {}
};

/** Push the account we are leaving (call right before switching into another partner). */
export const saveOriginalSession = (token, user) => {
  if (!token) return;
  writeSessionStack([...readSessionStack(), { token, user }]);
};

/** Every saved level, oldest (super admin) first. */
export const getSessionStack = () => readSessionStack();

/** The account one level up (the one "Return" goes back to), or null. */
export const getOriginalSession = () => {
  const list = readSessionStack();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!isJwtExpired(list[i].token)) return list[i];
  }
  return null;
};

/** Remove and return the level we go back to (expired levels in between are skipped). */
export const popOriginalSession = () => {
  const list = readSessionStack();
  while (list.length) {
    const top = list.pop();
    if (top && top.token && !isJwtExpired(top.token)) {
      writeSessionStack(list);
      return top;
    }
  }
  writeSessionStack([]);
  return null;
};

export const clearOriginalSession = () => writeSessionStack([]);

/**
 * Switch the whole app to another account in one step (impersonate, or return one level).
 * The new session is written first and the page reloads straight into it, so the current
 * account's dashboard is never shown in between. `hash` = where to land (e.g. 'dashboard').
 */
export const switchSession = (token, user, hash = 'dashboard', label = '') => {
  if (typeof window === 'undefined') return;
  try {
    // cover the screen at once so nothing of the old account flashes while reloading
    if (typeof document !== 'undefined' && document.body && !document.getElementById('onebss-switching')) {
      const el = document.createElement('div');
      el.id = 'onebss-switching';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;font:600 15px system-ui,sans-serif';
      el.textContent = label ? `Switching to ${label}…` : 'Switching account…';
      document.body.appendChild(el);
    }
  } catch (e) {}
  if (token) {
    setApiConfig(undefined, token);
    try {
      localStorage.setItem('onebss_user', JSON.stringify({ ...user, token }));
    } catch (e) {}
  } else {
    setApiConfig(undefined, '');
    try {
      localStorage.removeItem('onebss_user');
    } catch (e) {}
  }
  try {
    const tab = String(hash || 'dashboard').split('?')[0];
    localStorage.setItem('onebss_active_tab', tab);
    localStorage.removeItem('onebss_filter');
    // replaceState does NOT fire 'hashchange', so the app doesn't re-render the old account
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`);
  } catch (e) {}
  window.location.reload();
};

let unauthorizedListeners = [];

export const onUnauthorized = (callback) => {
  unauthorizedListeners.push(callback);
  return () => {
    unauthorizedListeners = unauthorizedListeners.filter((cb) => cb !== callback);
  };
};

export const notifyUnauthorized = (reason = 'Session expired. Please log in again.') => {
  clearStoredSession();
  unauthorizedListeners.forEach((cb) => {
    try {
      cb(reason);
    } catch (e) {}
  });
};

// NOTE: decoding only reads the claims for display. It does NOT verify the
// signature — the server is the only authority on who the user is.
export const decodeJwt = (token) => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

export const isJwtExpired = (token) => {
  const decoded = decodeJwt(token);
  if (!decoded) return true; // not a JWT -> treat as invalid
  if (!decoded.exp) return false;
  return Math.floor(Date.now() / 1000) >= decoded.exp;
};

const getActiveToken = () => {
  if (AUTH_TOKEN) return AUTH_TOKEN.trim();
  const ls = safeStorage('localStorage');
  try {
    const saved = ls && ls.getItem(TOKEN_KEY);
    if (saved) return saved.trim();
  } catch (e) {}
  return '';
};

/** A client-side failure in the same shape as a server response. */
const clientError = (message, status = 400) => ({
  ok: false,
  status,
  duration: 0,
  url: '',
  data: { success: false, message },
});

const requireArg = (value, name) => (value === undefined || value === null || value === '' ? `${name} is required` : null);

const toNum = (v) => (v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : v);

const request = async (endpoint, options = {}) => {
  const url = `${BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  const isLoginEndpoint = /(^|\/)login\.php/.test(endpoint);
  const activeToken = isLoginEndpoint ? '' : getActiveToken();

  if (!isLoginEndpoint) {
    if (!activeToken || isJwtExpired(activeToken)) {
      notifyUnauthorized('Session expired. Please log in again.');
      return { ok: false, status: 401, duration: 0, url, data: { success: false, message: 'Session expired. Please log in again.' } };
    }
  }

  // FormData uploads: let the browser set multipart/form-data with its boundary.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
  };

  const startTime = Date.now();
  try {
    const res = await fetch(url, { ...options, headers });
    const duration = Date.now() - startTime;
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { success: false, message: `Unexpected response from server (HTTP ${res.status}).`, raw: text };
    }
    if (data === null || typeof data !== 'object') {
      data = { success: false, message: 'Empty response from server.' };
    }

    if (res.status === 401 && !isLoginEndpoint) {
      notifyUnauthorized(data.message || 'Session expired. Please log in again.');
    }

    const ok = res.ok && data.success !== false && data.status !== 'error';
    if (!ok) {
      // make `data.success !== false` checks in screens reliable too
      data.success = false;
      if (!data.message) data.message = `Request failed (HTTP ${res.status}).`;
    }
    return { ok, status: res.status, duration, url, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      duration: Date.now() - startTime,
      url,
      data: { success: false, message: 'Could not reach the OneBSS server. Check your internet connection.' },
    };
  }
};

const get = (endpoint) => request(endpoint, { method: 'GET' });
const post = (endpoint, body) =>
  request(endpoint, { method: 'POST', body: body === undefined ? '' : JSON.stringify(body) });
const put = (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body || {}) });
const del = (endpoint, body) =>
  request(endpoint, { method: 'DELETE', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const q = encodeURIComponent;

/** A fresh id for one recharge attempt. */
export const newClientRef = () =>
  `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const tenDigits = (m) => String(m || '').replace(/\D/g, '').slice(-10);

export const OneBssApi = {
  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------
  login: async (username, password) => {
    if (!username || !password) return clientError('Username and password are required.');
    const res = await post('/login.php', { username, password });
    if (res.ok && !res.data?.token) {
      return { ...res, ok: false, data: { success: false, message: 'Login response did not include a token.' } };
    }
    return res;
  },

  // ------------------------------------------------------------------
  // Partners
  // ------------------------------------------------------------------
  // GET /partner.php?role=&status= — server scopes the list to what the caller may see.
  // scope 'direct' = only the caller's own level-1 partners (the main Partners table);
  // default = everyone the caller may see (super admin: all; admin: everyone below it).
  getPartners: async (role = '', status = '', scope = '') => {
    let query = '';
    const params = [];
    if (role) params.push(`role=${q(role)}`);
    if (status) params.push(`status=${q(status)}`);
    if (scope) params.push(`scope=${q(scope)}`);
    if (params.length) query = `?${params.join('&')}`;
    const res = await get(`/partner.php${query}`);
    if (res.ok) {
      const d = res.data?.data;
      return { ...res, data: Array.isArray(d) ? d : d && typeof d === 'object' ? [d] : [] };
    }
    return res;
  },

  // The partners one admin created (its operators and sub-admins) — super admin's admin page.
  getPartnersCreatedBy: async (adminId) => {
    const err = requireArg(adminId, 'admin_id');
    if (err) return clientError(err);
    const res = await get(`/partner.php?created_by=${q(adminId)}`);
    if (res.ok) {
      const d = res.data?.data;
      return { ...res, data: Array.isArray(d) ? d : [] };
    }
    return res;
  },

  getPartnerById: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return get(`/partner.php?id=${q(partnerId)}`);
  },

  createPartner: async (partnerPayload) => post('/partner.php', partnerPayload),

  // updatePartner(id, payload) or updatePartner({ partner_id, ...payload })
  updatePartner: async (partnerIdOrPayload, partnerPayload = null) => {
    let id;
    let payload;
    if (typeof partnerIdOrPayload === 'object' && partnerIdOrPayload !== null) {
      id = partnerIdOrPayload.partner_id || partnerIdOrPayload.id;
      payload = partnerIdOrPayload;
    } else {
      id = partnerIdOrPayload;
      payload = partnerPayload || {};
    }
    const err = requireArg(id, 'partner_id');
    if (err) return clientError(err);
    return put(`/partner.php?id=${q(id)}`, payload);
  },

  // POST /reset_password.php { partner_id, new_password? } -> { new_password, auto_generated }
  // Leave newPassword empty to let the server generate one.
  resetPartnerPassword: async (partnerId, newPassword = '') => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/reset_password.php', { partner_id: toNum(partnerId), new_password: newPassword || '' });
  },

  impersonatePartner: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/impersonate.php', { partner_id: toNum(partnerId) });
  },

  deletePartner: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return del(`/partner.php?id=${q(partnerId)}`);
  },

  // ------------------------------------------------------------------
  // Internet gateway setup
  // ------------------------------------------------------------------
  fetchInternetPartners: async (internetToken, internetBaseUrl) =>
    post('/internet_partners_fetch.php', { internet_token: internetToken, internet_base_url: internetBaseUrl }),

  fetchInternetBranches: async (internetToken, internetBaseUrl, partnerId) =>
    post('/internet_branches_fetch.php', {
      internet_token: internetToken,
      internet_base_url: internetBaseUrl,
      partner_id: toNum(partnerId),
    }),

  // ------------------------------------------------------------------
  // Internet plan catalog
  // ------------------------------------------------------------------
  syncInternetPlans: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post(`/internet_plan_sync.php?partner_id=${q(partnerId)}`);
  },

  getInternetPlans: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return get(`/internet_plan_mapping.php?partner_id=${q(partnerId)}`);
  },

  mapInternetPlansToOperator: async (partnerId, plans = []) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/internet_plan_mapping.php', { partner_id: toNum(partnerId), plans });
  },

  // ------------------------------------------------------------------
  // IPTV plan catalog
  // ------------------------------------------------------------------
  syncIptvPlans: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post(`/iptv_plan_sync.php?partner_id=${q(partnerId)}`);
  },

  getIptvPlans: async (partnerId, type = '') => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return get(`/iptv_plan_mapping.php?partner_id=${q(partnerId)}${type ? `&type=${q(type)}` : ''}`);
  },

  mapIptvPlansToOperator: async (partnerId, plans = []) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/iptv_plan_mapping.php', { partner_id: toNum(partnerId), plans });
  },

  // ------------------------------------------------------------------
  // Combo plans
  // ------------------------------------------------------------------
  getComboPlanOptions: async (partnerId, validity = '') =>
    get(`/combo_plan_options.php?partner_id=${q(partnerId)}${validity ? `&validity=${q(validity)}` : ''}`),

  getComboPlans: async (partnerId, activeOnly = false) =>
    get(`/combo_plans.php?partner_id=${q(partnerId)}${activeOnly ? '&active_only=1' : ''}`),

  getComboPlanDetail: async (comboId) => get(`/combo_plans.php?combo_id=${q(comboId)}`),
  createComboPlan: async (payload) => post('/combo_plans.php', payload),
  updateComboPlan: async (payload) => put('/combo_plans.php', payload),
  deleteComboPlan: async (comboId) => del(`/combo_plans.php?combo_id=${q(comboId)}`),

  // ------------------------------------------------------------------
  // KYC (Aadhaar)
  // ------------------------------------------------------------------
  // GET /kyc_provider_mapping.php?partner_id= -> { success, providers: [...] }
  getKycProviderMapping: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return get(`/kyc_provider_mapping.php?partner_id=${q(partnerId)}`);
  },

  // Alias kept for PartnerScreen
  kycProviders: async (partnerId) => OneBssApi.getKycProviderMapping(partnerId),

  assignKycProviders: async (partnerId, providers = []) =>
    post('/kyc_provider_mapping.php', { partner_id: toNum(partnerId), providers }),

  unassignKycProviders: async (partnerId, providers = []) =>
    del('/kyc_provider_mapping.php', { partner_id: toNum(partnerId), providers }),

  digilockerInitialize: async (operatorId) => post('/digilocker_initialize.php', { operator_id: toNum(operatorId) }),

  digilockerDownloadAadhaar: async (clientId, operatorId, userId = null) => {
    const body = { client_id: clientId, operator_id: toNum(operatorId) };
    if (userId) body.user_id = toNum(userId);
    return post('/digilocker_download_aadhaar.php', body);
  },

  scoremeSendOtp: async (aadhaarNumber, operatorId) => {
    if (!/^\d{12}$/.test(String(aadhaarNumber || ''))) return clientError('Enter the 12-digit Aadhaar number.');
    return post('/scoreme_send_otp.php', { aadhaar_number: String(aadhaarNumber), operator_id: toNum(operatorId) });
  },

  scoremeVerifyOtp: async (aadhaarNumber, otp, operatorId, userId = null) => {
    if (!otp) return clientError('OTP is required.');
    const body = { aadhaar_number: String(aadhaarNumber), otp: String(otp), operator_id: toNum(operatorId) };
    if (userId) body.user_id = toNum(userId);
    return post('/scoreme_verify_otp.php', body);
  },

  // ------------------------------------------------------------------
  // Customers
  // ------------------------------------------------------------------
  addInternetCustomer: async (customerPayload) => post('/add_internet_customer.php', customerPayload),

  // FormData (files) — sent as multipart
  addInternetCustomerManual: async (formData) =>
    request('/add_internet_customer_manual.php', { method: 'POST', body: formData }),

  syncInternetCustomersBulk: async (partnerId) =>
    post(partnerId ? `/internet_customer_sync.php?partner_id=${q(partnerId)}` : '/internet_customer_sync.php'),

  syncInternetCustomerDetail: async (internetId) => {
    const numericId = String(internetId || '').replace(/^[^\d]+/, '');
    if (!numericId) return clientError('internet_id is required');
    return post(`/internet_customer_detail_sync.php?internet_id=${q(numericId)}`);
  },

  syncIptvCustomers: async (mobile) => {
    const clean = tenDigits(mobile);
    if (clean.length !== 10) return clientError('A 10-digit mobile number is required.');
    return post('/iptv_customer_sync.php', { mobile: clean });
  },

  checkInternetUsername: async (username, operatorId) =>
    get(`/check_internet_username.php?username=${q(username)}&operator_id=${q(operatorId)}`),

  // ------------------------------------------------------------------
  // OTT (OTTAggre)
  // ------------------------------------------------------------------
  syncOttPlans: async (partnerId) => post('/ott_plan_sync.php', { partner_id: toNum(partnerId) }),
  getOttPlanMapping: async (partnerId) => get(`/ott_plan_mapping.php?partner_id=${q(partnerId)}`),
  // plans: [{ ott_sub_plan_id, price? }] — full replace
  assignOttPlans: async (partnerId, plans = []) => post('/ott_plan_mapping.php', { partner_id: toNum(partnerId), plans }),
  getOttWalletBalance: async (partnerId) => get(`/ott_wallet_balance.php?partner_id=${q(partnerId)}`),
  getOttRegisterPrefill: async (custId, partnerId) =>
    get(`/ott_add_customer.php?cust_id=${q(custId)}${partnerId ? `&partner_id=${q(partnerId)}` : ''}`),
  // { cust_id, partner_id?, first_name, last_name, email, dob, state, gender }
  addOttCustomer: async (body) => post('/ott_add_customer.php', body),
  syncOttCustomer: async (mobile) => {
    const m = tenDigits(mobile);
    if (m.length !== 10) return clientError('A 10-digit mobile number is required.');
    return post('/ott_customer_sync.php', { mobile: m });
  },
  getOttRechargePlans: async (ottId) => get(`/ott_recharge_plans.php?ott_id=${q(ottId)}`),
  rechargeOtt: async (ottId, subPlanId, clientRef) =>
    post('/ott_recharge.php', { ott_id: toNum(ottId), sub_plan_id: toNum(subPlanId), ...(clientRef ? { client_ref: clientRef } : {}) }),
  deactivateOtt: async (ottId) => post('/ott_deactivate.php', { ott_id: toNum(ottId) }),

  // One customer by its OneBSS id (works on a page reload, when only the id from the URL is known).
  customerLookupById: async (custId) => get(`/customer_lookup.php?cust_id=${q(custId)}`),

  // customer_lookup.php is keyed by mobile. For a cust_id / username we resolve the
  // mobile via the (server-scoped) customers list search first.
  customerLookup: async (query) => {
    const s = String(query || '').trim();
    if (!s) return clientError('Enter a mobile number, customer ID or username.');
    if (/^\d{10}$/.test(s)) return get(`/customer_lookup.php?mobile=${q(s)}`);

    const listRes = await OneBssApi.getCustomersList(1, 20, '', s);
    if (!listRes.ok) return listRes;
    const rows = listRes.data?.data || listRes.data?.customers || [];
    const found = (Array.isArray(rows) ? rows : []).find(
      (r) =>
        String(r.cust_id) === s ||
        String(r.id) === s ||
        String(r.username || '').toLowerCase() === s.toLowerCase()
    );
    const m = tenDigits(found?.mobile);
    if (m.length === 10) return get(`/customer_lookup.php?mobile=${q(m)}`);
    return { ok: true, status: 200, duration: 0, url: '', data: { success: true, data: [], message: 'No matching customer found.' } };
  },

  // customers_list.php — filtering, search, sorting and paging are server-side.
  //   extra: { status, partner_id, sort, dir, range }
  getCustomersList: async (page = 1, limit = 100, type = '', search = '', extra = {}) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (type) params.set('type', type);
    if (search && String(search).trim()) params.set('search', String(search).trim());
    Object.entries(extra || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && !(k === 'status' && v === 'all')) params.set(k, String(v));
    });
    const endpoint = extra && extra.range ? '/customers_by_date.php' : '/customers_list.php';
    return get(`${endpoint}?${params.toString()}`);
  },

  getCustomersByDateSummary: async (partnerId) =>
    get(`/customers_by_date.php?summary=1${partnerId ? `&partner_id=${q(partnerId)}` : ''}`),

  // Edits the OneBSS customer profile only (name, mobile, email, addresses).
  // Plans / status / STB details are owned by RADIUS & Pioneer — change them via
  // recharge, suspend or sync, not here.
  updateCustomerProfile: async ({ cust_id, ...fields }) => {
    const err = requireArg(cust_id, 'cust_id');
    if (err) return clientError('This subscriber has no OneBSS customer record yet. Sync the account first.');
    return post('/update_customer_profile.php', { cust_id: toNum(cust_id), ...fields });
  },

  // ------------------------------------------------------------------
  // Wallet
  // ------------------------------------------------------------------
  getWallet: async (partnerId, page = 1, limit = 20) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return get(`/wallet.php?partner_id=${q(partnerId)}&page=${page}&limit=${limit}`);
  },

  topupWallet: async (partnerId, amount, remark = 'Wallet top-up') => {
    const amt = Number(amount);
    if (!(amt > 0)) return clientError('Enter an amount greater than 0.');
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/wallet_credit_debit.php', { partner_id: toNum(partnerId), amount: amt, type: 'credit', remark: String(remark || 'Wallet top-up') });
  },

  debitWallet: async (partnerId, amount, remark = 'Wallet debit') => {
    const amt = Number(amount);
    if (!(amt > 0)) return clientError('Enter an amount greater than 0.');
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post('/wallet_credit_debit.php', { partner_id: toNum(partnerId), amount: amt, type: 'debit', remark: String(remark || 'Wallet debit') });
  },

  // ------------------------------------------------------------------
  // Recharge
  // ------------------------------------------------------------------
  // Same endpoint for Recharge and Advance Renewal. Errors (402 low wallet,
  // 409 in progress, 429 rate limit, 502 gateway failure + refund) come back as-is.
  // clientRef: one id per attempt (newClientRef()). The server never charges the same ref
  // twice, and getRechargeStatus() can find out what happened if the response is lost.
  rechargeInternetAccount: async (internetId, packageId, subPlanId, clientRef) =>
    post('/internet_recharge.php', {
      internet_id: toNum(internetId),
      package_id: toNum(packageId),
      sub_plan_id: toNum(subPlanId),
      ...(clientRef ? { client_ref: clientRef } : {}),
    }),

  // subPlanIds: exactly one DPO + any Broadcaster / A-la-carte sub_plan_ids.
  rechargeIptvAccount: async (iptvId, subPlanIds, clientRef) =>
    post('/iptv_recharge.php', {
      iptv_id: toNum(iptvId),
      sub_plan_ids: (subPlanIds || []).map(toNum),
      ...(clientRef ? { client_ref: clientRef } : {}),
    }),

  // Combo: one internet account + one STB of the same customer, renewed with a combo plan
  // plus optional Broadcaster / A-la-carte add-ons.
  getComboRechargeOptions: async (internetId, iptvId) =>
    get(`/combo_recharge_options.php?internet_id=${q(internetId)}&iptv_id=${q(iptvId)}`),

  // -> 200 success | 207 partial (internet renewed, IPTV not) | 202 pending | 4xx/5xx
  rechargeCombo: async ({ internetId, iptvId, comboId, addonSubPlanIds = [], clientRef }) =>
    post('/combo_recharge.php', {
      internet_id: toNum(internetId),
      iptv_id: toNum(iptvId),
      combo_id: toNum(comboId),
      addon_sub_plan_ids: (addonSubPlanIds || []).map(toNum),
      ...(clientRef ? { client_ref: clientRef } : {}),
    }),

  // -> { state: 'completed' | 'in_progress' | 'not_found', new_expiry_date }
  //    kind 'combo' (id = internet_id) can also answer 'internet_only'
  getRechargeStatus: async (kind, id, clientRef) =>
    get(`/recharge_status.php?kind=${q(kind)}&id=${q(id)}&client_ref=${q(clientRef)}`),

  // A recharge that did not go through (wallet already debited): checks the provider's
  // current expiry and, only if the account did not renew, sends the same renewal again.
  recheckRecharge: async (logId) => post('/recharge_recheck.php', { log_id: toNum(logId) }),

  // Customer prices of an operator (customer_prices.php): one price per package for all customers.
  getCustomerPrices: async (partnerId) => get(`/customer_prices.php${partnerId ? `?partner_id=${q(partnerId)}` : ''}`),
  // items: [{ service: 'internet'|'iptv'|'combo', ref_id, customer_price | null }]
  saveCustomerPrices: async (partnerId, items = []) =>
    post('/customer_prices.php', { ...(partnerId ? { partner_id: toNum(partnerId) } : {}), items }),
  // Online recharge on/off for one customer of an operator (customer_online_access.php)
  setCustomerOnlineAccess: async (custId, partnerId, enabled) =>
    post('/customer_online_access.php', { cust_id: toNum(custId), partner_id: toNum(partnerId), enabled: !!enabled }),

  getRechargeHistory: async (page = 1, limit = 50) => get(`/recharge_history.php?page=${page}&limit=${limit}`),

  // ------------------------------------------------------------------
  // IPTV
  // ------------------------------------------------------------------
  syncIptvBulkCustomers: async (partnerId) => {
    const err = requireArg(partnerId, 'partner_id');
    if (err) return clientError(err);
    return post(`/iptv_bulk_customer_sync.php?partner_id=${q(partnerId)}`);
  },

  getIptvRechargePlans: async (iptvId) => get(`/iptv_recharge_plans.php?iptv_id=${q(iptvId)}`),

  syncIptvBranches: async (partnerId, key = '') =>
    post('/iptv_branch_sync.php', { partner_id: toNum(partnerId), key: String(key || '') }),

  getIptvBranchMapping: async (partnerId) => get(`/iptv_branch_mapping.php?partner_id=${q(partnerId)}`),

  assignIptvBranchMapping: async (partnerId, branchIds = []) =>
    post('/iptv_branch_mapping.php', { partner_id: toNum(partnerId), branch_ids: (branchIds || []).map(toNum) }),

  addIptvCustomer: async (payload) => post('/iptv_add_customer.php', payload),

  // ------------------------------------------------------------------
  // Per-account internet actions
  // ------------------------------------------------------------------
  viewInternetPassword: async (internetId) => get(`/internet_view_password.php?internet_id=${q(internetId)}`),

  changeInternetPassword: async (internetId, password) =>
    post('/internet_change_password.php', { internet_id: toNum(internetId), password }),

  getInternetMacBindings: async (internetId) => get(`/internet_get_mac_bindings.php?internet_id=${q(internetId)}`),

  removeInternetMacBinding: async (internetId, bindingId) =>
    post('/internet_remove_mac_binding.php', { internet_id: toNum(internetId), binding_id: toNum(bindingId) }),

  // dates: 'YYYY-MM-DD'
  getInternetAuthLogs: async (internetId) => get(`/internet_auth_logs.php?internet_id=${q(internetId)}`),
  getInternetSessionHistory: async (internetId, startDate, endDate) =>
    get(`/internet_session_history.php?internet_id=${q(internetId)}&start_date=${q(startDate)}&end_date=${q(endDate)}`),

  verifyInternetCustomer: async (internetId) =>
    post('/internet_change_verification.php', { internet_id: toNum(internetId) }),

  // ------------------------------------------------------------------
  // Customer location
  // ------------------------------------------------------------------
  getCustomerLocation: async (mobile) => {
    const m = tenDigits(mobile);
    if (m.length !== 10) return clientError('Invalid mobile number');
    return get(`/customer_location.php?mobile=${q(m)}`);
  },

  saveCustomerLocation: async (mobile, latitude, longitude) => {
    const m = tenDigits(mobile);
    if (m.length !== 10) return clientError('Invalid mobile number');
    return post('/customer_location.php', { mobile: m, latitude: Number(latitude), longitude: Number(longitude) });
  },

  // ------------------------------------------------------------------
  // OLT / NMS
  // ------------------------------------------------------------------
  // sync=true asks the NMS to read the OLT live (slower) instead of its cached copy
  getOnuDetails: async (internetId, sync = false) => {
    const err = requireArg(internetId, 'internet_id');
    if (err) return clientError(err);
    return get(`/olt/internet_get_onu_details.php?internet_id=${q(internetId)}${sync ? '&sync=true' : ''}`);
  },

  getNmsDevices: async (operatorPhone = '') => {
    const p = tenDigits(operatorPhone);
    return get(`/olt/nms_get_devices.php${p ? `?operator_phone=${q(p)}` : ''}`);
  },

  syncNmsDevice: async (deviceId, force = false) => {
    const err = requireArg(deviceId, 'device_id');
    if (err) return clientError(err);
    return post('/olt/nms_device_sync.php', { device_id: toNum(deviceId), force: Boolean(force) });
  },

  getNmsDeviceTerminal: async (deviceId, operatorPhone = '') => {
    const err = requireArg(deviceId, 'device_id');
    if (err) return clientError(err);
    const payload = { device_id: toNum(deviceId) };
    const p = tenDigits(operatorPhone);
    if (p) payload.operator_phone = p;
    return post('/olt/nms_device_terminal.php', payload);
  },

  getNmsDeviceWebUrl: async (deviceId, operatorPhone = '') => {
    const err = requireArg(deviceId, 'device_id');
    if (err) return clientError(err);
    const payload = { device_id: toNum(deviceId) };
    const p = tenDigits(operatorPhone);
    if (p) payload.operator_phone = p;
    return post('/olt/nms_device_web_url.php', payload);
  },

  // ------------------------------------------------------------------
  // Dashboard — partnerId is optional (omit for the caller's own scope).
  // ------------------------------------------------------------------
  getDashboard: async (partnerId) => get(`/dashboard.php${partnerId ? `?partner_id=${q(partnerId)}` : ''}`),
};
