import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';

export const LoginModal = ({ visible, onClose, onLoginSuccess }) => {
  const [username, setUsername] = useState('onebss');
  const [password, setPassword] = useState('onebss');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      const u = username.trim();
      const p = password.trim();

      if (!u || !p) {
        setErrorMsg('Please enter both username and password.');
        setLoading(false);
        return;
      }

      const res = await OneBssApi.login(u, p);
      const data = res.data || {};

      if (data.success === false || data.status === 'error' || res.status === 401) {
        setErrorMsg(`❌ ${data.message || 'Invalid username or password. Access denied.'}`);
        setLoading(false);
        return;
      }

      const token = data.token || `token_${Date.now()}`;
      setApiConfig(undefined, token);

      let decoded = null;
      try {
        const base64Url = token.split('.')[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          decoded = JSON.parse(jsonPayload);
        }
      } catch (e) {}

      const serverUser = data.user || {};
      const role = (decoded?.role || serverUser.role || (u === 'oper1' || u.includes('oper') ? 'operator' : 'superadmin')).toLowerCase();
      const partnerId = decoded?.partner_id || serverUser.partner_id || null;

      onLoginSuccess({
        username: u,
        role: role,
        partner_name: decoded?.partner_name || serverUser.partner_name || (role === 'operator' ? 'Operator' : 'Super Admin'),
        partner_id: partnerId,
        token: token,
      });
      onClose();
    } catch (e) {
      setErrorMsg('❌ Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.logoRow}>
            <MaterialCommunityIcons name="shield-check" size={28} color={COLORS.primary} />
            <Text style={styles.title}>OneBSS Authentication</Text>
          </View>
          <Text style={styles.subtitle}>Enter your account credentials to authenticate</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>USERNAME</Text>
            <View style={styles.inputWrapper}>
              <Feather name="user" size={14} color={COLORS.textDim} />
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Enter username"
                placeholderTextColor={COLORS.textDim}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={14} color={COLORS.textDim} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="Enter password"
                placeholderTextColor={COLORS.textDim}
              />
              <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="log-in" size={14} color="#fff" />
                  <Text style={styles.loginBtnText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    elevation: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 14,
    gap: 6,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.8)',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMain,
    outlineStyle: 'none',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  cancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  loginBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
});
