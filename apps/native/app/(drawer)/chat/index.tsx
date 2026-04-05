import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Container } from "@/components/container";
import { client } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

/**
 * Conversations Screen - Airbnb Inspired Design
 * Highlights: Pure white bg, clean lines, bold typography, pink accents.
 */
export default function ConversationsScreen() {
  const router = useRouter();

  // 1. Fetch conversations with React Query
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

  const renderItem = ({ item }: { item: any }) => {
    // Get Initials for Avatar
    const name = item.name || "User";
    const initials = name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    // Format Time
    const timeStr = item.lastMessageAt
      ? formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: false })
          .replace("about ", "")
          .replace("less than a minute", "now")
      : "";

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          router.push({
            pathname: "/chat/[id]",
            params: { id: item.id, name: item.name },
          })
        }
        activeOpacity={0.7}
      >
        {/* Avatar Circle */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {/* Content Area */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.time}>{timeStr}</Text>
          </View>

          <View style={styles.messageRow}>
            <Text style={styles.preview} numberOfLines={1}>
              {item.lastMessagePreview || "Naya chat shuru karo..."}
            </Text>

            {/* Unread Badge */}
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Container style={styles.safe} isScrollable={false}>
      {/* Header with Compose Button */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity
          onPress={() => router.push("/chat/new")}
          style={styles.composeBtn}
        >
          <Ionicons name="pencil-outline" size={24} color="#222222" />
        </TouchableOpacity>
      </View>

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
            tintColor="#ff385c"
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={64} color="#e0e0e0" />
              <Text style={styles.emptyText}>
                Abhi koi conversation nahi. Naya chat shuru karo!
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push("/chat/new")}
              >
                <Text style={styles.emptyBtnText}>Start Chat</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </Container>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 15,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#222222",
  },
  composeBtn: {
    padding: 8,
  },
  list: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  emptyContainer: {
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: "center",
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ff385c",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    marginLeft: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ebebeb",
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222222",
    flex: 1,
  },
  time: {
    fontSize: 11,
    color: "#929292",
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
  badge: {
    backgroundColor: "#ff385c",
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    paddingHorizontal: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#717171",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: "#222222",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
