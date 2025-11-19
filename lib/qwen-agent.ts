/**
 * Enhanced Qwen Calendar Agent - Integrated with Multi-Turn Conversation
 * Analyzes email content, voice input, and conversation data to extract calendar events
 * Works with Email Handler, Voice System, and Action Delegator
 */

import { ExtractedEventData } from './email-handler';
import { ConversationContext } from './conversation-handler';

export interface ExtractedEvent {
  title: string;
  description: string;
  date: string; // ISO format YYYY-MM-DD
  start_time: string; // ISO format with time
  end_time: string; // ISO format with time
  location?: string;
  attendees?: string[];
}

export interface AgentResponse {
  create_event: boolean;
  event?: ExtractedEvent;
  reasoning?: string;
  confidence?: number;
}

export interface CalendarEventInput {
  source: 'email' | 'voice' | 'conversation';
  data: Partial<ExtractedEventData>;
  context?: ConversationContext;
  language?: string;
}

const SYSTEM_PROMPT = `You are an Enhanced Calendar Automation Agent with multi-source input support.

Your Responsibilities:
1. Analyze input from multiple sources:
   - Email text
   - Voice transcriptions
   - Multi-turn conversation data
   
2. CRITICAL: Distinguish between TASKS and EVENTS:
   
   TASKS (use event_type: 'task'):
   - Action items to be completed
   - To-dos with deadlines
   - Reminders without specific meeting times
   - Activities that don't involve multiple people or locations
   - Examples: "Finish report", "Submit proposal", "Review document", "Call John"
   - For tasks: set start_time to deadline and end_time to 15 minutes after
   
   EVENTS (use event_type: 'meeting', 'call', 'appointment', or 'event'):
   - Scheduled meetings with specific times
   - Appointments with time ranges
   - Calls scheduled at specific times with others
   - Events happening at a location or with attendees
   - Examples: "Team meeting at 2pm", "Doctor appointment", "Conference call"
   - For events: use actual start and end times

3. Extract all relevant details:
   - title (required)
   - description (required)
   - event_type (required: 'task', 'meeting', 'call', 'appointment', or 'event')
   - date (required, format: YYYY-MM-DD)
   - start_time (required, ISO 8601 format with timezone)
   - end_time (required, ISO 8601 format with timezone)
   - location (optional, usually not needed for tasks)
   - attendees (optional, array of email addresses)

4. Validation Rules:
   - Only extract explicit or clearly inferable information
   - No hallucination - stick to provided data
   - ALWAYS respect user's intent: if they say "create a task", use event_type 'task'
   - If they say "create an event" or "schedule a meeting", use appropriate event type
   - For rename/update requests: recognize phrases like "rename this task", "change the title", "update the event name"
   - Infer reasonable defaults:
     * Tasks: 15 minutes duration from deadline
     * Meetings: 1 hour duration if end time not specified
     * Calls: 30 minutes duration if end time not specified
     * Appointments: 1 hour duration if end time not specified
   - Calculate relative dates (tomorrow, next Monday, etc.) from current date
   - Use UTC timezone if not specified
   - Validate date/time logic (end must be after start)

5. Multi-turn conversation support:
   - Merge partial data from conversation context
   - Fill in missing fields from conversation history
   - Respect user modifications and corrections

6. Output Format:
{
  "create_event": true,
  "event": {
    "title": "Meeting Title or Task Name",
    "description": "Full description",
    "event_type": "task" or "meeting" or "call" or "appointment" or "event",
    "date": "2025-11-20",
    "start_time": "2025-11-20T14:00:00Z",
    "end_time": "2025-11-20T15:00:00Z",
    "location": "Conference Room A" (optional, omit for tasks),
    "attendees": ["person@example.com"] (optional)
  },
  "reasoning": "Brief explanation (specify if TASK or EVENT)",
  "confidence": 0.95
}

If no event should be created:
{
  "create_event": false,
  "reasoning": "Brief explanation",
  "confidence": 0.85
}

Always return valid JSON. Always include reasoning and confidence score.`;

/**
 * Enhanced: Process calendar event from multiple sources
 */
export async function processCalendarEvent(
  input: CalendarEventInput,
  apiKey: string
): Promise<AgentResponse> {
  const currentDate = new Date().toISOString();
  
  let contentToAnalyze = '';
  let partialEventData = input.data;
  
  // Build context based on source
  if (input.source === 'email') {
    contentToAnalyze = typeof input.data === 'string' ? input.data : JSON.stringify(input.data);
  } else if (input.source === 'voice') {
    contentToAnalyze = `Voice input (${input.language || 'en-US'}): ${
      typeof input.data === 'string' ? input.data : JSON.stringify(input.data)
    }`;
  } else if (input.source === 'conversation' && input.context) {
    // For conversation, merge context
    const history = input.context.conversationHistory
      .map(turn => `${turn.role}: ${turn.content}`)
      .join('\n');
    
    contentToAnalyze = `Conversation history:\n${history}\n\nPartial event data: ${JSON.stringify(partialEventData)}`;
    partialEventData = { ...input.context.partialEvent, ...partialEventData };
  }
  
  // If we have complete partial data, validate and return
  if (isCompleteEvent(partialEventData)) {
    return {
      create_event: true,
      event: partialEventData as ExtractedEvent,
      reasoning: 'Event data complete from multi-turn conversation',
      confidence: 0.95,
    };
  }
  
  // Otherwise, analyze with Qwen
  return await analyzeEmailWithQwen(contentToAnalyze, apiKey, partialEventData);
}

/**
 * Check if event data is complete
 */
function isCompleteEvent(data: Partial<ExtractedEventData>): boolean {
  const required = ['title', 'description', 'date', 'start_time', 'end_time'];
  return required.every(field => !!data[field as keyof ExtractedEventData]);
}

/**
 * Call Qwen model to analyze and extract event information
 * Enhanced to handle partial data from conversations
 */
export async function analyzeEmailWithQwen(
  content: string,
  apiKey: string,
  partialData?: Partial<ExtractedEventData>
): Promise<AgentResponse> {
  const apiUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  const currentDate = new Date().toISOString();
  
  let userPrompt = `Please analyze this content and determine if a calendar event should be created:\n\n${content}`;
  
  if (partialData && Object.keys(partialData).length > 0) {
    userPrompt += `\n\nExisting partial event data to merge/validate:\n${JSON.stringify(partialData, null, 2)}`;
  }
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\nCurrent date and time: ${currentDate}`,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Qwen API error: ${response.status} - ${
          errorData.message || response.statusText
        }`
      );
    }

    const data = await response.json();
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent) {
      throw new Error("No content in Qwen API response");
    }

    // Parse the JSON response
    const agentResponse: AgentResponse = JSON.parse(responseContent);

    // Validate the response structure
    if (typeof agentResponse.create_event !== "boolean") {
      throw new Error("Invalid response: missing create_event field");
    }

    if (agentResponse.create_event) {
      if (!agentResponse.event) {
        throw new Error("Invalid response: create_event is true but no event data provided");
      }
      
      // Validate extracted event
      validateExtractedEvent(agentResponse.event);
    }

    return agentResponse;
  } catch (error) {
    console.error("Qwen agent error:", error);
    throw error;
  }
}

/**
 * Validate extracted event data
 */
function validateExtractedEvent(event: ExtractedEvent): void {
  const required: (keyof ExtractedEvent)[] = ['title', 'description', 'date', 'start_time', 'end_time'];
  
  for (const field of required) {
    if (!event[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    throw new Error(`Invalid date format: ${event.date}. Expected YYYY-MM-DD`);
  }
  
  // Validate time format (ISO 8601)
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
  if (!isoRegex.test(event.start_time)) {
    throw new Error(`Invalid start_time format: ${event.start_time}`);
  }
  if (!isoRegex.test(event.end_time)) {
    throw new Error(`Invalid end_time format: ${event.end_time}`);
  }
  
  // Validate time logic
  const startTime = new Date(event.start_time);
  const endTime = new Date(event.end_time);
  
  if (endTime <= startTime) {
    throw new Error('end_time must be after start_time');
  }
  
  // Validate attendees if present
  if (event.attendees) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of event.attendees) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid email format: ${email}`);
      }
    }
  }
}

/**
 * Convert extracted event to Google Calendar API format
 */
export function convertToCalendarFormat(event: ExtractedEvent) {
  return {
    summary: event.title,
    description: event.description,
    location: event.location || "",
    start: event.start_time,
    end: event.end_time,
    attendees: event.attendees?.map(email => ({ email })),
  };
}

