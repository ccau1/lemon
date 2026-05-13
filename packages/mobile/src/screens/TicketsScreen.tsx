import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Modal,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { TouchableOpacity, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "../navigation/RootNavigator";
import { getConnections, getOrCreateDeviceId } from "../stores/connectionsStore";
import { subscribe } from "../services/wsManager";
import { useApiClient } from "../hooks/useApiClient";
import CreateTicketModal from "../components/CreateTicketModal";
import BottomPillNav from "../components/BottomPillNav";
import HamburgerMenu from "../components/HamburgerMenu";
import FilterModal from "../components/FilterModal";
import WorkspacePickerModal from "../components/WorkspacePickerModal";
import { Ionicons } from "@expo/vector-icons";

interface EnrichedTicket {
  id: string;
  title: string;
  status: string;
  state?: string;
  step?: string;
  effectiveStep?: string;
  workspaceId: string;
  workspaceName: string;
  projectName?: string;
  connectionId: string;
  connectionName: string;
  updatedAt: string;
  createdAt: string;
}

type ListItem =
  | { type: "header"; title: string }
  | { type: "ticket"; data: EnrichedTicket };

const SECTION_ORDER = [
  "spec",
  "plan",
  "tasks",
  "implement",
  "queued",
  "running",
  "awaiting_review",
  "stopped",
  "error",
  "done",
  "idle",
];

function getSectionKey(t: EnrichedTicket): string {
  return t.step || t.state || t.status;
}

function sectionRank(key: string): number {
  const idx = SECTION_ORDER.indexOf(key);
  return idx === -1 ? SECTION_ORDER.length : idx;
}

export default function TicketsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [tickets, setTickets] = useState<EnrichedTicket[]>([]);
  const [workspaces, setWorkspaces] = useState<Map<string, string>>(new Map());
  const [projects, setProjects] = useState<Set<string>>(new Set());
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [showFade, setShowFade] = useState(true);
  const { buildClient } = useApiClient();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const connections = (await getConnections()).filter(
      (c) => c.enabled !== false && c.status === "approved"
    );
    const allTickets: EnrichedTicket[] = [];
    const wsMap = new Map<string, string>();
    const projSet = new Set<string>();

    for (const conn of connections) {
      try {
        const client = buildClient(conn);
        const wss = await client.getWorkspaces();
        for (const w of wss) wsMap.set(w.id, w.name);
        const all = await client.getAllTickets();
        for (const t of all) {
          allTickets.push({
            id: t.id,
            title: t.title,
            status: t.status,
            state: t.state,
            step: t.step,
            effectiveStep: t.effectiveStep,
            workspaceId: t.workspaceId,
            workspaceName: wsMap.get(t.workspaceId) || t.workspaceId,
            projectName: t.projectName,
            connectionId: conn.id,
            connectionName: conn.name,
            updatedAt: t.updatedAt,
            createdAt: t.createdAt || t.updatedAt,
          });
          if (t.projectName) projSet.add(t.projectName);
        }
      } catch {
        // skip unreachable connections
      }
    }

    setTickets(allTickets);
    setWorkspaces(wsMap);
    setProjects(projSet);
  }, [buildClient]);

  useEffect(() => {
    let deviceId: string;
    getOrCreateDeviceId().then((id) => {
      deviceId = id;
    });

    return subscribe("device:updated", (payload) => {
      if (payload?.deviceId === deviceId) {
        load();
      }
    });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = tickets.filter((t) => {
    if (selectedWorkspace !== "all" && t.workspaceId !== selectedWorkspace) return false;
    if (selectedProject !== "all" && t.projectName !== selectedProject) return false;
    return true;
  });

  // Build sections
  const groups = new Map<string, EnrichedTicket[]>();
  for (const t of filtered) {
    const key = getSectionKey(t);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const sections = Array.from(groups.entries())
    .map(([title, data]) => ({
      title,
      data: data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }))
    .sort((a, b) => sectionRank(a.title) - sectionRank(b.title));

  // Build flat list items for inverted list: tickets first, then header
  // so visually (after inverted) header appears above its tickets
  const listItems: ListItem[] = [];
  sections.forEach((sec) => {
    sec.data.forEach((t) => listItems.push({ type: "ticket", data: t }));
    listItems.push({ type: "header", title: sec.title });
  });

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atVisualTop =
      contentSize.height > 0 && contentOffset.y + layoutMeasurement.height >= contentSize.height - 4;
    setShowFade(!atVisualTop);
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      awaiting_review: "#f59e0b",
      queued: "#3b82f6",
      running: "#6366f1",
      error: "#ef4444",
      spec: "#6b7280",
      plan: "#6b7280",
      tasks: "#6b7280",
      implement: "#6b7280",
      done: "#10b981",
      stopped: "#9ca3af",
      idle: "#9ca3af",
    };
    return map[status] || "#6b7280";
  };

  const displayStatus = (item: EnrichedTicket) => item.step || item.state || item.status;

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "header") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{item.title}</Text>
        </View>
      );
    }

    const t = item.data;
    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate("TicketDetail", {
            workspaceId: t.workspaceId,
            ticketId: t.id,
            connectionId: t.connectionId,
          })
        }
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{t.title}</Text>
          <View style={[styles.badge, { backgroundColor: statusBadge(displayStatus(t)) + "20" }]}>
            <Text style={[styles.badgeText, { color: statusBadge(displayStatus(t)) }]}>
              {displayStatus(t)}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {t.workspaceName} • {t.projectName || "No project"} • {t.connectionName}
        </Text>
      </TouchableOpacity>
    );
  };

  const workspaceList = Array.from(workspaces.entries()).map(([id, name]) => ({ id, name }));

  return (
    <View style={styles.container}>
      <FlatList
        data={listItems}
        keyExtractor={(item, index) =>
          item.type === "header" ? `hdr-${item.title}` : `tk-${item.data.connectionId}-${item.data.id}-${index}`
        }
        inverted
        refreshing={refreshing}
        onRefresh={onRefresh}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No tickets found.</Text>
          </View>
        }
        contentContainerStyle={{ paddingTop: insets.bottom + 80, paddingBottom: insets.top }}
        renderItem={renderItem}
      />

      {showFade && (
        <View style={[styles.fade, { paddingTop: insets.top }]} pointerEvents="none">
          {[1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1].map((opacity, i) => (
            <View key={i} style={{ height: 6, backgroundColor: `rgba(249,250,251,${opacity})` }} />
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        style={[styles.menuBtn, { top: insets.top + 8 }]}
      >
        <Ionicons name="ellipsis-vertical" size={26} color="#111827" />
      </TouchableOpacity>

      <BottomPillNav
        onWorkspaces={() => setWorkspaceOpen(true)}
        onAddTicket={() => setShowCreate(true)}
        onFilters={() => setFilterOpen(true)}
      />

      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" statusBarTranslucent>
        <CreateTicketModal onClose={() => { setShowCreate(false); load(); }} />
      </Modal>

      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

      <FilterModal
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        workspaces={workspaceList}
        projects={Array.from(projects)}
        selectedWorkspace={selectedWorkspace}
        selectedProject={selectedProject}
        onSelectWorkspace={setSelectedWorkspace}
        onSelectProject={setSelectedProject}
      />

      <WorkspacePickerModal
        visible={workspaceOpen}
        onClose={() => setWorkspaceOpen(false)}
        workspaces={workspaceList}
        selected={selectedWorkspace}
        onSelect={setSelectedWorkspace}
        onCreateWorkspace={() => {
          setWorkspaceOpen(false);
          navigation.navigate("CreateWorkspace");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  sectionHeader: {
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#ffffff",
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: "#111827" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  meta: { marginTop: 6, fontSize: 12, color: "#6b7280" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#6b7280" },
  fade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  menuBtn: {
    position: "absolute",
    right: 12,
    padding: 8,
    zIndex: 10,
  },
});
