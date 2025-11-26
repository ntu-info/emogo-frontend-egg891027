import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const scheduleDailyReminders = async () => {
  try {
    // 1. Cancel all previous schedules
    await Notifications.cancelAllScheduledNotificationsAsync();

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Permission not granted');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const fixedTimes = [
      { hour: 8, minute: 0, label: '08:00' },
      { hour: 15, minute: 0, label: '15:00' },
      { hour: 22, minute: 0, label: '22:00' }, 
    ];

    for (const t of fixedTimes) {
      let targetDate = new Date();
      targetDate.setHours(t.hour);
      targetDate.setMinutes(t.minute);
      targetDate.setSeconds(0);
      targetDate.setMilliseconds(0);

      // If time passed today, schedule for tomorrow
      if (targetDate.getTime() <= Date.now()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      // Calculate seconds from now until the target time
      const secondsUntilTrigger = Math.floor((targetDate.getTime() - Date.now()) / 1000);

      console.log(`Scheduling ${t.label} (in ${secondsUntilTrigger} seconds)`);

      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'EmoGo Reminder',
          body: `Time to record your mood! (${t.label})`,
        },
        trigger: {
          seconds: secondsUntilTrigger, // 這是最穩定的方式
          repeats: false, // 只響一次，下次打開 App 會自動排程明天的
        },
      });
    }
    console.log('All daily reminders scheduled successfully.');
  } catch (e) {
    console.error('Error scheduling notifications:', e);
  }
};