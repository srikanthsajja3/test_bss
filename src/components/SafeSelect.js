import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

export const SafeSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  disabled = false,
  style,
  selectStyle,
  title = 'Select Option',
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  // Normalize options to [{ value: string, label: string }]
  const normalizedOptions = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        value: String(opt.value !== undefined ? opt.value : (opt.id !== undefined ? opt.id : '')),
        label: String(opt.label || opt.name || opt.title || opt.value || ''),
        raw: opt,
      };
    }
    return { value: String(opt), label: String(opt), raw: opt };
  });

  const selectedOption = normalizedOptions.find((o) => o.value === String(value));

  // On Web, render native HTML select for maximum desktop speed & native browser autofill
  if (Platform.OS === 'web') {
    return (
      <select
        value={value !== undefined && value !== null ? String(value) : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          height: 38,
          borderRadius: 8,
          border: '1px solid #cbd5e1',
          backgroundColor: disabled ? '#f8fafc' : '#ffffff',
          color: '#0f172a',
          fontSize: 13,
          paddingLeft: 10,
          paddingRight: 10,
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...(selectStyle || {}),
        }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  // On Mobile (Android / iOS), render touchable dropdown pill with modal picker
  const filtered = search
    ? normalizedOptions.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : normalizedOptions;

  return (
    <View style={style}>
      <TouchableOpacity
        style={[
          styles.triggerBox,
          disabled && styles.triggerBoxDisabled,
          selectStyle,
        ]}
        onPress={() => !disabled && setModalVisible(true)}
        activeOpacity={0.7}
        disabled={disabled}
      >
        <Text
          style={[
            styles.triggerText,
            !selectedOption && styles.triggerPlaceholder,
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Feather name="chevron-down" size={16} color="#64748b" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View
            style={styles.modalContainer}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeBtn}
              >
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {normalizedOptions.length > 6 && (
              <View style={styles.searchRow}>
                <Feather name="search" size={14} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search..."
                  placeholderTextColor="#94a3b8"
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Feather name="x-circle" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => {
                const isSelected = item.value === String(value);
                return (
                  <TouchableOpacity
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                    onPress={() => {
                      onChange(item.value);
                      setModalVisible(false);
                      setSearch('');
                    }}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color="#0284c7" />
                    )}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No options found</Text>
                </View>
              }
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  triggerBox: {
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  triggerBoxDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  triggerText: {
    fontSize: 13,
    color: '#0f172a',
    flex: 1,
    marginRight: 6,
  },
  triggerPlaceholder: {
    color: '#94a3b8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    padding: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  optionRowSelected: {
    backgroundColor: '#f0f9ff',
  },
  optionLabel: {
    fontSize: 13,
    color: '#334155',
  },
  optionLabelSelected: {
    color: '#0284c7',
    fontWeight: '600',
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
