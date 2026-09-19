import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, GLASS_STYLE } from '../constants/theme';

export const Header = ({
  title,
  subtitle,
  activeView,
  onViewChange,
  onRefresh,
  onOpenCreate,
  onOpenOnboard,
  onToggleSidebar,
}) => {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.titleSection}>
        {onToggleSidebar && (
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
        {/* Wallet Balance Card Pill */}
        <View style={styles.walletCard}>
          <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
          <View style={{ marginLeft: 6 }}>
            <Text style={styles.walletLbl}>WALLET BALANCE</Text>
            <Text style={styles.walletVal}>₹ 12,450.00</Text>
          </View>
        </View>

        {onRefresh && (
          <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} title="Refresh Telemetry">
            <Feather name="refresh-cw" size={16} color={COLORS.textMain} />
          </TouchableOpacity>
        )}

        {onOpenCreate && (
          <TouchableOpacity style={styles.btnPrimary} onPress={onOpenCreate}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Add Partner</Text>
          </TouchableOpacity>
        )}

        {onOpenOnboard && (
          <TouchableOpacity style={styles.btnAccent} onPress={onOpenOnboard}>
            <Feather name="user-plus" size={16} color={COLORS.accentCyan} />
            <Text style={styles.btnAccentText}>Onboard</Text>
          </TouchableOpacity>
        )}
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
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  btnPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  btnAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  btnAccentText: {
    color: COLORS.accentCyan,
    fontWeight: '600',
    fontSize: 13,
  },
});
