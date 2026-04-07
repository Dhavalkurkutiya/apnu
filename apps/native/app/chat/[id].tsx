import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardGestureArea } from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  Surface,
  Button,
  Input,
  TextField,
  Spinner,
  useToast,
  useThemeColor,
  Avatar,
  Chip,
  Separator,
} from "heroui-native";

import { authClient } from "@/lib/auth-client";
import { useWebSocket, Message } from "@/hooks/useWebSocket";
import { env } from "@apnu/env/native";
import { format, isToday, isYesterday } from "date-fns";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * Full-Screen Chat Detail Screen with HeroUI
 * Modern messaging UI with real-time features
 */
export default function ChatDetailScreen() {
  const { id: conversationId, name: initialName } = useLocalSearchParams<{
    id: string;
    name?: string;
  }>();
  const router = useRouter();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "details">("chat");
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<any>(null);

  // Theme colors
  const backgroundColor = useThemeColor("background");
  const surfaceColor = useThemeColor("surface");
  const accentColor = useThemeColor("accent");
  const mutedColor = useThemeColor("muted");
  const foregroundColor = useThemeColor("foreground");

  // Get Current User Session
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;

  // Real-time WebSocket Hook
  const {
    messages,
    setMessages,
    sendMessage,
    sendTypingStatus,
    isOtherTyping,
    isOtherOnline,
    isConnected,
    isConnecting,
    connectionLatency,
  } = useWebSocket(conversationId);

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Fetch Message History
  const { isLoading: isHistoryLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      try {
        const cookie = authClient.getCookie();``
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
        setMessages(history);
        return data;
      } catch (error) {
        console.error("[ChatDetail] History fetch error:", error);
        toast.show({
          variant: "danger",
          label: "Failed to load messages",
        });
        throw error;
      }
    },
    enabled: !!currentUserId && !!conversationId,
  });

  // Send Message Handler
  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText("");
    setSendError(null);
    sendTypingStatus(false);

    try {
      await sendMessage(text);
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    } catch (err) {
      console.error("[ChatDetail] Failed to send:", err);
      setSendError("Failed to send message");
      toast.show({
        variant: "danger",
        label: "Message failed to send. Check connection.",
      });
    }
  }, [inputText, sendMessage, sendTypingStatus, toast]);

  const handleInputChange = useCallback((text: string) => {
    setInputText(text);
    if (text.length > 0) {
      sendTypingStatus(true);
    } else {
      sendTypingStatus(false);
    }
  }, [sendTypingStatus]);

  // Group messages by date
  const groupedMessages = React.useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    [...messages].reverse().forEach((msg) => {
      const msgDate = new Date(msg.createdAt);
      let dateLabel = format(msgDate, "MMM d, yyyy");
      if (isToday(msgDate)) dateLabel = "Today";
      if (isYesterday(msgDate)) dateLabel = "Yesterday";

      if (dateLabel !== currentDate) {
        currentDate = dateLabel;
        groups.push({ date: dateLabel, messages: [] });
      }
      groups[groups.length - 1].messages.push(msg);
    });

    return groups.reverse();
  }, [messages]);

  // Render Date Separator
  const renderDateSeparator = (date: string) => (
    <View style={styles.dateSeparator}>
      <Surface variant="secondary" style={styles.dateBadge}>
        <Text style={styles.dateText}>{date}</Text>
      </Surface>
    </View>
  );

  // Render Message Bubble
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMine = item.senderId === currentUserId;
    const isSending = item.status === "sending";
    const isFailed = (item.status as any) === "failed";
    const showSender = !isMine && index === 0;

    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        style={[
          styles.messageContainer,
          isMine ? styles.myMessage : styles.theirMessage,
        ]}
      >
        {!isMine && (
          <Avatar alt={item.sender?.name || "User Avatar"} size="sm" style={styles.avatar}>
            <Avatar.Image src={item.sender?.image || undefined} />
            <Avatar.Fallback style={{ backgroundColor: "#ff385c" }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 10 }}>
                {(item.sender?.name || "U").substring(0, 2).toUpperCase()}
              </Text>
            </Avatar.Fallback>
          </Avatar>
        )}
        <View style={styles.messageContent}>
          {!isMine && item.sender?.name && (
            <Text style={styles.senderName}>{item.sender.name}</Text>
          )}
          <Surface
            variant={isMine ? "default" : "secondary"}
            style={[
              styles.bubble,
              isMine ? styles.myBubble : styles.theirBubble,
              isFailed && styles.failedBubble,
            ]}
          >
            <Text style={[
              styles.messageText,
              isMine ? styles.myMessageText : styles.theirMessageText,
            ]}>
              {item.content}
            </Text>
            <View style={styles.messageMeta}>
              <Text style={styles.timeText}>
                {format(new Date(item.createdAt), "h:mm a")}
              </Text>
              {isMine && (
                <View style={styles.statusContainer}>
                  {isSending ? (
                    <Spinner size="sm" color={mutedColor} />
                  ) : isFailed ? (
                    <Ionicons name="alert-circle" size={14} color="#ff385c" />
                  ) : (
                    <Ionicons
                      name={item.status === "seen" ? "checkmark-done" : "checkmark"}
                      size={14}
                      color={item.status === "seen" ? "#0084ff" : foregroundColor}
                    />
                  )}
                </View>
              )}
            </View>
          </Surface>
        </View>
      </Animated.View>
    );
  };

  // Render Chat List
  const renderChatContent = () => (
    <>
      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        keyExtractor={(item) => item.date}
        inverted
        contentContainerStyle={styles.messageList}
        ListHeaderComponent={
          <View style={styles.listFooter}>
            {isOtherTyping && (
              <Animated.View entering={FadeIn} style={styles.typingContainer}>
                <Surface variant="secondary" style={styles.typingBubble}>
                  <View style={styles.typingDots}>
                    <Animated.View style={[styles.dot, styles.dot1]} />
                    <Animated.View style={[styles.dot, styles.dot2]} />
                    <Animated.View style={[styles.dot, styles.dot3]} />
                  </View>
                  <Text style={styles.typingText}>
                    {initialName || "Someone"} is typing...
                  </Text>
                </Surface>
              </Animated.View>
            )}
            {isHistoryLoading && (
              <ActivityIndicator style={{ margin: 20 }} color={accentColor} />
            )}
          </View>
        }
        renderItem={({ item: group }) => (
          <View>
            {renderDateSeparator(group.date)}
            {group.messages.map((msg: Message, idx: number) => (
              <View key={msg.id || msg.tempId || idx}>
                {renderMessage({ item: msg, index: idx })}
              </View>
            ))}
          </View>
        )}
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        <Surface variant="default" style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <Button
              variant="ghost"
              size="md"
              isIconOnly
              onPress={() => {}}
            >
              <Ionicons name="add-circle-outline" size={24} color={foregroundColor} />
            </Button>
            <TextField style={styles.textField}>
              <Input
                ref={inputRef}
                value={inputText}
                onChangeText={handleInputChange}
                placeholder="Type a message..."
                multiline
                maxLength={1000}
                onBlur={() => sendTypingStatus(false)}
                style={styles.input}
              />
            </TextField>
            {inputText.trim() ? (
              <Button
                size="sm"
                variant="primary"
                onPress={handleSend}
                style={[styles.sendButton, { backgroundColor: "#ff385c" }]}
              >
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="md"
                isIconOnly
                onPress={() => {}}
              >
                <Ionicons name="mic-outline" size={24} color={foregroundColor} />
              </Button>
            )}
          </View>
        </Surface>
      </KeyboardAvoidingView>
    </>
  );

  // Render Details Tab
  const renderDetailsContent = () => (
    <View style={[styles.detailsContainer, { backgroundColor }]}>
      <View style={styles.profileHeader}>
        <Avatar alt={initialName || "User Profiles"} size="lg" style={styles.largeAvatar}>
          <Avatar.Fallback style={{ backgroundColor: "#ff385c" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 24 }}>
              {(initialName || "C").substring(0, 2).toUpperCase()}
            </Text>
          </Avatar.Fallback>
        </Avatar>
        <Text style={styles.detailName}>{initialName || "Chat User"}</Text>
        <Chip
          variant={isOtherOnline ? "primary" : "secondary"}
          color={isOtherOnline ? "success" : "default"}
          style={styles.statusBadge}
        >
          <Chip.Label>{isOtherOnline ? "Online" : "Offline"}</Chip.Label>
        </Chip>
      </View>

      <Surface variant="secondary" style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Information</Text>
        <Separator />
        <View style={styles.detailItem}>
          <Ionicons name="mail-outline" size={20} color={foregroundColor} />
          <View style={styles.detailItemContent}>
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>Shared via profile</Text>
          </View>
        </View>
        <Separator />
        <View style={styles.detailItem}>
          <Ionicons name="notifications-outline" size={20} color={foregroundColor} />
          <View style={styles.detailItemContent}>
            <Text style={styles.detailLabel}>Notifications</Text>
            <Text style={styles.detailValue}>Enabled</Text>
          </View>
        </View>
        <Separator />
        <View style={styles.detailItem}>
          <Ionicons name="shield-outline" size={20} color={foregroundColor} />
          <View style={styles.detailItemContent}>
            <Text style={styles.detailLabel}>Encryption</Text>
            <Text style={styles.detailValue}>End-to-end encrypted</Text>
          </View>
        </View>
      </Surface>

      <Surface variant="secondary" style={[styles.detailsSection, { marginTop: 16 }]}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="warning-outline" size={20} color="#ff9500" />
          <Text style={[styles.actionText, { color: "#ff9500" }]}>Report User</Text>
        </TouchableOpacity>
        <Separator />
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="ban-outline" size={20} color="#ff385c" />
          <Text style={[styles.actionText, { color: "#ff385c" }]}>Block User</Text>
        </TouchableOpacity>
      </Surface>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Full Screen Header */}
      <Surface variant="default" style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.headerLeft}>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={28} color="#222" />
          </Button>
          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() => setActiveTab(activeTab === "chat" ? "details" : "chat")}
          >
            <Avatar alt={initialName || "Chat Avatar"} size="sm">
              <Avatar.Fallback style={{ backgroundColor: "#ff385c" }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 10 }}>
                  {(initialName || "C").substring(0, 2).toUpperCase()}
                </Text>
              </Avatar.Fallback>
            </Avatar>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.headerTitle, { color: "#ff385c" }]}>{initialName || "Chat"}</Text>
              <Text style={styles.headerStatus}>
                {isOtherOnline
                  ? "Online"
                  : isOtherTyping
                    ? "typing..."
                    : "Last seen recently"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
          >
            <Ionicons name="videocam-outline" size={22} color="#222" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
          >
            <Ionicons name="call-outline" size={22} color="#222" />
          </Button>
        </View>
      </Surface>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "chat" && styles.activeTab]}
          onPress={() => setActiveTab("chat")}
        >
          <Text style={[styles.tabText, activeTab === "chat" && styles.activeTabText]}>
            Messages
          </Text>
          {activeTab === "chat" && (
            <Animated.View layout={SlideInRight} style={styles.tabIndicator} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "details" && styles.activeTab]}
          onPress={() => setActiveTab("details")}
        >
          <Text style={[styles.tabText, activeTab === "details" && styles.activeTabText]}>
            Details
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <KeyboardGestureArea style={styles.content}>
        {activeTab === "chat" ? renderChatContent() : renderDetailsContent()}
      </KeyboardGestureArea>

      {/* Connection Status Toast */}
      {!isConnected && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.connectionToast}>
          <Surface variant="secondary" style={styles.connectionSurface}>
            <Spinner size="sm" />
            <Text style={styles.connectionText}>
              {isConnecting ? "Connecting..." : "Reconnecting..."}
            </Text>
          </Surface>
        </Animated.View>
      )}

      {/* Slow Connection Warning */}
      {isConnected && connectionLatency > 500 && (
        <Animated.View entering={FadeIn} style={styles.slowConnectionToast}>
          <Surface variant="secondary" style={styles.slowConnectionSurface}>
            <Ionicons name="wifi-outline" size={16} color="#f59e0b" />
            <Text style={styles.slowConnectionText}>
              Slow connection ({connectionLatency}ms)
            </Text>
          </Surface>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  headerTextContainer: {
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#222",
  },
  headerStatus: {
    fontSize: 13,
    color: "#929292",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    position: "relative",
  },
  activeTab: {
    backgroundColor: "rgba(255,56,92,0.05)",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#717171",
  },
  activeTabText: {
    color: "#ff385c",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "20%",
    right: "20%",
    height: 2,
    backgroundColor: "#ff385c",
    borderRadius: 1,
  },
  content: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  listFooter: {
    paddingBottom: 20,
  },
  dateSeparator: {
    alignItems: "center",
    marginVertical: 16,
  },
  dateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  dateText: {
    fontSize: 12,
    color: "#717171",
    fontWeight: "500",
  },
  messageContainer: {
    flexDirection: "row",
    marginBottom: 12,
    maxWidth: "85%",
  },
  myMessage: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  theirMessage: {
    alignSelf: "flex-start",
  },
  avatar: {
    marginRight: 8,
    alignSelf: "flex-end",
  },
  messageContent: {
    maxWidth: "100%",
  },
  senderName: {
    fontSize: 12,
    color: "#717171",
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
  },
  myBubble: {
    backgroundColor: "#ff385c",
    borderBottomRightRadius: 4,
    shadowColor: "#ff385c",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  theirBubble: {
    backgroundColor: "#f2f2f2",
    borderBottomLeftRadius: 4,
  },
  failedBubble: {
    backgroundColor: "#ff6b6b",
    opacity: 0.8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: "#fff",
  },
  theirMessageText: {
    color: "#222",
  },
  messageMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
  },
  statusContainer: {
    marginLeft: 4,
  },
  typingContainer: {
    alignSelf: "flex-start",
    marginLeft: 40,
    marginBottom: 12,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
  },
  typingDots: {
    flexDirection: "row",
    gap: 4,
    marginRight: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#717171",
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  typingText: {
    fontSize: 13,
    color: "#717171",
    fontStyle: "italic",
  },
  inputArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  textField: {
    flex: 1,
  },
  input: {
    backgroundColor: "#f7f7f7",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    padding: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ff385c",
    elevation: 4,
    shadowColor: "#ff385c",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  detailsContainer: {
    flex: 1,
    padding: 24,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  detailName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#222",
    marginBottom: 8,
  },
  statusBadge: {
    marginTop: 4,
  },
  detailsSection: {
    borderRadius: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#717171",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 16,
  },
  detailItemContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 13,
    color: "#717171",
  },
  detailValue: {
    fontSize: 16,
    color: "#222",
    fontWeight: "500",
    marginTop: 2,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 14,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "600",
  },
  connectionToast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 80,
    alignSelf: "center",
  },
  connectionSurface: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "rgba(34,34,34,0.9)",
  },
  connectionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  slowConnectionToast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 80,
    alignSelf: "center",
  },
  slowConnectionSurface: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: "#fef3c7",
  },
  slowConnectionText: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "600",
  },
});
