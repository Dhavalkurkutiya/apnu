import React from "react";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAppTheme } from "../../contexts/app-theme-context";
import {
  ThemeProvider,
  DarkTheme,
  DefaultTheme,
} from "@react-navigation/native";
import { useColorScheme } from "react-native";

/**
 * Native Tabs Layout
 * Uses the native system tab bar for maximum performance and native platform feel.
 * Documentation reference: SDK 55 Unstable Native Tabs.
 */
export default function TabLayout() {
  const { isDark } = useAppTheme();
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <NativeTabs 
        tintColor="#ff385c"
      >
        {/* 1. Home / Dashboard */}
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
            md="home"
          />
        </NativeTabs.Trigger>

        {/* 2. Messages / Chat Section */}
        <NativeTabs.Trigger name="chat">
          <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{
              default: "bubble.left.and.bubble.right",
              selected: "bubble.left.and.bubble.right.fill",
            }}
            md="chat_bubble"
          />
          {/* Badge indicator could be added here later if needed */}
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
