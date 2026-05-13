import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, TextInput } from "@lemon/shared-ui";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSend: (message: string) => void;
  stepLabel: string;
  disabled?: boolean;
}

export default function CommentModal({ visible, onClose, onSend, stepLabel, disabled }: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent presentationStyle="overFullScreen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity style={styles.backdropTouch} onPress={onClose} activeOpacity={1} />
        </View>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Comment on {stepLabel}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <TextInput
            placeholder={`How should the ${stepLabel.toLowerCase()} be revised?`}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={6}
            style={styles.input}
          />
          <View style={{ marginTop: 12 }}>
            <Button
              title="Send Comment"
              onPress={handleSend}
              disabled={disabled || !text.trim()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: {
    padding: 4,
  },
  input: {
    minHeight: 120,
    textAlignVertical: "top",
  },
});
