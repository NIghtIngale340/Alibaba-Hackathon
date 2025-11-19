/**
 * Email Handler Agent - Phase 2
 * Analyzes incoming email content and extracts structured event information
 */

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

const EMAIL_ANALYSIS_PROMPT = `You are an Email Analysis Agent specialized in detecting calendar events.

Your Task:
1. Analyze incoming email text
2. Determine if it describes a schedulable event (meeting, call, appointment, reminder, event, task)
3. Extract structured information if an event is found

Event Types to Detect:
- Meeting: scheduled gathering with others
- Call: phone/video conference
- Appointment: scheduled activity (doctor, interview, etc.)
- Reminder: time-based task or deadline
- Event: general scheduled activity
- Task: actionable item with a time component

Extract These Fields:
{
  "title": "Clear, concise event name",
  "description": "Full context and details",
  "date": "YYYY-MM-DD format",
  "start_time": "ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)",
  "end_time": "ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ)",
  "location": "Physical or virtual location (optional)",
  "attendees": ["email@example.com"] (optional)
}

Response Format:
If event detected:
{
  "create_event": true,
  "event": { ...extracted fields... },
  "confidence": 0.95,
  "reasoning": "Why this is an event",
  "event_type": "meeting"
}

If no event:
{
  "create_event": false,
  "reasoning": "Why this is not an event"
}

Rules:
- Only extract explicit or clearly inferable information
- If end_time missing: meetings = +1 hour, calls = +30 min, appointments = +1 hour
- Calculate relative dates (tomorrow, next week, etc.) from current date
- Use UTC timezone if not specified
- Never hallucinate details
- Return valid JSON only`;

/**
 * Analyze email content using Qwen to extract event information
 */
export async function analyzeEmailContent(
  emailText: string,
  apiKey: string,
  currentDate?: string
): Promise<EmailAnalysisResult> {
  const apiUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  const now = currentDate || new Date().toISOString();
  
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
            content: `${EMAIL_ANALYSIS_PROMPT}\n\nCurrent date and time: ${now}`,
          },
          {
            role: "user",
            content: `Analyze this email and extract event information:\n\n${emailText}`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from Qwen API");
    }

    const result: EmailAnalysisResult = JSON.parse(content);
    
    // Validate the extracted event data
    if (result.create_event && result.event) {
      validateEventData(result.event);
    }
    
    return result;
  } catch (error) {
    console.error("Email analysis error:", error);
    throw error;
  }
}

/**
 * Validate extracted event data
 */
function validateEventData(event: ExtractedEventData): void {
  const required = ['title', 'description', 'date', 'start_time', 'end_time'];
  
  for (const field of required) {
    if (!event[field as keyof ExtractedEventData]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    throw new Error(`Invalid date format: ${event.date}`);
  }
  
  // Validate ISO 8601 format
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
  if (!isoRegex.test(event.start_time)) {
    throw new Error(`Invalid start_time format: ${event.start_time}`);
  }
  if (!isoRegex.test(event.end_time)) {
    throw new Error(`Invalid end_time format: ${event.end_time}`);
  }
  
  // Ensure end time is after start time
  if (new Date(event.end_time) <= new Date(event.start_time)) {
    throw new Error("end_time must be after start_time");
  }
}

/**
 * Process email and send to Calendar Agent
 */
export async function processEmailForCalendar(
  emailText: string,
  apiKey: string
): Promise<EmailAnalysisResult> {
  // Analyze the email
  const analysis = await analyzeEmailContent(emailText, apiKey);
  
  // If event detected, it's ready to be sent to Calendar Agent
  if (analysis.create_event && analysis.event) {
    console.log("Event extracted successfully:", {
      type: analysis.event_type,
      title: analysis.event.title,
      date: analysis.event.date,
    });
  } else {
    console.log("No event detected in email:", analysis.reasoning);
  }
  
  return analysis;
}
