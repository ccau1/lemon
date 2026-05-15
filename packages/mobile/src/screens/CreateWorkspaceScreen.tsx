import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native";
import { TextInput, Button } from "@lemon/shared-ui";
import { type Connection } from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { ConnectionSelect } from "../components/ConnectionSelect";

export default function CreateWorkspaceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { buildClient } = useApiClient();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);

  const handleConnectionsChange = useCallback((conns: Connection[]) => {
    setConnections(conns);
  }, []);

  const handleCreate = async () => {
    if (!selectedConnId) {
      Alert.alert("Error", "Select a connection.");
      return;
    }
    if (!name.trim() || !path.trim()) {
      Alert.alert("Error", "Name and path are required.");
      return;
    }
    setLoading(true);
    try {
      const conn = connections.find((c) => c.id === selectedConnId)!;
      const client = buildClient(conn);
      await client.createWorkspace({ name: name.trim(), path: path.trim() });
      Alert.alert("Created", "Workspace created successfully.");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create workspace.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        <ConnectionSelect
          selected={selectedConnId}
          onSelect={setSelectedConnId}
          onConnectionsChange={handleConnectionsChange}
        />

        {connections.length === 0 ? (
          <Text style={styles.empty}>No approved connections available.</Text>
        ) : (
          <>
            <Text style={styles.label}>Name</Text>
            <TextInput
              placeholder="Workspace name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              style={styles.input}
            />

            <Text style={styles.label}>Path</Text>
            <TextInput
              placeholder="/path/to/project"
              value={path}
              onChangeText={setPath}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            <View style={styles.gap} />
            <Button
              title={loading ? "Creating..." : "Create Workspace"}
              onPress={handleCreate}
              disabled={loading}
            />
          </>
        )}
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
  empty: { textAlign: "center", marginTop: 40, color: "#6b7280" },
});
