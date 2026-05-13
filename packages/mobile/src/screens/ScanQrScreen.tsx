import React, { useCallback, useState, useEffect } from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { parseQrPayload } from "@lemon/shared";
import { ScanActions } from "../scanActions/index";
import { saveConnection } from "../stores/connectionsStore";
import { buildApiClient } from "../hooks/useApiClient";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function ScanQrScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [saving, setSaving] = useState(false);
  const scanActions = new ScanActions({ saveConnection, buildApiClient });
  const mode = (route.params as { mode?: "save" | "prefill" } | undefined)?.mode ?? "save";

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setSaving(false);
    }, [])
  );

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const parsed = parseQrPayload(data);
      if (parsed.prefix !== "lm") throw new Error("Not a Lemon QR code.");

      if (mode === "prefill") {
        if (parsed.type !== "m_conn") throw new Error("QR code is not a machine connection.");
        const d = parsed.data as Record<string, unknown>;
        if (!d.url || !d.machineId) throw new Error("Invalid connection data.");
        navigation.navigate("AddConnection", {
          qrName: (d.machineName as string) || (d.name as string) || "Unknown Machine",
          qrUrl: String(d.url).replace(/\/$/, ""),
          qrMachineId: d.machineId as string,
        });
        return;
      }

      setSaving(true);
      const handler = scanActions.get(parsed.type);
      if (!handler) throw new Error(`Unknown Lemon QR type: ${parsed.type}`);

      await handler.action(parsed.data, {
        navigate: (screen, params) => (navigation as any).navigate(screen, params),
        goBack: () => navigation.goBack(),
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to parse QR code.");
      setScanned(false);
    } finally {
      setSaving(false);
    }
  };

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera permission is required to scan QR codes.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      />
      {saving && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.overlayText}>Connecting...</Text>
        </View>
      )}
      <View style={styles.hintBox}>
        <Text style={styles.hint}>Point the camera at a Lemon QR code</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: { color: "#ffffff", marginTop: 12, fontSize: 16 },
  hintBox: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  hint: { color: "#ffffff", fontSize: 14 },
});
