import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import { Container } from "../../../components/container";
import { authClient } from "../../../lib/auth-client";
import { useWebSocket, Message } from "../../../hooks/useWebSocket";
import { env } from "@apnu/env/native";
import { format } from "date-fns";

/**
 * Chat Detail Screen - Interactive Real-time Messaging with Tab Navigation
 */
export default function ChatDetailScreen() {
  const { id: conversationId, name: initialName } = useLocalSearchParams<{
    id: string;
    name?: string;
  }>();
  const router = useRouter();
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "details">("chat");
  const flatListRef = useRef<FlatList>(null);

  // 1. Get Current User Session
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // 2. Real-time WebSocket Hook
  const { messages, setMessages, sendMessage, isConnected, isConnecting } =
    useWebSocket(conversationId);

  // 3. Fetch Message History (on mount)
  const { isLoading: isHistoryLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      try {
        const cookie = authClient.getCookie();
        const url = `${env.EXPO_PUBLIC_SERVER_URL}/api/conversations/${conversationId}/messages?limit=50`;

        const res = await fetch(url, {
          headers: {
            Cookie: cookie || "",
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!res.ok) throw new Error("Failed to fetch history");
        const data = await res.json();
        const history = (data as any).items as Message[];
        setMessages(history.reverse());
        return data;
      } catch (error) {
        console.error("[ChatDetail] History fetch error:", error);
        throw error;
      }
    },
    enabled: !!currentUserId && !!conversationId,
  });

  // 4. Send Message Handler
  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    await sendMessage(text);
  };

  // 5. Render Message Bubble
  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === currentUserId;
    const isSending = item.status === "sending";

    return (
      <View
        style={[
          styles.bubbleWrapper,
          isMine ? styles.mineWrapper : styles.theirsWrapper,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.mineBubble : styles.theirsBubble,
            isSending && { opacity: 0.6 },
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMine ? styles.mineText : styles.theirsText,
            ]}
          >
            {item.content}
          </Text>
        </View>
        <View
          style={[styles.metaRow, isMine && { flexDirection: "row-reverse" }]}
        >
          <Text style={styles.timeText}>
            {format(new Date(item.createdAt), "h:mm a")}
          </Text>
          {isMine && !isSending && (
            <Ionicons
              name={item.status === "seen" ? "checkmark-done" : "checkmark"}
              size={14}
              color={item.status === "seen" ? "#0084ff" : "#929292"}
              style={{ marginHorizontal: 4 }}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <Container style={styles.safe} isScrollable={false}>
      {/* Dynamic Header */}
      <Stack.Screen
        options={{
          headerTitle: initialName || "Chat",
          headerShown: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={28} color="#222222" />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: "#ffffff" },
          headerShadowVisible: true,
        }}
      />

      {/* 6. Native Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "chat" && styles.activeTab]}
          onPress={() => setActiveTab("chat")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "chat" && styles.activeTabText,
            ]}
          >
            Messages
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "details" && styles.activeTab]}
          onPress={() => setActiveTab("details")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "details" && styles.activeTabText,
            ]}
          >
            Details
          </Text>
        </TouchableOpacity>
      </View>

      {/* 7. Conditional View Switching */}
      {activeTab === "chat" ? (
        <KeyboardGestureArea style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item.id || `temp-${index}`}
            inverted
            contentContainerStyle={styles.messageList}
            ListFooterComponent={
              isHistoryLoading ? (
                <ActivityIndicator style={{ margin: 20 }} />
              ) : null
            }
          />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 140 : 0}
          >
            <View style={styles.inputArea}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Type a message..."
                  multiline
                  maxLength={1000}
                  value={inputText}
                  onChangeText={setInputText}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    !inputText.trim() && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!inputText.trim()}
                >
                  <Ionicons name="arrow-up" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </KeyboardGestureArea>
      ) : (
        <ScrollView
          style={styles.detailsContainer}
          contentContainerStyle={styles.detailsContent}
        >
          <View style={styles.profileHeader}>
            <View style={styles.largeAvatar}>
              <Text style={styles.avatarInitial}>
                {initialName?.[0]?.toUpperCase() || "C"}
              </Text>
            </View>
            <Text style={styles.detailName}>{initialName || "Chat User"}</Text>
            <Text style={styles.detailPresence}>Active recently</Text>
          </View>

          <View style={styles.detailsSection}>
            <Text style={styles.sectionTitle}>Information</Text>
            <View style={styles.detailItem}>
              <Ionicons
                name="mail-outline"
                size={20}
                color="#717171"
                style={styles.detailIcon}
              />
              <View>
                <Text style={styles.detailLabel}>Email</Text>
                <Text style={styles.detailValue}>Shared via profile</Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <Ionicons
                name="notifications-outline"
                size={20}
                color="#717171"
                style={styles.detailIcon}
              />
              <View>
                <Text style={styles.detailLabel}>Mute Notifications</Text>
                <Text style={styles.detailValue}>Off</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.reportBtn}>
            <Text style={styles.reportText}>Report User</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reportBtn}>
            <Text style={[styles.reportText, { color: "#ff385c" }]}>
              Block User
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Connection Toast */}
      {!isConnected && activeTab === "chat" && (
        <View style={styles.statusToast}>
          <Text style={styles.statusText}>
            {isConnecting ? "Connecting..." : "Reconnecting..."}
          </Text>
        </View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#ffffff", flex: 1 },
  backBtn: { marginLeft: 8, padding: 4 },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ebebeb",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: "#ff385c" },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#717171",
    textTransform: "uppercase",
  },
  activeTabText: { color: "#ff385c" },
  messageList: { paddingHorizontal: 16, paddingVertical: 20 },
  bubbleWrapper: { marginBottom: 16, maxWidth: "80%" },
  mineWrapper: { alignSelf: "flex-end" },
  theirsWrapper: { alignSelf: "flex-start" },
  bubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  mineBubble: { backgroundColor: "#ff385c", borderBottomRightRadius: 4 },
  theirsBubble: { backgroundColor: "#f2f2f2", borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  mineText: { color: "#ffffff" },
  theirsText: { color: "#222222" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  timeText: { fontSize: 11, color: "#929292" },
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 0.5,
    borderTopColor: "#ebebeb",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#f7f7f7",
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#222222",
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ff385c",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: "#ffb7c5" },
  statusToast: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(34, 34, 34, 0.8)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: { color: "#ffffff", fontSize: 12, fontWeight: "600" },
  detailsContainer: { flex: 1, backgroundColor: "#fff" },
  detailsContent: { paddingVertical: 32 },
  profileHeader: { alignItems: "center", marginBottom: 32 },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#ff385c",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarInitial: { color: "#fff", fontSize: 36, fontWeight: "bold" },
  detailName: { fontSize: 24, fontWeight: "700", color: "#222" },
  detailPresence: { fontSize: 14, color: "#717171", marginTop: 4 },
  detailsSection: {
    marginTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#222",
    marginBottom: 16,
  },
  detailItem: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  detailIcon: { marginRight: 16 },
  detailLabel: { fontSize: 13, color: "#717171" },
  detailValue: { fontSize: 16, color: "#222", fontWeight: "500", marginTop: 2 },
  reportBtn: { padding: 16, alignItems: "center", marginTop: 8 },
  reportText: { fontSize: 16, fontWeight: "600", color: "#717171" },
});
