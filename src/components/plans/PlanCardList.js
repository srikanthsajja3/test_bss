import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { PlanPriceTable } from './PlanPriceTable';

/**
 * The plan-assigning layout shared by internet, IPTV and OTT: one card per package (the original
 * card design). Collapsed, a card shows the package; expanded, its options (validities /
 * durations) are listed in a price table (PlanPriceTable) — select, super admin price, one margin
 * per level above the operator, operator price.
 *
 * groups: [{ key, title, meta, typeLabel?, note?, rows: [PlanPriceTable plan rows] }]
 *   note: a highlighted price line under the title (e.g. IPTV DPO: "DPO ₹150 + FTA ₹35.40 = ₹185.40")
 * expandedKeys / onToggleExpand: controlled expand state (omit both to let the list keep its own)
 * forceExpanded: open every card (e.g. while searching)
 * The other props are passed to PlanPriceTable (mode, chain, viewerId, selectedIds, onToggle,
 * saPriceOf, onSaPriceChange, marginState, onMarginChange, showFetched, accent).
 */
export const PlanCardList = ({
  groups = [],
  expandedKeys,
  onToggleExpand,
  forceExpanded = false,
  onToggleGroup,
  icon = 'zap',
  accent = '#06b6d4',
  mode = 'edit',
  selectedIds = [],
  ...tableProps
}) => {
  const [ownExpanded, setOwnExpanded] = useState([]);
  const expanded = expandedKeys || ownExpanded;
  const toggleExpand = onToggleExpand || ((key) => setOwnExpanded((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])));
  const edit = mode === 'edit';
  const selected = new Set(selectedIds.map(String));

  return (
    <View style={{ gap: 14 }}>
      {groups.map((g) => {
        const ids = g.rows.map((r) => r.id);
        const selectedCount = ids.filter((id) => selected.has(String(id))).length;
        const allSelected = ids.length > 0 && selectedCount === ids.length;
        const isOpen = forceExpanded || expanded.includes(g.key);
        return (
          <View
            key={g.key}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: isOpen ? `${accent}66` : 'rgba(0,0,0,0.08)',
              overflow: 'hidden',
              boxShadow: '0px 4px 12px rgba(0,0,0,0.03)',
            }}
          >
            {/* PACKAGE CARD HEADER (click to expand / collapse) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => toggleExpand(g.key)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 10, backgroundColor: isOpen ? '#f8fafc' : '#ffffff' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: isOpen ? `${accent}26` : `${accent}14`, justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name={icon} size={20} color={accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>{g.title}</Text>
                    {g.typeLabel ? (
                      <View style={{ backgroundColor: `${accent}1f`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: accent }}>{g.typeLabel}</Text>
                      </View>
                    ) : null}
                    <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#0369a1' }}>
                        {g.rows.length} {g.rows.length === 1 ? 'Option' : 'Options'}
                      </Text>
                    </View>
                    {edit && selectedCount > 0 ? (
                      <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#10b981' }}>{selectedCount} Selected</Text>
                      </View>
                    ) : null}
                  </View>
                  {g.meta ? (
                    <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }} numberOfLines={2}>{g.meta}</Text>
                  ) : null}
                  {g.note ? (
                    <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${accent}12`, borderWidth: 1, borderColor: `${accent}33` }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: accent }}>{g.note}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {edit && ids.length > 0 && onToggleGroup ? (
                  <TouchableOpacity
                    onPress={(e) => {
                      e?.stopPropagation?.();
                      onToggleGroup(g, allSelected);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      backgroundColor: allSelected ? 'rgba(16, 185, 129, 0.12)' : '#f1f5f9',
                      borderWidth: 1,
                      borderColor: allSelected ? '#10b981' : 'rgba(0,0,0,0.08)',
                    }}
                  >
                    <Feather name={allSelected ? 'check-square' : 'square'} size={13} color={allSelected ? '#10b981' : '#64748b'} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: allSelected ? '#10b981' : '#64748b' }}>
                      {allSelected ? 'All Selected' : 'Select All Options'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: isOpen ? `${accent}26` : '#f1f5f9', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name={isOpen ? 'minus' : 'plus'} size={18} color={isOpen ? accent : '#000000'} />
                </View>
              </View>
            </TouchableOpacity>

            {/* EXPANDED: the package's options as a price table */}
            {isOpen && g.rows.length > 0 ? (
              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#ffffff' }}>
                <PlanPriceTable rows={g.rows} mode={mode} selectedIds={selectedIds} accent={accent} bare firstHeader="Option" {...tableProps} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
};
