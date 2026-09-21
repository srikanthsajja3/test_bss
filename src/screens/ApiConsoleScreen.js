import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

const API_ENDPOINTS = [
  // Module 1: Auth & Security
  { id: '1.1', name: 'POST /login.php', method: 'POST', module: 'Module 1: Auth', payload: JSON.stringify({ username: 'onebss', password: 'onebss' }, null, 2), action: () => OneBssApi.login() },
  { id: '1.2', name: 'POST /logout.php', method: 'POST', module: 'Module 1: Auth', payload: '{}', action: () => OneBssApi.logout() },

  // Module 2: Partner CRUD & Gateways
  { id: '2.1', name: 'GET /partner.php (List)', method: 'GET', module: 'Module 2: Partners', payload: '', action: () => OneBssApi.getPartners('', '', 1, 20) },
  { id: '2.2', name: 'GET /partner.php?id=1116', method: 'GET', module: 'Module 2: Partners', payload: '', action: () => OneBssApi.getPartnerById(1116) },
  { id: '2.3', name: 'POST /partner.php (Create)', method: 'POST', module: 'Module 2: Partners', payload: JSON.stringify({ partner_name: 'Airtel Partner Corp', company_name: 'Airtel Networks Ltd', partner_mobile: '9876543210', partner_email: 'contact@airtel.in', account_role: 'partner', status: 'enabled' }, null, 2), action: (p) => OneBssApi.createPartner(p ? JSON.parse(p) : {}) },
  { id: '2.4', name: 'PUT /partner.php (Update)', method: 'PUT', module: 'Module 2: Partners', payload: JSON.stringify({ partner_id: 1116, partner_name: 'Airtel Updated Corp' }, null, 2), action: (p) => OneBssApi.updatePartner(p ? JSON.parse(p) : {}) },
  { id: '2.5', name: 'DELETE /partner.php?id=1116', method: 'DELETE', module: 'Module 2: Partners', payload: '', action: () => OneBssApi.deletePartner(1116) },
  { id: '2.6', name: 'GET /get_gateway_partners_branches.php', method: 'GET', module: 'Module 2: Partners', payload: '', action: () => OneBssApi.getGatewayBranches(1116) },

  // Module 3 & 4: Internet & IPTV Plans
  { id: '3.1', name: 'GET /plan_mapping.php?partner_id=1116', method: 'GET', module: 'Module 3: Internet Plans', payload: '', action: () => OneBssApi.getInternetPlans(1116) },
  { id: '3.2', name: 'POST /internet_plan_sync.php?partner_id=1116', method: 'POST', module: 'Module 3: Internet Plans', payload: '', action: () => OneBssApi.syncInternetPlans(1116) },
  { id: '3.3', name: 'POST /plan_mapping.php', method: 'POST', module: 'Module 3: Internet Plans', payload: JSON.stringify({ partner_id: 1116, plan_name: 'Ultra 100Mbps', package_id: 101, sub_plan_id: 201, price: 699, validity_days: 30 }, null, 2), action: (p) => OneBssApi.createInternetPlan(p ? JSON.parse(p) : {}) },
  { id: '3.4', name: 'PUT /plan_mapping.php', method: 'PUT', module: 'Module 3: Internet Plans', payload: JSON.stringify({ id: 1, price: 799 }, null, 2), action: (p) => OneBssApi.updateInternetPlan(p ? JSON.parse(p) : {}) },
  { id: '3.5', name: 'DELETE /plan_mapping.php?id=1', method: 'DELETE', module: 'Module 3: Internet Plans', payload: '', action: () => OneBssApi.deleteInternetPlan(1) },

  { id: '4.1', name: 'GET /iptv_plan_mapping.php?partner_id=1116', method: 'GET', module: 'Module 4: IPTV Plans', payload: '', action: () => OneBssApi.getIptvPlans(1116) },
  { id: '4.2', name: 'POST /iptv_plan_sync.php?partner_id=1111 (SuperAdmin Only)', method: 'POST', module: 'Module 4: IPTV Plans', payload: '', action: () => OneBssApi.syncIptvPlans(1111) },
  { id: '4.3', name: 'POST /iptv_plan_mapping.php', method: 'POST', module: 'Module 4: IPTV Plans', payload: JSON.stringify({ partner_id: 1116, plan_name: 'Premium HD 300+', plan_id: 501, sub_plan_id: 601, price: 299, validity_days: 30 }, null, 2), action: (p) => OneBssApi.createIptvPlan(p ? JSON.parse(p) : {}) },

  // Module 5: Aadhaar e-KYC
  { id: '5.1', name: 'POST /digilocker_initialize.php', method: 'POST', module: 'Module 5: Aadhaar e-KYC', payload: JSON.stringify({ partner_id: 1116 }, null, 2), action: () => OneBssApi.digilockerInitialize(1116) },
  { id: '5.2', name: 'POST /digilocker_download_aadhaar.php', method: 'POST', module: 'Module 5: Aadhaar e-KYC', payload: JSON.stringify({ partner_id: 1116, client_id: 'dl_cli_001' }, null, 2), action: () => OneBssApi.digilockerDownloadAadhaar(1116, 'dl_cli_001') },
  { id: '5.3', name: 'POST /scoreme_send_otp.php', method: 'POST', module: 'Module 5: Aadhaar e-KYC', payload: JSON.stringify({ partner_id: 1116, aadhar_number: '234567890123' }, null, 2), action: () => OneBssApi.scoremeSendOtp(1116, '234567890123') },
  { id: '5.4', name: 'POST /scoreme_verify_otp.php', method: 'POST', module: 'Module 5: Aadhaar e-KYC', payload: JSON.stringify({ partner_id: 1116, otp: '123456' }, null, 2), action: () => OneBssApi.scoremeVerifyOtp(1116, '123456') },

  // Module 6 & 7: Customer Provisioning
  { id: '6.1', name: 'GET /customer_lookup.php?mobile=9000000001', method: 'GET', module: 'Module 6: Subscribers', payload: '', action: () => OneBssApi.customerLookup('9000000001') },
  { id: '6.2', name: 'POST /internet_customer_sync.php', method: 'POST', module: 'Module 6: Subscribers', payload: JSON.stringify({ partner_id: 1116 }, null, 2), action: () => OneBssApi.syncInternetCustomersBulk(1116) },
  { id: '6.3', name: 'POST /internet_customer_detail_sync.php?internet_id=1', method: 'POST', module: 'Module 6: Subscribers', payload: '', action: () => OneBssApi.syncInternetCustomerDetail(1) },
  { id: '6.4', name: 'POST /iptv_customer_sync.php', method: 'POST', module: 'Module 6: Subscribers', payload: JSON.stringify({ partner_id: 1116 }, null, 2), action: () => OneBssApi.syncIptvCustomers(1116) },
  { id: '6.5', name: 'POST /add_internet_customer.php', method: 'POST', module: 'Module 6: Subscribers', payload: JSON.stringify({ partner_id: 1116, username: 'sub99@onefiber' }, null, 2), action: (p) => OneBssApi.addInternetCustomer(p ? JSON.parse(p) : {}) },

  // Module 8: Telemetry & KYC Mapping
  { id: '8.1', name: 'GET /kyc_provider_mapping.php?partner_id=1116', method: 'GET', module: 'Module 8: Telemetry', payload: '', action: () => OneBssApi.getKycProviderMapping(1116) },
  { id: '8.2', name: 'POST /kyc_provider_mapping.php', method: 'POST', module: 'Module 8: Telemetry', payload: JSON.stringify({ partner_id: 1116, providers: ['digilocker', 'scoreme'] }, null, 2), action: () => OneBssApi.assignKycProviders(1116, ['digilocker', 'scoreme']) },
  { id: '8.3', name: 'DELETE /kyc_provider_mapping.php', method: 'DELETE', module: 'Module 8: Telemetry', payload: JSON.stringify({ partner_id: 1116, providers: ['scoreme'] }, null, 2), action: () => OneBssApi.unassignKycProviders(1116, ['scoreme']) },
  { id: '8.4', name: 'GET /dashboard.php?partner_id=1116', method: 'GET', module: 'Module 8: Telemetry', payload: '', action: () => OneBssApi.getDashboardTelemetry(1116) },
];

export const ApiConsoleScreen = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0]);
  const [payloadInput, setPayloadInput] = useState(API_ENDPOINTS[0].payload);
  const [responseOutput, setResponseOutput] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSelect = (endpoint) => {
    setSelectedEndpoint(endpoint);
    setPayloadInput(endpoint.payload);
    setResponseOutput(null);
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      const res = await selectedEndpoint.action(payloadInput);
      setResponseOutput(res);
    } catch (e) {
      setResponseOutput({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>28-API Endpoint Verification Suite</Text>
      <Text style={styles.subtitle}>Execute and inspect all 28 endpoints from OneBSS API Documentation Manual</Text>

      {/* Endpoint Dropdown Selector */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Select API Endpoint to Test ({API_ENDPOINTS.length} Endpoints)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.endpointList}>
          {API_ENDPOINTS.map((ep) => {
            const isSelected = selectedEndpoint.id === ep.id;
            return (
              <TouchableOpacity
                key={ep.id}
                style={[styles.epChip, isSelected && styles.epChipActive]}
                onPress={() => handleSelect(ep)}
              >
                <Text style={[styles.methodBadge, ep.method === 'GET' ? styles.badgeGet : ep.method === 'POST' ? styles.badgePost : styles.badgeDel]}>
                  {ep.method}
                </Text>
                <Text style={[styles.epName, isSelected && styles.epNameActive]}>{ep.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected Endpoint Info & Payload */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedEndpoint.name}</Text>
          <Text style={styles.moduleTag}>{selectedEndpoint.module}</Text>
        </View>

        {selectedEndpoint.method !== 'GET' && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabel}>JSON Request Payload</Text>
            <TextInput
              style={styles.payloadInput}
              value={payloadInput}
              onChangeText={setPayloadInput}
              multiline
              numberOfLines={6}
            />
          </View>
        )}

        <TouchableOpacity style={styles.executeBtn} onPress={handleExecute} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={16} color="#fff" />
          )}
          <Text style={styles.executeBtnText}>Run API Request</Text>
        </TouchableOpacity>
      </View>

      {/* Response Inspector Card */}
      {responseOutput && (
        <View style={styles.card}>
          <View style={styles.responseHeader}>
            <Text style={styles.cardTitle}>Response Inspector</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={[styles.statusBadge, responseOutput.ok ? styles.statusOk : styles.statusErr]}>
                <Text style={styles.statusText}>{responseOutput.status || '200 OK'}</Text>
              </View>
              {responseOutput.duration && (
                <Text style={styles.durationText}>{responseOutput.duration}ms</Text>
              )}
            </View>
          </View>

          <ScrollView style={styles.codeBlock}>
            <Text style={styles.codeText}>{JSON.stringify(responseOutput.data || responseOutput, null, 2)}</Text>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.bgPrimary,
  },
  content: {
    width: '100%',
    paddingHorizontal: '3%',
    paddingVertical: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  endpointList: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  epChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    marginRight: 8,
    gap: 6,
  },
  epChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  methodBadge: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    color: '#fff',
  },
  badgeGet: { backgroundColor: '#3b82f6' },
  badgePost: { backgroundColor: COLORS.primary },
  badgeDel: { backgroundColor: COLORS.accentRose },
  epName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  epNameActive: {
    color: COLORS.textMain,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.glassBorder,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  moduleTag: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  inputLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  payloadInput: {
    backgroundColor: COLORS.bgDark,
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 12,
    borderRadius: 8,
    padding: 12,
    textAlignVertical: 'top',
  },
  executeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginTop: 8,
  },
  executeBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusOk: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  statusErr: { backgroundColor: 'rgba(244, 63, 94, 0.15)' },
  statusText: { fontSize: 11, fontWeight: '700', color: COLORS.accentEmerald },
  durationText: { fontSize: 11, color: COLORS.textMuted },
  codeBlock: {
    backgroundColor: COLORS.bgDark,
    borderRadius: 10,
    padding: 14,
    maxHeight: 280,
  },
  codeText: {
    color: '#4ade80',
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
