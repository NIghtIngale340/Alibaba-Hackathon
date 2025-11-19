/**
 * Shared Types for Phases 2-5 Implementation
 */

// ============================================================================
// Phase 2: Email Handler Types
// ============================================================================

export interface ExtractedEventData {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  location?: string;
  attendees?: string[];
}

export interface EmailAnalysisResult {
  create_event: boolean;
  event?: ExtractedEventData;
  confidence?: number;
  reasoning?: string;
  event_type?: 'meeting' | 'call' | 'appointment' | 'reminder' | 'event' | 'task';
}

// ============================================================================
// Phase 3: Voice Interaction Types
// ============================================================================

export interface VoiceInput {
  text: string;
  language: string;
  confidence: number;
}

export interface VoiceOutput {
  text: string;
  language: string;
  audioUrl?: string;
}

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
}

export interface TTSResult {
  text: string;
  language: string;
  success: boolean;
}

export type SupportedLanguage = 
  | 'en-US'
  | 'zh-CN'
  | 'es-ES'
  | 'fr-FR'
  | 'de-DE'
  | 'ja-JP'
  | 'ko-KR';

// ============================================================================
// Phase 4: Conversation Types
// ============================================================================

export interface ConversationContext {
  sessionId: string;
  language: string;
  partialEvent?: Partial<ExtractedEventData>;
  conversationHistory: ConversationTurn[];
  state: ConversationState;
  missingFields: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  action?: 'clarify' | 'confirm' | 'modify' | 'cancel' | 'create';
}

export type ConversationState = 
  | 'initial'
  | 'collecting'
  | 'clarifying'
  | 'confirming'
  | 'modifying'
  | 'completed'
  | 'cancelled';

export interface ConversationResponse {
  message: string;
  state: ConversationState;
  needsUserInput: boolean;
  partialEvent?: Partial<ExtractedEventData>;
  readyToCreate?: boolean;
  action?: string;
}

// ============================================================================
// Phase 5: Action Delegation Types
// ============================================================================

export type AgentType = 'calendar' | 'outbound' | 'email' | 'voice';

export interface Task {
  taskId: string;
  type: 'create_event' | 'send_email' | 'update_event' | 'delete_event' | 'send_reply';
  agent: AgentType;
  data: any;
  priority: 'urgent' | 'normal' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export interface DelegationResult {
  success: boolean;
  taskId: string;
  agent: AgentType;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface AgentCapability {
  agent: AgentType;
  canHandle: (task: Task) => boolean;
  execute: (task: Task) => Promise<DelegationResult>;
}

// ============================================================================
// Enhanced Calendar Agent Types
// ============================================================================

export interface CalendarEventInput {
  source: 'email' | 'voice' | 'conversation';
  data: Partial<ExtractedEventData> | string;
  context?: ConversationContext;
  language?: string;
}

export interface AgentResponse {
  create_event: boolean;
  event?: ExtractedEventData;
  reasoning?: string;
  confidence?: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface EmailAnalyzeRequest {
  emailText: string;
  currentDate?: string;
}

export interface VoiceSTTRequest {
  audioData: string; // base64 encoded
  language?: SupportedLanguage;
}

export interface VoiceTTSRequest {
  text: string;
  language?: SupportedLanguage;
}

export interface ConversationRequest {
  sessionId?: string;
  userInput: string;
  language?: SupportedLanguage;
}

export interface DelegateTaskRequest {
  type: Task['type'];
  data: any;
  priority?: Task['priority'];
}

export interface IntegratedProcessRequest {
  inputType: 'email' | 'voice' | 'conversation';
  data: {
    emailText?: string;
    audioData?: string;
    userInput?: string;
  };
  sessionId?: string;
  language?: SupportedLanguage;
  autoCreate?: boolean;
}

export interface IntegratedProcessResponse {
  success: boolean;
  shouldCreateEvent?: boolean;
  eventCreated?: boolean;
  event?: ExtractedEventData;
  calendarEvent?: any;
  task?: Task;
  delegationResult?: DelegationResult;
  conversationResponse?: ConversationResponse;
  sessionId?: string;
  inputType?: string;
  reasoning?: string;
  message?: string;
  error?: string;
  details?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ErrorResponse {
  error: string;
  details?: string;
}

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}
