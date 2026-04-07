import { useState, useEffect, useRef, useCallback } from "react";
import { authClient } from "@/lib/auth-client";
import { env } from "@apnu/env/native";

export type Message = {
  id: string;
  tempId?: string;
  content: string;
  senderId: string;
  status: "sending" | "sent" | "delivered" | "seen";
  createdAt: string;
  sender?: {
    id: string;
    name: string | null;
    image: string | null;
  };
};

export interface UseWebSocketReturn {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sendMessage: (content: string) => Promise<void>;
  sendTypingStatus: (isTyping: boolean) => void;
  isOtherTyping: boolean;
  isOtherOnline: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  connectionLatency: number;
}

/**
 * useWebSocket hook for real-time chat in Apnu
 * Features: Auto-reconnect, heartbeat/ping-pong, message acknowledgments, rate limiting awareness
 */
export const useWebSocket = (conversationId: string): UseWebSocketReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isOtherOnline, setIsOtherOnline] = useState(false);
  const [connectionLatency, setConnectionLatency] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const maxRetries = 5;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pendingMessages = useRef<Map<string, { tempId: string; timestamp: number }>>(new Map());

  // Cleanup function
  const cleanup = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (ws.current) {
      try {
        ws.current.close();
      } catch (e) {
        // Ignore close errors
      }
      ws.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  }, []);

  // Setup heartbeat
  const setupHeartbeat = useCallback((socket: WebSocket) => {
    // Clear any existing heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    // Send ping every 30 seconds
    heartbeatIntervalRef.current = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "ping",
          timestamp: Date.now(),
        }));
      }
    }, 30000);
  }, []);

  const connect = useCallback(async () => {
    if (ws.current?.readyState === WebSocket.OPEN ||
        ws.current?.readyState === WebSocket.CONNECTING ||
        reconnectCount.current >= maxRetries) {
      return;
    }

    setIsConnecting(true);

    try {
      const session = await authClient.getSession();
      const token = session.data?.session?.token;

      if (!token) {
        console.error("[useWebSocket] No auth session found");
        setIsConnecting(false);
        return;
      }

      const baseUrl = env.EXPO_PUBLIC_SERVER_URL.replace(/^http/, "ws");
      const wsUrl = `${baseUrl}/api/ws?token=${token}&conversationId=${conversationId}`;

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("[useWebSocket] Connected to conversation:", conversationId);
        setIsConnected(true);
        setIsConnecting(false);
        reconnectCount.current = 0;
        ws.current = socket;

        // Setup heartbeat
        setupHeartbeat(socket);

        // Broadcast online status
        socket.send(JSON.stringify({ type: "presence", status: "online" }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "message") {
            const newMessage = data.message as Message;
            const tempId = data.tempId;

            setMessages((prev) => {
              // If this message was sent by us and we have a tempId, replace it
              if (tempId) {
                const exists = prev.some((m) => m.tempId === tempId);
                if (exists) {
                  // Remove from pending
                  pendingMessages.current.delete(tempId);
                  return prev.map((msg) =>
                    msg.tempId === tempId ? { ...newMessage, tempId } : msg
                  );
                }
              }
              // Check for duplicates
              if (prev.some((m) => m.id === newMessage.id)) return prev;

              // Add new message (newest first for inverted list)
              return [newMessage, ...prev];
            });

            // Send acknowledgment back
            socket.send(JSON.stringify({
              type: "ack",
              messageId: newMessage.id,
            }));

          } else if (data.type === "typing") {
            // Verify it's not from current user
            authClient.getSession().then((session) => {
              if (data.userId !== session.data?.user.id) {
                setIsOtherTyping(data.isTyping);

                // Auto-clear typing after 5 seconds if no stop signal
                if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                if (data.isTyping) {
                  typingTimeoutRef.current = setTimeout(() => {
                    setIsOtherTyping(false);
                  }, 5000);
                }
              }
            });

          } else if (data.type === "presence") {
            authClient.getSession().then((session) => {
              if (data.userId !== session.data?.user.id) {
                setIsOtherOnline(data.status === "online");
              }
            });

          } else if (data.type === "ack") {
            // Server acknowledgment of our message
            if (data.tempId && data.messageId) {
              pendingMessages.current.delete(data.tempId);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.tempId === data.tempId
                    ? { ...msg, id: data.messageId, status: data.status || "sent" }
                    : msg
                )
              );
            }

          } else if (data.type === "pong") {
            // Calculate latency
            if (data.originalTimestamp) {
              const latency = Date.now() - data.originalTimestamp;
              setConnectionLatency(latency);
            }

          } else if (data.type === "connected") {
            console.log("[useWebSocket] Server confirmed connection:", data.connectionId);

          } else if (data.type === "error") {
            console.error("[useWebSocket] Server error:", data.message);
            if (data.code === "RATE_LIMITED") {
              // Show rate limit warning to user
              alert("You're sending messages too fast. Please slow down.");
            }
          }
        } catch (err) {
          console.error("[useWebSocket] Error parsing message:", err);
        }
      };

      socket.onclose = (e) => {
        console.log("[useWebSocket] Connection closed:", e.code, e.reason);
        setIsConnected(false);
        setIsConnecting(false);
        setIsOtherOnline(false);
        ws.current = null;

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt reconnection
        if (reconnectCount.current < maxRetries) {
          const delay = Math.pow(2, reconnectCount.current) * 1000;
          reconnectCount.current += 1;
          console.log(`[useWebSocket] Reconnecting in ${delay}ms (attempt ${reconnectCount.current})`);
          timeoutRef.current = setTimeout(() => connect(), delay);
        }
      };

      socket.onerror = (err) => {
        console.error("[useWebSocket] Socket Error:", err);
        setIsConnected(false);
      };

      ws.current = socket;
    } catch (err) {
      console.error("[useWebSocket] Connection error:", err);
      setIsConnecting(false);
    }
  }, [conversationId, setupHeartbeat]);

  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  const sendMessage = useCallback(async (content: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.error("[useWebSocket] Cannot send message: not connected");
      throw new Error("WebSocket not connected");
    }

    const session = await authClient.getSession();
    const userId = session.data?.user.id;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMsg: Message = {
      id: tempId,
      tempId,
      content,
      senderId: userId,
      status: "sending",
      createdAt: new Date().toISOString(),
    };

    // Track pending message
    pendingMessages.current.set(tempId, { tempId, timestamp: Date.now() });

    // Add to local state immediately
    setMessages((prev) => [optimisticMsg, ...prev]);

    // Send via WebSocket
    ws.current.send(
      JSON.stringify({
        type: "message",
        content,
        tempId,
      })
    );

    // Set timeout to mark as failed if no ack received
    setTimeout(() => {
      if (pendingMessages.current.has(tempId)) {
        pendingMessages.current.delete(tempId);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.tempId === tempId ? { ...msg, status: "failed" as any } : msg
          )
        );
      }
    }, 30000); // 30s timeout
  }, []);

  const lastTypingStatusRef = useRef<boolean>(false);
  const lastTypingSentTimeRef = useRef<number>(0);

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    const shouldThrottle = isTyping && (now - lastTypingSentTimeRef.current < 2000);

    // Only skip if it's a repeated "true" within throttle window
    if (shouldThrottle && isTyping === lastTypingStatusRef.current) return;

    ws.current.send(
      JSON.stringify({
        type: "typing",
        isTyping,
      })
    );

    lastTypingStatusRef.current = isTyping;
    lastTypingSentTimeRef.current = now;
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    sendTypingStatus,
    isOtherTyping,
    isOtherOnline,
    isConnected,
    isConnecting,
    connectionLatency,
  };
};
