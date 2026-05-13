import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  onWorkspaces: () => void;
  onAddTicket: () => void;
  onFilters: () => void;
}

export default function BottomPillNav({ onWorkspaces, onAddTicket, onFilters }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.pill}>
        <TouchableOpacity style={styles.item} onPress={onWorkspaces}>
          <Ionicons name="grid-outline" size={22} color="#374151" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.itemCenter} onPress={onAddTicket}>
          <View style={styles.centerCircle}>
            <Ionicons name="add" size={28} color="#ffffff" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.item} onPress={onFilters}>
          <Ionicons name="funnel-outline" size={22} color="#374151" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  itemCenter: {
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  centerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
  },
});
