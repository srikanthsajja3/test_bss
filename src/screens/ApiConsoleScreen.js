import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

const API_ENDPOINTS = [
  // 1. Authentication (1 API)
  { id: '1.1', name: 'POST /login.php', method: 'POST', module: '1. Authentication', payload: JSON.stringify({ username: 'onebss', password: 'onebss' }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.login(body.username, body.password); } },

  // 2. Partner Management (5 APIs)
  { id: '2.1', name: 'GET /partner.php (List Partners)', method: 'GET', module: '2. Partner Management', payload: '', action: () => OneBssApi.getPartners('operator', 'enabled') },
  { id: '2.2', name: 'GET /partner.php?id=1116 (Get Partner)', method: 'GET', module: '2. Partner Management', payload: '', action: () => OneBssApi.getPartnerById(1116) },
  { id: '2.3', name: 'POST /partner.php (Create Partner)', method: 'POST', module: '2. Partner Management', payload: JSON.stringify({ partner_name: 'Sai Ram', company_name: 'Sai Ram Cable Network', partner_mobile: '9876543210', partner_email: 'sai.ram789@gmail.com', partner_region: 'Vijayawada', login: { username: 'oper1', password: 'oper1', role: 'operator' }, internet_mapping: { internet_base_url: 'https://radius.vrplay.in', internet_token: 'sdfghjkluytresa', internet_partner_id: '222', internet_branch_id: '111' } }, null, 2), action: (p) => OneBssApi.createPartner(p ? JSON.parse(p) : {}) },
  { id: '2.4', name: 'PUT /partner.php?id=1116 (Update Partner)', method: 'PUT', module: '2. Partner Management', payload: JSON.stringify({ internet_mapping: { internet_base_url: 'https://radius.vrplay.in', internet_token: 'sdfghjkluytresa', internet_partner_id: '222', internet_branch_id: '111' } }, null, 2), action: (p) => OneBssApi.updatePartner(1116, p ? JSON.parse(p) : {}) },
  { id: '2.5', name: 'DELETE /partner.php?id=1120 (Delete Partner)', method: 'DELETE', module: '2. Partner Management', payload: '', action: () => OneBssApi.deletePartner(1120) },

  // 3. Internet Gateway Setup (2 APIs)
  { id: '3.1', name: 'POST /internet_partners_fetch.php', method: 'POST', module: '3. Internet Gateway Setup', payload: JSON.stringify({ internet_base_url: 'https://radius.vrplay.in', internet_token: 'OsFKjvkV8hJpPxilaG3kplsrBOd8WqxA' }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.fetchInternetPartners(body.internet_token, body.internet_base_url); } },
  { id: '3.2', name: 'POST /internet_branches_fetch.php', method: 'POST', module: '3. Internet Gateway Setup', payload: JSON.stringify({ internet_base_url: 'https://radius.vrplay.in', internet_token: 'OsFKjvkV8hJpPxilaG3kplsrBOd8WqxA', partner_id: 292 }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.fetchInternetBranches(body.internet_token, body.internet_base_url, body.partner_id); } },

  // 4. Internet Plan Catalog (3 APIs)
  { id: '4.1', name: 'POST /internet_plan_sync.php?partner_id=1116', method: 'POST', module: '4. Internet Plan Catalog', payload: '', action: () => OneBssApi.syncInternetPlans(1116) },
  { id: '4.2', name: 'GET /internet_plan_mapping.php?partner_id=1116', method: 'GET', module: '4. Internet Plan Catalog', payload: '', action: () => OneBssApi.getInternetPlans(1116) },
  { id: '4.3', name: 'POST /internet_plan_mapping.php (Map Plans)', method: 'POST', module: '4. Internet Plan Catalog', payload: JSON.stringify({ partner_id: 1116, plans: [{ internet_sub_plan_id: 12, price: 499 }, { internet_sub_plan_id: 13 }] }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.mapInternetPlansToOperator(body.partner_id, body.plans); } },

  // 5. IPTV Plan Catalog (3 APIs)
  { id: '5.1', name: 'POST /iptv_plan_sync.php?partner_id=1111 (SuperAdmin)', method: 'POST', module: '5. IPTV Plan Catalog', payload: '', action: () => OneBssApi.syncIptvPlans(1111) },
  { id: '5.2', name: 'GET /iptv_plan_mapping.php?partner_id=1116', method: 'GET', module: '5. IPTV Plan Catalog', payload: '', action: () => OneBssApi.getIptvPlans(1116) },
  { id: '5.3', name: 'POST /iptv_plan_mapping.php (Map Plans)', method: 'POST', module: '5. IPTV Plan Catalog', payload: JSON.stringify({ partner_id: 1116, plans: [{ iptv_sub_plan_id: 494, price: 25 }, { iptv_sub_plan_id: 495 }] }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.mapIptvPlansToOperator(body.partner_id, body.plans); } },

  // 6. Aadhaar KYC Verification (4 APIs)
  { id: '6.1', name: 'POST /digilocker_initialize.php', method: 'POST', module: '6. Aadhaar KYC Verification', payload: '{}', action: () => OneBssApi.digilockerInitialize() },
  { id: '6.2', name: 'POST /digilocker_download_aadhaar.php', method: 'POST', module: '6. Aadhaar KYC Verification', payload: JSON.stringify({ client_id: 'dl_client_123' }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.digilockerDownloadAadhaar(body.client_id, body.user_id); } },
  { id: '6.3', name: 'POST /scoreme_send_otp.php', method: 'POST', module: '6. Aadhaar KYC Verification', payload: JSON.stringify({ aadhaar_number: '123456789012', operator_id: 1116 }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.scoremeSendOtp(body.aadhaar_number, body.operator_id); } },
  { id: '6.4', name: 'POST /scoreme_verify_otp.php', method: 'POST', module: '6. Aadhaar KYC Verification', payload: JSON.stringify({ aadhaar_number: '123456789012', otp: '123456', operator_id: 1116 }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.scoremeVerifyOtp(body.aadhaar_number, body.otp, body.operator_id, body.user_id); } },

  // 7. Customer Management (6 APIs)
  { id: '7.1', name: 'POST /add_internet_customer.php (Aadhaar-Verified)', method: 'POST', module: '7. Customer Management', payload: JSON.stringify({ user_id: 12, operator_id: 1116, package_id: 1, sub_plan_id: 1, username: 'sridevi_k', password: 'SecurePass123', mobile: '9125253535', installation_address: 'Pedda Avutapalli' }, null, 2), action: (p) => OneBssApi.addInternetCustomer(p ? JSON.parse(p) : {}) },
  { id: '7.2', name: 'POST /add_internet_customer_manual.php (Manual)', method: 'POST', module: '7. Customer Management', payload: JSON.stringify({ operator_id: 1116, package_id: 1, sub_plan_id: 1, username: 'walkin_cust', password: 'SecurePass123', mobile: '9999888877', first_name: 'Ravi', last_name: 'Kumar', dob: '1990-05-15', billing_address: 'Telaprolu', installation_address: 'Telaprolu' }, null, 2), action: (p) => OneBssApi.addInternetCustomerManual(p ? JSON.parse(p) : {}) },
  { id: '7.3', name: 'POST /internet_customer_sync.php (Bulk Sync)', method: 'POST', module: '7. Customer Management', payload: '', action: () => OneBssApi.syncInternetCustomersBulk() },
  { id: '7.4', name: 'POST /internet_customer_detail_sync.php?internet_id=3', method: 'POST', module: '7. Customer Management', payload: '', action: () => OneBssApi.syncInternetCustomerDetail(3) },
  { id: '7.5', name: 'POST /iptv_customer_sync.php', method: 'POST', module: '7. Customer Management', payload: JSON.stringify({ mobile: '9125253535' }, null, 2), action: (p) => { const body = p ? JSON.parse(p) : {}; return OneBssApi.syncIptvCustomers(body.mobile); } },
  { id: '7.6', name: 'GET /customer_lookup.php?mobile=9125253535', method: 'GET', module: '7. Customer Management', payload: '', action: () => OneBssApi.customerLookup('9125253535') },
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
      <Text style={styles.title}>24-API Endpoint Verification Suite</Text>
      <Text style={styles.subtitle}>Execute and inspect all 24 endpoints from OneBSS API Documentation Manual</Text>

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
