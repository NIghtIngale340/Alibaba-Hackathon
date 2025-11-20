/**
 * Multi-Turn Conversation System - Mobile Version
 * Maintains context across multiple user turns for event creation and modification
 */

import { ExtractedEventData } from './email-handler';

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
  action?: 'clarify' | 'confirm' | 'modify' | 'rename' | 'cancel' | 'create';
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

// In-memory conversation store
const conversations = new Map<string, ConversationContext>();

/**
 * Initialize a new conversation session
 */
export function initializeConversation(
  sessionId: string,
  language: string = 'en-US'
): ConversationContext {
  const context: ConversationContext = {
    sessionId,
    language,
    partialEvent: {},
    conversationHistory: [],
    state: 'initial',
    missingFields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  conversations.set(sessionId, context);
  return context;
}

/**
 * Get conversation context
 */
export function getConversation(sessionId: string): ConversationContext | undefined {
  return conversations.get(sessionId);
}

/**
 * Update conversation context
 */
export function updateConversation(
  sessionId: string,
  updates: Partial<ConversationContext>
): ConversationContext {
  const context = conversations.get(sessionId);
  
  if (!context) {
    throw new Error(`Conversation ${sessionId} not found`);
  }
  
  const updated: ConversationContext = {
    ...context,
    ...updates,
    updatedAt: new Date(),
  };
  
  conversations.set(sessionId, updated);
  return updated;
}

/**
 * Add a turn to the conversation
 */
export function addConversationTurn(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  action?: ConversationTurn['action']
): void {
  const context = getConversation(sessionId);
  
  if (!context) {
    throw new Error(`Conversation ${sessionId} not found`);
  }
  
  const turn: ConversationTurn = {
    role,
    content,
    timestamp: new Date(),
    action,
  };
  
  context.conversationHistory.push(turn);
  context.updatedAt = new Date();
  
  conversations.set(sessionId, context);
}

/**
 * Process user input in conversation context
 */
export async function processConversationInput(
  sessionId: string,
  userInput: string,
  qwenApiKey: string
): Promise<ConversationResponse> {
  let context = getConversation(sessionId);
  
  if (!context) {
    context = initializeConversation(sessionId);
  }
  
  // Add user input to history
  addConversationTurn(sessionId, 'user', userInput);
  
  // Analyze user intent using Qwen
  const intent = await analyzeUserIntent(userInput, context, qwenApiKey);
  
  // Handle different intents
  let response: ConversationResponse;
  
  switch (intent.type) {
    case 'create_event':
      response = await handleEventCreation(sessionId, intent.extractedData, qwenApiKey);
      break;
      
    case 'modify_event':
      response = await handleEventModification(sessionId, intent.modifications);
      break;
      
    case 'rename_event':
    case 'rename_task':
      response = await handleRename(sessionId, intent.newTitle);
      break;
      
    case 'confirm':
      response = await handleConfirmation(sessionId, true);
      break;
      
    case 'cancel':
      response = await handleCancellation(sessionId);
      break;
      
    case 'provide_info':
      response = await handleInformationProvided(sessionId, intent.extractedData);
      break;
      
    default:
      response = {
        message: getLocalizedMessage(context.language, 'unclear'),
        state: context.state,
        needsUserInput: true,
      };
  }
  
  // Add assistant response to history
  addConversationTurn(sessionId, 'assistant', response.message, response.action as any);
  
  return response;
}

/**
 * Analyze user intent using Qwen
 */
async function analyzeUserIntent(
  userInput: string,
  context: ConversationContext,
  qwenApiKey: string
): Promise<any> {
  // TODO: Implement Qwen-based intent analysis
  // For now, simple keyword matching
  const input = userInput.toLowerCase();
  
  if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
    return { type: 'confirm' };
  }
  
  if (input.includes('no') || input.includes('cancel') || input.includes('stop')) {
    return { type: 'cancel' };
  }
  
  if (input.includes('rename') || input.includes('change title')) {
    return { type: 'rename_event', newTitle: input };
  }
  
  return {
    type: 'create_event',
    extractedData: { description: userInput },
  };
}

/**
 * Handle event creation
 */
async function handleEventCreation(
  sessionId: string,
  data: Partial<ExtractedEventData>,
  qwenApiKey: string
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  // Merge with partial event
  const partialEvent = { ...context.partialEvent, ...data };
  
  updateConversation(sessionId, {
    partialEvent,
    state: 'collecting',
  });
  
  return {
    message: "I'm collecting the event details. What would you like to schedule?",
    state: 'collecting',
    needsUserInput: true,
    partialEvent,
  };
}

/**
 * Handle event modification
 */
async function handleEventModification(
  sessionId: string,
  modifications: Partial<ExtractedEventData>
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  const partialEvent = { ...context.partialEvent, ...modifications };
  
  updateConversation(sessionId, {
    partialEvent,
    state: 'modifying',
  });
  
  return {
    message: "I've updated the event details. Would you like to create it now?",
    state: 'confirming',
    needsUserInput: true,
    partialEvent,
  };
}

/**
 * Handle rename
 */
async function handleRename(
  sessionId: string,
  newTitle: string
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  const partialEvent = { ...context.partialEvent, title: newTitle };
  
  updateConversation(sessionId, {
    partialEvent,
    state: 'modifying',
  });
  
  return {
    message: `Renamed to "${newTitle}". Anything else?`,
    state: 'confirming',
    needsUserInput: true,
    partialEvent,
  };
}

/**
 * Handle confirmation
 */
async function handleConfirmation(
  sessionId: string,
  confirmed: boolean
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  if (confirmed) {
    updateConversation(sessionId, {
      state: 'completed',
    });
    
    return {
      message: "Great! I'll create the event for you.",
      state: 'completed',
      needsUserInput: false,
      partialEvent: context.partialEvent,
      readyToCreate: true,
    };
  }
  
  updateConversation(sessionId, {
    state: 'cancelled',
  });
  
  return {
    message: "Okay, I've cancelled the event creation.",
    state: 'cancelled',
    needsUserInput: false,
  };
}

/**
 * Handle cancellation
 */
async function handleCancellation(sessionId: string): Promise<ConversationResponse> {
  updateConversation(sessionId, {
    state: 'cancelled',
  });
  
  return {
    message: "Event creation cancelled.",
    state: 'cancelled',
    needsUserInput: false,
  };
}

/**
 * Handle information provided
 */
async function handleInformationProvided(
  sessionId: string,
  data: Partial<ExtractedEventData>
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  const partialEvent = { ...context.partialEvent, ...data };
  
  updateConversation(sessionId, {
    partialEvent,
    state: 'collecting',
  });
  
  return {
    message: "Got it! Is there anything else you'd like to add?",
    state: 'collecting',
    needsUserInput: true,
    partialEvent,
  };
}

/**
 * Get localized message
 */
function getLocalizedMessage(language: string, key: string): string {
  const messages: Record<string, Record<string, string>> = {
    'en-US': {
      unclear: "I didn't understand that. Could you rephrase?",
    },
    'zh-CN': {
      unclear: "我没听懂，您能换个说法吗？",
    },
  };
  
  return messages[language]?.[key] || messages['en-US'][key] || key;
}

/**
 * Clear old conversations (cleanup)
 */
export function clearOldConversations(olderThanMinutes: number = 60): void {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  
  for (const [sessionId, context] of conversations.entries()) {
    if (context.updatedAt < cutoff) {
      conversations.delete(sessionId);
    }
  }
}
