import { AppState } from "react-native";
import { getConnections, type Connection } from "../stores/connectionsStore";

type Handler = (payload: any, connectionId: string) => void | Promise<void>;

const handlers = new Map<string, Set<Handler>>();
const sockets = new Map<string, WebSocket>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
let syncInterval: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let active = false;

function emit(event: string, payload: any, connectionId: string) {
  const set = handlers.get(event);
  if (!set) return;
  set.forEach((h) => {
    try {
      const result = h(payload, connectionId);
      if (result && typeof (result as Promise<void>).catch === "function") {
        (result as Promise<void>).catch(() => {});
      }
    } catch {
      // ignore handler errors
    }
  });
}

export function subscribe(event: string, handler: Handler): () => void {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
  return () => {
    handlers.get(event)?.delete(handler);
  };
}

async function sync() {
  if (!active) return;
  const conns = await getConnections();
  const enabled = conns.filter((c) => c.enabled !== false);
  const targetIds = new Set(enabled.map((c) => c.id));

  // Close sockets for connections that are gone or disabled
  for (const [id, ws] of Array.from(sockets.entries())) {
    if (!targetIds.has(id)) {
      ws.close();
      sockets.delete(id);
      clearReconnect(id);
    }
  }

  // Open sockets for new enabled connections
  for (const conn of enabled) {
    if (sockets.has(conn.id)) continue;
    openSocket(conn);
  }
}

function clearReconnect(id: string) {
  const timer = reconnectTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    reconnectTimers.delete(id);
  }
}

function openSocket(conn: Connection) {
  try {
    const wsUrl = conn.url.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      clearReconnect(conn.id);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event) {
          emit(data.event, data.payload, conn.id);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      sockets.delete(conn.id);
      if (active) {
        clearReconnect(conn.id);
        const timer = setTimeout(() => {
          reconnectTimers.delete(conn.id);
          if (active && !sockets.has(conn.id)) {
            getConnections().then((conns) => {
              const c = conns.find((x) => x.id === conn.id);
              if (c && c.enabled !== false) openSocket(c);
            });
          }
        }, 3000);
        reconnectTimers.set(conn.id, timer);
      }
    };

    ws.onerror = () => {
      // onclose will fire next
    };

    sockets.set(conn.id, ws);
  } catch {
    // ignore setup errors
  }
}

export function start() {
  if (active) return;
  active = true;
  sync();
  syncInterval = setInterval(sync, 5000);

  appStateSub = AppState.addEventListener("change", (nextAppState) => {
    if (nextAppState === "active") {
      sync();
    }
  });
}

export function stop() {
  active = false;
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  appStateSub?.remove();
  appStateSub = null;

  for (const timer of reconnectTimers.values()) {
    clearTimeout(timer);
  }
  reconnectTimers.clear();

  for (const ws of sockets.values()) {
    ws.close();
  }
  sockets.clear();
}
