// Staff logins (office_staff): the app shows a staff member only what their role allows.
// The server checks the same permissions on every request (staff_permissions.php) — this file
// only hides pages and buttons that would be refused anyway.
//
// user.staff = { staff_id, staff_name, role_name, permissions: { "<key>": ["view","add",...] | ["allow"] } }
// A partner login (no user.staff) can do everything its partner role allows: can() is always true.

export const isStaffUser = (user) => !!(user && user.staff && user.staff.staff_id);

/** can(user, 'internet.recharge') / can(user, 'partners.list', 'add') */
export const can = (user, key, action = 'allow') => {
  if (!isStaffUser(user)) return true;
  const acts = (user.staff.permissions || {})[key];
  return Array.isArray(acts) && acts.includes(action);
};

export const canAny = (user, pairs) => pairs.some(([k, a]) => can(user, k, a || 'allow'));

// sidebar pages -> what a staff member needs to open them
const TAB_NEEDS = {
  dashboard: [['dashboard.view', 'allow']],
  customers: [['internet.customers', 'view']],
  subscribers: [['internet.customers', 'view'], ['iptv.customers', 'view'], ['ott.customers', 'view']], // the sidebar group
  iptv_customers: [['iptv.customers', 'view']],
  ott_customers: [['ott.customers', 'view']],
  partners: [['partners.list', 'view'], ['partners.wallet', 'allow'], ['partners.plans', 'allow']],
  customer_prices: [['prices.customer', 'view']],
  inventory: [['inventory.devices', 'view']],
  wallet: [['wallet.view', 'allow']],
  networking: [['networking.nas', 'view']],
  nas: [['networking.nas', 'view']],
  ip_pools: [['networking.nas', 'view']],
  dhcp_devices: [['networking.dhcp', 'view']],
  iptv_renewals: [['iptv.renewals', 'view']],
  payu_payments: [['payments.online', 'view']],
  staff: [['staff.manage', 'view']],
};

export const tabAllowed = (user, tab) => {
  if (!isStaffUser(user)) return true;
  if (tab === 'activity') return true; // everyone sees their own activity
  const need = TAB_NEEDS[tab];
  return need ? canAny(user, need) : false;
};

const TAB_ORDER = ['dashboard', 'customers', 'iptv_customers', 'ott_customers', 'partners', 'wallet', 'customer_prices', 'inventory', 'nas', 'dhcp_devices', 'iptv_renewals', 'payu_payments', 'staff', 'activity'];

/** Where a staff member lands (null = nothing allowed). */
export const firstAllowedTab = (user) => TAB_ORDER.find((t) => tabAllowed(user, t)) || null;

/** The Subscribers page of a staff member without Internet access opens on IPTV / OTT instead. */
export const customersTabFor = (user) => {
  if (can(user, 'internet.customers', 'view')) return 'customers';
  if (can(user, 'iptv.customers', 'view')) return 'iptv_customers';
  if (can(user, 'ott.customers', 'view')) return 'ott_customers';
  return 'customers';
};
