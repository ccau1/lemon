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

const SCREEN_HEIGHT = Dimensions.get("screen").height;

interface Props {
  visible: boolean;
  onClose: () => void;
  workspaces: Array<{ id: string; name: string }>;
  projects: string[];
  selectedWorkspace: string;
  selectedProject: string;
  onSelectWorkspace: (id: string) => void;
  onSelectProject: (name: string) => void;
}

export default function FilterModal({
  visible,
  onClose,
  workspaces,
  projects,
  selectedWorkspace,
  selectedProject,
  onSelectWorkspace,
  onSelectProject,
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
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.done}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>Workspace</Text>
            <View style={styles.chips}>
              <Chip
                label="All"
                active={selectedWorkspace === "all"}
                onPress={() => onSelectWorkspace("all")}
              />
              {workspaces.map((ws) => (
                <Chip
                  key={ws.id}
                  label={ws.name}
                  active={selectedWorkspace === ws.id}
                  onPress={() => onSelectWorkspace(ws.id)}
                />
              ))}
            </View>

            {projects.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Project</Text>
                <View style={styles.chips}>
                  <Chip
                    label="All"
                    active={selectedProject === "all"}
                    onPress={() => onSelectProject("all")}
                  />
                  {projects.map((p) => (
                    <Chip
                      key={p}
                      label={p}
                      active={selectedProject === p}
                      onPress={() => onSelectProject(p)}
                    />
                  ))}
                </View>
              </>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  done: { fontSize: 14, color: "#4f46e5", fontWeight: "600" },
  sectionLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", marginBottom: 8, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#f3f4f6" },
  chipActive: { backgroundColor: "#4f46e5" },
  chipText: { fontSize: 12, color: "#374151" },
  chipTextActive: { color: "#ffffff", fontWeight: "600" },
});
