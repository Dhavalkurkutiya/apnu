import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";
import {
  Surface,
  Avatar,
  Chip,
  Button,
  useThemeColor,
  useToast,
  Spinner,
} from "heroui-native";

import { client as apiClient } from "@/lib/api";
const client = apiClient as any;

import { formatDistanceToNow } from "date-fns";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * Modern Chat List Screen with HeroUI
 * Full-screen immersive design with beautiful animations
 */
export default function ConversationsScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor("background");
  const accentColor = useThemeColor("accent");
  const foregroundColor = useThemeColor("foreground");

  // Fetch conversations with React Query
  const {
    data: conversations,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const res = await client.api.conversations.$get();
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
  });

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const name = item.name || "User";
    const timeStr = item.lastMessageAt
      ? formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: false })
          .replace("about ", "")
          .replace("less than a minute", "now")
      : "";

    const isUnread = item.unreadCount > 0;

    return (
      <AnimatedTouchableOpacity
        entering={FadeInRight.delay(index * 50).duration(300)}
        style={styles.row}
        onPress={() =>
          router.push({
            pathname: "/chat/[id]",
            params: { id: item.id, name: item.name },
          })
        }
        activeOpacity={0.7}
      >
        <Avatar alt={name} size="md" style={styles.avatar}>
          <Avatar.Image src={item.image || undefined} />
          <Avatar.Fallback style={{ backgroundColor: "#ff385c" }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {name.substring(0, 2).toUpperCase()}
            </Text>
          </Avatar.Fallback>
        </Avatar>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text
              style={[
                styles.name,
                isUnread && styles.unreadName,
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={[styles.time, isUnread && styles.unreadTime]}>
              {timeStr}
            </Text>
          </View>

          <View style={styles.messageRow}>
            <Text
              style={[
                styles.preview,
                isUnread && styles.unreadPreview,
              ]}
              numberOfLines={1}
            >
              {item.lastMessagePreview || "Start a new chat"}
            </Text>

            {isUnread && (
              <Chip
                variant="primary"
                color="accent"
                style={styles.badge}
              >
                <Chip.Label>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Chip.Label>
              </Chip>
            )}
          </View>
        </View>
      </AnimatedTouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Immersive Header */}
      <Surface variant="default" style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Text style={[styles.title, { color: "#ff385c" }]}>Messages</Text>
        <View style={styles.headerActions}>
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            onPress={() => {}}
          >
            <Ionicons name="search-outline" size={24} color="#222" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            onPress={() => router.push("/chat/new")}
          >
            <Ionicons name="create-outline" size={24} color="#222" />
          </Button>
        </View>
      </Surface>

      {/* Conversations List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            !conversations?.length && styles.emptyContainer,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={accentColor}
              colors={[accentColor]}
            />
          }
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={styles.emptyState}>
              <Surface variant="secondary" style={styles.emptyIconContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color={accentColor} />
              </Surface>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyText}>
                Start a new chat with someone from your contacts
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: accentColor }]}
                onPress={() => router.push("/chat/new")}
              >
                <Text style={styles.emptyBtnText}>Start New Chat</Text>
              </TouchableOpacity>
            </Animated.View>
          }
        />
      )}

      {/* Floating New Chat Button for quick access */}
      {conversations?.length > 0 && (
        <Animated.View entering={FadeIn.delay(500)} style={styles.fabContainer}>
          <Button
            variant="primary"
            size="lg"
            isIconOnly
            onPress={() => router.push("/chat/new")}
            style={styles.fab}
          >
            <Ionicons name="chatbubble" size={24} color="#fff" />
          </Button>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ff385c",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: "center",
  },
  avatar: {
    marginRight: 16,
  },
  content: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.05)",
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "500",
    color: "#222",
    flex: 1,
  },
  unreadName: {
    fontWeight: "700",
  },
  time: {
    fontSize: 12,
    color: "#929292",
    marginLeft: 8,
  },
  unreadTime: {
    color: "#ff385c",
    fontWeight: "600",
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  preview: {
    fontSize: 14,
    color: "#6a6a6a",
    flex: 1,
  },
  unreadPreview: {
    color: "#222",
    fontWeight: "500",
  },
  badge: {
    marginLeft: 8,
    minWidth: 24,
    height: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: -60,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#222",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: "#717171",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
  },
  emptyBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  fabContainer: {
    position: "absolute",
    right: 20,
    bottom: 30,
  },
  fab: {
    borderRadius: 28,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
