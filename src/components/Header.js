import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS_STYLE } from '../constants/theme';

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
  user,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const userRole = (user?.role || '').toLowerCase();
  const isOperator = userRole === 'operator';
  const isSuperAdminOrAdmin = userRole === 'superadmin' || userRole === 'admin';
  const showWallet = isOperator && !isSuperAdminOrAdmin;
  const formattedBalance =
    user?.wallet_balance !== undefined
      ? `₹ ${Number(user.wallet_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : '₹ 12,450.00';
  const handleAddClick = onOpenCreate || onOpenCreateOperator || onOpenCreateAdmin;

  return (
    <View style={[styles.headerContainer, { paddingHorizontal: isMobile ? 16 : 28 }]}>
      <View style={styles.titleSection}>
        {isMobile && onToggleSidebar && (
          <TouchableOpacity style={styles.hamburgerBtn} onPress={onToggleSidebar}>
            <Feather name="menu" size={20} color={COLORS.textMain} />
          </TouchableOpacity>
        )}
        <View>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.actionSection}>
        {/* Wallet Balance Card Pill - Hidden for Super Admin and Admin, displayed for Operator */}
        {showWallet && (
          <View style={styles.walletCard}>
            <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.walletLbl}>WALLET BALANCE</Text>
              <Text style={styles.walletVal}>{formattedBalance}</Text>
            </View>
          </View>
        )}

        {onRefresh ? (
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} title="Refresh">
            <Feather name="refresh-cw" size={16} color={COLORS.textMain} />
          </TouchableOpacity>
        ) : null}

        {!isOperator && handleAddClick ? (
          <TouchableOpacity style={styles.btnOperator} onPress={handleAddClick}>
            <Feather name="plus-circle" size={15} color="#fff" />
            <Text style={styles.btnOperatorText}>Add Operator</Text>
          </TouchableOpacity>
        ) : null}
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
  iconBtn: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)',
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
