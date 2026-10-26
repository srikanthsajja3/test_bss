import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

const money = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : `₹${Number(v).toFixed(2)}`);

// The FTA base pack is chargeable and is added automatically with every DPO pack.
// fta: the operator's FTA pack { plan_name, price } or null when none is assigned.
// compact: one small chip for list rows ("+ FTA ₹30.00"); otherwise a one-line banner.
export const FtaIncluded = ({ fta = null, compact = false }) => {
  const pack = Array.isArray(fta) ? fta[0] || null : fta;
  if (compact) {
    return pack ? (
      <View style={styles.inline}>
        <Feather name={pack.included ? 'check' : 'plus'} size={10} color="#6d28d9" />
        <Text style={styles.inlineText} numberOfLines={1}>{pack.included ? 'FTA included' : `FTA ${money(pack.price)}`}</Text>
      </View>
    ) : (
      <View style={[styles.inline, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <Feather name="alert-triangle" size={10} color="#b91c1c" />
        <Text style={[styles.inlineText, { color: '#b91c1c' }]} numberOfLines={1}>FTA not assigned</Text>
      </View>
    );
  }
  return pack ? (
    <View style={styles.banner}>
      <Feather name="plus-circle" size={14} color="#7c3aed" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.bannerTitle}>{pack.included ? 'FTA base pack included in the DPO price' : `FTA base pack added with the DPO · ${money(pack.price)}`}</Text>
        <Text style={styles.bannerSub} numberOfLines={1}>{pack.plan_name}</Text>
      </View>
    </View>
  ) : (
    <View style={[styles.banner, styles.bannerError]}>
      <Feather name="alert-triangle" size={14} color="#b91c1c" />
      <Text style={[styles.bannerTitle, { color: '#b91c1c', flex: 1 }]}>The FTA base pack is not assigned to this operator — a DPO can't be recharged without it. Ask the super admin to assign FTA.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(139,92,246,0.12)', marginTop: 3 },
  inlineText: { fontSize: 10, fontWeight: '700', color: '#6d28d9' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 8, marginBottom: 10, borderRadius: 8, backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)' },
  bannerError: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' },
  bannerTitle: { fontSize: 11, fontWeight: '700', color: '#5b21b6' },
  bannerSub: { fontSize: 11, color: '#4c1d95', marginTop: 2 },
});
