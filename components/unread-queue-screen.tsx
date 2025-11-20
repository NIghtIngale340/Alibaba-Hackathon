/**
 * Email Queue Screen - Unread and Normal Emails
 * Shows batch view of normal priority emails
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { getAccessToken } from '../lib/auth';
import { analyzeEmailContent } from '../lib/email-handler';
import { createCalendarEvent } from '../lib/calendar-agent';
import { sendEmail } from '../lib/outbound-agent';

interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: Date;
  isRead: boolean;
  hasEvent?: boolean;
}

export default function EmailQueuesScreen() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    setLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.warn('Not authenticated');
        setEmails([]);
        setLoading(false);
        return;
      }

      const response = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=50',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gmail API error:', response.status, errorText);
        setEmails([]);
        setLoading(false);
        return;
      }

      const data = await response.json();
      const messages = data.messages || [];

      // Fetch full details for each message
      const emailPromises = messages.map(async (msg: any) => {
        const detailResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }
        );
        return await detailResponse.json();
      });

      const fullMessages = await Promise.all(emailPromises);

      const parsedEmails: Email[] = fullMessages.map((msg: any) => {
        const headers = msg.payload.headers;
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
        const dateStr = headers.find((h: any) => h.name === 'Date')?.value;

        return {
          id: msg.id,
          threadId: msg.threadId,
          from,
          subject,
          snippet: msg.snippet || '',
          date: dateStr ? new Date(dateStr) : new Date(),
          isRead: !msg.labelIds?.includes('UNREAD'),
        };
      });

      setEmails(parsedEmails);
    } catch (error) {
      console.error('Load emails error:', error);
      setEmails([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadEmails();
  };

  const markAsRead = async (emailId: string) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await fetch(
        `https://www.googleapis.com/gmail/v1/users/me/messages/${emailId}/modify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            removeLabelIds: ['UNREAD'],
          }),
        }
      );

      setEmails(prev =>
        prev.map(email =>
          email.id === emailId ? { ...email, isRead: true } : email
        )
      );
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  };

  const renderEmailItem = ({ item }: { item: Email }) => (
    <TouchableOpacity
      style={[styles.emailItem, !item.isRead && styles.unreadEmail]}
      onPress={() => {
        setSelectedEmail(item);
        markAsRead(item.id);
      }}
    >
      <View style={styles.emailHeader}>
        <Text style={styles.emailFrom} numberOfLines={1}>
          {item.from}
        </Text>
        <Text style={styles.emailDate}>
          {item.date.toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.emailSubject} numberOfLines={2}>
        {item.subject}
      </Text>
      <Text style={styles.emailSnippet} numberOfLines={2}>
        {item.snippet}
      </Text>
      {item.hasEvent && (
        <View style={styles.eventBadge}>
          <Text style={styles.eventBadgeText}>📅 Has Event</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading && emails.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading emails...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📬 Email Queue</Text>
        <Text style={styles.headerSubtitle}>
          {emails.filter(e => !e.isRead).length} unread
        </Text>
      </View>

      <FlatList
        data={emails}
        renderItem={renderEmailItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>📭 No emails</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
          </View>
        }
        contentContainerStyle={
          emails.length === 0 ? styles.emptyList : undefined
        }
      />

      {selectedEmail && (
        <View style={styles.detailPanel}>
          <Text style={styles.detailFrom}>{selectedEmail.from}</Text>
          <Text style={styles.detailSubject}>{selectedEmail.subject}</Text>
          <Text style={styles.detailSnippet}>{selectedEmail.snippet}</Text>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>📅 Create Event</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.actionButtonText}>✉️ Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.closeButton]}
              onPress={() => setSelectedEmail(null)}
            >
              <Text style={styles.actionButtonText}>✕ Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  emailItem: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ccc',
  },
  unreadEmail: {
    borderLeftColor: '#007AFF',
    backgroundColor: '#f0f8ff',
  },
  emailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  emailFrom: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  emailDate: {
    fontSize: 12,
    color: '#666',
  },
  emailSubject: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
    marginBottom: 4,
  },
  emailSnippet: {
    fontSize: 13,
    color: '#666',
  },
  eventBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  eventBadgeText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '500',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
  },
  detailPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  detailFrom: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  detailSubject: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  detailSnippet: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: '#ff3b30',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
