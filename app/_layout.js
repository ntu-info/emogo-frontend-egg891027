import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from 'expo-status-bar';

import { scheduleDailyReminders } from "../utils/notifications";

export default function RootLayout() {
  
  // 3. 使用 useEffect 確保只在 App 啟動時執行一次排程
  useEffect(() => {
    scheduleDailyReminders();
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#000" />
      {/* Root stack controls screen transitions for the whole app */}
      <Stack>
        {/* The (tabs) group is one Stack screen with its own tab navigator */}
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        {/* This screen is pushed on top of tabs when you navigate to /details */}
        <Stack.Screen
          name="details"
          options={{ title: "Details" }}
        />
      </Stack>
    </>
  );
}