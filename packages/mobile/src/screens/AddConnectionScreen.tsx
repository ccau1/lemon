import React, { useEffect, useLayoutEffect, useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { TextInput, Button } from "@lemon/shared-ui";
import { saveConnection, type Connection } from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";
import type { RootStackParamList } from "../navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function AddConnectionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { buildClient } = useApiClient();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ width: 32, height: 32, justifyContent: "center", alignItems: "center" }}>
          <Ionicons
            name="qr-code-outline"
            size={24}
            color="#4f46e5"
            onPress={() => navigation.navigate("ScanQr", { mode: "prefill" })}
            style={{ lineHeight: 24, width: 24, textAlign: "center", marginLeft: 4.5 }}
          />
        </View>
      ),
    });
  }, [navigation]);

  const doSave = async (saveName: string, saveUrl: string) => {
    if (!saveName.trim() || !saveUrl.trim()) {
      Alert.alert("Error", "Name and URL are required.");
      return;
    }
    setLoading(true);
    try {
      const conn: Connection = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: saveName.trim(),
        url: saveUrl.trim().replace(/\/$/, ""),
      };
      const client = buildClient(conn);
      const result = await client.registerDevice();

      if (result.status === "removed") {
        await saveConnection({ ...conn, status: "removed" });
        Alert.alert("Removed", "This machine has removed this connection.");
        navigation.goBack();
        setLoading(false);
        return;
      }

      const status = result.status === "pending_approval" ? "pending" : "approved";
      await saveConnection({ ...conn, status });

      if (status === "pending") {
        Alert.alert("Saved", `Connection to ${conn.name} saved. Approve this device on the machine to connect.`);
      } else {
        Alert.alert("Saved", `Connection to ${conn.name} saved.`);
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to connect.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => doSave(name, url);

  useEffect(() => {
    const params = (route.params || {}) as { qrName?: string; qrUrl?: string; qrMachineId?: string };
    if (params.qrUrl && params.qrMachineId) {
      const prefillName = params.qrName || "Unknown Machine";
      const prefillUrl = String(params.qrUrl).replace(/\/$/, "");
      if (name !== prefillName || url !== prefillUrl) {
        setName(prefillName);
        setUrl(prefillUrl);
        doSave(prefillName, prefillUrl);
      }
    }
  }, [route.params]);

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          placeholder="e.g. Home Server"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          style={styles.input}
        />

        <Text style={styles.label}>URL</Text>
        <TextInput
          placeholder="http://192.168.1.100:3000"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />

        <View style={styles.gap} />
        <Button
          title={loading ? "Testing..." : "Save Connection"}
          onPress={handleSave}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  form: { padding: 16, gap: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151" },
  input: { marginTop: 4 },
  gap: { height: 8 },
});
