import { useEffect, useRef } from "react";

export function useWebSocketListener(
  onMessage: (event: string, payload: any) => void
) {
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    ws.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data.event, data.payload);
      } catch {
        onMessage("raw", event.data);
      }
    };

    return () => {
      socket.close();
    };
  }, [onMessage]);
}
