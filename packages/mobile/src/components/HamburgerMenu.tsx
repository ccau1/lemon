import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function HamburgerMenu({ visible, onClose }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const items = [
    {
      icon: "qr-code-outline" as const,
      label: "QR Code",
      onPress: () => {
        onClose();
        navigation.navigate("ScanQr");
      },
    },
    {
      icon: "hardware-chip-outline" as const,
      label: "Connections",
      onPress: () => {
        onClose();
        navigation.navigate("Connections");
      },
    },
    {
      icon: "cog-outline" as const,
      label: "Settings",
      onPress: () => {
        onClose();
        navigation.navigate("Settings");
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <View style={styles.menu}>
          {items.map((item) => (
            <TouchableOpacity key={item.label} style={styles.row} onPress={item.onPress}>
              <Ionicons name={item.icon} size={20} color="#374151" />
              <Text style={styles.label}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 60,
    paddingRight: 12,
  },
  menu: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 180,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: { fontSize: 14, color: "#111827", fontWeight: "500" },
});
