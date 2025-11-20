/**
 * Enhanced Dashboard Screen
 * Displays real-time stats, quick actions, and email queue preview
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useApp } from '@/contexts/app-context';
import { Sparkles, Mail, Mic, Clock, TrendingUp, Zap, Calendar, Send, Settings } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function EnhancedDashboardScreen() {
  const router = useRouter();
  const { stats, loading, backendConnected, refreshStats, notificationsEnabled } = useApp();
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    // Load stats on mount
    refreshStats();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient
        colors={['#8B5CF6', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.headerTitle}>AI Email Assistant</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/explore')}>
            <Settings color="#fff" size={24} />
          </TouchableOpacity>
        </View>

        {/* Connection Status */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, backendConnected ? styles.connected : styles.disconnected]}>
            <View style={[styles.statusDot, backendConnected ? styles.connectedDot : styles.disconnectedDot]} />
            <Text style={styles.statusText}>
              {backendConnected ? 'Backend Connected' : 'Demo Mode'}
            </Text>
          </View>
          {notificationsEnabled && (
            <View style={[styles.statusBadge, styles.connected]}>
              <View style={[styles.statusDot, styles.connectedDot]} />
              <Text style={styles.statusText}>Notifications ON</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8B5CF6"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* North Star Metric */}
        <LinearGradient
          colors={['#6D28D9', '#5B21B6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.northStarCard}
        >
          <View style={styles.northStarHeader}>
            <Sparkles color="#FFD700" size={28} />
            <Text style={styles.northStarLabel}>This Week's Impact</Text>
          </View>
          <Text style={styles.northStarValue}>{stats.hoursSaved.toFixed(1)}</Text>
          <Text style={styles.northStarUnit}>Hours Saved</Text>
          
          <View style={styles.northStarFooter}>
            <TrendingUp color="#10B981" size={16} />
            <Text style={styles.northStarFooterText}>
              {stats.emailsProcessed} emails processed • {stats.actionsTaken} actions taken
            </Text>
          </View>
        </LinearGradient>

        {/* Quick Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FEF3C7' }]}>
              <Mail color="#F59E0B" size={24} />
            </View>
            <Text style={styles.statValue}>{stats.emailsProcessed}</Text>
            <Text style={styles.statLabel}>Emails Today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#DBEAFE' }]}>
              <Zap color="#3B82F6" size={24} />
            </View>
            <Text style={styles.statValue}>{stats.actionsTaken}</Text>
            <Text style={styles.statLabel}>Actions</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FCE7F3' }]}>
              <Calendar color="#EC4899" size={24} />
            </View>
            <Text style={styles.statValue}>{stats.urgentPending}</Text>
            <Text style={styles.statLabel}>Urgent</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#D1FAE5' }]}>
              <TrendingUp color="#10B981" size={24} />
            </View>
            <Text style={styles.statValue}>{stats.streakDays}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/voice')}
          >
            <LinearGradient
              colors={['#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.actionGradient}
            >
              <View style={styles.actionContent}>
                <View style={styles.actionLeft}>
                  <Mic color="#fff" size={28} />
                  <View style={styles.actionText}>
                    <Text style={styles.actionTitle}>Voice Interaction</Text>
                    <Text style={styles.actionDescription}>
                      Speak to manage your emails
                    </Text>
                  </View>
                </View>
                <View style={styles.actionChevron}>
                  <Text style={styles.chevronText}>→</Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/emails')}
          >
            <View style={[styles.actionCardPlain, { backgroundColor: '#F3F4F6' }]}>
              <View style={styles.actionContent}>
                <View style={styles.actionLeft}>
                  <Mail color="#6B7280" size={28} />
                  <View style={styles.actionText}>
                    <Text style={[styles.actionTitle, { color: '#1F2937' }]}>
                      Unread Queue
                    </Text>
                    <Text style={[styles.actionDescription, { color: '#6B7280' }]}>
                      {stats.normalPending} emails waiting
                    </Text>
                  </View>
                </View>
                {stats.normalPending > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.normalPending}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Today's Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Mail color="#8B5CF6" size={20} />
                <Text style={styles.summaryText}>
                  Processed {stats.emailsProcessed} emails
                </Text>
              </View>
            </View>
            
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Clock color="#8B5CF6" size={20} />
                <Text style={styles.summaryText}>
                  Saved {stats.hoursSaved.toFixed(1)} hours this week
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Zap color="#8B5CF6" size={20} />
                <Text style={styles.summaryText}>
                  Took {stats.actionsTaken} automated actions
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <TrendingUp color="#10B981" size={20} />
                <Text style={styles.summaryText}>
                  {stats.streakDays} day productivity streak
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Spacing at bottom */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    color: '#E9D5FF',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  connected: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  disconnected: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectedDot: {
    backgroundColor: '#10B981',
  },
  disconnectedDot: {
    backgroundColor: '#FBB F24',
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  northStarCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  northStarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  northStarLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E9D5FF',
  },
  northStarValue: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  northStarUnit: {
    fontSize: 18,
    color: '#E9D5FF',
    marginBottom: 16,
  },
  northStarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  northStarFooterText: {
    fontSize: 14,
    color: '#E9D5FF',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 52) / 2,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  actionCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionGradient: {
    padding: 20,
  },
  actionCardPlain: {
    padding: 20,
    borderRadius: 16,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: '#E9D5FF',
  },
  actionChevron: {
    marginLeft: 12,
  },
  chevronText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: '300',
  },
  badge: {
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryText: {
    fontSize: 15,
    color: '#4B5563',
    flex: 1,
  },
});
