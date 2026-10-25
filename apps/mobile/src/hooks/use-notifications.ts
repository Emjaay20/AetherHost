import { useAuth } from '@clerk/expo';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { aetherApi } from '@/api';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });

export async function registerForPushNotifications(getToken: ReturnType<typeof useAuth>['getToken']) {
  if (Platform.OS === 'web') throw new Error('Push notifications are available in the Android and iPhone app.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('deployments', { name: 'Deployments', importance: 5, vibrationPattern: [0, 250, 250, 250] });
  const current = await Notifications.getPermissionsAsync();
  const result = current.status === 'granted' ? current : await Notifications.requestPermissionsAsync();
  if (result.status !== 'granted') throw new Error('Notification permission was not granted.');
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) throw new Error('Push notifications need an EAS project ID. Run `eas init` once, then add it to EXPO_PUBLIC_EAS_PROJECT_ID.');
  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const token = await getToken();
  if (!token) throw new Error('Your session expired. Please sign in again.');
  await aetherApi.registerPushDevice(token, pushToken, Platform.OS as 'ios' | 'android');
  return pushToken;
}
