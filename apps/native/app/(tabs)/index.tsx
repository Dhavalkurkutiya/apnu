import React from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useThemeColor, Button } from "heroui-native";
import { authClient } from "../../lib/auth-client";
import { Container } from "../../components/container";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
// Use a local alias with type assertion to unblock IDE issues with Hono RPC inference
const client = api as any;
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useAppTheme } from "../../contexts/app-theme-context";

/**
 * Dashboard / Home Screen
 * Shows Recent Chats and a list of All Users to discover.
 */
export default function Dashboard() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { isDark } = useAppTheme();
  const surfaceColor = useThemeColor("surface");

  // 1. Fetch recent conversations
  const {
    data: conversations,
    isLoading: isChatLoading,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ["conversations", "recent"],
    queryFn: async () => {
      const res = await client.api.conversations.$get();
      if (!res.ok) return [];
      const data = await res.json();
      return (data as any[]).slice(0, 3);
    },
  });
  
  // 2. Fetch All Users for Discovery
  const {
    data: discoverUsers,
    isLoading: isUsersLoading,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["users", "discover"],
    queryFn: async () => {
      const res = await client.api.users.$get();
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchConversations(), refetchUsers()]);
    setRefreshing(false);
  }, [refetchConversations, refetchUsers]);

  // 3. Create Conversation Mutation
  const createConv = useMutation({
    mutationFn: async (userId: string) => {
      const res = await client.api.conversations.$post({
        json: { participantUserId: userId },
      });
      if (!res.ok) throw new Error("Failed to start chat");
      return res.json();
    },
    onSuccess: (data) => {
      router.push(`/chat/${data.id}`);
    },
  });

  return (
    <Container style={styles.safe} isScrollable={false} disableSafeArea={true}>
      <StatusBar style={"light"} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#ff385c"
            colors={["#ff385c"]}
          />
        }
      >
        {/* Header Section */}
        <View style={styles.hero}>
          <Text style={styles.greeting}>
            Hello, {session?.user?.name?.split(" ")[0] || "User"}! 👋
          </Text>
          <Text style={styles.subtitle}>Let's connect with someone today.</Text>
        </View>

        {/* Recent Chats Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Chats</Text>
            <TouchableOpacity onPress={() => router.push("/chat")}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>

          {isChatLoading ? (
            <ActivityIndicator color="#ff385c" style={{ marginVertical: 10 }} />
          ) : conversations?.length ? (
            conversations.map((item) => {
              const initials =
                item.name
                  ?.split(" ")
                  .map((n: any) => n[0])
                  .join("") || "U";
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.chatCard, { backgroundColor: surfaceColor }]}
                  onPress={() =>
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: item.id, name: item.name },
                    })
                  }
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initials.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.chatContent}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.chatPreview} numberOfLines={1}>
                      {item.lastMessagePreview || "No messages yet"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#929292" />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyRecent}>
              <Text style={styles.emptyRecentText}>No recent chats yet.</Text>
            </View>
          )}
        </View>

        {/* DISCOVER PEOPLE SECTION (ALL USERS) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discover People</Text>
            <Text style={styles.badgeText}>{discoverUsers?.length || 0} Members</Text>
          </View>

          {isUsersLoading ? (
            <ActivityIndicator color="#ff385c" style={{ marginVertical: 20 }} />
          ) : discoverUsers?.length ? (
            discoverUsers.map((user: any) => (
              <TouchableOpacity
                key={user.id}
                style={[styles.userCard, { backgroundColor: surfaceColor }]}
                onPress={() => createConv.mutate(user.id)}
                disabled={createConv.isPending}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userNameText}>{user.name}</Text>
                  <Text style={styles.userEmailText}>{user.email}</Text>
                </View>
                <View style={styles.chatIconBtn}>
                  <Ionicons name="chatbubble-outline" size={20} color="#ff385c" />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyDiscover}>
              <Text style={styles.emptyText}>No other users found yet.</Text>
            </View>
          )}
        </View>

        {/* Account Info */}
        <View style={[styles.infoCard, { backgroundColor: "#f7f7f7" }]}>
          <Text style={styles.infoLabel}>Logged in as</Text>
          <Text style={styles.infoValue}>{session?.user?.email}</Text>
          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={async () => {
              await authClient.signOut();
              router.replace("/sign-in");
            }}
          >
            <Text style={styles.signOutText}>Sign Out from Apnu</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#ffffff", flex: 1 },
  scroll: { padding: 24 },
  hero: { marginBottom: 32, marginTop: 20 },
  greeting: { fontSize: 28, fontWeight: "700", color: "#222222" },
  subtitle: { fontSize: 16, color: "#717171", marginTop: 4 },
  section: { marginBottom: 32 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#222222" },
  seeAll: { color: "#ff385c", fontWeight: "700" },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ff385c",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  chatContent: { flex: 1, marginLeft: 16 },
  chatName: { fontSize: 16, fontWeight: "700", color: "#222222" },
  chatPreview: { fontSize: 14, color: "#6a6a6a", marginTop: 2 },
  emptyRecent: {
    padding: 16,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 16,
  },
  emptyRecentText: { color: "#929292", fontSize: 13 },
  discoverRow: { marginTop: 12 },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfo: { flex: 1, marginLeft: 12 },
  userNameText: { fontSize: 16, fontWeight: "600", color: "#222" },
  userEmailText: { fontSize: 13, color: "#717171", marginTop: 2 },
  chatIconBtn: { padding: 8, backgroundColor: "rgba(255,56,92,0.1)", borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: "600", color: "#ff385c", backgroundColor: "rgba(255,56,92,0.1)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  emptyDiscover: { padding: 20, alignItems: "center" },
  emptyText: { color: "#717171" },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f2f2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  userAvatarText: { color: "#222222", fontSize: 18, fontWeight: "700" },
  infoCard: { padding: 20, borderRadius: 24, marginTop: 10 },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#717171",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoValue: { fontSize: 15, color: "#222222", marginBottom: 16 },
  signOutBtn: { borderTopWidth: 1, borderTopColor: "#e0e0e0", paddingTop: 16 },
  signOutText: { color: "#ff385c", fontWeight: "700", fontSize: 14 },
});
