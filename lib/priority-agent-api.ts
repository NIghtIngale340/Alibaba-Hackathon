/**
 * Priority Agent API Service
 * Connects to FastAPI backend for email intelligence
 */

// Use environment variable for API URL, fallback to localhost for development
const PRIORITY_AGENT_BASE_URL = process.env.EXPO_PUBLIC_PRIORITY_AGENT_API_URL || 'http://localhost:8000';

console.log('🔌 Priority Agent API URL:', PRIORITY_AGENT_BASE_URL);

/**
 * Check if the backend is reachable
 */
export async function checkBackendHealth(): Promise<{
  healthy: boolean;
  message: string;
  url: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        healthy: true,
        message: 'Backend is healthy',
        url: PRIORITY_AGENT_BASE_URL,
      };
    }

    return {
      healthy: false,
      message: `Backend returned status ${response.status}`,
      url: PRIORITY_AGENT_BASE_URL,
    };
  } catch (error) {
    let message = 'Cannot connect to backend';
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        message = 'Backend connection timeout';
      } else if (error.message.includes('Network request failed')) {
        message = 'Network request failed - Check Wi-Fi and server';
      }
    }

    return {
      healthy: false,
      message,
      url: PRIORITY_AGENT_BASE_URL,
    };
  }
}

export interface EmailClassification {
  classification: 'URGENT' | 'NORMAL' | 'SPAM';
  trust_score: number;
  confidence: number;
  reasoning: string;
  metadata?: {
    sender_reputation?: number;
    domain_auth_score?: number;
    behavioral_match?: number;
    content_analysis?: number;
    interaction_history?: number;
  };
}

export interface Email {
  id: string;
  sender: string;
  sender_name?: string;
  subject: string;
  body: string;
  received_at: string;
  classification?: EmailClassification;
  thread_id?: string;
  labels?: string[];
}

export interface EmailAnalysis {
  intent: 'meeting_request' | 'action_item' | 'question' | 'information' | 'response_needed';
  summary: string;
  key_entities: {
    dates?: string[];
    times?: string[];
    people?: string[];
    locations?: string[];
  };
  action_required: 'calendar_update' | 'send_reply' | 'acknowledge' | 'none';
  urgency_level: 'immediate' | 'today' | 'this_week' | 'none';
  suggested_actions?: string[];
}

export interface VoiceCommand {
  transcript: string;
  intent: string;
  confidence: number;
  entities?: Record<string, any>;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  in_reply_to?: string;
  thread_id?: string;
  tone: 'professional' | 'casual' | 'formal';
}

/**
 * Classify an email using Priority Agent
 */
export async function classifyEmail(email: {
  sender: string;
  subject: string;
  body: string;
  received_at?: string;
}): Promise<EmailClassification> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
    });

    if (!response.ok) {
      throw new Error(`Classification failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Email classification error:', error);
    throw error;
  }
}

/**
 * Analyze email content for actionable insights
 */
export async function analyzeEmail(email: Email): Promise<EmailAnalysis> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_id: email.id,
        sender: email.sender,
        subject: email.subject,
        body: email.body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Email analysis error:', error);
    throw error;
  }
}

/**
 * Process voice command
 */
export async function processVoiceCommand(
  audioBlob: Blob,
  context?: {
    email_id?: string;
    conversation_history?: Array<{ role: string; content: string }>;
  }
): Promise<VoiceCommand> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    if (context) {
      formData.append('context', JSON.stringify(context));
    }

    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/voice/process`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Voice processing failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Voice command processing error:', error);
    throw error;
  }
}

/**
 * Generate speech from text
 */
export async function generateSpeech(text: string): Promise<Blob> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/voice/synthesize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Speech synthesis failed: ${response.statusText}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Speech synthesis error:', error);
    throw error;
  }
}

/**
 * Create or update calendar event
 */
export async function manageCalendarEvent(
  event: CalendarEvent,
  action: 'create' | 'update' | 'delete'
): Promise<{ success: boolean; event_id?: string; message?: string }> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/calendar/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Calendar operation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Calendar management error:', error);
    throw error;
  }
}

/**
 * Check for calendar conflicts
 */
export async function checkCalendarConflicts(
  startTime: string,
  endTime: string
): Promise<{ has_conflict: boolean; conflicting_events?: CalendarEvent[] }> {
  try {
    const response = await fetch(
      `${PRIORITY_AGENT_BASE_URL}/api/calendar/check-conflicts`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start_time: startTime, end_time: endTime }),
      }
    );

    if (!response.ok) {
      throw new Error(`Conflict check failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Calendar conflict check error:', error);
    throw error;
  }
}

/**
 * Generate email draft using AI
 */
export async function generateEmailDraft(params: {
  email_id: string;
  reply_intent: string;
  user_message?: string;
  tone?: 'professional' | 'casual' | 'formal';
}): Promise<EmailDraft> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/email/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Draft generation failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Email draft generation error:', error);
    throw error;
  }
}

/**
 * Send email
 */
export async function sendEmail(draft: EmailDraft): Promise<{
  success: boolean;
  message_id?: string;
  error?: string;
}> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draft),
    });

    if (!response.ok) {
      throw new Error(`Email send failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
}

/**
 * Get user's email queues (urgent, normal, spam)
 */
export async function getEmailQueues(): Promise<{
  urgent: Email[];
  normal: Email[];
  spam: Email[];
  stats: {
    total_processed: number;
    urgent_count: number;
    normal_count: number;
    spam_count: number;
    time_saved_minutes: number;
  };
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/emails/queues`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch queues: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('Email queues fetch error: Backend connection timeout');
        throw new Error(`Backend timeout - Please ensure FastAPI server is running at ${PRIORITY_AGENT_BASE_URL}`);
      }
      if (error.message.includes('Network request failed')) {
        console.error('Email queues fetch error: Network request failed');
        throw new Error(`Cannot connect to backend at ${PRIORITY_AGENT_BASE_URL}. Check: 1) FastAPI server is running, 2) Device is on same Wi-Fi network, 3) IP address is correct`);
      }
    }
    console.error('Email queues fetch error:', error);
    throw error;
  }
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<{
  emails_processed_today: number;
  actions_taken: number;
  time_saved_minutes: number;
  current_streak_days: number;
  urgent_pending: number;
  normal_pending: number;
  weekly_summary: {
    hours_saved: number;
    events_created: number;
    estimated_value: number;
    emails_archived: number;
  };
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/stats/dashboard`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Backend connection timeout - is the FastAPI server running?');
    }
    throw error;
  }
}

/**
 * Update behavioral learning database
 */
export async function logUserAction(action: {
  email_id: string;
  action_type: string;
  response_time_seconds: number;
  metadata?: Record<string, any>;
}): Promise<{ success: boolean }> {
  try {
    const response = await fetch(`${PRIORITY_AGENT_BASE_URL}/api/learning/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(action),
    });

    if (!response.ok) {
      throw new Error(`Action logging failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Action logging error:', error);
    throw error;
  }
}
