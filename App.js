import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, useWindowDimensions, Text, TouchableOpacity, Platform } from 'react-native';
import { COLORS } from './src/constants/theme';
import { setApiConfig, onUnauthorized, isJwtExpired, clearStoredSession } from './src/services/oneBssApi';
import { Sidebar } from './src/components/Sidebar';
import { Header } from './src/components/Header';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PartnerScreen } from './src/screens/PartnerScreen';
import { CustomerPricesPage } from './src/components/plans/CustomerPricesPage';
import { CustomerScreen } from './src/screens/CustomerScreen';
import { OttSubscribersScreen } from './src/screens/OttSubscribersScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { IptvRenewalsScreen } from './src/screens/IptvRenewalsScreen';
import { PayuPaymentsScreen } from './src/screens/PayuPaymentsScreen';
import { WalletScreen } from './src/screens/WalletScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ToastContainer, toast } from 'react-toastify';
import { createPortal } from 'react-dom';

// react-native-web renders <Modal> in a portal on <body> (z-index 9999), while every RN View
// is `position:relative; z-index:0` — a stacking context the toasts can't escape from inside
// the app tree. So toasts were drawn BEHIND open modals. Render the toast container in its
// own portal on <body>, above everything.
const TOAST_CONTAINER_STYLE = { zIndex: 2147483647 };
const ToastHost = () => {
  const toasts = <ToastContainer position="top-right" autoClose={3500} theme="colored" style={TOAST_CONTAINER_STYLE} />;
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    return createPortal(toasts, document.body);
  }
  return toasts;
};

export default function App() {
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
          if (['dashboard', 'partners', 'customers', 'iptv_customers', 'ott_customers', 'customer_prices', 'inventory', 'iptv_renewals', 'payu_payments', 'wallet'].includes(tab)) {
            const filter = rawFilter ? rawFilter.split('?')[0].split('&')[0] : 'all';
            const rangeMatch = hash.match(/[?&]range=([a-z0-9_]+)/);
            return { tab, filter, range: rangeMatch ? rangeMatch[1] : '' };
          }
        }
        const savedTab = localStorage.getItem('onebss_active_tab');
        const savedFilter = localStorage.getItem('onebss_filter');
        if (savedTab && ['dashboard', 'partners', 'customers', 'iptv_customers', 'ott_customers', 'customer_prices', 'inventory', 'iptv_renewals', 'payu_payments', 'wallet'].includes(savedTab)) {
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

  // Back from PayU's checkout (pg/payu_callback.php sends the browser to #payu=<txnid>), or the
  // Wallet page reloaded right after leaving for PayU (browser Back): the Wallet page checks that
  // payment — success goes to the dashboard, anything else is shown on the Wallet page.
  const [payuResumeTxn, setPayuResumeTxn] = useState(() => {
    try {
      if (typeof window === 'undefined') return null;
      const m = window.location.hash.match(/^#payu=([A-Za-z0-9]{6,40})/);
      if (m) return m[1];
      if (/^#wallet/.test(window.location.hash)) {
        const raw = localStorage.getItem('onebss_pending_payu_txn');
        const pending = raw ? JSON.parse(raw) : null;
        if (pending?.txnid && Date.now() - Number(pending.at || 0) < 30 * 60 * 1000) return pending.txnid;
      }
    } catch (e) {}
    return null;
  });
  React.useEffect(() => {
    if (!payuResumeTxn || typeof window === 'undefined') return;
    window.history.replaceState(null, '', '#wallet');
    setActiveTabState('wallet');
    try {
      localStorage.setItem('onebss_active_tab', 'wallet');
    } catch (e) {}
  }, [payuResumeTxn]);

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
            setActiveTab('dashboard');
          }}
        />
        <ToastHost />
      </SafeAreaView>
    );
  }

  const renderActiveScreen = () => {
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
        // super admin only (the API answers 403 to everyone else)
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return <InventoryScreen user={user} refreshSignal={globalRefreshKey} />;
      case 'iptv_renewals':
        // super admin only (the API answers 403 to everyone else)
        if (String(user?.role || '').toLowerCase().replace(/[\s_-]/g, '') !== 'superadmin') {
          return <DashboardScreen user={user} refreshSignal={globalRefreshKey} onNavigateToCustomers={handleNavigateToCustomers} onNavigateToPartners={handleNavigateToPartners} />;
        }
        return <IptvRenewalsScreen refreshSignal={globalRefreshKey} />;
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
            resumeTxnid={payuResumeTxn}
            onResumeHandled={() => setPayuResumeTxn(null)}
            onPaid={() => setActiveTab('dashboard')}
          />
        );
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
      case 'iptv_renewals':
        return { title: 'IPTV Auto-Renewals', subtitle: 'Paid IPTV months renewed on Pioneer by the hourly cron' };
      case 'payu_payments':
        return { title: 'Online Payments', subtitle: 'Operator wallet top-ups through PayU' };
      case 'wallet':
        return { title: 'Wallet', subtitle: 'Add money and see your transactions' };
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
