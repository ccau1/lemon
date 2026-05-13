import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  type TouchableOpacityProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}

const variantStyles: Record<
  string,
  { container: ViewStyle; text: TextStyle }
> = {
  primary: {
    container: { backgroundColor: "#4f46e5" },
    text: { color: "#ffffff" },
  },
  secondary: {
    container: { backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb" },
    text: { color: "#374151" },
  },
  danger: {
    container: { backgroundColor: "#ef4444" },
    text: { color: "#ffffff" },
  },
};

const sizeStyles: Record<string, ViewStyle & TextStyle> = {
  sm: { paddingVertical: 6, paddingHorizontal: 12, fontSize: 12, borderRadius: 6 },
  md: { paddingVertical: 10, paddingHorizontal: 16, fontSize: 14, borderRadius: 8 },
  lg: { paddingVertical: 14, paddingHorizontal: 24, fontSize: 16, borderRadius: 10 },
};

export function Button({ title, variant = "primary", size = "md", style, ...rest }: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.base, v.container, s, style as ViewStyle]}
      {...rest}
    >
      <Text style={[styles.textBase, v.text, { fontSize: s.fontSize }]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  textBase: {
    fontWeight: "600",
  },
});
