import { Stack } from "expo-router";
import { StatusBar } from 'expo-status-bar';
export default function RootLayout() {
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
      </Stack>
    </>
  );
}