import AsyncStorage from "@react-native-async-storage/async-storage";

export type ConnectionStatus = "pending" | "approved" | "removed";

export interface Connection {
  id: string;
  name: string;
  url: string;
  machineId?: string;
  enabled?: boolean;
  status?: ConnectionStatus;
}

const CONNECTIONS_KEY = "@lemon_connections";
const ACTIVE_CONNECTION_KEY = "@lemon_active_connection";
const DEVICE_ID_KEY = "@lemon_device_id";

export async function getConnections(): Promise<Connection[]> {
  const raw = await AsyncStorage.getItem(CONNECTIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveConnection(conn: Connection): Promise<void> {
  const all = await getConnections();
  const idx = all.findIndex((c) => c.id === conn.id);
  if (idx >= 0) {
    all[idx] = { ...conn, enabled: conn.enabled ?? all[idx].enabled ?? true };
  } else {
    all.push({ ...conn, enabled: conn.enabled ?? true });
  }
  await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(all));
}

export async function deleteConnection(id: string): Promise<void> {
  const all = await getConnections();
  const filtered = all.filter((c) => c.id !== id);
  await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(filtered));
}

export async function getActiveConnectionId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_CONNECTION_KEY);
}

export async function setActiveConnectionId(id: string | null): Promise<void> {
  if (id) {
    await AsyncStorage.setItem(ACTIVE_CONNECTION_KEY, id);
  } else {
    await AsyncStorage.removeItem(ACTIVE_CONNECTION_KEY);
  }
}

export async function toggleConnectionEnabled(id: string): Promise<void> {
  const all = await getConnections();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], enabled: !all[idx].enabled };
    await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(all));
  }
}

export async function updateConnectionStatus(id: string, status: ConnectionStatus): Promise<void> {
  const all = await getConnections();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], status };
    await AsyncStorage.setItem(CONNECTIONS_KEY, JSON.stringify(all));
  }
}

export async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
