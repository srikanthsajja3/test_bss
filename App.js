import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, useWindowDimensions, Text, TouchableOpacity } from 'react-native';
import { COLORS } from './src/constants/theme';
import { Sidebar } from './src/components/Sidebar';
import { Header } from './src/components/Header';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PartnerScreen } from './src/screens/PartnerScreen';
import { CustomerScreen } from './src/screens/CustomerScreen';
import { ApiConsoleScreen } from './src/screens/ApiConsoleScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { LoginModal } from './src/screens/LoginModal';

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  // Parse initial tab & filter from URL hash or localStorage on page reload
  const getInitialNavigationState = () => {
    try {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
          const [tab, filter] = hash.split('?filter=');
          if (['dashboard', 'partners', 'customers', 'iptv_customers', 'apiConsole', 'login'].includes(tab)) {
            return { tab, filter: filter || 'all' };
          }
        }
        const savedTab = localStorage.getItem('onebss_active_tab');
        const savedFilter = localStorage.getItem('onebss_filter');
        if (savedTab && ['dashboard', 'partners', 'customers', 'iptv_customers', 'apiConsole', 'login'].includes(savedTab)) {
          return { tab: savedTab, filter: savedFilter || 'all' };
        }
      }
    } catch (e) {}
    return { tab: 'dashboard', filter: 'all' };
  };

  // Parse initial user role persona from localStorage on page reload
  const getInitialUserState = () => {
    try {
      if (typeof window !== 'undefined') {
        const savedUser = localStorage.getItem('onebss_user');
        if (savedUser) {
          const parsed = JSON.parse(savedUser);
          if (parsed && parsed.role) return parsed;
        }
      }
    } catch (e) {}
    return null;
  };

  const initialNav = getInitialNavigationState();
  const [activeTab, setActiveTabState] = useState(initialNav.tab);
  const [customerInitialFilter, setCustomerInitialFilter] = useState(initialNav.filter);
  const [user, setUserState] = useState(getInitialUserState());
  const [isLoginVisible, setIsLoginVisible] = useState(false);
  const [partnerCreateRole, setPartnerCreateRole] = useState(null);

  const handleOpenCreateRole = (role) => {
    setPartnerCreateRole(role);
    setActiveTab('partners');
  };

  const handleSetUser = (userData) => {
    setUserState(userData);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('onebss_user', JSON.stringify(userData));
        if (userData?.token) {
          localStorage.setItem('onebss_token', userData.token);
        }
      }
    } catch (e) {}
  };

  const handleLogout = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('onebss_user');
        localStorage.removeItem('onebss_token');
        localStorage.removeItem('onebss_active_tab');
      }
    } catch (e) {}
    setUserState(null);
    setActiveTabState('login');
  };

  // Wrapper to update active tab and sync storage/hash
  const setActiveTab = (tab, filter = 'all') => {
    setActiveTabState(tab);
    setCustomerInitialFilter(filter);
    try {
      if (typeof window !== 'undefined') {
        const hashVal = filter && filter !== 'all' ? `${tab}?filter=${filter}` : tab;
        window.location.hash = hashVal;
        localStorage.setItem('onebss_active_tab', tab);
        localStorage.setItem('onebss_filter', filter);
      }
    } catch (e) {}
  };

  // Sync hash changes if user hits browser back/forward
  React.useEffect(() => {
    const handleHashChange = () => {
      const nav = getInitialNavigationState();
      setActiveTabState(nav.tab);
      setCustomerInitialFilter(nav.filter);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
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

  const handleNavigateToCustomers = (filterKey = 'all') => {
    if (filterKey.startsWith('iptv') || filterKey === 'iptv') {
      setActiveTab('iptv_customers', filterKey === 'iptv' ? 'all' : filterKey);
    } else {
      setActiveTab('customers', filterKey);
    }
  };

  // If user is not logged in or navigated to login tab, render full screen LoginScreen
  if (!user || activeTab === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <LoginScreen
          onLoginSuccess={(userData) => {
            handleSetUser(userData);
            setActiveTab('dashboard');
          }}
        />
      </SafeAreaView>
    );
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen user={user} onNavigateToCustomers={handleNavigateToCustomers} />;
      case 'partners':
        return <PartnerScreen initialCreateRole={partnerCreateRole} user={user} />;
      case 'customers':
        return <CustomerScreen user={user} isIptvMode={false} initialFilter={customerInitialFilter} onSwitchMode={(mode) => setActiveTab(mode)} onAutoCloseSidebar={() => setSidebarCollapsed(true)} />;
      case 'iptv_customers':
        return <CustomerScreen user={user} isIptvMode={true} initialFilter={customerInitialFilter} onSwitchMode={(mode) => setActiveTab(mode)} onAutoCloseSidebar={() => setSidebarCollapsed(true)} />;
      case 'apiConsole':
        return <ApiConsoleScreen />;
      default:
        return <DashboardScreen user={user} onNavigateToCustomers={handleNavigateToCustomers} />;
    }
  };

  const getPageMeta = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: `${user.role.toUpperCase()} Dashboard`,
          subtitle: `Logged in as ${user.partner_name} (ID: #${user.partner_id || 1000})`,
        };
      case 'partners':
        return { title: 'Partner & Gateway Management', subtitle: 'RADIUS & IPTV Operator Bindings & Parent Admin Hierarchy' };
      case 'customers':
        return { title: 'Subscriber Management', subtitle: 'RADIUS Broadband & Pioneer IPTV STB Accounts' };
      case 'iptv_customers':
        return { title: 'Pioneer IPTV STB Telemetry & Management', subtitle: '45 Pioneer STB Accounts, CAS Pairing & Channel Packages' };
      case 'apiConsole':
        return { title: '28-Endpoint API Verification Suite', subtitle: 'Complete Postman Manual Test Runner' };
      default:
        return { title: 'OneBSS Platform', subtitle: 'Broadband & IPTV BSS Engine' };
    }
  };

  const meta = getPageMeta();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Role Persona Quick Switcher Banner */}
      <View style={styles.roleBanner}>
        <Text style={styles.roleBannerText}>
          ACTIVE ROLE PERSONA: <Text style={{ fontWeight: '800', color: COLORS.primary }}>{user.role.toUpperCase()}</Text> ({user.partner_name})
        </Text>
        <TouchableOpacity style={styles.switchRoleBtn} onPress={handleLogout}>
          <Text style={styles.switchRoleBtnText}>Sign Out / Switch Account</Text>
        </TouchableOpacity>
      </View>
      
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
            onOpenCreateAdmin={() => handleOpenCreateRole('admin')}
            onOpenCreateOperator={() => handleOpenCreateRole('operator')}
            onToggleSidebar={toggleSidebarCollapse}
            user={user}
          />

          <View style={styles.contentArea}>
            {renderActiveScreen()}
          </View>
        </View>
      </View>

      {/* Role Selection / Login Modal */}
      <LoginModal
        visible={isLoginVisible}
        onClose={() => setIsLoginVisible(false)}
        onLoginSuccess={(userData) => handleSetUser(userData)}
      />
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
