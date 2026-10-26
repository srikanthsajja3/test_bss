import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS_STYLE } from '../constants/theme';
import { OneBssApi, getOriginalSession, popOriginalSession, switchSession } from '../services/oneBssApi';

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
  user,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [liveWalletBalance, setLiveWalletBalance] = useState(user?.wallet_balance);
  const [hasSuperAdminSession, setHasSuperAdminSession] = useState(false);
  const [returnTo, setReturnTo] = useState(null); // the account one level up

  useEffect(() => {
    const prev = getOriginalSession();
    setHasSuperAdminSession(!!prev);
    setReturnTo(prev ? prev.user : null);
  }, [user]);

  useEffect(() => {
    if (!user?.partner_id) return undefined;
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

  // Return from an impersonation session to the account that started it.
  // Uses ONLY the original token saved at impersonation time (sessionStorage).
  // If it has expired, the user simply logs in again — no stored credentials.
  // Goes back ONE level (operator -> admin -> super admin) and lands on the partner we left.
  const handleReturnToSuperAdmin = () => {
    if (typeof window === 'undefined') return;
    const session = popOriginalSession();
    if (session?.token && session?.user) {
      const leftId = user?.partner_id;
      switchSession(session.token, session.user, leftId ? `partners?partner_id=${leftId}` : 'partners', session.user.partner_name || '');
    } else {
      // every saved level expired -> back to the login screen
      switchSession('', null, 'dashboard', 'login');
    }
  };

  const userRole = (user?.role || '').toLowerCase();
  const isOperator = userRole === 'operator';
  const isSuperAdminOrAdmin = userRole === 'superadmin' || userRole === 'admin';
  const showWallet = isOperator && !isSuperAdminOrAdmin;
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

      <View style={[styles.actionSection, isMobile && { gap: 6 }]}>
        {hasSuperAdminSession && (
          <TouchableOpacity style={styles.btnBackToSuperAdmin} onPress={handleReturnToSuperAdmin}>
            <Feather name="arrow-left-circle" size={16} color="#ffffff" />
            <Text style={styles.btnBackToSuperAdminText} numberOfLines={1}>
              {isMobile ? 'Back' : `Back to ${returnTo?.partner_name || 'previous account'}${returnTo?.role ? ` (${String(returnTo.role).toLowerCase() === 'superadmin' ? 'Super Admin' : String(returnTo.role).toLowerCase() === 'admin' ? 'Admin' : 'Operator'})` : ''}`}
            </Text>
          </TouchableOpacity>
        )}

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
            <View style={[styles.btnHeaderTopup, isMobile && { width: 20, height: 20, marginLeft: 6 }]}>
              <Feather name="plus" size={isMobile ? 12 : 14} color="#ffffff" />
            </View>
          </TouchableOpacity>
        )}

        {/* {!isOperator && handleAddClick ? (
          <TouchableOpacity style={styles.btnOperator} onPress={handleAddClick}>
            <Feather name="plus-circle" size={15} color="#fff" />
            <Text style={styles.btnOperatorText}>Add Operator</Text>
          </TouchableOpacity>
        ) : null} */}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
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
  actionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  btnBackToSuperAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  btnBackToSuperAdminText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
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
