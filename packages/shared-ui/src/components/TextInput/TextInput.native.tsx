import React from "react";
import {
  TextInput as RNTextInput,
  StyleSheet,
  type TextInputProps as RNTextInputProps,
} from "react-native";

export interface TextInputProps extends RNTextInputProps {
  error?: boolean;
}

export function TextInput({ error, style, ...rest }: TextInputProps) {
  return (
    <RNTextInput
      style={[styles.base, error && styles.error, style]}
      placeholderTextColor="#9ca3af"
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#ffffff",
  },
  error: {
    borderColor: "#ef4444",
  },
});
