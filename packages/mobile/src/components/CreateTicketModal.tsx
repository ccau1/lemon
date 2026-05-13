import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { TextInput, Button } from "@lemon/shared-ui";
import { getConnections, type Connection } from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";

export default function CreateTicketModal({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWsId, setSelectedWsId] = useState<string>("");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const { buildClient } = useApiClient();

  useEffect(() => {
    getConnections().then((conns) => {
      setConnections(conns);
      if (conns.length === 1) setSelectedConnId(conns[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedConnId) return;
    const conn = connections.find((c) => c.id === selectedConnId);
    if (!conn) return;
    const client = buildClient(conn);
    client.getWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]));
    setSelectedWsId("");
    setSelectedProjectId("");
  }, [selectedConnId, connections, buildClient]);

  useEffect(() => {
    if (!selectedWsId || !selectedConnId) return;
    const conn = connections.find((c) => c.id === selectedConnId);
    if (!conn) return;
    const client = buildClient(conn);
    client
      .getProjects(selectedWsId)
      .then(setProjects)
      .catch(() => setProjects([]));
    setSelectedProjectId("");
  }, [selectedWsId, selectedConnId, connections, buildClient]);

  const handleCreate = async () => {
    if (!selectedConnId || !selectedWsId || !selectedProjectId || !title.trim()) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const conn = connections.find((c) => c.id === selectedConnId)!;
      const client = buildClient(conn);
      await client.createTicket(selectedWsId, {
        projectId: selectedProjectId,
        title: title.trim(),
        description: description.trim(),
      });
      Alert.alert("Created", "Ticket created successfully.");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create ticket.");
    } finally {
      setLoading(false);
    }
  };

  const SelectRow = ({
    label,
    options,
    selected,
    onSelect,
  }: {
    label: string;
    options: Array<{ id: string; name: string }>;
    selected: string;
    onSelect: (id: string) => void;
  }) => (
    <View style={styles.selectRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <TouchableOpacity
            key={o.id}
            onPress={() => onSelect(o.id)}
            style={[styles.chip, selected === o.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, selected === o.id && styles.chipTextActive]}>
              {o.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Ticket</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {connections.length > 1 && (
          <SelectRow
            label="Connection"
            options={connections.map((c) => ({ id: c.id, name: c.name }))}
            selected={selectedConnId}
            onSelect={setSelectedConnId}
          />
        )}

        <SelectRow
          label="Workspace"
          options={workspaces.map((w) => ({ id: w.id, name: w.name }))}
          selected={selectedWsId}
          onSelect={setSelectedWsId}
        />

        <SelectRow
          label="Project"
          options={projects.map((p) => ({ id: p.id, name: p.name }))}
          selected={selectedProjectId}
          onSelect={setSelectedProjectId}
        />

        <Text style={styles.label}>Title</Text>
        <TextInput
          placeholder="Ticket title"
          value={title}
          onChangeText={setTitle}
          style={styles.input}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          placeholder="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
        />

        <View style={{ height: 16 }} />
        <Button title={loading ? "Creating..." : "Create Ticket"} onPress={handleCreate} disabled={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  close: { fontSize: 14, color: "#4f46e5", fontWeight: "600" },
  form: { padding: 16 },
  selectRow: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f3f4f6" },
  chipActive: { backgroundColor: "#4f46e5" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextActive: { color: "#ffffff", fontWeight: "600" },
  input: { marginBottom: 12 },
});
