/**
 * Multi-Turn Conversation System - Phase 4
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
  action?: 'clarify' | 'confirm' | 'modify' | 'cancel' | 'create';
}

export type ConversationState = 
  | 'initial'           // Just started
  | 'collecting'        // Gathering event details
  | 'clarifying'        // Asking for missing information
  | 'confirming'        // Awaiting user confirmation
  | 'modifying'         // User is making changes
  | 'completed'         // Event created successfully
  | 'cancelled';        // User cancelled

export interface ConversationResponse {
  message: string;
  state: ConversationState;
  needsUserInput: boolean;
  partialEvent?: Partial<ExtractedEventData>;
  readyToCreate?: boolean;
  action?: string;
}

// In-memory conversation store (use Redis in production)
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
  
  // Analyze user intent
  const intent = await analyzeUserIntent(
    userInput,
    context,
    qwenApiKey
  );
  
  // Handle different intents
  let response: ConversationResponse;
  
  switch (intent.type) {
    case 'create_event':
      response = await handleEventCreation(sessionId, intent.extractedData, qwenApiKey);
      break;
      
    case 'modify_event':
      response = await handleEventModification(sessionId, intent.modifications);
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
  const apiUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  const prompt = `Analyze this user input in the context of calendar event creation.

Current conversation state: ${context.state}
Partial event data: ${JSON.stringify(context.partialEvent || {})}
User input: "${userInput}"

Determine the user's intent:
- "create_event": User wants to create a new event
- "modify_event": User wants to change existing event details
- "confirm": User confirms the current event
- "cancel": User wants to cancel
- "provide_info": User is providing requested information

Return JSON:
{
  "type": "intent_type",
  "extractedData": { event fields if any },
  "modifications": { fields to modify if applicable }
}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${qwenApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [
          {
            role: "system",
            content: "You are an intent analyzer for calendar event conversations. Return only valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    return JSON.parse(content || '{"type": "unclear"}');
  } catch (error) {
    console.error("Intent analysis error:", error);
    return { type: 'unclear' };
  }
}

/**
 * Handle event creation intent
 */
async function handleEventCreation(
  sessionId: string,
  extractedData: any,
  qwenApiKey: string
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  // Merge extracted data with partial event
  const partialEvent = {
    ...context.partialEvent,
    ...extractedData,
  };
  
  // Check what fields are missing
  const requiredFields = ['title', 'date', 'start_time', 'end_time'];
  const missingFields = requiredFields.filter(field => !partialEvent[field]);
  
  updateConversation(sessionId, {
    partialEvent,
    missingFields,
    state: missingFields.length > 0 ? 'clarifying' : 'confirming',
  });
  
  if (missingFields.length > 0) {
    // Ask for the first missing field
    const message = getLocalizedMessage(
      context.language,
      'ask_for_field',
      missingFields[0]
    );
    
    return {
      message,
      state: 'clarifying',
      needsUserInput: true,
      partialEvent,
    };
  } else {
    // All fields present, ask for confirmation
    const message = getLocalizedMessage(
      context.language,
      'confirm_event',
      partialEvent
    );
    
    return {
      message,
      state: 'confirming',
      needsUserInput: true,
      partialEvent,
      readyToCreate: false,
    };
  }
}

/**
 * Handle event modification
 */
async function handleEventModification(
  sessionId: string,
  modifications: any
): Promise<ConversationResponse> {
  const context = getConversation(sessionId)!;
  
  const updatedEvent = {
    ...context.partialEvent,
    ...modifications,
  };
  
  updateConversation(sessionId, {
    partialEvent: updatedEvent,
    state: 'confirming',
  });
  
  const message = getLocalizedMessage(
    context.language,
    'event_updated',
    updatedEvent
  );
  
  return {
    message,
    state: 'confirming',
    needsUserInput: true,
    partialEvent: updatedEvent,
  };
}

/**
 * Handle user confirmation
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
      message: getLocalizedMessage(context.language, 'event_created'),
      state: 'completed',
      needsUserInput: false,
      readyToCreate: true,
      partialEvent: context.partialEvent,
      action: 'create',
    };
  } else {
    return {
      message: getLocalizedMessage(context.language, 'what_to_change'),
      state: 'modifying',
      needsUserInput: true,
    };
  }
}

/**
 * Handle cancellation
 */
async function handleCancellation(sessionId: string): Promise<ConversationResponse> {
  updateConversation(sessionId, {
    state: 'cancelled',
  });
  
  const context = getConversation(sessionId)!;
  
  return {
    message: getLocalizedMessage(context.language, 'cancelled'),
    state: 'cancelled',
    needsUserInput: false,
  };
}

/**
 * Handle information provided by user
 */
async function handleInformationProvided(
  sessionId: string,
  extractedData: any
): Promise<ConversationResponse> {
  return await handleEventCreation(sessionId, extractedData, '');
}

/**
 * Get localized message
 */
function getLocalizedMessage(
  language: string,
  key: string,
  data?: any
): string {
  const messages: Record<string, Record<string, string | ((data: any) => string)>> = {
    'en-US': {
      unclear: "I'm not sure what you mean. Can you please rephrase?",
      ask_for_field: (field: string) => `What ${field} should I use for this event?`,
      confirm_event: (event: any) => 
        `I'll create: "${event.title}" on ${event.date} from ${event.start_time} to ${event.end_time}. Confirm?`,
      event_updated: () => "Event updated. Does this look correct?",
      event_created: "Event created successfully!",
      what_to_change: "What would you like to change?",
      cancelled: "Event creation cancelled.",
    },
    'zh-CN': {
      unclear: "我不太明白。您能重新表述一下吗？",
      ask_for_field: (field: string) => `请问这个事件的${field}是什么？`,
      confirm_event: (event: any) => 
        `我将创建："${event.title}"，时间：${event.date} ${event.start_time} 到 ${event.end_time}。确认吗？`,
      event_updated: () => "事件已更新。看起来正确吗？",
      event_created: "事件创建成功！",
      what_to_change: "您想修改什么？",
      cancelled: "事件创建已取消。",
    },
  };
  
  const langMessages = messages[language] || messages['en-US'];
  const message = langMessages[key];
  
  if (typeof message === 'function') {
    return message(data);
  }
  
  return message || langMessages['unclear'] as string;
}

/**
 * Clear old conversations (cleanup function)
 */
export function clearOldConversations(olderThanMinutes: number = 60): void {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  
  for (const [sessionId, context] of conversations.entries()) {
    if (context.updatedAt < cutoff) {
      conversations.delete(sessionId);
    }
  }
}
