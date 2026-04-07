import "@/global.css";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import { AppThemeProvider } from "@/contexts/app-theme-context";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { OfflineBanner } from "@/components/offline-banner";

// 1. Setup QueryClient with WhatsApp-like aggressive caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60 * 24, // 24 hours (keep data ready offline)
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days (survive app closures)
      retry: 3,
    },
  },
});

// 2. Setup Persistence
const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

persistQueryClient({
  queryClient,
  persister: asyncStoragePersister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
});

// 3. Setup Online Awareness
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected ?? true);
  });
});

export const unstable_settings = {
  initialRouteName: "splash",
};

function StackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(drawer)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="modal"
        options={{ title: "Modal", presentation: "modal", headerShown: true }}
      />
    </Stack>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppThemeProvider>
          <QueryClientProvider client={queryClient}>
            <HeroUINativeProvider>
              <StatusBar style="auto" />
              <OfflineBanner />
              <StackLayout />
            </HeroUINativeProvider>
          </QueryClientProvider>
        </AppThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
