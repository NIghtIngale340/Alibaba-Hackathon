/**
 * App Context - Global state management
 * Manages authentication, notifications, and agent orchestration
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { initializeNotificationService, sendUrgentEmailNotification, NotificationData } from '@/lib/notification-service';
import { checkBackendHealth, getDashboardStats } from '@/lib/priority-agent-api';
import { getAccessToken } from '@/lib/auth';

interface DashboardStats {
  emailsProcessed: number;
  actionsTaken: number;
  hoursSaved: number;
  streakDays: number;
  urgentPending: number;
  normalPending: number;
}

interface AppContextType {
  // Authentication
  isAuthenticated: boolean;
  accessToken: string | null;
  
  // Backend status
  backendConnected: boolean;
  backendUrl: string;
  
  // Dashboard stats
  stats: DashboardStats;
  loading: boolean;
  
  // Notifications
  notificationsEnabled: boolean;
  
  // Actions
  refreshStats: () => Promise<void>;
  checkBackend: () => Promise<void>;
  processUrgentEmail: (email: NotificationData) => Promise<void>;
}

const defaultStats: DashboardStats = {
  emailsProcessed: 0,
  actionsTaken: 0,
  hoursSaved: 0,
  streakDays: 0,
  urgentPending: 0,
  normalPending: 0,
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize app on mount (only once)
  useEffect(() => {
    if (!initialized) {
      initializeApp();
    }
  }, [initialized]);

  const initializeApp = async () => {
    try {
      // Check authentication
      const token = await getAccessToken();
      setIsAuthenticated(!!token);
      setAccessToken(token);

      // Initialize notifications
      const notifEnabled = await initializeNotificationService();
      setNotificationsEnabled(notifEnabled);

      // Check backend
      await checkBackend();
      
      // Load initial stats if authenticated
      if (token) {
        await refreshStats();
      }
      
      setInitialized(true);
    } catch (error) {
      console.error('❌ App initialization error:', error);
      setInitialized(true); // Mark as initialized even on error to prevent infinite loop
    }
  };

  const checkBackend = async () => {
    try {
      const health = await checkBackendHealth();
      setBackendConnected(health.healthy);
      setBackendUrl(health.url);
      
      if (health.healthy) {
        console.log('✅ Backend connected:', health.url);
      } else {
        console.warn('⚠️ Backend not available:', health.message);
        console.log('💡 Start backend: cd priority-agent && python api_server.py');
      }
    } catch (error) {
      console.warn('⚠️ Backend connection failed. Using demo mode.');
      console.log('💡 To connect backend: cd priority-agent && python api_server.py');
      setBackendConnected(false);
    }
  };

  const refreshStats = async () => {
    if (!backendConnected) {
      console.log('📊 Using demo stats - backend not connected');
      setStats({
        emailsProcessed: 47,
        actionsTaken: 12,
        hoursSaved: 5.2,
        streakDays: 5,
        urgentPending: 3,
        normalPending: 12,
      });
      return;
    }

    try {
      setLoading(true);
      const data = await getDashboardStats();
      
      setStats({
        emailsProcessed: data.emails_processed_today || 0,
        actionsTaken: data.actions_taken || 0,
        hoursSaved: data.weekly_summary?.hours_saved || 0,
        streakDays: data.current_streak_days || 0,
        urgentPending: data.urgent_pending || 0,
        normalPending: data.normal_pending || 0,
      });
    } catch (error) {
      console.error('❌ Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const processUrgentEmail = async (email: NotificationData) => {
    if (!notificationsEnabled) {
      console.warn('⚠️ Notifications not enabled');
      return;
    }

    try {
      await sendUrgentEmailNotification(email);
      
      // Update urgent count
      setStats(prev => ({
        ...prev,
        urgentPending: prev.urgentPending + 1,
      }));
    } catch (error) {
      console.error('❌ Failed to process urgent email:', error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        accessToken,
        backendConnected,
        backendUrl,
        stats,
        loading,
        notificationsEnabled,
        refreshStats,
        checkBackend,
        processUrgentEmail,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
