import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { authClient } from "../../../lib/auth-client";
import { env } from "@apnu/env/native";

export default function NewChatScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // 1. Debounce Logic (300ms)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  // 2. Load Suggested Users (All) OR Search Results
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["users", "list", debouncedQuery],
    queryFn: async () => {
      try {
        const cookie = authClient.getCookie();
        const url = debouncedQuery.trim()
          ? `${env.EXPO_PUBLIC_SERVER_URL}/api/users/search?q=${encodeURIComponent(debouncedQuery)}`
          : `${env.EXPO_PUBLIC_SERVER_URL}/api/users`;

        const res = await fetch(url, {
          headers: {
            Cookie: cookie || "",
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!res.ok) {
          console.warn("[NewChat] Fetch failed:", res.status);
          return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error("[NewChat] Query error:", error);
        return [];
      }
    },
  });

  // 3. Create Conversation Mutation
  const createConv = useMutation({
    mutationFn: async (userId: string) => {
      const cookie = authClient.getCookie();
      const res = await fetch(`${env.EXPO_PUBLIC_SERVER_URL}/api/conversations`, {
        method: "POST",
        headers: {
          Cookie: cookie || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ participantUserId: userId }),
        credentials: "include"
      });

      if (!res.ok) throw new Error("Failed to start chat");
      return res.json();
    },
    onSuccess: (data) => {
      router.replace(`/chat/${(data as any).id}`);
    },
  });

  const renderUser = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => createConv.mutate(item.id)}
      disabled={createConv.isPending}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {item.name?.[0]?.toUpperCase() || "?"}
        </Text>
      </View>
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.email} numberOfLines={1}>
          {item.email}
        </Text>
      </View>
      {createConv.isPending && createConv.variables === item.id ? (
        <ActivityIndicator size="small" color="#ff385c" />
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Search Header */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="#929292" />
        <TextInput
          style={styles.input}
          placeholder="Search by name or email..."
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        {isLoading && query.length > 0 && <ActivityIndicator size="small" color="#ff385c" />}
      </View>

      <Text style={styles.sectionHeader}>
        {debouncedQuery.trim() ? "Search Results" : "Suggested People"}
      </Text>

      {isLoading && !users?.length ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff385c" />
          <Text style={styles.loadingText}>Searching users...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={() =>
            !isLoading ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color="#e0e0e0" />
                <Text style={styles.emptyText}>
                  {debouncedQuery
                    ? `No users found matching "${debouncedQuery}"`
                    : "Discover more people in the search bar above."}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    margin: 16,
    backgroundColor: "#f2f2f2",
    borderRadius: 12,
  },
  input: { flex: 1, marginLeft: 8, fontSize: 16, color: "#222" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#717171",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f0f0f0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ff385c",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 17 },
  name: { fontSize: 16, fontWeight: "700", color: "#222" },
  email: { fontSize: 13, color: "#717171", marginTop: 2 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: "#929292", fontSize: 15, textAlign: "center", marginTop: 12 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 40 },
  loadingText: { color: "#717171", marginTop: 12, fontSize: 14 },
  listContent: { paddingBottom: 100 },
});
