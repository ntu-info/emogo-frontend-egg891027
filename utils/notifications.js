import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useDailyNotifications() {
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        await Notifications.requestPermissionsAsync();
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
          }),
        });
        // Cancel all before scheduling new
        await Notifications.cancelAllScheduledNotificationsAsync();
        // Schedule 3 notifications per day
        const hours = [9, 15, 21];
        for (let h of hours) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Emogo Reminder',
              body: 'Please fill in your sentiment, vlog, and GPS!'
            },
            trigger: {
              hour: h,
              minute: 0,
              repeats: true
            }
          });
        }
      }
    })();
  }, []);
}
