/**
 * Push Notification Service
 * Handles actionable notifications for urgent emails
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Email } from './priority-agent-api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface UrgentEmailNotification {
  emailId: string;
  sender: string;
  senderName?: string;
  subject: string;
  summary: string;
  trustScore: number;
}

export interface NotificationData {
  emailId: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  trustScore: number;
  priority: 'urgent' | 'high' | 'normal';
  timestamp: string;
  threadId?: string;
}

export type NotificationAction = 'listen' | 'snooze' | 'dismiss';

const SNOOZE_STORAGE_KEY = '@snoozed_emails';
const DEFAULT_SNOOZE_MINUTES = 30;

/**
 * Initialize notification service - Main entry point
 */
export async function initializeNotificationService(): Promise<boolean> {
  try {
    const permissionsGranted = await requestNotificationPermissions();
    if (!permissionsGranted) {
      return false;
    }

    await setupNotificationCategories();
    setupNotificationListeners();

    console.log('✅ Notification service initialized');
    return true;
  } catch (error) {
    console.error('❌ Notification service initialization error:', error);
    return false;
  }
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
      return false;
    }

    // Get push token for remote notifications (optional in Expo Go)
    if (Platform.OS !== 'web') {
      try {
        const projectId = process.env.EXPO_PUBLIC_PROJECT_ID || 'q-mobile-app';
        const token = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        console.log('✅ Push token:', token.data);
        
        // Store token for backend use
        await AsyncStorage.setItem('@push_token', token.data);
      } catch (error) {
        console.warn('⚠️ Push token not available in Expo Go. Use development build for full notification support.');
        console.log('ℹ️ Local notifications will still work.');
      }
    }

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('urgent-emails', {
        name: 'Urgent Emails',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF0000',
        sound: 'default',
        enableVibrate: true,
      });

      await Notifications.setNotificationChannelAsync('normal-emails', {
        name: 'Normal Emails',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      });
    }

    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

/**
 * Send urgent email notification with action buttons
 * @deprecated Use sendNotificationForUrgentEmail instead
 */
export async function sendUrgentEmailNotification(
  notification: UrgentEmailNotification | NotificationData
): Promise<string> {
  try {
    // Handle both old and new notification formats
    const isOldFormat = 'summary' in notification;
    const title = isOldFormat 
      ? `🔴 URGENT EMAIL FROM ${(notification as UrgentEmailNotification).senderName || notification.sender}`
      : `🔴 URGENT FROM ${(notification as NotificationData).fromName || (notification as NotificationData).from}`;
    const body = isOldFormat 
      ? (notification as UrgentEmailNotification).summary 
      : (notification as NotificationData).snippet;
    const sender = isOldFormat ? notification.sender : (notification as NotificationData).from;
    const subject = isOldFormat 
      ? (notification as UrgentEmailNotification).subject 
      : (notification as NotificationData).subject;
    
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          emailId: notification.emailId,
          type: 'urgent_email',
          from: sender,
          sender,
          subject,
          trustScore: notification.trustScore,
          priority: isOldFormat ? 'urgent' : (notification as NotificationData).priority,
          timestamp: isOldFormat ? new Date().toISOString() : (notification as NotificationData).timestamp,
        },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: 'urgent-email-actions',
        ...(Platform.OS === 'android' && {
          channelId: 'urgent-emails',
        }),
      },
      trigger: null, // Immediate notification
    });

    console.log('✅ Urgent notification sent:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('❌ Error sending urgent notification:', error);
    throw error;
  }
}

/**
 * Setup notification action categories
 */
export async function setupNotificationCategories() {
  try {
    await Notifications.setNotificationCategoryAsync('urgent-email-actions', [
      {
        identifier: 'listen',
        buttonTitle: '🎧 Listen & Respond',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'snooze',
        buttonTitle: '⏰ Snooze',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'dismiss',
        buttonTitle: '❌ Dismiss',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);

    console.log('Notification categories configured');
  } catch (error) {
    console.error('Error setting up notification categories:', error);
  }
}

/**
 * Setup notification event listeners
 */
function setupNotificationListeners(): void {
  // Handle notification received while app is in foreground
  Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('📬 Notification received:', notification.request.content.title);
  });

  // Handle notification response (user tapped notification or action button)
  Notifications.addNotificationResponseReceivedListener((response: any) => {
    const { actionIdentifier, notification } = response;
    const data = notification.request.content.data as NotificationData;
    
    console.log('👆 Notification response:', actionIdentifier);
    
    handleNotificationActionResponse(actionIdentifier, data);
  });
}

/**
 * Handle notification action response
 */
async function handleNotificationActionResponse(
  actionIdentifier: string,
  data: any
): Promise<void> {
  const emailId = data?.emailId;
  
  if (!emailId) {
    console.warn('No emailId in notification data');
    return;
  }

  switch (actionIdentifier) {
    case 'listen':
    case Notifications.DEFAULT_ACTION_IDENTIFIER:
      // Navigate to voice interaction screen
      router.push({
        pathname: '/(tabs)/voice',
        params: {
          emailId,
          from: data.from || data.sender,
          subject: data.subject,
          autoStart: 'true',
        },
      });
      break;

    case 'snooze':
      await snoozeEmail(emailId, DEFAULT_SNOOZE_MINUTES);
      break;

    case 'dismiss':
      await dismissEmail(emailId);
      router.push('/(tabs)/emails');
      break;

    default:
      console.log('Unknown action:', actionIdentifier);
  }
}

/**
 * Handle notification action response
 */
export async function handleNotificationAction(
  action: NotificationAction,
  emailId: string
): Promise<void> {
  try {
    switch (action) {
      case 'listen':
        // Navigate to voice interaction screen
        console.log('Opening voice interaction for email:', emailId);
        break;

      case 'snooze':
        await snoozeEmail(emailId, DEFAULT_SNOOZE_MINUTES);
        console.log(`Email ${emailId} snoozed for ${DEFAULT_SNOOZE_MINUTES} minutes`);
        break;

      case 'dismiss':
        await dismissEmail(emailId);
        console.log(`Email ${emailId} dismissed`);
        break;
    }
  } catch (error) {
    console.error('Error handling notification action:', error);
  }
}

/**
 * Snooze an email notification
 */
async function snoozeEmail(emailId: string, minutes: number): Promise<void> {
  try {
    const snoozedEmails = await getSnoozedEmails();
    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);

    snoozedEmails[emailId] = {
      snoozeUntil: snoozeUntil.toISOString(),
      originalTime: new Date().toISOString(),
      snoozeCount: (snoozedEmails[emailId]?.snoozeCount || 0) + 1,
    };

    await AsyncStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(snoozedEmails));

    // Schedule re-notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Snoozed Email Reminder',
        body: `You have a snoozed email to review`,
        data: { emailId, type: 'snooze_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeUntil,
      } as Notifications.DateTriggerInput,
    });
  } catch (error) {
    console.error('Error snoozing email:', error);
  }
}

/**
 * Dismiss an email notification (move to unread queue)
 */
async function dismissEmail(emailId: string): Promise<void> {
  try {
    // This will be handled by the email queues screen
    // Just cancel any pending notifications for this email
    const notifications = await Notifications.getPresentedNotificationsAsync();
    
    for (const notification of notifications) {
      if (notification.request.content.data?.emailId === emailId) {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  } catch (error) {
    console.error('Error dismissing email:', error);
  }
}

/**
 * Get snoozed emails from storage
 */
async function getSnoozedEmails(): Promise<Record<string, any>> {
  try {
    const data = await AsyncStorage.getItem(SNOOZE_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error getting snoozed emails:', error);
    return {};
  }
}

/**
 * Check for expired snoozes and re-notify
 */
export async function checkExpiredSnoozes(): Promise<void> {
  try {
    const snoozedEmails = await getSnoozedEmails();
    const now = new Date();
    const expired: string[] = [];

    for (const [emailId, snoozeData] of Object.entries(snoozedEmails)) {
      const snoozeUntil = new Date(snoozeData.snoozeUntil);
      if (snoozeUntil <= now) {
        expired.push(emailId);
      }
    }

    // Remove expired snoozes
    if (expired.length > 0) {
      for (const emailId of expired) {
        delete snoozedEmails[emailId];
      }
      await AsyncStorage.setItem(SNOOZE_STORAGE_KEY, JSON.stringify(snoozedEmails));
    }
  } catch (error) {
    console.error('Error checking expired snoozes:', error);
  }
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    console.log('All notifications cleared');
  } catch (error) {
    console.error('Error clearing notifications:', error);
  }
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  try {
    if (Platform.OS === 'ios') {
      return await Notifications.getBadgeCountAsync();
    }
    return 0;
  } catch (error) {
    console.error('Error getting badge count:', error);
    return 0;
  }
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Notifications.setBadgeCountAsync(count);
    }
  } catch (error) {
    console.error('Error setting badge count:', error);
  }
}

/**
 * Auto-snooze ignored notifications (5 min timeout)
 */
export async function setupAutoSnooze(emailId: string): Promise<void> {
  const IGNORE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  setTimeout(async () => {
    // Check if notification is still present (not interacted with)
    const notifications = await Notifications.getPresentedNotificationsAsync();
    const stillPresent = notifications.some(
      (n: any) => n.request.content.data?.emailId === emailId
    );

    if (stillPresent) {
      console.log(`Auto-snoozing ignored email: ${emailId}`);
      await snoozeEmail(emailId, 60); // Auto-snooze for 1 hour
      await dismissEmail(emailId);
    }
  }, IGNORE_TIMEOUT_MS);
}
