import { Stack } from 'expo-router';
export default function AppLayout() { return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }}><Stack.Screen name="(tabs)" /><Stack.Screen name="projects/[id]" /><Stack.Screen name="deploy" /></Stack>; }
