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
  partners: [['partners.list', 'view'], ['partners.wallet_credit', 'allow'], ['partners.wallet_debit', 'allow'], ['partners.wallet_type', 'allow'], ['partners.plans', 'allow'], ['partners.branches', 'allow'], ['partners.kyc', 'allow'], ['partners.gateways', 'allow']],
  customer_prices: [['prices.customer', 'view']],
  inventory: [['inventory.devices', 'view'], ['inventory.inward', 'view'], ['inventory.catalog', 'view']],
  inventory_inward: [['inventory.inward', 'view']],
  inventory_devices: [['inventory.devices', 'view']],
  inventory_catalog: [['inventory.catalog', 'view']],
  wallet: [['wallet.view', 'allow']],
  networking: [['networking.nas', 'view'], ['networking.ip_pools', 'view'], ['networking.auth_logs', 'allow']], // Networking is in the super admin's menu only
  auth_logs: [['networking.auth_logs', 'allow']],
  complaints: [['support.complaints', 'view']],
  backups: [['system.backups', 'view']],
  leads: [['support.leads', 'view']],
  nas: [['networking.nas', 'view']],
  ip_pools: [['networking.ip_pools', 'view']],
  dhcp_devices: [['networking.dhcp', 'view']],
  iptv_renewals: [['iptv.renewals', 'view']],
  payu_payments: [['payments.online', 'view'], ['partners.provider_sync', 'view']],
  staff: [['staff.users', 'view'], ['staff.roles', 'view']],
};

const isSuperRole = (user) => String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') === 'superadmin';
// pages only the super admin (and its staff) may open
const SUPER_ONLY_TABS = ['auth_logs'];

export const tabAllowed = (user, tab) => {
  if (SUPER_ONLY_TABS.includes(tab) && !isSuperRole(user)) return false;
  if (!isStaffUser(user)) return true;
  if (tab === 'activity') return true; // everyone sees their own activity
  const need = TAB_NEEDS[tab];
  return need ? canAny(user, need) : false;
};

const TAB_ORDER = ['dashboard', 'customers', 'iptv_customers', 'ott_customers', 'partners', 'wallet', 'customer_prices', 'inventory', 'inventory_inward', 'inventory_devices', 'inventory_catalog', 'complaints', 'leads', 'nas', 'auth_logs', 'dhcp_devices', 'iptv_renewals', 'payu_payments', 'backups', 'staff', 'activity'];

/**
 * The Inventory page to open: the super admin (and super admin staff) gets Inward Stock,
 * Devices Stock or Vendors & Models — the first one their role allows; everyone else has
 * only their own devices.
 */
export const inventoryHome = (user, isSuper) => {
  if (!isSuper) return 'inventory_devices';
  return ['inventory_inward', 'inventory_devices', 'inventory_catalog'].find((t) => tabAllowed(user, t)) || 'inventory_devices';
};

/** Where a staff member lands (null = nothing allowed). */
export const firstAllowedTab = (user) => TAB_ORDER.find((t) => tabAllowed(user, t)) || null;

/** The Subscribers page of a staff member without Internet access opens on IPTV / OTT instead. */
export const customersTabFor = (user) => {
  if (can(user, 'internet.customers', 'view')) return 'customers';
  if (can(user, 'iptv.customers', 'view')) return 'iptv_customers';
  if (can(user, 'ott.customers', 'view')) return 'ott_customers';
  return 'customers';
};
