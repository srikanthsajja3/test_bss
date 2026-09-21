import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export const Sidebar = ({ activeTab, onSelectTab, user, onLogout, isCollapsed, onToggleCollapse, onMouseEnter, onMouseLeave }) => {
  const isOperator = user?.role === 'operator';
  const menuItems = isOperator
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
        { id: 'customers', label: 'Subscribers', icon: 'users' },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
        { id: 'customers', label: 'Subscribers', icon: 'users' },
        { id: 'partners', label: 'Partners', icon: 'briefcase' },
        { id: 'apiConsole', label: 'API Console', icon: 'terminal' },
        { id: 'login', label: 'Login', icon: 'log-in' },
      ];

  return (
    <View 
      style={[styles.sidebarContainer, isCollapsed && styles.sidebarCollapsed]}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Brand Logo & Collapse Toggle */}
      <View style={[styles.logoSection, isCollapsed && styles.logoSectionCollapsed]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name="shield-check-outline" size={26} color={COLORS.primary} />
          {!isCollapsed && (
            <View style={{ marginLeft: 8 }}>
              <Text style={styles.logoText}>OneBSS</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.collapseToggleBtn} onPress={onToggleCollapse}>
          <Feather name={isCollapsed ? 'chevron-right' : 'chevron-left'} size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Navigation Links */}
      <View style={styles.menuList}>
        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                isCollapsed && styles.menuItemCollapsed,
                isActive && styles.menuItemActive,
              ]}
              onPress={() => onSelectTab(item.id)}
              title={item.label}
            >
              <Feather
                name={item.icon}
                size={18}
                color={isActive ? '#ffffff' : COLORS.textMuted}
              />
              {!isCollapsed && (
                <Text style={[styles.menuText, isActive && styles.menuTextActive]}>
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer User Badge */}
      <View style={[styles.footerSection, isCollapsed && styles.footerSectionCollapsed]}>
        <View style={[styles.userBadge, isCollapsed && styles.userBadgeCollapsed]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.partner_name ? user.partner_name.charAt(0).toUpperCase() : 'A'}
            </Text>
          </View>

          {!isCollapsed && (
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.username} numberOfLines={1}>
                {user?.partner_name || user?.username || 'Operator Account'}
              </Text>
              <Text style={styles.userrole}>{user?.role ? user.role.toUpperCase() : 'OPERATOR'}</Text>
            </View>
          )}

          {!isCollapsed && (
            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout || (() => onSelectTab && onSelectTab('login'))}>
              <Feather name="log-out" size={16} color={COLORS.accentRose} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 260,
    backgroundColor: COLORS.bgSecondary,
    borderRightWidth: 1,
    borderRightColor: COLORS.glassBorder,
    padding: 16,
    height: '100%',
    justifyContent: 'space-between',
    transitionDuration: '0.2s',
  },
  sidebarCollapsed: {
    width: 68,
    paddingHorizontal: 10,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  logoSectionCollapsed: {
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 12,
  },
  collapseToggleBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  logoSubtext: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  menuList: {
    flex: 1,
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 12,
  },
  menuItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  menuItemActive: {
    backgroundColor: COLORS.primary,
    boxShadow: '0px 4px 10px rgba(16, 185, 129, 0.3)',
    elevation: 4,
  },
  menuText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
  },
  menuTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  footerSection: {
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
  },
  footerSectionCollapsed: {
    alignItems: 'center',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBadgeCollapsed: {
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  username: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  userrole: {
    fontSize: 9,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  logoutBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
});
