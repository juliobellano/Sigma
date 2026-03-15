import { useCallback, useEffect, useRef, useState } from "react";

const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 30000;

export default function useWebSocket() {
  const wsRef = useRef(null);
  const handlersRef = useRef(new Map());
  const reconnectDelay = useRef(RECONNECT_BASE);
  const reconnectTimer = useRef(null);
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setStatus("connected");
      reconnectDelay.current = RECONNECT_BASE;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = handlersRef.current.get(msg.type);
        if (handler) handler(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      // Auto-reconnect with exponential backoff
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, RECONNECT_MAX);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const sendMessage = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const onMessage = useCallback((type, handler) => {
    handlersRef.current.set(type, handler);
    return () => handlersRef.current.delete(type);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { status, connect, disconnect, sendMessage, onMessage };
}
