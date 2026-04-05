import React from "react";
import { Drawer } from "expo-router/drawer";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, StyleSheet } from "react-native";
import { useAppTheme } from "../../contexts/app-theme-context";

/**
 * Main Drawer Layout
 * Wraps top-level screens like Dashboard and Chat Stack
 */
export default function DrawerLayout() {
  const { toggleTheme, isDark } = useAppTheme();

  return (
    <Drawer
      screenOptions={{
        headerTintColor: "#222222",
        headerTitleStyle: { fontWeight: "600" },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: "#ffffff" },
        drawerActiveTintColor: "#ff385c",
        drawerInactiveTintColor: "#6a6a6a",
        drawerLabelStyle: { fontWeight: "600", fontSize: 15 },
        headerRight: () => (
          <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={24}
              color="#222222"
            />
          </TouchableOpacity>
        ),
      }}
    >
      {/* 1. Dashboard / Home */}
      <Drawer.Screen
        name="index"
        options={{
          title: "Dashboard",
          drawerLabel: "Home",
          drawerIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      {/* 2. Chat Stack (Nested) */}
      <Drawer.Screen
        name="chat"
        options={{
          title: "Chats",
          drawerIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  themeToggle: {
    marginRight: 16,
    padding: 8,
  },
});
