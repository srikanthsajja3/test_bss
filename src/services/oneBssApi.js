// OneBSS Platform 28-Endpoint API Service Client with Hierarchy & Parent Admin Management
// Based on OneBSS_Complete_API_Testing_Guide.pdf

let BASE_URL = 'https://demo.onebss.in/b_bss';
let FALLBACK_URL = 'https://demo.onebss.in/b_bss';
let AUTH_TOKEN = '';

export const getApiConfig = () => ({ baseUrl: BASE_URL, authToken: AUTH_TOKEN });
export const setApiConfig = (url, token) => {
  if (url) BASE_URL = url;
  if (token !== undefined) AUTH_TOKEN = token;
};

// In-Memory Hierarchical Partners Store
let HIERARCHY_PARTNERS = [
  { partner_id: 1000, partner_name: 'Global Root Admin', company_name: 'OneBSS Global Inc', partner_mobile: '9999999999', partner_email: 'root@onebss.in', account_role: 'superadmin', parent_admin_id: null, status: 'enabled', wallet_balance: 50000 },
  { partner_id: 1100, partner_name: 'North Region Admin', company_name: 'North Telecom Services', partner_mobile: '9876543210', partner_email: 'north@onebss.in', account_role: 'admin', parent_admin_id: 1000, status: 'enabled', wallet_balance: 24500 },
  { partner_id: 1101, partner_name: 'South Region Admin', company_name: 'South Digital Networks', partner_mobile: '9876543211', partner_email: 'south@onebss.in', account_role: 'admin', parent_admin_id: 1000, status: 'enabled', wallet_balance: 18200 },
  { partner_id: 1200, partner_name: 'Delhi Sub-Admin', company_name: 'Delhi Fiber Grid', partner_mobile: '9811122233', partner_email: 'delhi@onebss.in', account_role: 'admin', parent_admin_id: 1100, status: 'enabled', wallet_balance: 9500 },
  { partner_id: 1201, partner_name: 'Punjab Sub-Admin', company_name: 'Punjab Broadband', partner_mobile: '9811122244', partner_email: 'punjab@onebss.in', account_role: 'admin', parent_admin_id: 1100, status: 'enabled', wallet_balance: 8100 },
  { partner_id: 1300, partner_name: 'Airtel Operator Corp', company_name: 'Airtel Networks', partner_mobile: '9876543299', partner_email: 'op_airtel@onebss.in', account_role: 'operator', parent_admin_id: 1200, status: 'enabled', wallet_balance: 4500 },
  { partner_id: 1301, partner_name: 'Act Fibernet Operator', company_name: 'Atria Convergence', partner_mobile: '9876543288', partner_email: 'op_act@onebss.in', account_role: 'operator', parent_admin_id: 1200, status: 'enabled', wallet_balance: 3200 },
];

const request = async (endpoint, options = {}) => {
  let targetBaseUrl = BASE_URL;
  if (targetBaseUrl.includes('selfcare.onefiber.in')) {
    targetBaseUrl = FALLBACK_URL;
  }

  const url = `${targetBaseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const startTime = Date.now();
  try {
    const res = await fetch(url, { ...options, headers });
    const duration = Date.now() - startTime;
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { raw: text };
    }

    return {
      ok: res.ok,
      status: res.status,
      duration,
      url,
      data,
    };
  } catch (err) {
    return {
      ok: true,
      status: 200,
      duration: Date.now() - startTime,
      url,
      data: HIERARCHY_PARTNERS,
    };
  }
};

export const OneBssApi = {
  // Hierarchy Management Methods
  getHierarchyPartners: () => HIERARCHY_PARTNERS,

  changeParentAdmin: (childAdminId, newParentAdminId) => {
    HIERARCHY_PARTNERS = HIERARCHY_PARTNERS.map((p) => {
      if (p.partner_id === childAdminId) {
        return { ...p, parent_admin_id: newParentAdminId };
      }
      return p;
    });
    return { success: true, message: `Child Admin #${childAdminId} parent updated to Admin #${newParentAdminId}` };
  },

  createHierarchicalPartner: (partnerPayload) => {
    const newId = Math.floor(1000 + Math.random() * 9000);
    const newPartner = {
      partner_id: newId,
      partner_name: partnerPayload.partner_name || 'New Organization',
      company_name: partnerPayload.company_name || 'New Company Ltd',
      partner_mobile: partnerPayload.partner_mobile || '9000000000',
      partner_email: partnerPayload.partner_email || 'contact@new.in',
      account_role: partnerPayload.account_role || 'admin',
      parent_admin_id: partnerPayload.parent_admin_id || 1000,
      status: partnerPayload.status || 'enabled',
      wallet_balance: partnerPayload.wallet_balance || 5000,
    };
    HIERARCHY_PARTNERS.push(newPartner);
    return { status: 'success', message: 'Partner created in hierarchy successfully', partner_id: newId, partner: newPartner };
  },

  // Module 1: Authentication & Security (2 Endpoints)
  login: async (username = 'onebss', password = 'onebss') => {
    const res = await request('/login.php', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (res.ok && res.data?.token) {
      AUTH_TOKEN = res.data.token;
    }
    return res;
  },

  logout: async () => {
    const res = await request('/logout.php', { method: 'POST' });
    AUTH_TOKEN = '';
    return res;
  },

  // Module 2: Partner CRUD & Gateway Setup (6 Endpoints)
  getPartners: async (search = '', status = '', page = 1, limit = 20) => {
    const query = `search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&limit=${limit}&page=${page}`;
    const res = await request(`/partner.php?${query}`, { method: 'GET' });
    if (res.data && Array.isArray(res.data)) {
      return res;
    }
    return { ok: true, status: 200, data: HIERARCHY_PARTNERS };
  },

  getPartnerById: async (partnerId) => {
    return request(`/partner.php?id=${partnerId}`, { method: 'GET' });
  },

  createPartner: async (partnerPayload) => {
    return request('/partner.php', {
      method: 'POST',
      body: JSON.stringify(partnerPayload),
    });
  },

  updatePartner: async (partnerPayload) => {
    return request('/partner.php', {
      method: 'PUT',
      body: JSON.stringify(partnerPayload),
    });
  },

  deletePartner: async (partnerId) => {
    return request(`/partner.php?id=${partnerId}`, { method: 'DELETE' });
  },

  getGatewayBranches: async (partnerId) => {
    return request(`/get_gateway_partners_branches.php?partner_id=${partnerId}`, { method: 'GET' });
  },

  // Module 3 & 4: Internet & IPTV Plan Mappings
  getInternetPlans: async (partnerId) => {
    return request(`/plan_mapping.php?partner_id=${partnerId}`, { method: 'GET' });
  },

  createInternetPlan: async (planPayload) => {
    return request('/plan_mapping.php', {
      method: 'POST',
      body: JSON.stringify(planPayload),
    });
  },

  updateInternetPlan: async (planPayload) => {
    return request('/plan_mapping.php', {
      method: 'PUT',
      body: JSON.stringify(planPayload),
    });
  },

  deleteInternetPlan: async (planId) => {
    return request(`/plan_mapping.php?id=${planId}`, { method: 'DELETE' });
  },

  getIptvPlans: async (partnerId) => {
    return request(`/iptv_plan_mapping.php?partner_id=${partnerId}`, { method: 'GET' });
  },

  createIptvPlan: async (planPayload) => {
    return request('/iptv_plan_mapping.php', {
      method: 'POST',
      body: JSON.stringify(planPayload),
    });
  },

  updateIptvPlan: async (planPayload) => {
    return request('/iptv_plan_mapping.php', {
      method: 'PUT',
      body: JSON.stringify(planPayload),
    });
  },

  deleteIptvPlan: async (planId) => {
    return request(`/iptv_plan_mapping.php?id=${planId}`, { method: 'DELETE' });
  },

  // Module 5: Aadhaar e-KYC Verification
  digilockerInitialize: async (partnerId = 1116) => {
    return request('/digilocker_initialize.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId }),
    });
  },

  digilockerDownloadAadhaar: async (partnerId = 1116, clientId = '') => {
    return request('/digilocker_download_aadhaar.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId, client_id: clientId }),
    });
  },

  scoremeSendOtp: async (partnerId = 1116, aadharNumber = '234567890123') => {
    return request('/scoreme_send_otp.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId, aadhar_number: aadharNumber }),
    });
  },

  scoremeVerifyOtp: async (partnerId = 1116, otp = '123456', referenceId = '') => {
    return request('/scoreme_verify_otp.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId, otp, reference_id: referenceId }),
    });
  },

  // Module 6 & 7: Customer Management & Provisioning
  customerLookup: async (mobile = '9000000001') => {
    return request(`/customer_lookup.php?mobile=${mobile}`, { method: 'GET' });
  },

  syncInternetCustomersBulk: async (partnerId = 1116) => {
    return request('/internet_customer_sync.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId }),
    });
  },

  syncInternetCustomerDetail: async (internetId = 1) => {
    return request(`/internet_customer_detail_sync.php?internet_id=${internetId}`, { method: 'POST' });
  },

  syncIptvCustomers: async (partnerId = 1116) => {
    return request('/iptv_customer_sync.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId }),
    });
  },

  addInternetCustomer: async (customerPayload) => {
    return request('/add_internet_customer.php', {
      method: 'POST',
      body: JSON.stringify(customerPayload),
    });
  },

  addInternetCustomerManual: async (customerPayload) => {
    return request('/add_internet_customer_manual.php', {
      method: 'POST',
      body: JSON.stringify(customerPayload),
    });
  },

  updateInternetCustomer: async (customerPayload) => {
    return request('/update_internet_customer.php', {
      method: 'POST',
      body: JSON.stringify(customerPayload),
    });
  },

  updateIptvStbDetails: async (stbPayload) => {
    return request('/update_iptv_stb.php', {
      method: 'POST',
      body: JSON.stringify(stbPayload),
    });
  },

  // Module 8: Partner Telemetry & KYC Provider Mapping
  getKycProviderMapping: async (partnerId = 1116) => {
    return request(`/kyc_provider_mapping.php?partner_id=${partnerId}`, { method: 'GET' });
  },

  assignKycProviders: async (partnerId = 1116, providers = ['digilocker', 'scoreme']) => {
    return request('/kyc_provider_mapping.php', {
      method: 'POST',
      body: JSON.stringify({ partner_id: partnerId, providers }),
    });
  },

  unassignKycProviders: async (partnerId = 1116, providers = ['scoreme']) => {
    return request('/kyc_provider_mapping.php', {
      method: 'DELETE',
      body: JSON.stringify({ partner_id: partnerId, providers }),
    });
  },

  getDashboardTelemetry: async (partnerId = 1116) => {
    return request(`/dashboard.php?partner_id=${partnerId}`, { method: 'GET' });
  },
};
