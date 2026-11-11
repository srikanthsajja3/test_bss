// must stay first: gives Android / iOS a stand-in window.location / history so web-only code can't crash
import './src/utils/browserPolyfill';
import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, useWindowDimensions, Text, TouchableOpacity, Platform } from 'react-native';
import { COLORS } from './src/constants/theme';
import { setApiConfig, onUnauthorized, isJwtExpired, clearStoredSession, OneBssApi } from './src/services/oneBssApi';
import { Sidebar } from './src/components/Sidebar';
import { Header } from './src/components/Header';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PartnerScreen } from './src/screens/PartnerScreen';
import { CustomerPricesPage } from './src/components/plans/CustomerPricesPage';
import { CustomerScreen } from './src/screens/CustomerScreen';
import { OttSubscribersScreen } from './src/screens/OttSubscribersScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { DhcpDevicesScreen } from './src/screens/DhcpDevicesScreen';
import { IptvRenewalsScreen } from './src/screens/IptvRenewalsScreen';
import { PayuPaymentsScreen } from './src/screens/PayuPaymentsScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { NasScreen } from './src/screens/NasScreen';
import { IpPoolsScreen } from './src/screens/IpPoolsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { StaffScreen } from './src/screens/StaffScreen';
import { ActivityLogScreen } from './src/screens/ActivityLogScreen';
import { isStaffUser, tabAllowed, firstAllowedTab } from './src/services/staffAccess';
import { ToastContainer, toast } from 'react-toastify';
import { createPortal } from 'react-dom';

// react-native-web renders <Modal> in a portal on <body> (z-index 9999), while every RN View
// is `position:relative; z-index:0` — a stacking context the toasts can't escape from inside
// the app tree. So toasts were drawn BEHIND open modals. Render the toast container in its
// own portal on <body>, above everything.
const TOAST_CONTAINER_STYLE = { zIndex: 2147483647 };
const ToastHost = () => {
  if (Platform.OS !== 'web') return null;
  const toasts = <ToastContainer position="top-right" autoClose={3500} theme="colored" style={TOAST_CONTAINER_STYLE} />;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(toasts, document.body);
  }
  return toasts;
};

// A crash in any screen shows a message with Retry instead of a blank page.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 12 }}>OneBSS Platform</Text>
          <Text style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected error occurred while starting the application.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ backgroundColor: '#0284c7', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Parse initial tab & filter from URL hash or localStorage on page reload
  const getInitialNavigationState = () => {
    try {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash) {
          const [routePart] = hash.split('&');
          const [rawTab, rawFilter] = routePart.split('?filter=');
          const tab = rawTab ? rawTab.split('?')[0] : '';
          if (['dashboard', 'partners', 'customers', 'iptv_customers', 'ott_customers', 'customer_prices', 'inventory', 'dhcp_devices', 'iptv_renewals', 'payu_payments', 'wallet', 'nas', 'ip_pools', 'staff', 'activity'].includes(tab)) {
            const filter = rawFilter ? rawFilter.split('?')[0].split('&')[0] : 'all';
            const rangeMatch = hash.match(/[?&]range=([a-z0-9_]+)/);
            return { tab, filter, range: rangeMatch ? rangeMatch[1] : '' };
          }
        }
        const savedTab = localStorage.getItem('onebss_active_tab');
        const savedFilter = localStorage.getItem('onebss_filter');
        if (savedTab && ['dashboard', 'partners', 'customers', 'iptv_customers', 'ott_customers', 'customer_prices', 'inventory', 'dhcp_devices', 'iptv_renewals', 'payu_payments', 'wallet', 'nas', 'ip_pools', 'staff', 'activity'].includes(savedTab)) {
          return { tab: savedTab, filter: savedFilter || 'all', range: '' };
        }
      }
    } catch (e) {}
    return { tab: 'dashboard', filter: 'all', range: '' };
  };

  // Parse initial user role persona from localStorage on page reload
  const getInitialUserState = () => {
    try {
      if (typeof window !== 'undefined') {
        const savedUser = localStorage.getItem('onebss_user');
        const savedToken = localStorage.getItem('onebss_token');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && (parsed.role || parsed.partner_id)) {
            const token = parsed.token || savedToken;
            if (token) {
              if (isJwtExpired(token)) {
                localStorage.removeItem('onebss_user');
                localStorage.removeItem('onebss_token');
                setApiConfig(undefined, '');
                return null;
              }
              parsed.token = token;
              setApiConfig(undefined, token);
            }
            return parsed;
          }
        }
      }
    } catch (e) {}
    return null;
  };

  const initialNav = getInitialNavigationState();
  const [activeTab, setActiveTabState] = useState(initialNav.tab);
  const [customerInitialFilter, setCustomerInitialFilter] = useState(initialNav.filter);
  const [customerInitialRange, setCustomerInitialRange] = useState(initialNav.range || ''); // expiry / registration range
  const [customerInitialSearch, setCustomerInitialSearch] = useState('');
  const [globalRefreshKey, setGlobalRefreshKey] = useState(0);
  const [user, setUserState] = useState(getInitialUserState());
  const [partnerCreateRole, setPartnerCreateRole] = useState(null);
  const [partnerInitialRole, setPartnerInitialRole] = useState('');

  // Back from Razorpay or PayU checkout (sends the browser to #razorpay=<txnid> or #payu=<txnid>), or
  // the Wallet page reloaded right after leaving (browser Back): the Wallet page checks that
  // payment — success goes to the dashboard, anything else is shown on the Wallet page.
  const [onlineResume, setOnlineResume] = useState(() => {
    try {
      if (typeof window === 'undefined') return null;
      const mRzp = window.location.hash.match(/^#razorpay=([A-Za-z0-9_-]{6,50})/);
      if (mRzp) return { txnid: mRzp[1], gateway: 'razorpay' };
      const mPayu = window.location.hash.match(/^#payu=([A-Za-z0-9]{6,40})/);
      if (mPayu) return { txnid: mPayu[1], gateway: 'payu' };
      if (/^#wallet/.test(window.location.hash)) {
        const rawRzp = localStorage.getItem('onebss_pending_razorpay_txn');
        const pendingRzp = rawRzp ? JSON.parse(rawRzp) : null;
        if (pendingRzp?.txnid && Date.now() - Number(pendingRzp.at || 0) < 30 * 60 * 1000) {
          return { txnid: pendingRzp.txnid, gateway: 'razorpay' };
        }
        const rawPayu = localStorage.getItem('onebss_pending_payu_txn');
        const pendingPayu = rawPayu ? JSON.parse(rawPayu) : null;
        if (pendingPayu?.txnid && Date.now() - Number(pendingPayu.at || 0) < 30 * 60 * 1000) {
          return { txnid: pendingPayu.txnid, gateway: 'payu' };
        }
      }
    } catch (e) {}
    return null;
  });
  React.useEffect(() => {
    if (!onlineResume || typeof window === 'undefined') return;
    window.history.replaceState(null, '', '#wallet');
    setActiveTabState('wallet');
    try {
      localStorage.setItem('onebss_active_tab', 'wallet');
    } catch (e) {}
  }, [onlineResume]);

  const handleNavigateToPartners = (role = '') => {
    setPartnerInitialRole(role || '');
    setActiveTabState('partners');
    try {
      if (typeof window !== 'undefined') {
        window.location.hash = 'partners';
        localStorage.setItem('onebss_active_tab', 'partners');
      }
    } catch (e) {}
  };

  // Initialize base URL hash on first render if missing so browser back history doesn't land on a blank hash
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentHash = window.location.hash.replace(/^#/, '');
      if (!currentHash) {
        window.history.replaceState(null, '', `#${initialNav.tab}`);
      }
    }
  }, []);

  const handleOpenCreateRole = (role) => {
    setPartnerCreateRole(role);
    setActiveTabState('partners');
    try {
      if (typeof window !== 'undefined') {
        window.location.hash = 'partners';
        localStorage.setItem('onebss_active_tab', 'partners');
      }
    } catch (e) {}
  };

  const handleSetUser = (userData) => {
    setUserState(userData);
    try {
      if (typeof window !== 'undefined') {
        if (userData) {
          localStorage.setItem('onebss_user', JSON.stringify(userData));
          if (userData.token) {
            localStorage.setItem('onebss_token', userData.token);
            setApiConfig(undefined, userData.token);
          }
        } else {
          localStorage.removeItem('onebss_user');
          localStorage.removeItem('onebss_token');
          setApiConfig(undefined, '');
        }
      }
    } catch (e) {}
  };

  const handleLogout = () => {
    // recorded in the Activity Log (sent with the current token before it is cleared; never waits)
    try { OneBssApi.logout().catch(() => {}); } catch (e) {}
    clearStoredSession();
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('onebss_active_tab');
        localStorage.removeItem('onebss_filter');
      }
    } catch (e) {}
    setUserState(null);
    setActiveTabState('login');
  };

  // Wrapper to update active tab and sync storage/hash
  const setActiveTab = (tab, filter = 'all', range = '', search = '') => {
    setActiveTabState(tab);
    setCustomerInitialFilter(filter);
    setCustomerInitialRange(range || '');
    setCustomerInitialSearch(search || '');
    setPartnerCreateRole(null);
    setPartnerInitialRole('');
    try {
      if (typeof window !== 'undefined') {
        const parts = [];
        if (filter && filter !== 'all') parts.push(`filter=${filter}`);
        if (range) parts.push(`range=${range}`);
        const hashVal = parts.length ? `${tab}?${parts.join('&')}` : tab;
        const currentHash = window.location.hash.replace(/^#/, '');
        if (currentHash !== hashVal) {
          window.location.hash = hashVal;
        }
        localStorage.setItem('onebss_active_tab', tab);
        if (filter && filter !== 'all') {
          localStorage.setItem('onebss_filter', filter);
        } else {
          localStorage.removeItem('onebss_filter');
        }
      }
    } catch (e) {}
  };

  // Staff login: refresh its permissions from the server (a role change applies without logging in again)
  const staffIdForRefresh = user && user.staff ? user.staff.staff_id : null;
  React.useEffect(() => {
    if (!staffIdForRefresh) return;
    let gone = false;
    OneBssApi.staffMe().then((res) => {
      if (gone || !res.ok || !res.data?.staff) return;
      setUserState((prev) => {
        if (!prev || !prev.staff) return prev;
        const next = { ...prev, staff: { ...prev.staff, ...res.data.staff } };
        try { localStorage.setItem('onebss_user', JSON.stringify(next)); } catch (e) {}
        return next;
      });
    });
    return () => { gone = true; };
  }, [staffIdForRefresh, globalRefreshKey]);

  // Staff: a page its role doesn't allow (typed link, old saved tab) goes to the first allowed one
  React.useEffect(() => {
    if (!user || !isStaffUser(user) || activeTab === 'login') return;
    if (!tabAllowed(user, activeTab === 'networking' ? 'nas' : activeTab)) {
      const first = firstAllowedTab(user);
      if (first && first !== activeTab) setActiveTab(first);
    }
  }, [activeTab, user]);

  // Operators have no Partners page: a typed or old #partners link lands on the dashboard
  React.useEffect(() => {
    if (activeTab === 'partners' && user && String(user.role || '').toLowerCase() === 'operator') {
      setActiveTab('dashboard');
    }
  }, [activeTab, user]);

  // Sync hash changes if user hits browser back/forward (left arrow in web)
  React.useEffect(() => {
    const handleHashChange = () => {
      const nav = getInitialNavigationState();
      if (nav && nav.tab) {
        setActiveTabState(nav.tab);
        setCustomerInitialFilter(nav.filter);
        setCustomerInitialRange(nav.range || '');
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('onebss_active_tab', nav.tab);
            if (nav.filter && nav.filter !== 'all') {
              localStorage.setItem('onebss_filter', nav.filter);
            } else {
              localStorage.removeItem('onebss_filter');
            }
          }
        } catch (e) {}
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  }, []);

  // Listen for API 401/403 or session expiration events to log out and show login screen
  React.useEffect(() => {
    const unsubscribe = onUnauthorized((reason) => {
      toast.error(reason || 'Session expired. Please log in again.');
      handleLogout();
    });
    return () => unsubscribe();
  }, []);

  // Periodically check if active user session token has expired
  React.useEffect(() => {
    if (!user?.token) return;

    const checkTokenExpiry = () => {
      if (isJwtExpired(user.token)) {
        toast.error('Session expired. Please log in again.');
        handleLogout();
      }
    };

    checkTokenExpiry();
    const interval = setInterval(checkTokenExpiry, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // Global offline detector (spec item 22): banner + toast when the browser loses connectivity
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const goOffline = () => {
      setIsOffline(true);
      toast.warn('You are offline. Changes will not be saved until the connection is back.');
    };
    const goOnline = () => {
      setIsOffline(false);
      toast.success('Back online.');
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Sidebar Auto-Closing / Collapsible State (Defaults to collapsed, expands on hover)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);

  const toggleSidebarCollapse = () => {
    if (isDesktop) {
      setSidebarCollapsed((prev) => !prev);
    } else {
      setSidebarOpenMobile((prev) => !prev);
    }
  };

  // range: optional expiry / registration range key (customers_by_date.php), search: optional search query
  const handleNavigateToCustomers = (filterKey = 'all', range = '', search = '') => {
    setCustomerInitialFilter(filterKey);
    setCustomerInitialRange(range);
    setCustomerInitialSearch(search || '');
    // pass the search term through — setActiveTab resets it otherwise (dashboard search + Enter)
    if (filterKey === 'ott' || filterKey.startsWith('ott_')) {
      setActiveTab('ott_customers');
      return;
    }
    if (filterKey.startsWith('iptv') || filterKey === 'iptv') {
      const cleanFilter = (filterKey === 'iptv' || filterKey === 'iptv_all') ? 'all' : filterKey.replace('iptv_', '');
      setActiveTab('iptv_customers', cleanFilter, range, search);
    } else {
      setActiveTab('customers', filterKey, range, search);
    }
  };

  // If user is not logged in, render full screen LoginScreen
  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <LoginScreen
          onLoginSuccess={(userData) => {
            handleSetUser(userData);
            setActiveTab(firstAllowedTab(userData) || 'dashboard');
          }}
        />
        <ToastHost />
      </SafeAreaView>
    );
  }

  const renderActiveScreen = () => {
    if (isStaffUser(user) && !firstAllowedTab(user)) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>No pages in your role yet</Text>
          <Text style={{ fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center' }}>Your role "{user.staff.role_name || '—'}" has no permissions. Ask your admin to tick what you need.</Text>
        </View>
      );
    }
    if (isStaffUser(user) && !tabAllowed(user, activeTab)) {
      return null; // redirected to the first allowed page (effect above)
    }
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardScreen
            user={user}
            refreshSignal={globalRefreshKey}
            onNavigateToCustomers={handleNavigateToCustomers}
            onNavigateToPartners={handleNavigateToPartners}
          />
        );
      case 'partners':
        // operators have no partners below them (a typed #partners link goes to the dashboard)
        if (String(user?.role || '').toLowerCase() === 'operator') {
          return null;
        }
        return (
          <PartnerScreen
            refreshSignal={globalRefreshKey}
            initialCreateRole={partnerCreateRole}
            initialRoleFilter={partnerInitialRole}
            onOpenCreate={(r) => setPartnerCreateRole(r)}
            user={user}
          />
        );
      case 'customers':
        return <CustomerScreen key="customers" refreshSignal={globalRefreshKey} user={user} isIptvMode={false} initialFilter={customerInitialFilter} initialRange={customerInitialRange} initialSearch={customerInitialSearch} onSwitchMode={(mode) => setActiveTab(mode)} onAutoCloseSidebar={() => setSidebarCollapsed(true)} />;
      case 'iptv_customers':
        return <CustomerScreen key="iptv" refreshSignal={globalRefreshKey} user={user} isIptvMode={true} initialFilter={customerInitialFilter} initialRange={customerInitialRange} initialSearch={customerInitialSearch} onSwitchMode={(mode) => setActiveTab(mode)} onAutoCloseSidebar={() => setSidebarCollapsed(true)} />;
      case 'ott_customers':
        return <OttSubscribersScreen user={user} refreshSignal={globalRefreshKey} />;
      case 'customer_prices':
        // operators: one customer price per package for all their customers
        return <CustomerPricesPage key={`cp_${globalRefreshKey}`} partnerId={user?.partner_id} partnerName={user?.partner_name} readOnly={String(user?.role || '').toLowerCase() !== 'operator'} />;
      case 'inventory':
        // everyone: super admin all devices, admins their tree, operators their own devices
        return <InventoryScreen user={user} refreshSignal={globalRefreshKey} />;
      case 'dhcp_devices':
        // super admin only
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return <DhcpDevicesScreen user={user} refreshSignal={globalRefreshKey} />;
      case 'iptv_renewals':
        // super admin only (the API answers 403 to everyone else)
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return <IptvRenewalsScreen refreshSignal={globalRefreshKey} />;
      case 'nas':
      case 'ip_pools':
        // Networking — super admin only (the API answers 403 to everyone else)
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return activeTab === 'nas'
          ? <NasScreen refreshSignal={globalRefreshKey} onOpenPools={() => setActiveTab('ip_pools')} />
          : <IpPoolsScreen refreshSignal={globalRefreshKey} />;
      case 'payu_payments':
        // super admin only
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return <PayuPaymentsScreen refreshSignal={globalRefreshKey} />;
      case 'wallet':
        // operator's own wallet: add money (PayU) + transactions
        if (String(user?.role || '').toLowerCase() !== 'operator') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return (
          <WalletScreen
            user={user}
            refreshSignal={globalRefreshKey}
            resumeTxnid={onlineResume?.txnid}
            resumeGateway={onlineResume?.gateway}
            onResumeHandled={() => setOnlineResume(null)}
            onPaid={() => setActiveTab('dashboard')}
          />
        );
      case 'staff':
        return <StaffScreen user={user} refreshSignal={globalRefreshKey} />;
      case 'activity':
        return <ActivityLogScreen user={user} refreshSignal={globalRefreshKey} />;
      default:
        return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
    }
  };

  const getPageMeta = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Dashboard',
          subtitle: user.partner_id ? `${user.partner_name || 'Account'} (#${user.partner_id})` : (user.partner_name || 'Account'),
        };
      case 'partners':
        return { title: 'Partners' };
      case 'customers':
        return { title: 'Internet Subscribers'};
      case 'iptv_customers':
        return { title: 'IPTV Subscribers'};
      case 'ott_customers':
        return { title: 'OTT Subscribers' };
      case 'customer_prices':
        return { title: 'Customer Prices', subtitle: 'What your customers pay, per package' };
      case 'inventory':
        return { title: 'Inventory', subtitle: 'ONU stock, vendors and models' };
      case 'dhcp_devices':
        return { title: 'DHCP Devices' };
      case 'iptv_renewals':
        return { title: 'IPTV Auto-Renewals' };
      case 'payu_payments':
        return { title: 'Online Payments', subtitle: 'Operator wallet top-ups (Razorpay, PayU) and gateway settings' };
      case 'nas':
        return { title: 'NAS' };
      case 'ip_pools':
        return { title: 'IP Pools' };
      case 'wallet':
        return { title: 'Wallet', subtitle: 'Add money and see your transactions' };
      case 'staff':
        return { title: 'Staff & Roles', subtitle: 'Your office staff, their logins and what each role may do' };
      case 'activity':
        return { title: 'Activity Log', subtitle: 'Who did what, and when' };
      default:
        return { title: 'OneBSS Platform', subtitle: 'Management Portal' };
    }
  };

  const meta = getPageMeta();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>No internet connection — showing the last loaded data. Actions will fail until you are back online.</Text>
        </View>
      )}

      <View style={styles.layout}>
        {/* Desktop Sidebar (Inline flex layout) */}
        {isDesktop && (
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tab) => setActiveTab(tab)}
            user={user}
            onLogout={handleLogout}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
            onMouseEnter={() => setSidebarCollapsed(false)}
            onMouseLeave={() => setSidebarCollapsed(true)}
          />
        )}

        {/* Mobile Sidebar Drawer (Opens OVER the screen with backdrop overlay) */}
        {!isDesktop && sidebarOpenMobile && (
          <View style={styles.mobileDrawerOverlay}>
            <TouchableOpacity
              style={styles.mobileBackdrop}
              activeOpacity={1}
              onPress={() => setSidebarOpenMobile(false)}
            />
            <View style={styles.mobileDrawerContainer}>
              <Sidebar
                activeTab={activeTab}
                onSelectTab={(tab) => {
                  setActiveTab(tab);
                  setSidebarOpenMobile(false);
                }}
                user={user}
                onLogout={() => {
                  setSidebarOpenMobile(false);
                  handleLogout();
                }}
                isCollapsed={false}
                onToggleCollapse={() => setSidebarOpenMobile(false)}
              />
            </View>
          </View>
        )}

        {/* Main Display Area */}
        <View style={styles.main}>
          <Header
            title={meta.title}
            subtitle={meta.subtitle}
            activeView={activeTab}
            onViewChange={setActiveTab}
            onRefresh={() => {
              setGlobalRefreshKey((k) => k + 1);
              try {
                window.dispatchEvent(new Event('onebss:wallet-changed'));
              } catch (e) {}
            }}
            onOpenCreate={() => handleOpenCreateRole('operator')}
            onToggleSidebar={toggleSidebarCollapse}
            onOpenWallet={() => setActiveTab('wallet')}
            user={user}
          />

          <View style={styles.contentArea}>
            {renderActiveScreen()}
          </View>
        </View>
      </View>


      <ToastHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.bgPrimary,
  },
  offlineBanner: {
    width: '100%',
    backgroundColor: '#b91c1c',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  roleBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: '3%',
    paddingVertical: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  roleBannerText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  switchRoleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  switchRoleBtnText: {
    color: '#4ade80',
    fontSize: 11,
    fontWeight: '700',
  },
  layout: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    position: 'relative',
  },
  mobileDrawerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    flexDirection: 'row',
  },
  mobileBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  mobileDrawerContainer: {
    position: 'relative',
    width: 270,
    height: '100%',
    zIndex: 10000,
    backgroundColor: COLORS.bgSecondary,
    boxShadow: '4px 0px 15px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  main: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    backgroundColor: COLORS.bgPrimary,
  },
  contentArea: {
    flex: 1,
    width: '100%',
  },
});
