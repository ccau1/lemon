import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SCREEN_HEIGHT = Dimensions.get("screen").height;

interface Props {
  visible: boolean;
  onClose: () => void;
  workspaces: Array<{ id: string; name: string }>;
  selected: string;
  onSelect: (id: string) => void;
  onCreateWorkspace?: () => void;
}

export default function WorkspacePickerModal({
  visible,
  onClose,
  workspaces,
  selected,
  onSelect,
  onCreateWorkspace,
}: Props) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(SCREEN_HEIGHT);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handleRow}>
            <Text style={styles.title}>Workspaces</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.row, selected === "all" && styles.rowActive]}
              onPress={() => {
                onSelect("all");
                onClose();
              }}
            >
              <Text style={[styles.rowText, selected === "all" && styles.rowTextActive]}>All Workspaces</Text>
              {selected === "all" && <Ionicons name="checkmark" size={18} color="#4f46e5" />}
            </TouchableOpacity>
            {workspaces.map((ws) => (
              <TouchableOpacity
                key={ws.id}
                style={[styles.row, selected === ws.id && styles.rowActive]}
                onPress={() => {
                  onSelect(ws.id);
                  onClose();
                }}
              >
                <Text style={[styles.rowText, selected === ws.id && styles.rowTextActive]}>{ws.name}</Text>
                {selected === ws.id && <Ionicons name="checkmark" size={18} color="#4f46e5" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.createRow}
              onPress={() => {
                onCreateWorkspace?.();
              }}
            >
              <Text style={styles.createText}>+ Create Workspace</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  handleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  done: { fontSize: 14, color: "#4f46e5", fontWeight: "600" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rowActive: {},
  rowText: { fontSize: 15, color: "#374151" },
  rowTextActive: { color: "#4f46e5", fontWeight: "600" },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  createText: { fontSize: 15, color: "#4f46e5", fontWeight: "600" },
});
