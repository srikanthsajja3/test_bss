import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { CustomerLocationMap } from './CustomerLocationMap';

export const CustomerLocationModal = ({
  visible,
  onClose,
  customer,
  onLocationSaved,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  if (!visible || !customer) return null;

  const rawMobile = customer.mobile || customer.MobileNumber || customer.mobile_number || customer.username || '';
  const cleanMobile = String(rawMobile).replace(/\D/g, '').slice(-10);
  const name = customer.full_name || customer.name || `Customer #${customer.cust_id || customer.id}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { width: isMobile ? '96%' : 780, maxHeight: '90%' }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.headerIcon}>
                <Feather name="map-pin" size={18} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Customer Location Mapping</Text>
                <Text style={styles.modalSub}>
                  {name} {cleanMobile ? `· +91 ${cleanMobile}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={COLORS.textDim || '#64748b'} />
            </TouchableOpacity>
          </View>

          {/* Map Content */}
          <View style={{ flex: 1, padding: 12 }}>
            <CustomerLocationMap
              key={`${customer.cust_id || customer.id}_${cleanMobile}`}
              mobile={cleanMobile}
              customerName={name}
              customerAddress={customer.installation_address || customer.address || customer.billing_address || ''}
              customerZipcode={customer.zipcode || ''}
              custId={customer.cust_id || customer.id}
              onLocationSaved={(coords) => {
                if (onLocationSaved) onLocationSaved(coords);
              }}
            />
          </View>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 99999,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 25,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 6,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
});
