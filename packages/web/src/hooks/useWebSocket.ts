import { useEffect, useRef } from "react";

type Handler = (event: string, payload: any) => void;

let ws: WebSocket | null = null;
const handlers = new Set<Handler>();

function getUrl() {
  const env = (import.meta as any).env;
  const electronPort = typeof window !== "undefined" ? (window as any).electronAPI?.serverPort : undefined;
  if (env?.DEV) {
    return `ws://localhost:${env?.VITE_SERVER_PORT || 3456}/ws`;
  }
  if (electronPort) {
    return `ws://localhost:${electronPort}/ws`;
  }
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
}

function ensureSocket() {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }
  const socket = new WebSocket(getUrl());
  ws = socket;

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handlers.forEach((fn) => fn(data.event, data.payload));
    } catch {
      handlers.forEach((fn) => fn("raw", event.data));
    }
  };

  socket.onerror = () => {
    if (ws === socket) socket.close();
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    setTimeout(ensureSocket, 1000);
  };
}

export function useWebSocketListener(onMessage: Handler) {
  const ref = useRef(onMessage);
  ref.current = onMessage;

  useEffect(() => {
    const handler: Handler = (event, payload) => ref.current(event, payload);
    handlers.add(handler);
    ensureSocket();
    return () => { handlers.delete(handler); };
  }, []);
}
