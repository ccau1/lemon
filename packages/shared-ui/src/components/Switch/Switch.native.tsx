import React from "react";
import {
  TouchableOpacity,
  View,
  StyleSheet,
  type ViewStyle,
} from "react-native";

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function Switch({ value, onValueChange, disabled }: SwitchProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => !disabled && onValueChange(!value)}
      style={[
        styles.track,
        value ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <View
        style={[
          styles.thumb,
          value ? styles.thumbOn : styles.thumbOff,
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: "center",
  },
  trackOn: {
    backgroundColor: "#4f46e5",
  },
  trackOff: {
    backgroundColor: "#d1d5db",
  },
  disabled: {
    opacity: 0.5,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbOn: {
    alignSelf: "flex-end",
  },
  thumbOff: {
    alignSelf: "flex-start",
  },
});
