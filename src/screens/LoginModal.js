import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

export const LoginModal = ({ visible, onClose, onLoginSuccess }) => {
  const [selectedRole, setSelectedRole] = useState('superadmin'); // 'superadmin' | 'admin' | 'operator' | 'customer'
  const [username, setUsername] = useState('onebss_admin');
  const [password, setPassword] = useState('onebss');

  const handleSelectRole = (role) => {
    setSelectedRole(role);
    if (role === 'superadmin') setUsername('root_superadmin');
    else if (role === 'admin') setUsername('north_admin');
    else if (role === 'operator') setUsername('airtel_operator');
    else if (role === 'customer') setUsername('srikanth_subscriber');
  };

  const handleLogin = () => {
    const roleTitles = {
      superadmin: 'Global Super Admin',
      admin: 'North Region Admin',
      operator: 'Airtel Operator',
      customer: 'Srikanth Subscriber',
    };

    onLoginSuccess({
      username,
      role: selectedRole,
      partner_name: roleTitles[selectedRole] || 'User',
      partner_id: selectedRole === 'superadmin' ? 1000 : selectedRole === 'admin' ? 1100 : selectedRole === 'operator' ? 1300 : 9999,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.logoRow}>
            <MaterialCommunityIcons name="shield-check" size={32} color={COLORS.primary} />
            <Text style={styles.title}>OneBSS Role Selector</Text>
          </View>
          <Text style={styles.subtitle}>Select a role persona to authenticate and inspect its custom dashboard</Text>

          {/* Persona Role Selection Chips */}
          <View style={styles.roleGrid}>
            {[
              { id: 'superadmin', label: 'Super Admin', desc: 'Global Control & Reassignment' },
              { id: 'admin', label: 'Admin', desc: 'Child Admins & Operators' },
              { id: 'operator', label: 'Operator', desc: 'OCM & STB Management' },
              { id: 'customer', label: 'Customer', desc: 'Broadband & IPTV Portal' },
            ].map((roleItem) => {
              const isSelected = selectedRole === roleItem.id;
              return (
                <TouchableOpacity
                  key={roleItem.id}
                  style={[styles.roleCard, isSelected && styles.roleCardActive]}
                  onPress={() => handleSelectRole(roleItem.id)}
                >
                  <Text style={[styles.roleLabel, isSelected && styles.roleLabelActive]}>{roleItem.label}</Text>
                  <Text style={[styles.roleDesc, isSelected && styles.roleDescActive]}>{roleItem.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Identity Username</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} />
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Feather name="log-in" size={16} color="#fff" />
            <Text style={styles.loginBtnText}>Launch {selectedRole.toUpperCase()} Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justify: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    elevation: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  roleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  roleCard: {
    width: '48%',
    padding: 12,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
  },
  roleCardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: COLORS.primary,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  roleLabelActive: {
    color: COLORS.accentCyan,
  },
  roleDesc: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  roleDescActive: {
    color: COLORS.accentEmerald,
  },
  inputGroup: {
    marginBottom: 14,
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: COLORS.textMain,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    height: 44,
    borderRadius: 10,
    gap: 8,
  },
  loginBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
});
