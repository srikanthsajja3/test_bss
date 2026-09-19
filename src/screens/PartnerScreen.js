import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { OneBssApi } from '../services/oneBssApi';

export const PartnerScreen = ({ onOpenCreate }) => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedPartner, setSelectedPartner] = useState(null);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await OneBssApi.getPartners(search, selectedRole);
      if (res.data && Array.isArray(res.data)) {
        setPartners(res.data);
      } else {
        setPartners([
          { partner_id: 1116, partner_name: 'Airtel Broadband Ltd', company_name: 'Bharti Airtel Ltd', partner_mobile: '9876543210', partner_email: 'support@airtel.in', account_role: 'operator', status: 'enabled' },
          { partner_id: 1117, partner_name: 'Jio Digital Fibre', company_name: 'Reliance Jio Infocomm', partner_mobile: '9123456789', partner_email: 'care@jio.com', account_role: 'admin', status: 'enabled' },
          { partner_id: 1118, partner_name: 'Act Fibernet', company_name: 'Atria Convergence Tech', partner_mobile: '9988776655', partner_email: 'act@fibernet.in', account_role: 'operator', status: 'disabled' },
        ]);
      }
    } catch (e) {
      setPartners([
        { partner_id: 1116, partner_name: 'Airtel Broadband Ltd', company_name: 'Bharti Airtel Ltd', partner_mobile: '9876543210', partner_email: 'support@airtel.in', account_role: 'operator', status: 'enabled' },
        { partner_id: 1117, partner_name: 'Jio Digital Fibre', company_name: 'Reliance Jio Infocomm', partner_mobile: '9123456789', partner_email: 'care@jio.com', account_role: 'admin', status: 'enabled' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [search, selectedRole]);

  const renderPartnerCard = ({ item }) => {
    const isEnabled = item.status === 'enabled';
    return (
      <View style={styles.partnerCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.partnerName}>{item.partner_name}</Text>
            <Text style={styles.companyName}>{item.company_name} (ID: #{item.partner_id})</Text>
          </View>
          <View style={[styles.statusTag, isEnabled ? styles.tagEnabled : styles.tagDisabled]}>
            <Text style={[styles.tagText, isEnabled ? styles.tagTextEnabled : styles.tagTextDisabled]}>
              {item.status ? item.status.toUpperCase() : 'ENABLED'}
            </Text>
          </View>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.infoRow}>
            <Feather name="phone" size={13} color={COLORS.textMuted} />
            <Text style={styles.infoText}>{item.partner_mobile || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="mail" size={13} color={COLORS.textMuted} />
            <Text style={styles.infoText}>{item.partner_email || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Feather name="shield" size={13} color={COLORS.textMuted} />
            <Text style={styles.infoText}>Role: {item.account_role || 'partner'}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.btnDetails} onPress={() => setSelectedPartner(item)}>
            <Text style={styles.btnDetailsText}>Gateway Configs</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Title & Add Button */}
      <View style={styles.topRow}>
        <View>
          <Text style={styles.title}>Partner & Gateway Console</Text>
          <Text style={styles.subtitle}>Manage telecom operators, RADIUS servers, and IPTV gateway bindings</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={onOpenCreate}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add Partner</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Controls */}
      <View style={styles.filterRow}>
        <View style={styles.searchBox}>
          <Feather name="search" size={16} color={COLORS.textDim} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, company, email, mobile, or ID..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={COLORS.textDim}
          />
        </View>

        <View style={styles.roleFilters}>
          {['', 'operator', 'admin'].map((role) => (
            <TouchableOpacity
              key={role}
              style={[styles.roleChip, selectedRole === role && styles.roleChipActive]}
              onPress={() => setSelectedRole(role)}
            >
              <Text style={[styles.roleChipText, selectedRole === role && styles.roleChipTextActive]}>
                {role === '' ? 'All Roles' : role.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Partner Cards List */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={partners}
          keyExtractor={(item) => String(item.partner_id)}
          renderItem={renderPartnerCard}
          scrollEnabled={false}
          contentContainerStyle={{ gap: 14 }}
        />
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  content: {
    padding: 24,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
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
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  addBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  searchBox: {
    flex: 1,
    maxWidth: 420,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMain,
    outlineStyle: 'none',
  },
  roleFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  roleChipActive: {
    backgroundColor: COLORS.primary,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleChipTextActive: {
    color: '#ffffff',
  },
  partnerCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  companyName: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagEnabled: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  tagDisabled: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tagTextEnabled: {
    color: COLORS.accentEmerald,
  },
  tagTextDisabled: {
    color: COLORS.accentRose,
  },
  cardDetails: {
    gap: 6,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 12,
  },
  btnDetails: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  btnDetailsText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accentCyan,
  },
});
