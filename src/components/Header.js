import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal, useWindowDimensions } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, GLASS_STYLE } from '../constants/theme';
import { OneBssApi, getSwitchBackTargets, switchBackToLevel, switchSession } from '../services/oneBssApi';
import { can, tabAllowed } from '../services/staffAccess';
import { GlobalSearch } from './GlobalSearch';

export const Header = ({
  title,
  subtitle,
  activeView,
  onViewChange,
  onRefresh,
  onOpenCreate,
  onOpenCreateAdmin,
  onOpenCreateOperator,
  onToggleSidebar,
  onOpenWallet,
  onNavigateToCustomers,
  onNavigateToPartners,
  user,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  // customer search on every page (anyone who can open a subscriber list)
  const canSearch = !!user && (tabAllowed(user, 'customers') || tabAllowed(user, 'iptv_customers'));
  const [searchOpen, setSearchOpen] = useState(false); // phones: the bar under the title

  const [liveWalletBalance, setLiveWalletBalance] = useState(user?.wallet_balance);
  // "Login as": the accounts we can switch back to, nearest first (kept with the login, so
  // they survive closing the tab)
  const [switchTargets, setSwitchTargets] = useState([]);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchAnchor, setSwitchAnchor] = useState(null); // where the menu opens (web: below the icon)
  const switchBtnRef = React.useRef(null);

  useEffect(() => {
    setSwitchTargets(user?.is_impersonation ? getSwitchBackTargets() : []);
  }, [user]);

  useEffect(() => {
    // staff without the Wallet permission (e.g. technicians) never see the wallet: don't load it
    if (!user?.partner_id || !can(user, 'wallet.view')) return undefined;
    const load = () =>
      OneBssApi.getWallet(user.partner_id).then((res) => {
        if (res.ok && res.data && res.data.wallet_balance !== undefined) {
          setLiveWalletBalance(res.data.wallet_balance);
        }
      });
    load();
    // refresh after a recharge or the top-bar Refresh
    window.addEventListener('onebss:wallet-changed', load);
    return () => window.removeEventListener('onebss:wallet-changed', load);
  }, [user?.partner_id, user?.wallet_balance]);

  // Switch back from a "Login as" session to one of the accounts that started it — any level
  // (operator -> admin, or straight to the super admin). Uses ONLY the tokens saved when
  // switching; if that login has expired, the user logs in again (no stored credentials).
  // Lands on the Partners page, on the partner we left.
  const openSwitchMenu = () => {
    const el = switchBtnRef.current;
    if (el && typeof el.getBoundingClientRect === 'function') {
      const r = el.getBoundingClientRect();
      setSwitchAnchor({ top: r.bottom + 8, right: Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 0) - r.right - 4) });
    } else {
      setSwitchAnchor(null);
    }
    setSwitchTargets(getSwitchBackTargets());
    setSwitchOpen(true);
  };
  const handleSwitchBack = (level) => {
    setSwitchOpen(false);
    const leftId = user?.partner_id;
    if (!switchBackToLevel(level, leftId ? `partners?partner_id=${leftId}` : 'partners')) {
      // that login has expired -> back to the login screen
      switchSession('', null, 'dashboard', 'login');
    }
  };
  const roleLabel = (r) => {
    const x = String(r || '').toLowerCase().replace(/[\s_-]/g, '');
    return x === 'superadmin' ? 'Super Admin' : x === 'admin' ? 'Admin' : x === 'operator' ? 'Operator' : '';
  };

  const userRole = (user?.role || '').toLowerCase();
  const isOperator = userRole === 'operator';
  const isSuperAdminOrAdmin = userRole === 'superadmin' || userRole === 'admin';
  const showWallet = isOperator && !isSuperAdminOrAdmin && can(user, 'wallet.view'); // staff: only with Wallet permission
  const balanceVal = liveWalletBalance !== undefined ? liveWalletBalance : (user?.wallet_balance !== undefined ? user.wallet_balance : 0);
  const formattedBalance = `₹ ${Number(balanceVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  const handleAddClick = onOpenCreate || onOpenCreateOperator || onOpenCreateAdmin;

  return (
    <View style={[styles.headerContainer, { paddingHorizontal: isMobile ? 16 : 28 }]}>
      <View style={[styles.titleSection, isMobile && { flex: 1, minWidth: 0 }]}>
        {isMobile && onToggleSidebar && (
          <TouchableOpacity style={styles.hamburgerBtn} onPress={onToggleSidebar}>
            <Feather name="menu" size={20} color={COLORS.textMain} />
          </TouchableOpacity>
        )}
        <View style={isMobile ? { flex: 1, minWidth: 0 } : null}>
          <Text style={[styles.headerTitle, isMobile && { fontSize: 18 }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>

      {canSearch && !isMobile ? (
        <GlobalSearch user={user} onNavigateToCustomers={onNavigateToCustomers} onNavigateToPartners={onNavigateToPartners} />
      ) : null}

      <View style={[styles.actionSection, isMobile && { gap: 6 }]}>
        {canSearch && isMobile ? (
          <TouchableOpacity style={[styles.searchIconBtn, searchOpen && styles.searchIconBtnOn]} onPress={() => setSearchOpen((v) => !v)} accessibilityLabel="Search customers">
            <Feather name="search" size={18} color={searchOpen ? '#0f766e' : COLORS.textMain} />
          </TouchableOpacity>
        ) : null}
        {switchTargets.length > 0 && (
          <TouchableOpacity
            ref={switchBtnRef}
            style={[styles.switchBtn, switchOpen && styles.switchBtnOpen]}
            onPress={openSwitchMenu}
            title="Switch back"
            accessibilityRole="button"
            accessibilityLabel="Switch back to another account"
          >
            <View style={styles.switchIcon}>
              <Feather name="user" size={17} color="#4f46e5" />
              <View style={styles.switchIconBadge}>
                <MaterialCommunityIcons name="swap-horizontal" size={11} color="#4f46e5" />
              </View>
            </View>
          </TouchableOpacity>
        )}
        <Modal visible={switchOpen} transparent animationType="fade" onRequestClose={() => setSwitchOpen(false)}>
          <Pressable style={styles.switchOverlay} onPress={() => setSwitchOpen(false)}>
            <Pressable
              style={[styles.switchMenu, switchAnchor && !isMobile ? { top: switchAnchor.top, right: switchAnchor.right } : styles.switchMenuMobile]}
              onPress={() => {}}
            >
              <View style={styles.switchArrow} />
              <View style={styles.switchTitleRow}>
                <MaterialCommunityIcons name="account-switch-outline" size={16} color={COLORS.textMuted} />
                <Text style={styles.switchTitle}>Switch To</Text>
              </View>
              {switchTargets.map((t) => (
                <TouchableOpacity key={t.level} style={styles.switchItem} onPress={() => handleSwitchBack(t.level)}>
                  <Feather name="user" size={15} color={COLORS.textMuted} />
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.switchName} numberOfLines={1}>{t.user.username || t.user.partner_name || 'Previous account'}</Text>
                    {(() => {
                      // "Admin · Polfiber Networks" (the name is left out when it only repeats the role)
                      const role = roleLabel(t.user.role);
                      const name = t.user.username && t.user.partner_name && t.user.partner_name.toLowerCase() !== role.toLowerCase() ? t.user.partner_name : '';
                      const sub = [role, name].filter(Boolean).join(' · ');
                      return sub ? <Text style={styles.switchSub} numberOfLines={1}>{sub}</Text> : null;
                    })()}
                  </View>
                </TouchableOpacity>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Wallet Balance Card Pill - Hidden for Super Admin and Admin, displayed for Operator */}
        {showWallet && (
          // the whole pill opens the Wallet page (add money + transactions)
          <TouchableOpacity
            style={[styles.walletCard, activeView === 'wallet' && styles.walletCardActive, isMobile && { paddingHorizontal: 8, paddingVertical: 4 }]}
            onPress={onOpenWallet}
            disabled={!onOpenWallet}
            title="Wallet — add money and see transactions"
            accessibilityRole="button"
            accessibilityLabel={`Wallet balance ${formattedBalance}. Open wallet`}
          >
            <Ionicons name="wallet-outline" size={isMobile ? 15 : 18} color={COLORS.primary} />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.walletLbl}>{isMobile ? 'WALLET' : 'WALLET BALANCE'}</Text>
              <Text style={styles.walletVal}>{formattedBalance}</Text>
            </View>
            {can(user, 'wallet.topup') ? (
            <View style={[styles.btnHeaderTopup, isMobile && { width: 20, height: 20, marginLeft: 6 }]}>
              <Feather name="plus" size={isMobile ? 12 : 14} color="#ffffff" />
            </View>
            ) : null}
          </TouchableOpacity>
        )}

        {/* {!isOperator && handleAddClick ? (
          <TouchableOpacity style={styles.btnOperator} onPress={handleAddClick}>
            <Feather name="plus-circle" size={15} color="#fff" />
            <Text style={styles.btnOperatorText}>Add Operator</Text>
          </TouchableOpacity>
        ) : null} */}
      </View>
      {canSearch && isMobile && searchOpen ? (
        <View style={{ width: '100%', zIndex: 100 }}>
          <GlobalSearch user={user} mobile autoFocus onClose={() => setSearchOpen(false)}
            onNavigateToCustomers={onNavigateToCustomers} onNavigateToPartners={onNavigateToPartners} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    position: 'relative',
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: '3%',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glassBorder,
    backgroundColor: '#ffffff',
    flexWrap: 'wrap',
    gap: 12,
  },
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hamburgerBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  searchIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  searchIconBtnOn: { backgroundColor: 'rgba(20,184,166,0.12)' },
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  switchBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  switchIcon: {
    width: 22,
    height: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  switchIconBadge: {
    position: 'absolute',
    right: -3,
    bottom: -2,
    backgroundColor: '#eef0fe',
    borderRadius: 7,
    paddingHorizontal: 0.5,
  },
  switchBtnOpen: {
    backgroundColor: 'rgba(99, 102, 241, 0.16)',
    borderColor: '#6366f1',
  },
  switchOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  switchMenu: {
    position: 'absolute',
    minWidth: 230,
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  switchMenuMobile: {
    top: 64,
    right: 12,
  },
  switchArrow: {
    position: 'absolute',
    top: -7,
    right: 14,
    width: 12,
    height: 12,
    backgroundColor: '#ffffff',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    transform: [{ rotate: '45deg' }],
  },
  switchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 2,
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  switchName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  switchSub: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  walletLbl: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  walletVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accentEmerald,
  },
  walletCardActive: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
  },
  btnHeaderTopup: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    marginLeft: 10,
  },
  iconBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  btnHeaderRefresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
  },
  btnHeaderRefreshText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563eb',
  },
  btnAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  btnAdminText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  btnOperator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentEmerald,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  btnOperatorText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
