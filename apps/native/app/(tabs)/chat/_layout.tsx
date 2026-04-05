import { Stack } from "expo-router";

/**
 * Nested Chat Stack Navigation
 * This sits inside the Drawer's "Chat" screen
 */
export default function ChatStackLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false, // Individual screens (index, new, [id]) manage their own headers
        contentStyle: { backgroundColor: "#ffffff" },
        animation: "slide_from_right"
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen 
        name="[id]" 
        options={{ 
          fullScreenGestureEnabled: true,
          headerShown: false,
        }} 
      />
    </Stack>
  );
}
