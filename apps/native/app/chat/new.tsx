import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInRight } from "react-native-reanimated";
import {
  Surface,
  Input,
  TextField,
  Avatar,
  Spinner,
  useThemeColor,
  useToast,
  Button,
} from "heroui-native";

import { authClient } from "@/lib/auth-client";
import { env } from "@apnu/env/native";

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * New Chat Screen with HeroUI
 * Modern user search and selection interface
 */
export default function NewChatScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<any>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const backgroundColor = useThemeColor("background");
  const surfaceColor = useThemeColor("surface");
  const accentColor = useThemeColor("accent");
  const foregroundColor = useThemeColor("foreground");

  // Debounce Logic (300ms)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);

  // Load Suggested Users or Search Results
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

  // Create Conversation Mutation
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
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to start chat");
      return res.json();
    },
    onSuccess: (data) => {
      toast.show({
        variant: "success",
        label: "Conversation started!",
      });
      router.replace(`/chat/${(data as any).id}`);
    },
    onError: () => {
      toast.show({
        variant: "danger",
        label: "Failed to start conversation. Please try again.",
      });
    },
  });

  const renderUser = ({ item, index }: { item: any; index: number }) => (
    <AnimatedTouchableOpacity
      entering={FadeInRight.delay(index * 30).duration(300)}
      style={styles.row}
      onPress={() => createConv.mutate(item.id)}
      disabled={createConv.isPending}
      activeOpacity={0.7}
    >
      <Avatar alt={item.name} size="md" style={styles.avatar}>
        <Avatar.Image src={item.image || undefined} />
        <Avatar.Fallback style={{ backgroundColor: "#ff385c" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {item.name.substring(0, 2).toUpperCase()}
          </Text>
        </Avatar.Fallback>
      </Avatar>
      <View style={styles.userInfo}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.email} numberOfLines={1}>
          {item.email}
        </Text>
      </View>
      {createConv.isPending && createConv.variables === item.id ? (
        <Spinner size="sm" color={accentColor} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
        >
          <Ionicons name="chevron-forward" size={20} color={foregroundColor} />
        </Button>
      )}
    </AnimatedTouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      {/* Header */}
      <Surface variant="default" style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerLeft}>
          <Button
            variant="ghost"
            size="md"
            isIconOnly
            onPress={() => router.back()}
          >
            <Ionicons name="close-outline" size={28} color="#222" />
          </Button>
          <Text style={[styles.headerTitle, { color: "#ff385c" }]}>New Chat</Text>
        </View>
      </Surface>

      {/* Search Box */}
      <Surface variant="secondary" style={styles.searchContainer}>
        <TextField style={styles.searchField}>
          <View style={styles.searchInputContainer}>
            <Ionicons
              name="search"
              size={20}
              color={foregroundColor}
              style={styles.searchIcon}
            />
            <Input
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or email..."
              autoFocus
              style={styles.searchInput}
            />
            {isLoading && query.length > 0 && (
              <Spinner size="sm" color={accentColor} style={styles.searchSpinner} />
            )}
            {query.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <Ionicons name="close-circle" size={20} color={foregroundColor} />
              </Button>
            )}
          </View>
        </TextField>
      </Surface>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>
          {debouncedQuery.trim() ? "Search Results" : "Suggested People"}
        </Text>
        <Text style={[styles.countText, { color: "#ff385c" }]}>{users.length} found</Text>
      </View>

      {/* User List */}
      {isLoading && !users?.length ? (
        <View style={styles.loadingContainer}>
          <Spinner size="lg" />
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
              <Animated.View entering={FadeIn} style={styles.emptyState}>
                <Surface variant="secondary" style={styles.emptyIconContainer}>
                  <Ionicons name="people-outline" size={48} color="#ff385c" title="No Users" />
                </Surface>
                <Text style={styles.emptyTitle}>
                  {debouncedQuery ? "No users found" : "No users available"}
                </Text>
                <Text style={styles.emptyText}>
                  {debouncedQuery
                    ? `No results matching "${debouncedQuery}"`
                    : "Check back later for more people to chat with"}
                </Text>
                {debouncedQuery && (
                  <Button
                    variant="outline"
                    onPress={() => setQuery("")}
                    style={[styles.clearButton, { borderColor: "#ff385c" }]}
                  >
                    <Button.Label style={{ color: "#ff385c" }}>Clear Search</Button.Label>
                  </Button>
                )}
              </Animated.View>
            ) : null
          }
        />
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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
    marginLeft: 8,
  },
  searchContainer: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  searchField: {
    padding: 0,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    backgroundColor: "transparent",
  },
  searchSpinner: {
    marginRight: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#717171",
  },
  countText: {
    fontSize: 13,
    color: "#929292",
  },
  listContent: {
    paddingBottom: 100,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  avatar: {
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#222",
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: "#717171",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  loadingText: {
    color: "#717171",
    marginTop: 16,
    fontSize: 15,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
    marginTop: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#222",
    marginBottom: 8,
  },
  emptyText: {
    color: "#717171",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  clearButton: {
    minWidth: 140,
  },
});
