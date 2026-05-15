import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { getConnections, type Connection } from "../stores/connectionsStore";
import { useApiClient } from "../hooks/useApiClient";
import { SelectRow } from "./SelectRow";

export interface ConnectionSelectProps {
  selected: string;
  onSelect: (id: string) => void;
  onConnectionsChange?: (connections: Connection[]) => void;
  hiddenWhenSingle?: boolean;
}

export function ConnectionSelect({
  selected,
  onSelect,
  onConnectionsChange,
  hiddenWhenSingle = true,
}: ConnectionSelectProps) {
  const { buildClient } = useApiClient();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});

  const onSelectRef = useRef(onSelect);
  const onConnectionsChangeRef = useRef(onConnectionsChange);
  onSelectRef.current = onSelect;
  onConnectionsChangeRef.current = onConnectionsChange;

  useEffect(() => {
    let cancelled = false;
    getConnections().then(async (conns) => {
      if (cancelled) return;
      setConnections(conns);
      onConnectionsChangeRef.current?.(conns);

      const nextOnline: Record<string, boolean> = {};
      await Promise.all(
        conns.map(async (conn) => {
          let ok = false;
          if (conn.enabled !== false && conn.status === "approved") {
            try {
              const client = buildClient(conn);
              await client.healthCheck();
              ok = true;
            } catch {
              ok = false;
            }
          }
          nextOnline[conn.id] = ok;
          setOnlineMap((prev) => ({ ...prev, [conn.id]: ok }));
        })
      );
      if (cancelled) return;

      const connected = conns.filter((c) => {
        if (c.enabled === false || c.status !== "approved") return false;
        return nextOnline[c.id] === true;
      });
      if (connected.length === 1) {
        onSelectRef.current?.(connected[0].id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [buildClient]);

  const isConnected = (conn: Connection) => {
    if (conn.enabled === false) return false;
    if (conn.status !== "approved") return false;
    return onlineMap[conn.id] === true;
  };

  const dotColor = (conn: Connection) => {
    if (conn.enabled === false) return "#9ca3af";
    if (onlineMap[conn.id] !== true) return "#ef4444";
    if (conn.status === "removed") return "#ef4444";
    if (conn.status === "pending") return "#f59e0b";
    return "#22c55e";
  };

  if (hiddenWhenSingle && connections.length <= 1) {
    return null;
  }

  return (
    <SelectRow
      label="Connection"
      options={connections.map((c) => ({ id: c.id, name: c.name }))}
      selected={selected}
      onSelect={onSelect}
      getDisabled={(id) => {
        const conn = connections.find((c) => c.id === id);
        return conn ? !isConnected(conn) : true;
      }}
      renderIndicator={(id) => {
        const conn = connections.find((c) => c.id === id);
        if (!conn) return null;
        return (
          <View style={[styles.dot, { backgroundColor: dotColor(conn) }]} />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
