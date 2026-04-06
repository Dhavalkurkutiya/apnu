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
  isConnected: boolean;
  isConnecting: boolean;
}

/**
 * useWebSocket hook for real-time chat in Apnu
 */
export const useWebSocket = (conversationId: string): UseWebSocketReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const maxRetries = 5;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(async () => {
    if (ws.current || reconnectCount.current >= maxRetries) return;

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
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "message") {
          const newMessage = data.message as Message;
          const tempId = data.tempId;

          setMessages((prev) => {
            if (tempId) {
              const exists = prev.some((m) => m.tempId === tempId);
              if (exists) {
                return prev.map((msg) =>
                  msg.tempId === tempId ? { ...newMessage, tempId } : msg,
                );
              }
            }
            if (prev.some((m) => m.id === newMessage.id)) return prev;
            return [newMessage, ...prev];
          });
        } else if (data.type === "typing") {
          // Verify it's not from current user (though server should handle this)
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
        }
      };

      socket.onclose = (e) => {
        setIsConnected(false);
        setIsConnecting(false);
        ws.current = null;

        if (reconnectCount.current < maxRetries) {
          const delay = Math.pow(2, reconnectCount.current) * 1000;
          reconnectCount.current += 1;
          timeoutRef.current = setTimeout(() => connect(), delay);
        }
      };

      socket.onerror = (err) => {
        console.error("[useWebSocket] Socket Error:", err);
      };

      ws.current = socket;
    } catch (err) {
      console.error("[useWebSocket] Connection error:", err);
      setIsConnecting(false);
    }
  }, [conversationId]);

  useEffect(() => {
    connect();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback(async (content: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const session = await authClient.getSession();
    const userId = session.data?.user.id;
    if (!userId) return;

    const tempId = Math.random().toString(36).substring(7);
    const optimisticMsg: Message = {
      id: tempId,
      tempId,
      content,
      senderId: userId,
      status: "sending",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [optimisticMsg, ...prev]);

    ws.current.send(
      JSON.stringify({
        type: "message",
        content,
        tempId,
      }),
    );
  }, []);

  const sendTypingStatus = useCallback((isTyping: boolean) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(
      JSON.stringify({
        type: "typing",
        isTyping,
      }),
    );
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    sendTypingStatus,
    isOtherTyping,
    isConnected,
    isConnecting,
  };
};
