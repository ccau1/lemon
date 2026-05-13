import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  RefreshControl,
  Switch,
  AppState,
} from "react-native";
import { TouchableOpacity, FlatList } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import {
  getConnections,
  deleteConnection,
  toggleConnectionEnabled,
  updateConnectionStatus,
  getOrCreateDeviceId,
  type Connection,
} from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";
import { subscribe } from "../services/wsManager";
import ConfirmModal from "../components/ConfirmModal";

const PING_INTERVAL_MS = 10000;

export default function ConnectionsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ width: 32, height: 32, justifyContent: "center", alignItems: "center" }}>
          <Ionicons
            name="add-outline"
            size={24}
            color="#4f46e5"
            onPress={() => navigation.navigate("AddConnection")}
            style={{ lineHeight: 24, width: 24, textAlign: "center", marginLeft: 4.5 }}
          />
        </View>
      ),
    });
  }, [navigation]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<Connection | null>(null);
  const { buildClient } = useApiClient();

  const load = useCallback(async () => {
    const all = await getConnections();
    setConnections(all);

    const enabled = all.filter((c) => c.enabled !== false);
    if (enabled.length === 0) return;

    await Promise.all(
      enabled.map(async (conn) => {
        try {
          if (conn.status === "removed") {
            // Don't auto-re-register removed connections
            return;
          }
          const client = buildClient(conn);
          const device = await client.getDeviceStatus();
          if (conn.status !== device.status) {
            await updateConnectionStatus(conn.id, device.status as "pending" | "approved" | "removed");
          }
        } catch (e: any) {
          const msg = e?.message || "";
          if (msg.includes("not found") || msg.includes("404")) {
            if (conn.status !== "removed") {
              await updateConnectionStatus(conn.id, "removed");
            }
          }
          // ignore other network errors during background refresh
        }
      })
    );

    const refreshed = await getConnections();
    setConnections(refreshed);
  }, [buildClient]);

  const checkOnline = useCallback(async () => {
    const all = await getConnections();
    const enabled = all.filter((c) => c.enabled !== false);
    const next: Record<string, boolean> = {};
    await Promise.all(
      enabled.map(async (conn) => {
        try {
          const client = buildClient(conn);
          await client.healthCheck();
          next[conn.id] = true;
        } catch {
          next[conn.id] = false;
        }
      })
    );
    setOnlineMap(next);
  }, [buildClient]);

  const wsUnsubscribeRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getOrCreateDeviceId().then((deviceId) => {
      if (cancelled) return;
      wsUnsubscribeRef.current = subscribe("device:updated", async (payload, connectionId) => {
        if (payload?.deviceId === deviceId) {
          const status = payload.status;
          if (status === "approved" || status === "pending" || status === "removed") {
            await updateConnectionStatus(connectionId, status);
            load();
          }
        }
      });
    });
    return () => {
      cancelled = true;
      wsUnsubscribeRef.current?.();
    };
  }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      checkOnline();
      const timer = setInterval(checkOnline, PING_INTERVAL_MS);
      return () => clearInterval(timer);
    }, [load, checkOnline])
  );

  const handleDelete = (conn: Connection) => {
    setConfirmDelete(conn);
  };

  const onConfirmDelete = async () => {
    if (!confirmDelete) return;
    await deleteConnection(confirmDelete.id);
    setConfirmDelete(null);
    load();
  };

  const handleReconnect = async (conn: Connection) => {
    try {
      const client = buildClient(conn);
      const result = await client.reconnectDevice();

      if (result.status === "pending_approval") {
        await updateConnectionStatus(conn.id, "pending");
        load();
        Alert.alert("Pending Approval", `Approve "${conn.name}" on the machine before connecting.`);
        return;
      }

      await updateConnectionStatus(conn.id, "approved");
      load();
      Alert.alert("Connected", `Successfully reached ${conn.name}.`);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to reconnect.");
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dotStyle = (item: Connection) => {
    if (item.enabled === false) return styles.dotDisabled;
    if (onlineMap[item.id] !== true) return styles.dotOffline;
    if (item.status === "removed") return styles.dotOffline;
    if (item.status === "pending") return styles.dotPending;
    return styles.dotOnline;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ flexGrow: 1, padding: 16 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No connections yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.enabled !== false && item.status === "approved" && styles.cardActive]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardContent}>
                <View style={styles.nameRow}>
                  <View style={[styles.dot, dotStyle(item)]} />
                  <Text style={styles.name}>{item.name}</Text>
                </View>
                <Text style={styles.url}>{item.url}</Text>
                {item.status === "pending" && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Pending approval on machine</Text>
                  </View>
                )}
                {item.status === "removed" && (
                  <View style={[styles.badge, { backgroundColor: "#fee2e2" }]}>
                    <Text style={[styles.badgeText, { color: "#b91c1c" }]}>Removed by machine</Text>
                  </View>
                )}
              </View>
              <Switch
                value={item.enabled !== false && item.status !== "removed" && item.status !== "pending"}
                disabled={item.status === "removed" || item.status === "pending"}
                onValueChange={async () => {
                  await toggleConnectionEnabled(item.id);
                  load();
                }}
                trackColor={{ false: "#d1d5db", true: "#4f46e5" }}
              />
            </View>
            <View style={styles.actions}>
              {item.status === "removed" && (
                <TouchableOpacity onPress={() => handleReconnect(item)} style={styles.actionBtn}>
                  <Text style={styles.actionText}>Reconnect</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                <Text style={[styles.actionText, { color: "#ef4444" }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
      <ConfirmModal
        visible={confirmDelete !== null}
        title="Delete Connection"
        message={confirmDelete ? `Remove "${confirmDelete.name}"?` : ""}
        confirmText="Delete"
        confirmColor="#ef4444"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#6b7280" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardActive: { borderColor: "#4f46e5", borderWidth: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardContent: { flex: 1, marginBottom: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 16, fontWeight: "700", color: "#111827" },
  url: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotOnline: { backgroundColor: "#22c55e" },
  dotOffline: { backgroundColor: "#ef4444" },
  dotPending: { backgroundColor: "#f59e0b" },
  dotDisabled: { backgroundColor: "#9ca3af" },
  badge: {
    marginTop: 6,
    alignSelf: "flex-start",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b45309",
  },
  actions: { flexDirection: "row", gap: 12 },
  actionBtn: { paddingVertical: 4 },
  actionText: { fontSize: 13, color: "#4f46e5", fontWeight: "600" },
});
