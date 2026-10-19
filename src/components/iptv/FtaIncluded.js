import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

// Free-to-air packs come with every DPO pack at no charge.
// fta: [{ plan_id, plan_name }] from the API (may be empty — FTA is still included).
// compact: one line for list rows; otherwise a small banner for summaries.
export const FtaIncluded = ({ fta = [], compact = false }) => {
  const names = (fta || []).map((f) => f.plan_name).filter(Boolean);
  if (compact) {
    return (
      <View style={styles.inline}>
        <Feather name="check" size={10} color="#047857" />
        <Text style={styles.inlineText} numberOfLines={1}>FTA included</Text>
      </View>
    );
  }
  return (
    <View style={styles.banner}>
      <Feather name="check-circle" size={14} color="#10b981" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.bannerTitle}>FTA (Free-To-Air) included with the DPO · ₹0.00</Text>
        {names.length ? <Text style={styles.bannerSub} numberOfLines={2}>{names.join(', ')}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(16,185,129,0.12)', marginTop: 3 },
  inlineText: { fontSize: 10, fontWeight: '700', color: '#047857' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 8, marginBottom: 10, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.1)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)' },
  bannerTitle: { fontSize: 11, fontWeight: '700', color: '#047857' },
  bannerSub: { fontSize: 11, color: '#065f46', marginTop: 2 },
});
