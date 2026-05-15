import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export interface SelectRowOption {
  id: string;
  name: string;
}

export interface SelectRowProps {
  label: string;
  options: SelectRowOption[];
  selected: string;
  onSelect: (id: string) => void;
  getDisabled?: (id: string) => boolean;
  renderIndicator?: (id: string) => React.ReactNode;
}

export function SelectRow({
  label,
  options,
  selected,
  onSelect,
  getDisabled,
  renderIndicator,
}: SelectRowProps) {
  return (
    <View style={styles.selectRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const disabled = getDisabled?.(o.id) ?? false;
          const isActive = selected === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => {
                if (!disabled) onSelect(o.id);
              }}
              style={[
                styles.chip,
                isActive && styles.chipActive,
                disabled && styles.chipDisabled,
              ]}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <View style={styles.chipInner}>
                {renderIndicator?.(o.id)}
                <Text
                  style={[
                    styles.chipText,
                    isActive && styles.chipTextActive,
                    disabled && styles.chipTextDisabled,
                  ]}
                >
                  {o.name}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selectRow: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  chipActive: { backgroundColor: "#4f46e5" },
  chipDisabled: { backgroundColor: "#f3f4f6", opacity: 0.6 },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#ffffff", fontWeight: "600" },
  chipTextDisabled: { color: "#9ca3af" },
  chipInner: { flexDirection: "row", alignItems: "center", gap: 6 },
});
