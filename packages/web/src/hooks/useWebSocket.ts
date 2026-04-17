import { useEffect, useRef } from "react";

type Handler = (event: string, payload: any) => void;

let ws: WebSocket | null = null;
const handlers = new Set<Handler>();

function getUrl() {
  const isDev = (import.meta as any).env?.DEV;
  return isDev
    ? "ws://localhost:3000/ws"
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
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
