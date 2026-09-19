import React, { useState } from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar, useWindowDimensions, Text, TouchableOpacity } from 'react-native';
import { COLORS } from './src/constants/theme';
import { Sidebar } from './src/components/Sidebar';
import { Header } from './src/components/Header';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PartnerScreen } from './src/screens/PartnerScreen';
import { CustomerScreen } from './src/screens/CustomerScreen';
import { ApiConsoleScreen } from './src/screens/ApiConsoleScreen';
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
          if (['dashboard', 'partners', 'customers', 'iptv_customers', 'apiConsole'].includes(tab)) {
            return { tab, filter: filter || 'all' };
          }
        }
        const savedTab = localStorage.getItem('onebss_active_tab');
        const savedFilter = localStorage.getItem('onebss_filter');
        if (savedTab && ['dashboard', 'partners', 'customers', 'iptv_customers', 'apiConsole'].includes(savedTab)) {
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
    return { partner_name: 'Global Root Admin', role: 'superadmin', partner_id: 1000 };
  };

  const initialNav = getInitialNavigationState();
  const [activeTab, setActiveTabState] = useState(initialNav.tab);
  const [customerInitialFilter, setCustomerInitialFilter] = useState(initialNav.filter);
  const [user, setUserState] = useState(getInitialUserState());
  const [isLoginVisible, setIsLoginVisible] = useState(false);

  const handleSetUser = (userData) => {
    setUserState(userData);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('onebss_user', JSON.stringify(userData));
      }
    } catch (e) {}
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

  // Sidebar Auto-Closing / Collapsible State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen user={user} onNavigateToCustomers={handleNavigateToCustomers} />;
      case 'partners':
        return <PartnerScreen onOpenCreate={() => {}} user={user} />;
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
        <TouchableOpacity style={styles.switchRoleBtn} onPress={() => setIsLoginVisible(true)}>
          <Text style={styles.switchRoleBtnText}>Switch Role Dashboard</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.layout}>
        {/* Sidebar (Supports Collapsible / Auto-closing mode) */}
        {(isDesktop || sidebarOpenMobile) && (
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              if (!isDesktop) setSidebarOpenMobile(false);
            }}
            user={user}
            onLogout={() => setIsLoginVisible(true)}
            isCollapsed={isDesktop && sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapse}
          />
        )}

        {/* Main Display Area (Expands to full width when sidebar is collapsed) */}
        <View style={styles.main}>
          <Header
            title={meta.title}
            subtitle={meta.subtitle}
            activeView={activeTab}
            onViewChange={setActiveTab}
            onOpenCreate={() => setActiveTab('partners')}
            onOpenOnboard={() => handleNavigateToCustomers('all')}
            onToggleSidebar={toggleSidebarCollapse}
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
    backgroundColor: COLORS.bgPrimary,
  },
  roleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 8,
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
    flexDirection: 'row',
  },
  main: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  contentArea: {
    flex: 1,
  },
});
