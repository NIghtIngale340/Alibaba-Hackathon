/**
 * Email Handler Agent - Phase 2
 * Analyzes incoming email content and extracts structured event information
 */

export interface ExtractedEventData {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  start_time: string; // ISO 8601 with timezone
  end_time: string; // ISO 8601 with timezone
  location?: string;
  attendees?: string[];
  is_all_day?: boolean;
  is_recurring?: boolean;
  recurrence_pattern?: string; // e.g., "weekly", "daily", "monthly"
  event_type?: 'meeting' | 'call' | 'appointment' | 'reminder' | 'event' | 'task';
}

export interface EmailAnalysisResult {
  create_event: boolean;
  event?: ExtractedEventData;
  confidence: number; // 0.0 to 1.0
  reasoning: string;
  event_type?: 'meeting' | 'call' | 'appointment' | 'reminder' | 'event' | 'task';
  missing_info?: string[]; // Fields that are unclear or missing
  warnings?: string[]; // Potential issues (past date, weekend, late night, etc.)
}

const EMAIL_ANALYSIS_PROMPT = `You are an advanced Email Analysis Agent that extracts calendar events from email content.

# CORE OBJECTIVE
Analyze email text and extract structured event information with high accuracy and proper timezone handling.

# USER TIMEZONE CONTEXT
User timezone: Asia/Manila (UTC+8)
ALL timestamps must use +08:00 offset to preserve local time.

# EVENT DETECTION CRITERIA

## Valid Event Types
1. **meeting** - Scheduled gathering with others (team sync, client call, etc.)
2. **call** - Phone/video conference with scheduled time
3. **appointment** - Personal scheduled activity (doctor, interview, haircut)
4. **reminder** - Time-based deadline or task
5. **event** - General scheduled activity (conference, webinar, party)
6. **task** - Actionable item with specific due date/time

## Detection Rules
✓ EXTRACT if email contains:
  - Explicit time/date reference (even if incomplete)
  - Clear invitation or scheduling language
  - Meeting/event coordination context

✗ SKIP if email is:
  - General inquiry without time commitment
  - Cancellation or declined invitation
  - Pure information sharing
  - Reply to previous thread without new scheduling info

# TIMEZONE & DATE HANDLING

## Critical Rules
1. **Always use +08:00 timezone offset** (Asia/Manila)
2. **Preserve local time** - If user says "5:00 PM", create "T17:00:00+08:00"
3. **DO NOT convert to UTC** - Never use "Z" suffix
4. **Use current date context** - Calculate relative dates from CURRENT_DATETIME

## Time Formats
- "5:00 PM" → "2025-11-20T17:00:00+08:00"
- "9am" → "2025-11-20T09:00:00+08:00"
- "2:30pm" → "2025-11-20T14:30:00+08:00"
- "17:00" → "2025-11-20T17:00:00+08:00"

## Relative Date Calculations
Given CURRENT_DATETIME, calculate:
- "today" → same date
- "tomorrow" → current date + 1 day
- "next Monday" → next occurrence of Monday after current date
- "next week Tuesday" → Tuesday in the following week
- "in 3 days" → current date + 3 days
- "Jan 16" (no year) → use current year, or next year if date has passed

## Default Duration Rules
If end_time not specified:
- meeting/appointment → start_time + 1 hour
- call → start_time + 30 minutes  
- event → start_time + 2 hours
- task/reminder → start_time + 15 minutes

If time not specified but date is:
- Set start_time to 09:00:00+08:00 (9 AM)
- Set is_all_day to true if truly all-day event

# CONFIDENCE SCORING

Return confidence score (0.0 to 1.0) based on:

**0.9 - 1.0 (Very High)**
- Explicit time, date, title all present
- Clear event type
- Formal invitation language

**0.7 - 0.89 (High)**
- Time and date present
- Title inferable from context
- Minor ambiguity in one field

**0.5 - 0.69 (Medium)**
- Partial information (date but vague time, or vice versa)
- Requires inference for 2+ fields
- Ambiguous event type

**0.3 - 0.49 (Low)**
- Heavy inference needed
- Multiple fields missing or ambiguous
- Unclear if truly an event

**< 0.3 (Very Low)**
- Minimal scheduling information
- Highly speculative extraction
- Better to skip than risk wrong data

# MISSING INFO TRACKING

List any unclear/missing fields in "missing_info" array:
- "end_time" - No end time specified
- "location" - No location mentioned
- "attendees" - Unclear who else is attending
- "time" - Date mentioned but no specific time
- "date" - Time mentioned but no specific date

# WARNING DETECTION

Add warnings for potential issues:
- "past_date" - Event date is before current date
- "weekend_meeting" - Meeting scheduled on Saturday/Sunday
- "late_night" - Event after 10 PM
- "early_morning" - Event before 6 AM
- "very_long" - Duration > 4 hours
- "very_short" - Duration < 15 minutes

# RESPONSE FORMAT

Return ONLY valid JSON:

## When Event Detected
{
  "create_event": true,
  "event": {
    "title": "Concise, clear event name (max 100 chars)",
    "description": "Full context from email, including any notes or agenda",
    "date": "2025-11-20",
    "start_time": "2025-11-20T14:00:00+08:00",
    "end_time": "2025-11-20T15:00:00+08:00",
    "location": "Office Meeting Room 3" | "Zoom" | "https://meet.google.com/xxx",
    "attendees": ["john@example.com", "sarah@example.com"],
    "is_all_day": false,
    "is_recurring": false,
    "recurrence_pattern": null
  },
  "confidence": 0.95,
  "reasoning": "Clear meeting invitation with explicit date, time, and attendees",
  "event_type": "meeting",
  "missing_info": [],
  "warnings": []
}

## When No Event
{
  "create_event": false,
  "confidence": 0.0,
  "reasoning": "Email is a general inquiry without scheduling commitment",
  "missing_info": ["date", "time"],
  "warnings": []
}

# EXTRACTION EXAMPLES

## Example 1: Complete Meeting
Email: "Hi! Can we meet tomorrow at 2 PM in Conference Room A to discuss the Q4 budget?"
Current: 2025-11-20T10:00:00+08:00

Response:
{
  "create_event": true,
  "event": {
    "title": "Q4 Budget Discussion",
    "description": "Meeting to discuss the Q4 budget in Conference Room A",
    "date": "2025-11-21",
    "start_time": "2025-11-21T14:00:00+08:00",
    "end_time": "2025-11-21T15:00:00+08:00",
    "location": "Conference Room A",
    "attendees": [],
    "is_all_day": false
  },
  "confidence": 0.95,
  "reasoning": "Clear meeting invitation with date (tomorrow = 2025-11-21), time (2 PM), location, and topic",
  "event_type": "meeting",
  "missing_info": [],
  "warnings": []
}

## Example 2: Partial Information
Email: "Reminder: Client presentation next Tuesday"
Current: 2025-11-20T10:00:00+08:00 (Wednesday)

Response:
{
  "create_event": true,
  "event": {
    "title": "Client Presentation",
    "description": "Client presentation scheduled for next Tuesday",
    "date": "2025-11-26",
    "start_time": "2025-11-26T09:00:00+08:00",
    "end_time": "2025-11-26T10:00:00+08:00",
    "is_all_day": false
  },
  "confidence": 0.65,
  "reasoning": "Clear date (next Tuesday = 2025-11-26) and event, but time inferred as business hours",
  "event_type": "reminder",
  "missing_info": ["time", "location"],
  "warnings": []
}

## Example 3: Past Date Warning
Email: "Meeting yesterday at 3pm was cancelled"
Current: 2025-11-20T10:00:00+08:00

Response:
{
  "create_event": false,
  "confidence": 0.0,
  "reasoning": "Event references past date (yesterday) and is marked as cancelled",
  "missing_info": [],
  "warnings": ["past_date"]
}

# CRITICAL RULES

1. ✓ ALWAYS use +08:00 timezone offset (Asia/Manila)
2. ✓ NEVER convert times to UTC (no "Z" suffix)
3. ✓ Use CURRENT_DATETIME as reference for relative dates
4. ✓ Only extract information explicitly stated or clearly inferable
5. ✗ NEVER hallucinate attendees, locations, or details not in email
6. ✓ Include reasoning for transparency
7. ✓ Flag ambiguities in missing_info
8. ✓ Return valid JSON only, no markdown formatting
9. ✓ When in doubt about event validity, prefer create_event: false
10. ✓ For all-day events, set is_all_day: true and use 00:00:00 time`;

/**
 * Analyze email content using Qwen to extract event information
 */
export async function analyzeEmailContent(
  emailText: string,
  apiKey: string,
  currentDate?: string
): Promise<EmailAnalysisResult> {
  const apiUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  // Format current date in readable format for LLM
  const now = currentDate || new Date().toISOString();
  const dateObj = new Date(now);
  const formattedCurrent = dateObj.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Manila'
  });
  
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
            content: EMAIL_ANALYSIS_PROMPT,
          },
          {
            role: "user",
            content: `CURRENT_DATETIME: ${formattedCurrent} (${now})

EMAIL CONTENT:
${emailText}

Extract event information following the response format specified in your instructions.`,
          },
        ],
        temperature: 0.2, // Very low for consistent, deterministic extraction
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
    
    // Ensure required fields exist
    if (!result.reasoning) {
      result.reasoning = "No reasoning provided";
    }
    if (typeof result.confidence !== 'number') {
      result.confidence = 0.5;
    }
    
    return result;
  } catch (error) {
    console.error("Email analysis error:", error);
    
    // Return a fallback error response
    return {
      create_event: false,
      confidence: 0.0,
      reasoning: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      warnings: ['analysis_error']
    };
  }
}

/**
 * Validate extracted event data with comprehensive checks
 */
function validateEventData(event: ExtractedEventData): void {
  const errors: string[] = [];
  
  // Required fields
  const required: Array<keyof ExtractedEventData> = [
    'title', 'description', 'date', 'start_time', 'end_time'
  ];
  
  for (const field of required) {
    if (!event[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
  
  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    errors.push(`Invalid date format: ${event.date}. Expected YYYY-MM-DD`);
  }
  
  // Validate ISO 8601 format with timezone
  // Accepts: YYYY-MM-DDTHH:MM:SS+HH:MM or YYYY-MM-DDTHH:MM:SSZ
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
  
  if (!isoRegex.test(event.start_time)) {
    errors.push(`Invalid start_time format: ${event.start_time}. Expected ISO 8601 with timezone`);
  }
  
  if (!isoRegex.test(event.end_time)) {
    errors.push(`Invalid end_time format: ${event.end_time}. Expected ISO 8601 with timezone`);
  }
  
  // Business logic validation
  try {
    const startDate = new Date(event.start_time);
    const endDate = new Date(event.end_time);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      errors.push('Invalid date objects - cannot parse timestamps');
    } else {
      // Ensure end time is after start time
      if (endDate <= startDate) {
        errors.push('end_time must be after start_time');
      }
      
      // Check for unrealistic duration (> 24 hours)
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      if (durationHours > 24) {
        errors.push(`Unrealistic duration: ${durationHours} hours. Events should be < 24 hours`);
      }
      
      // Check for very short duration (< 5 minutes) unless it's a reminder
      if (durationHours < (5 / 60)) {
        console.warn(`Warning: Very short event duration: ${durationHours * 60} minutes`);
      }
    }
  } catch (e) {
    errors.push(`Date parsing error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
  
  // Validate title length
  if (event.title && event.title.length > 200) {
    errors.push(`Title too long: ${event.title.length} characters (max 200)`);
  }
  
  // Validate email addresses in attendees
  if (event.attendees && event.attendees.length > 0) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = event.attendees.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      errors.push(`Invalid email addresses: ${invalidEmails.join(', ')}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Event validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Process email and prepare for Calendar Agent
 */
export async function processEmailForCalendar(
  emailText: string,
  apiKey: string,
  currentDate?: string
): Promise<EmailAnalysisResult> {
  // Analyze the email
  const analysis = await analyzeEmailContent(emailText, apiKey, currentDate);
  
  // Log results
  if (analysis.create_event && analysis.event) {
    console.log("✓ Event extracted successfully:", {
      type: analysis.event_type,
      title: analysis.event.title,
      date: analysis.event.date,
      confidence: analysis.confidence,
      warnings: analysis.warnings || [],
      missing_info: analysis.missing_info || [],
    });
    
    // Log warnings if any
    if (analysis.warnings && analysis.warnings.length > 0) {
      console.warn("⚠ Event warnings:", analysis.warnings);
    }
    
    // Log missing info if any
    if (analysis.missing_info && analysis.missing_info.length > 0) {
      console.info("ℹ Missing information:", analysis.missing_info);
    }
  } else {
    console.log("✗ No event detected:", analysis.reasoning);
  }
  
  return analysis;
}

/**
 * Batch process multiple emails
 */
export async function processMultipleEmails(
  emails: Array<{ id: string; content: string }>,
  apiKey: string,
  currentDate?: string
): Promise<Map<string, EmailAnalysisResult>> {
  const results = new Map<string, EmailAnalysisResult>();
  
  // Process emails sequentially to avoid rate limits
  for (const email of emails) {
    try {
      const analysis = await processEmailForCalendar(email.content, apiKey, currentDate);
      results.set(email.id, analysis);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to process email ${email.id}:`, error);
      results.set(email.id, {
        create_event: false,
        confidence: 0.0,
        reasoning: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        warnings: ['processing_error']
      });
    }
  }
  
  return results;
}