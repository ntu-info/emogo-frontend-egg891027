import { Tabs } from "expo-router";
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs>
      {/* First tab uses the index.js screen in this folder */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="SentimentQuestionnaire"
        options={{
          title: "Sentiment",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="happy-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="VlogRecorder"
        options={{
          title: "Vlog",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="videocam-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="GPSCollector"
        options={{
          title: "GPS",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="location-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
