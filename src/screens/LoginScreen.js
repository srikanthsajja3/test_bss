import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi, setApiConfig } from '../services/oneBssApi';
import { toast } from 'react-toastify';

export const LoginScreen = ({ onLoginSuccess }) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const passwordRef = useRef(null);

  const handleLogin = async () => {
    if (loading) return; // Enter pressed again while signing in
    setErrorMsg('');
    setLoading(true);

    try {
      const u = username.trim();
      const p = password.trim();

      if (!u || !p) {
        toast.error('Please enter both username and password.');
        setErrorMsg('Please enter both username and password.');
        setLoading(false);
        return;
      }

      const res = await OneBssApi.login(u, p);
      const data = res.data || {};

      if (!res.ok || !data.token) {
        toast.error(data.message || 'Invalid username or password. Access denied.');
        setErrorMsg(`❌ ${data.message || 'Invalid username or password. Access denied.'}`);
        setLoading(false);
        return;
      }

      const token = data.token;

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

      // Role and partner come ONLY from the server-issued token. If they are missing
      // we refuse the login instead of guessing (an old fallback made such users Super Admin).
      const role = String(decoded?.role || '').toLowerCase().replace(/[\s_-]+/g, '');
      const partnerId = decoded?.partner_id || null;
      if (!['superadmin', 'admin', 'operator'].includes(role) || (role !== 'superadmin' && !partnerId)) {
        toast.error('Your account has no valid role assigned. Contact the administrator.');
        setErrorMsg('❌ Your account has no valid role assigned. Contact the administrator.');
        setLoading(false);
        return;
      }
      setApiConfig(undefined, token);
      const partnerName = decoded?.partner_name || decoded?.username || u;

      toast.success(`Welcome back, ${partnerName}!`);

      onLoginSuccess({
        username: u,
        role: role,
        partner_name: partnerName,
        partner_id: partnerId,
        token: token,
      });
    } catch (e) {
      toast.error('Invalid username or password. Authentication failed.');
      setErrorMsg('❌ Invalid username or password. Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.loginCard, isMobile && styles.loginCardMobile]}>
        {/* Brand Header */}
        <View style={styles.brandHeader}>
          <View style={styles.logoBadge}>
            <MaterialCommunityIcons name="shield-check" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.brandTitle}>OneBSS Platform</Text>
          <Text style={styles.brandSubtitle}>Sign in to your telecom operations account</Text>
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Feather name="info" size={14} color={COLORS.accentRose} />
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Username Field */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>USERNAME</Text>
          <View style={styles.inputWrapper}>
            <Feather name="user" size={15} color={COLORS.textDim} />
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
              autoComplete="username"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => passwordRef.current && passwordRef.current.focus()}
            />
          </View>
        </View>

        {/* Password Field */}
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <View style={styles.inputWrapper}>
            <Feather name="lock" size={15} color={COLORS.textDim} />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              placeholder="Enter password"
              placeholderTextColor={COLORS.textDim}
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={15} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Feather name="log-in" size={16} color="#ffffff" />
              <Text style={styles.submitBtnText}>Sign In</Text>
            </>
          )}
        </TouchableOpacity>

        {/* <View style={styles.footerNote}>
          <Feather name="shield" size={12} color={COLORS.textMuted} />
          <Text style={styles.footerNoteText}>
            
          </Text>
        </View> */}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 28,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.25)',
    elevation: 10,
  },
  loginCardMobile: {
    padding: 20,
    borderRadius: 12,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textMain,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.25)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.accentRose,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
    gap: 6,
  },
  fieldLabel: {
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
    height: 42,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMain,
    outlineStyle: 'none',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    height: 46,
    borderRadius: 10,
    marginTop: 6,
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  footerNoteText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
