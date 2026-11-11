import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { isSuperAdmin } from './internet/shared';
import { isStaffUser, tabAllowed, customersTabFor } from '../services/staffAccess';

// Networking group (super admin): NAS and IP Pools pages
const NETWORKING_TABS = ['nas', 'ip_pools'];

export const Sidebar = ({ activeTab, onSelectTab, user, onLogout, isCollapsed, onToggleCollapse, onMouseEnter, onMouseLeave }) => {
  const isOperator = user?.role === 'operator';
  const isSuper = isSuperAdmin(user);
  const allItems = isOperator
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
        { id: 'customers', label: 'Subscribers', icon: 'users' },
        { id: 'customer_prices', label: 'Customer Prices', icon: 'tag' },
        { id: 'inventory', label: 'Inventory', icon: 'box' },
        { id: 'wallet', label: 'Wallet', icon: 'credit-card' },
        { id: 'staff', label: 'Staff & Roles', icon: 'user-check' },
        { id: 'activity', label: 'Activity Log', icon: 'clock' },
      ]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
        { id: 'customers', label: 'Subscribers', icon: 'users' },
        { id: 'partners', label: 'Partners', icon: 'briefcase' },
        ...(isSuper ? [{ id: 'networking', label: 'Networking', icon: 'share-2' }] : []),
        { id: 'inventory', label: 'Inventory', icon: 'box' },
        ...(isSuper ? [{ id: 'dhcp_devices', label: 'DHCP-devices', icon: 'server' }] : []),
        ...(isSuper ? [{ id: 'iptv_renewals', label: 'IPTV Auto-Renewals', icon: 'repeat' }] : []),
        ...(isSuper ? [{ id: 'payu_payments', label: 'Online Payments', icon: 'credit-card' }] : []),
        { id: 'staff', label: 'Staff & Roles', icon: 'user-check' },
        { id: 'activity', label: 'Activity Log', icon: 'clock' },
      ];
  // a staff login sees only the pages its role allows
  const menuItems = allItems.filter((it) => tabAllowed(user, it.id === 'networking' ? 'nas' : it.id === 'customers' ? 'subscribers' : it.id));
  const staff = isStaffUser(user) ? user.staff : null;

  return (
    <View 
      style={[styles.sidebarContainer, Platform.OS === 'web' && { maxHeight: '100vh' }, isCollapsed && styles.sidebarCollapsed]}
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

      {/* Navigation Links (scroll on their own; logo and user badge stay put) */}
      <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
        {menuItems.map((item) => {
          const isActive = item.id === 'customers'
            ? (activeTab === 'customers' || activeTab === 'iptv_customers' || activeTab === 'ott_customers')
            : item.id === 'networking'
              ? NETWORKING_TABS.includes(activeTab)
              : activeTab === item.id;
          return (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={[
                  styles.menuItem,
                  isCollapsed && styles.menuItemCollapsed,
                  isActive && styles.menuItemActive,
                ]}
                onPress={() => onSelectTab(item.id === 'networking' ? 'nas' : item.id === 'customers' ? customersTabFor(user) : item.id)}
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

              {item.id === 'networking' && !isCollapsed && (
                <View style={styles.treeContainer}>
                  {[
                    { id: 'nas', label: 'NAS', icon: 'server' },
                    { id: 'ip_pools', label: 'IP Pools', icon: 'layers' },
                  ].map((sub) => {
                    const on = activeTab === sub.id;
                    return (
                      <TouchableOpacity
                        key={sub.id}
                        style={[styles.treeSubItem, on && styles.treeSubItemActiveNetworking]}
                        onPress={() => onSelectTab(sub.id)}
                      >
                        <Feather name={sub.icon} size={13} color={on ? '#4f46e5' : COLORS.textMuted} />
                        <Text style={[styles.treeSubText, on && styles.treeSubTextActiveNetworking]}>{sub.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {item.id === 'customers' && !isCollapsed && (
                <View style={styles.treeContainer}>
                  {/* Tree branch 1: Network Users (Regular) */}
                  {tabAllowed(user, 'customers') ? (
                  <TouchableOpacity
                    style={[
                      styles.treeSubItem,
                      activeTab === 'customers' && styles.treeSubItemActiveBroadband,
                    ]}
                    onPress={() => onSelectTab('customers')}
                  >
                    <Feather
                      name="wifi"
                      size={13}
                      color={activeTab === 'customers' ? '#2563eb' : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.treeSubText,
                        activeTab === 'customers' && styles.treeSubTextActiveBroadband,
                      ]}
                    >
                      Internet Users
                    </Text>
                  </TouchableOpacity>
                  ) : null}

                  {/* Tree branch 2: IPTV Users (STB) */}
                  {tabAllowed(user, 'iptv_customers') ? (
                  <TouchableOpacity
                    style={[
                      styles.treeSubItem,
                      activeTab === 'iptv_customers' && styles.treeSubItemActiveIPTV,
                    ]}
                    onPress={() => onSelectTab('iptv_customers')}
                  >
                    <Feather
                      name="tv"
                      size={13}
                      color={activeTab === 'iptv_customers' ? '#8b5cf6' : COLORS.textMuted}
                    />
                    <Text
                      style={[
                        styles.treeSubText,
                        activeTab === 'iptv_customers' && styles.treeSubTextActiveIPTV,
                      ]}
                    >
                      IPTV Users
                    </Text>
                  </TouchableOpacity>
                  ) : null}

                  {/* Tree branch 3: OTT Users */}
                  {tabAllowed(user, 'ott_customers') ? (
                  <TouchableOpacity
                    style={[styles.treeSubItem, activeTab === 'ott_customers' && { backgroundColor: 'rgba(14,165,233,0.1)' }]}
                    onPress={() => onSelectTab('ott_customers')}
                  >
                    <Feather name="play-circle" size={13} color={activeTab === 'ott_customers' ? '#0ea5e9' : COLORS.textMuted} />
                    <Text style={[styles.treeSubText, activeTab === 'ott_customers' && { color: '#0ea5e9', fontWeight: '700' }]}>
                      OTT Users
                    </Text>
                  </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Footer User Badge */}
      <View style={[styles.footerSection, isCollapsed && styles.footerSectionCollapsed]}>
        <View style={[styles.userBadge, isCollapsed && styles.userBadgeCollapsed]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(staff ? staff.staff_name : user?.partner_name) ? String(staff ? staff.staff_name : user.partner_name).charAt(0).toUpperCase() : 'A'}
            </Text>
          </View>

          {!isCollapsed && (
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.username} numberOfLines={1}>
                {staff ? staff.staff_name : (user?.partner_name || user?.username || 'Operator Account')}
              </Text>
              <Text style={styles.userrole} numberOfLines={1}>
                {staff ? `STAFF · ${String(staff.role_name || '').toUpperCase()} · ${user?.partner_name || ''}` : (user?.role ? user.role.toUpperCase() : 'OPERATOR')}
              </Text>
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
    overflow: 'hidden',
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
  menuScroll: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: -4,
  },
  menuList: {
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 12,
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
  treeContainer: {
    paddingLeft: 10,
    marginTop: 4,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#cbd5e1',
    marginLeft: 22,
    gap: 4,
  },
  treeSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  treeSubItemActiveBroadband: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  treeSubItemActiveIPTV: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  treeSubItemActiveNetworking: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
  },
  treeSubTextActiveNetworking: {
    color: '#4f46e5',
    fontWeight: '700',
  },
  treeSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  treeSubTextActiveBroadband: {
    color: '#2563eb',
    fontWeight: '700',
  },
  treeSubTextActiveIPTV: {
    color: '#8b5cf6',
    fontWeight: '700',
  },
  footerSection: {
    flexShrink: 0,
    backgroundColor: COLORS.bgSecondary,
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
