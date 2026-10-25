import { Tabs } from 'expo-router';

export default function TabsLayout() { return <Tabs screenOptions={{ headerShown: false, tabBarStyle: { height: 72, backgroundColor: '#0a1927', borderTopColor: '#1b3747', paddingTop: 7 }, tabBarActiveTintColor: '#62e5d7', tabBarInactiveTintColor: '#7893a5', tabBarLabelStyle: { fontWeight: '700', fontSize: 10 } }}>
  <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: () => null }} />
  <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: () => null }} />
  <Tabs.Screen name="ai" options={{ title: 'AI', tabBarIcon: () => null }} />
  <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: () => null }} />
  <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: () => null }} />
</Tabs>; }
