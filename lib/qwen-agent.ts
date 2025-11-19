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
   
2. Determine if it contains information about:
   - A meeting
   - A call
   - An appointment
   - A deadline
   - A reminder
   - Any scheduled event

3. Extract all relevant event details:
   - title (required)
   - description (required)
   - date (required, format: YYYY-MM-DD)
   - start_time (required, ISO 8601 format with timezone)
   - end_time (required, ISO 8601 format with timezone)
   - location (optional)
   - attendees (optional, array of email addresses)

4. Validation Rules:
   - Only extract explicit or clearly inferable information
   - No hallucination - stick to provided data
   - Infer reasonable defaults:
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
    "title": "Meeting Title",
    "description": "Full description",
    "date": "2025-11-20",
    "start_time": "2025-11-20T14:00:00Z",
    "end_time": "2025-11-20T15:00:00Z",
    "location": "Conference Room A",
    "attendees": ["person@example.com"]
  },
  "reasoning": "Brief explanation",
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

/**
 * Test the agent with sample emails
 */
export const SAMPLE_EMAILS = {
  meeting: `Subject: Team Standup - Tomorrow 2 PM

Hi team,

Just a reminder that we have our weekly standup tomorrow at 2:00 PM in Conference Room B.

We'll discuss:
- Sprint progress
- Blockers
- Next week's planning

See you all there!

Best,
Sarah`,

  call: `Subject: Quick sync on Q4 roadmap

Hey Mark,

Can we hop on a call this Friday at 10 AM? Should only take 30 minutes.

Want to discuss the Q4 roadmap and get your input on priorities.

Let me know if that works!

Thanks,
Alex`,

  appointment: `Subject: Doctor's Appointment Confirmation

Dear Mark Christian Anub,

This is to confirm your appointment:

Date: November 25, 2025
Time: 3:00 PM - 3:30 PM
Location: City Medical Center, 123 Health St
Doctor: Dr. Johnson

Please arrive 10 minutes early.

Thank you,
City Medical Center`,

  deadline: `Subject: Project Deadline - Nov 30

Team,

Quick reminder that the Alibaba Hackathon project is due on November 30th, 2025 at 11:59 PM.

Please make sure all code is committed and documentation is complete.

Thanks!`,

  noEvent: `Subject: FYI - New Documentation Available

Hi everyone,

Just wanted to let you know that the new API documentation is now available on the wiki.

Check it out when you have time.

No action needed.

Cheers,
Tom`,
};

// Keep SAMPLE_EMAILS for testing purposes only