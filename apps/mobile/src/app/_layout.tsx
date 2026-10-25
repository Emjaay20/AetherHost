import { ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  if (!publishableKey) return <ConfigurationNotice />;
  return <SafeAreaProvider><ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}><ApplicationProviders /></ClerkProvider></SafeAreaProvider>;
}

function ApplicationProviders() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  useNotificationNavigation();
  return <QueryClientProvider client={queryClient}><StatusBar style="light" /><RootNavigator /></QueryClientProvider>;
}

function useNotificationNavigation() {
  useEffect(() => {
    const redirect = (notification: Notifications.Notification) => { const url = notification.request.content.data?.url; if (typeof url === 'string') router.push(url as never); };
    const previous = Notifications.getLastNotificationResponse();
    if (previous?.notification) redirect(previous.notification);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => redirect(response.notification));
    return () => subscription.remove();
  }, []);
}

function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <View style={styles.loading}><ActivityIndicator color="#48d8ca" size="large" /></View>;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#07111f' } }}>
    <Stack.Protected guard={Boolean(isSignedIn)}><Stack.Screen name="(app)" /></Stack.Protected>
    <Stack.Protected guard={!isSignedIn}><Stack.Screen name="(auth)" /></Stack.Protected>
  </Stack>;
}

function ConfigurationNotice() { return <SafeAreaProvider><View style={styles.notice}><Text style={styles.title}>AetherHost Mobile</Text><Text style={styles.copy}>Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your local .env file before launching the app.</Text></View></SafeAreaProvider>; }

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: '#07111f', justifyContent: 'center', alignItems: 'center' }, notice: { flex: 1, backgroundColor: '#07111f', justifyContent: 'center', alignItems: 'center', padding: 32 }, title: { color: '#f4f8fb', fontSize: 23, fontWeight: '800', marginBottom: 12 }, copy: { color: '#9fb2c3', fontSize: 15, lineHeight: 23, textAlign: 'center' } });
