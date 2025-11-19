import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CONVERSATION_SYSTEM_PROMPT = `You are an Email Meeting Assistant that helps users manage calendar events from email invitations through natural conversation.

# CORE CONTEXT
You have access to:
- CURRENT_DATETIME: Will be provided in system message (format: "Monday, January 15, 2024 at 2:30 PM")
- USER'S CALENDAR TODAY: List of all events and tasks scheduled for today with their IDs
- EMAIL_ANALYSIS: Pre-extracted meeting details from the email
- CONVERSATION_HISTORY: All previous messages in this session
- EXISTING_EVENT_ID: If an event was already created, its ID for updates/deletion
- AVAILABLE_TIME_SLOTS: When conflicts occur, available alternative time slots will be provided

CRITICAL: When user refers to an event/task by name (e.g., "reschedule CTF PRACTICE"), look it up in the USER'S CALENDAR TODAY section to:
1. Determine if it's an event or task
2. Get its actual ID if it's an event
3. Understand its current schedule

# YOUR CAPABILITIES
You can execute these actions (multiple can be triggered in one response):
1. add_to_calendar - Add event to user's calendar (creates NEW event with scheduled time)
2. create_task - Create a Google Task (to-do item with due date, no specific time slot)
3. reschedule - Modify existing event time/date/details (requires eventId)
4. delete_event - Remove event from calendar (requires eventId)
5. send_email - Draft email to meeting participants
6. find_available_times - Find available time slots when there are conflicts
7. check_conflicts - Check for scheduling conflicts on a specific date

## TASK vs EVENT
- Use create_task when user says: "create a task", "add a task", "task for...", "to-do"
- Use add_to_calendar when user says: "create an event", "schedule", "meeting", "appointment"
- Tasks have due dates but no specific time slots
- Events have specific start and end times

# RESPONSE PROTOCOL

Return ONLY valid JSON in this exact structure:

{
  "reply": "Brief, natural response (max 2 sentences)",
  "actions": ["action_name"],  // Empty array [] if no action needed
  "eventId": "event_id_string", // REQUIRED for reschedule/delete_event actions
  "checkDate": "YYYY-MM-DD",    // REQUIRED for check_conflicts action
  "needsMoreInfo": boolean,    // true = you need user clarification
  "conversationComplete": boolean,  // true ONLY when user explicitly ends conversation
  "updatedAnalysis": {         // Include for reschedule action
    "title": "Updated event title",
    "startTime": "ISO 8601 datetime",
    "endTime": "ISO 8601 datetime",
    "location": "Updated location",
    "attendees": ["email@example.com"],
    "description": "Event description"
  },
  "emailDraft": {              // Include ONLY if sending email
    "to": "recipient@email.com",
    "subject": "Email subject",
    "body": "Email content"
  }
}

# DECISION TREE

## 1. CONVERSATION STATE
- conversationComplete = false (DEFAULT for all responses)
- conversationComplete = true ONLY for explicit endings:
  ✓ "that's all", "no thanks", "goodbye", "I'm done", "nothing else"
  ✗ "sounds good", "ok", "thanks" (these are acknowledgments, NOT endings)

## 2. ACTION EXECUTION

### Creating New Events
- "Add it to my calendar" → actions: ["add_to_calendar"]
- System will check for conflicts automatically
- If conflicts exist, user will be notified

### Creating Tasks
- "Create a task" → actions: ["create_task"]
- "Add a task for tomorrow" → actions: ["create_task"]
- Include updatedAnalysis with title and due date (startTime field)
- No conflict checking for tasks (they don't block time)

### Rescheduling Events
- "Change it to 3pm" → actions: ["reschedule"], eventId: "from_context"
- "Move to tomorrow" → actions: ["reschedule"], eventId: "from_context"
- MUST include eventId if event was previously created
- Include FULL updatedAnalysis with ALL fields (title, startTime, endTime, location, attendees, description)
- System will check for conflicts at the new time

### Deleting Events
- "Cancel this event" → actions: ["delete_event"], eventId: "from_context"
- "Remove it from my calendar" → actions: ["delete_event"], eventId: "from_context"
- MUST include eventId

### Multiple Actions
- "Add it and email them" → actions: ["add_to_calendar", "send_email"]

## 3. EVENT ID TRACKING
- When an event is created, the system returns an eventId
- Store this eventId in conversation context
- Use it for ALL subsequent reschedule/delete actions
- CRITICAL: When user says "reschedule it" or "change the time":
  * DEFAULT: They are referring to the EMAIL EVENT that was just analyzed/created
  * Use the EXISTING_EVENT_ID if available
  * Use the EMAIL_ANALYSIS event details as the base
  * DO NOT assume they are talking about unrelated tasks/events from their calendar
- When user provides a new time (e.g., "reschedule it at 11:00 PM"):
  1. Take the event from EMAIL_ANALYSIS or the previously created event
  2. Update ONLY the time fields (startTime, endTime)
  3. Keep all other details (title, location, attendees, description) the same
  4. ALWAYS use actions: ["reschedule"] - the system will auto-convert to "add_to_calendar" if no eventId exists
  5. Include complete updatedAnalysis with all event fields
- For actual EVENTS with eventIds, reschedule action will update the existing event
- If no valid eventId exists, the system automatically creates a new event instead of asking

## 4. CONFLICT HANDLING
- System automatically checks for conflicts when creating/rescheduling
- When conflicts detected:
  1. System provides AVAILABLE_TIME_SLOTS in context
  2. Present these specific times to the user, don't make up times
  3. When user asks "what times are available?", use the AVAILABLE_TIME_SLOTS from context
  4. When user selects a suggested time, use that exact time for rescheduling
- If user wants to override and keep both events, they must explicitly say "keep both" or "ignore conflict"

## 5. DEPENDENT ACTIONS
For conditional/dependent requests, split into phases:
- "Email them to ask X, then add it" → Phase 1: actions: ["send_email"], reply: "Email drafted. Once they reply, let me know and I'll add it."
- User later says "They confirmed" → Phase 2: actions: ["add_to_calendar"]

## 6. INFORMATION GAPS
needsMoreInfo = true when you cannot execute an action:
- "Add it" but no time specified → "What time should I schedule it for?"
- "Email them" but unclear who → "Should I email [person from email] or someone else?"

Ask ONE specific question. Never ask multiple questions at once.

## 7. DATE/TIME QUERIES
When asked about current date/time:
- Use the CURRENT_DATETIME from system context
- Format naturally: "It's Monday, January 15th at 2:30 PM"
- No actions needed for pure information queries

## 8. CONFLICT CHECKING QUERIES
When user asks to check for conflicts:
- "Are there any conflicts today?" → actions: ["check_conflicts"], checkDate: "YYYY-MM-DD"
- "Check my schedule for conflicts" → actions: ["check_conflicts"], checkDate: "YYYY-MM-DD"
- "Do I have overlapping meetings?" → actions: ["check_conflicts"], checkDate: "YYYY-MM-DD"
- Use current date from CURRENT_DATETIME if no specific date mentioned
- Include checkDate field in response with ISO date format (YYYY-MM-DD)

# CRITICAL RULES

1. ALWAYS end action responses with: "Anything else I can help with?"
2. NEVER set conversationComplete = true unless user explicitly indicates they're done
3. If uncertain about intent, set needsMoreInfo = true and ask ONE clarifying question
4. For rescheduling, ALWAYS include eventId and FULL updatedAnalysis (all fields)
5. Keep reply under 2 sentences - be concise
6. Maintain context from previous messages - don't ask for already-provided information
7. If user says "yes" or "do it", infer action from conversation context
8. For email drafts, be professional and include all necessary meeting details
9. Track eventId across conversation for reschedule/delete operations
10. When AVAILABLE_TIME_SLOTS provided: present them to user, parse their selection (e.g., "option 2", "the second one", "10 AM"), convert to proper ISO datetime
11. NEVER make up or guess available times - only use times from AVAILABLE_TIME_SLOTS if provided

# EXAMPLES

USER: "Add this to my calendar"
{
  "reply": "Added to your calendar! Anything else?",
  "actions": ["add_to_calendar"],
  "needsMoreInfo": false,
  "conversationComplete": false
}

USER: "Create a task for tomorrow at 1pm"
{
  "reply": "Task created! Anything else?",
  "actions": ["create_task"],
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "Task name from context",
    "startTime": "2024-11-21T13:00:00+08:00",
    "description": "Task details"
  }
}

USER: "Change it to 3pm tomorrow"
{
  "reply": "Updated to 3pm tomorrow. Anything else?",
  "actions": ["reschedule"],
  "eventId": "abc123xyz",
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "Product Demo with ABC Corp",
    "startTime": "2024-11-28T15:00:00Z",
    "endTime": "2024-11-28T16:00:00Z",
    "location": "Zoom",
    "attendees": ["john.smith@abccorp.com"],
    "description": "Virtual product demo scheduled with ABC Corp"
  }
}

USER: "Actually, cancel that meeting"
{
  "reply": "Event cancelled and removed from your calendar. Anything else?",
  "actions": ["delete_event"],
  "eventId": "abc123xyz",
  "needsMoreInfo": false,
  "conversationComplete": false
}

USER: "That's all, thanks"
{
  "reply": "You're welcome! Have a great day.",
  "actions": [],
  "needsMoreInfo": false,
  "conversationComplete": true
}

USER: "Are there any conflicts in my calendar today?"
{
  "reply": "Let me check for conflicts today...",
  "actions": ["check_conflicts"],
  "checkDate": "2024-11-20",
  "needsMoreInfo": false,
  "conversationComplete": false
}

USER: "Do I have any overlapping meetings?"
{
  "reply": "Checking your schedule for conflicts...",
  "actions": ["check_conflicts"],
  "checkDate": "2024-11-20",
  "needsMoreInfo": false,
  "conversationComplete": false
}

USER: "What times are available?" (when AVAILABLE_TIME_SLOTS provided in context)
{
  "reply": "I found these available slots: [list the actual times from AVAILABLE_TIME_SLOTS]. Which works best for you?",
  "actions": [],
  "needsMoreInfo": true,
  "conversationComplete": false
}

USER: "Schedule it for option 2" or "The second one" or "10 AM tomorrow" (after being shown AVAILABLE_TIME_SLOTS)
{
  "reply": "Updated to [selected time from AVAILABLE_TIME_SLOTS]. Anything else?",
  "actions": ["reschedule"],
  "eventId": "abc123xyz",
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "Product Demo with ABC Corp",
    "startTime": "[Use exact ISO datetime from AVAILABLE_TIME_SLOTS including +08:00 offset]",
    "endTime": "[Calculate end time: add duration to startTime, keep +08:00 offset]",
    "location": "Zoom",
    "attendees": ["john.smith@abccorp.com"],
    "description": "Virtual product demo scheduled with ABC Corp"
  }
}

USER: "Reschedule it" (but no new time provided)
{
  "reply": "What time would you like to reschedule it to?",
  "actions": [],
  "needsMoreInfo": true,
  "conversationComplete": false
}

USER: "Can you reschedule CTF PRACTICE at 11:00 PM?" (when CTF PRACTICE is a TASK, not an event)
{
  "reply": "Creating a calendar event for CTF PRACTICE at 11:00 PM. Anything else?",
  "actions": ["add_to_calendar"],
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "CTF PRACTICE",
    "startTime": "2024-11-20T23:00:00+08:00",
    "endTime": "2024-11-21T00:00:00+08:00",
    "location": "",
    "attendees": [],
    "description": "Scheduled time for CTF PRACTICE"
  }
}

USER: "Can you reschedule it at 11:00 PM?" (referring to the EMAIL EVENT, eventId may or may not exist)
{
  "reply": "Event scheduled for 11:00 PM today. Anything else I can help with?",
  "actions": ["reschedule"],
  "eventId": "abc123xyz",
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "[Keep original title from EMAIL_ANALYSIS]",
    "startTime": "2024-11-20T23:00:00+08:00",
    "endTime": "2024-11-21T00:00:00+08:00",
    "location": "[Keep original location]",
    "attendees": ["[Keep original attendees]"],
    "description": "[Keep original description]"
  }
}

USER: "Can you reschedule it at 11:00 PM?" (but the item is a TASK, not an event)
{
  "reply": "I see 'CTF PRACTICE' is a task with a due date, not a calendar event. Would you like me to create a calendar event for it at 11:00 PM today?",
  "actions": [],
  "needsMoreInfo": true,
  "conversationComplete": false
}

USER: "Yes, create it at 11:00 PM" (after being told it's a task)
{
  "reply": "Got it, creating a calendar event for 'CTF PRACTICE' at 11:00 PM. Anything else I can help with?",
  "actions": ["add_to_calendar"],
  "needsMoreInfo": false,
  "conversationComplete": false,
  "updatedAnalysis": {
    "title": "CTF PRACTICE",
    "startTime": "2025-11-20T23:00:00+08:00",
    "endTime": "2025-11-21T00:00:00+08:00",
    "location": "",
    "attendees": [],
    "description": "Converted from task to calendar event"
  }
}`;


/**
 * Find available time slots
 */
async function findAvailableTimeSlots(
  origin: string,
  cookieHeader: string,
  requestedDate: Date,
  durationMinutes: number = 60,
  numSlots: number = 3
): Promise<string[]> {
  try {
    // Get calendar events for the requested day
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(9, 0, 0, 0); // Start at 9 AM
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(18, 0, 0, 0); // End at 6 PM

    const response = await fetch(`${origin}/api/calendar`, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader || '',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch calendar events');
      return [];
    }

    const data = await response.json();
    const events = data.events || [];

    // Create time slots (every 30 minutes from 9 AM to 6 PM)
    const slots: Date[] = [];
    const current = new Date(startOfDay);
    
    while (current < endOfDay) {
      slots.push(new Date(current));
      current.setMinutes(current.getMinutes() + 30);
    }

    // Filter out occupied slots
    const availableSlots = slots.filter(slot => {
      const slotEnd = new Date(slot.getTime() + durationMinutes * 60000);
      
      return !events.some((event: any) => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date);
        const eventEnd = new Date(event.end?.dateTime || event.end?.date);
        
        // Check if slot overlaps with event
        return slot < eventEnd && slotEnd > eventStart;
      });
    });

    // Return top N available slots formatted as readable strings with ISO datetime
    return availableSlots
      .slice(0, numSlots)
      .map(slot => {
        const timeStr = slot.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila'
        });
        const dateStr = slot.toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short', 
          day: 'numeric',
          timeZone: 'Asia/Manila'
        });
        // Also include ISO format for easy parsing
        const year = slot.getFullYear();
        const month = String(slot.getMonth() + 1).padStart(2, '0');
        const day = String(slot.getDate()).padStart(2, '0');
        const hours = String(slot.getHours()).padStart(2, '0');
        const minutes = String(slot.getMinutes()).padStart(2, '0');
        const isoTime = `${year}-${month}-${day}T${hours}:${minutes}:00+08:00`;
        
        return `${dateStr} at ${timeStr} (${isoTime})`;
      });
  } catch (error) {
    console.error('Error finding available time slots:', error);
    return [];
  }
}

/**
 * Fetch user's current calendar events and tasks for context
 */
async function fetchCalendarContext(
  origin: string,
  cookieHeader: string,
  date: string
): Promise<{ events: any[], tasks: any[] }> {
  try {
    // Fetch calendar events and tasks for the specified date
    const response = await fetch(
      `${origin}/api/calendar?checkConflicts=true&date=${date}`,
      {
        method: 'GET',
        headers: {
          'Cookie': cookieHeader || '',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch calendar context');
      return { events: [], tasks: [] };
    }

    const data = await response.json();
    return {
      events: data.allEvents || [],
      tasks: data.tasks || []
    };
  } catch (error) {
    console.error('Error fetching calendar context:', error);
    return { events: [], tasks: [] };
  }
}

/**
 * POST /api/conversation
 * Process multi-turn conversation for event creation
 */
export async function POST(request: NextRequest) {
  try {
    const isDemoMode = request.headers.get('x-demo-mode') === 'true';
    const session = await getServerSession(authOptions);

    if (!session && !isDemoMode) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message, emailAnalysis, conversationHistory, emailContent, currentDate, eventId, hasConflicts, conflictInfo } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing required field: message" },
        { status: 400 }
      );
    }

    const qwenApiKey = process.env.QWEN_API_KEY;
    if (!qwenApiKey) {
      return NextResponse.json(
        { error: "Qwen API key not configured" },
        { status: 500 }
      );
    }

    // Format current date/time for context
    const now = currentDate || new Date().toISOString();
    const dateObj = new Date(now);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = dateObj.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    // Fetch user's current calendar events and tasks for context
    const currentDateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
    const calendarContext = await fetchCalendarContext(
      request.nextUrl.origin,
      request.headers.get('cookie') || '',
      currentDateStr
    );

    // Find available time slots if there are conflicts
    let availableTimeSlots: string[] = [];
    if (hasConflicts && emailAnalysis?.startTime) {
      const requestedDate = new Date(emailAnalysis.startTime);
      const duration = emailAnalysis.endTime 
        ? (new Date(emailAnalysis.endTime).getTime() - new Date(emailAnalysis.startTime).getTime()) / 60000
        : 60;
      
      availableTimeSlots = await findAvailableTimeSlots(
        request.nextUrl.origin,
        request.headers.get('cookie') || '',
        requestedDate,
        duration,
        3
      );
    }

    // Build conversation messages
    const messages = [
      {
        role: "system",
        content: CONVERSATION_SYSTEM_PROMPT
      },
      {
        role: "system",
        content: `# CONTEXT FOR THIS CONVERSATION

CURRENT_DATETIME: ${formattedDate} at ${formattedTime}

USER'S CALENDAR TODAY (${currentDateStr}):
Events (${calendarContext.events.length}):
${calendarContext.events.length > 0 
  ? calendarContext.events.map((e, i) => `${i + 1}. "${e.summary}" (ID: ${e.id}) [EVENT - has time slot]
   Time: ${new Date(e.start).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} - ${new Date(e.end).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila' })}
   ${e.location ? `Location: ${e.location}` : ''}`).join('\n')
  : 'No events scheduled today'}

Tasks (${calendarContext.tasks.length}):
${calendarContext.tasks.length > 0
  ? calendarContext.tasks.map((t, i) => `${i + 1}. "${t.title}" - Due: ${t.due}`).join('\n')
  : 'No tasks due today'}

⚠️ IMPORTANT CONTEXT RULES:
- When user says "reschedule it" or "change the time", they mean the EMAIL EVENT, NOT calendar tasks above
- Focus on EMAIL_ANALYSIS below for the event being discussed
- Only refer to calendar tasks/events if user EXPLICITLY mentions them by name AND is NOT discussing the email event

EMAIL_ANALYSIS:
${JSON.stringify(emailAnalysis, null, 2)}

ORIGINAL_EMAIL_CONTENT:
${emailContent}

${eventId ? `EXISTING_EVENT_ID: ${eventId}
(Use this eventId for reschedule or delete_event actions)` : `No event created yet.`}

${hasConflicts && conflictInfo ? `
⚠️ CONFLICT DETECTED:
${JSON.stringify(conflictInfo, null, 2)}

AVAILABLE_TIME_SLOTS (use these exact times when suggesting alternatives):
${availableTimeSlots.length > 0 ? availableTimeSlots.map((slot, i) => `${i + 1}. ${slot}`).join('\n') : 'No available slots found in the requested timeframe'}

When user asks "what times are available?", present these AVAILABLE_TIME_SLOTS.
When user selects one (e.g., "schedule it for option 2"), use that exact time.
` : ''}

Remember: Use CURRENT_DATETIME when user asks about date/time. Maintain conversation context from history.`
      }
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    // Add current user message
    messages.push({
      role: "user",
      content: message
    });

    // Call Qwen-Max API
    const response = await fetch("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${qwenApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen-max",
        messages: messages,
        temperature: 0.7,
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

    const result = JSON.parse(content);

    // Validate response structure
    if (typeof result.reply !== 'string') {
      throw new Error("Invalid response: missing 'reply' field");
    }

    // Handle calendar actions if present
    let actions = result.actions || [];
    const calendarActions: any = {};
    
    if (actions.includes('add_to_calendar') || actions.includes('reschedule') || actions.includes('create_task')) {
      // Determine which analysis to use (updated or original)
      const eventData = result.updatedAnalysis || emailAnalysis;
      
      if (!eventData) {
        return NextResponse.json({
          success: false,
          error: "No event data available for calendar action"
        }, { status: 400 });
      }

      // Check if user is trying to reschedule a task (which doesn't have a valid event ID)
      if (actions.includes('reschedule')) {
        // Validate the eventId format - Google Calendar event IDs are typically long alphanumeric strings
        // If it looks like a placeholder (e.g., "new_event_001"), it's likely not a real event
        const isPlaceholderId = result.eventId ? /^(new_event_|task_|event_|temp_)/i.test(result.eventId) : false;
        
        if (isPlaceholderId || !eventId || !result.eventId) {
          // No valid event ID - convert reschedule to add_to_calendar
          // This handles the case where user says "reschedule it" but event was never created
          console.log('Converting reschedule to add_to_calendar - no valid eventId');
          result.actions = result.actions.filter((a: string) => a !== 'reschedule');
          result.actions.push('add_to_calendar');
          actions = result.actions; // Update the local actions variable
          // Continue with event creation below
        }
      }

      // Check for conflicts before creating/updating
      if (actions.includes('add_to_calendar')) {
        // Creating a new event - check for conflicts
        const checkResponse = await fetch(`${request.nextUrl.origin}/api/calendar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            summary: eventData.title,
            start: eventData.startTime,
            end: eventData.endTime,
            description: eventData.description || '',
            location: eventData.location || '',
            checkConflicts: true,
          }),
        });

        const checkResult = await checkResponse.json();
        
        if (checkResult.hasConflicts) {
          // Don't create the event, return conflict information
          calendarActions.hasConflicts = true;
          calendarActions.conflicts = checkResult.conflicts;
          calendarActions.attempted = 'create';
          
          // Override the AI's reply to inform about conflicts
          result.reply = `⚠️ There's a conflict at that time. I found ${checkResult.conflicts.length} existing event(s). Would you like to see available time slots?`;
          result.needsMoreInfo = true;
          result.actions = []; // Remove the add_to_calendar action since it failed
        } else if (checkResult.success) {
          calendarActions.eventCreated = true;
          calendarActions.eventId = checkResult.event?.id;
          // Update the reply to reflect successful creation at the specified time
          if (result.updatedAnalysis) {
            result.reply = `Event created at ${new Date(eventData.startTime).toLocaleString('en-US', { timeZone: 'Asia/Manila' })}. Anything else I can help with?`;
          }
        } else {
          calendarActions.error = checkResult.error || 'Failed to create event';
        }
      } else if (actions.includes('reschedule') && result.eventId) {
        // Updating an existing event - check for conflicts
        const updateResponse = await fetch(`${request.nextUrl.origin}/api/calendar`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            eventId: result.eventId,
            summary: eventData.title,
            start: eventData.startTime,
            end: eventData.endTime,
            description: eventData.description,
            location: eventData.location,
            checkConflicts: true,
          }),
        });

        const updateResult = await updateResponse.json();
        
        if (updateResponse.status === 404) {
          // Event doesn't exist
          calendarActions.error = 'Event not found - it may have been deleted';
          result.reply = `⚠️ I couldn't find that event. It may have been deleted or the ID is incorrect. Would you like to create a new event instead?`;
          result.needsMoreInfo = true;
          result.actions = [];
        } else if (updateResult.hasConflicts) {
          // Don't update the event, return conflict information
          calendarActions.hasConflicts = true;
          calendarActions.conflicts = updateResult.conflicts;
          calendarActions.attempted = 'reschedule';
          
          // Override the AI's reply to inform about conflicts
          result.reply = `⚠️ There's a conflict at that time. I found ${updateResult.conflicts.length} existing event(s). Would you like to see other available times?`;
          result.needsMoreInfo = true;
          result.actions = []; // Remove the reschedule action since it failed
        } else if (updateResult.success) {
          calendarActions.eventUpdated = true;
          calendarActions.eventId = result.eventId;
        } else {
          calendarActions.error = updateResult.error || 'Failed to update event';
        }
      }
    }

    // Handle create_task action
    if (actions.includes('create_task')) {
      const taskData = result.updatedAnalysis || emailAnalysis;
      
      if (!taskData || !taskData.title) {
        return NextResponse.json({
          success: false,
          error: "No task data available"
        }, { status: 400 });
      }

      try {
        const createTaskResponse = await fetch(`${request.nextUrl.origin}/api/calendar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            taskTitle: taskData.title,
            taskDue: taskData.startTime,
            taskNotes: taskData.description || '',
            createTask: true,
          }),
        });

        const createTaskResult = await createTaskResponse.json();
        
        if (createTaskResult.success) {
          calendarActions.taskCreated = true;
          calendarActions.taskId = createTaskResult.task?.id;
          result.reply = `Task created! Anything else I can help with?`;
        } else {
          calendarActions.error = createTaskResult.error || 'Failed to create task';
        }
      } catch (error) {
        console.error('Error creating task:', error);
        calendarActions.error = 'Failed to create task';
      }
    }

    // Handle delete action
    if (actions.includes('delete_event') && result.eventId) {
      const deleteResponse = await fetch(
        `${request.nextUrl.origin}/api/calendar?eventId=${result.eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Cookie': request.headers.get('cookie') || '',
          },
        }
      );

      const deleteResult = await deleteResponse.json();
      
      if (deleteResult.success) {
        calendarActions.eventDeleted = true;
        // Event is deleted, so we clear it from tracking
      } else {
        calendarActions.error = deleteResult.error || 'Failed to delete event';
      }
    }

    // Handle check_conflicts action
    if (actions.includes('check_conflicts')) {
      const checkDate = result.checkDate || new Date().toISOString().split('T')[0];
      
      const conflictCheckResponse = await fetch(
        `${request.nextUrl.origin}/api/calendar?checkConflicts=true&date=${checkDate}`,
        {
          method: 'GET',
          headers: {
            'Cookie': request.headers.get('cookie') || '',
          },
        }
      );

      const conflictCheckResult = await conflictCheckResponse.json();
      
      if (conflictCheckResult.success) {
        calendarActions.conflictCheckPerformed = true;
        calendarActions.hasConflicts = conflictCheckResult.hasConflicts;
        calendarActions.conflicts = conflictCheckResult.conflicts;
        calendarActions.allEvents = conflictCheckResult.allEvents;
        calendarActions.tasks = conflictCheckResult.tasks;
        
        // Update the AI's reply with conflict information
        if (conflictCheckResult.hasConflicts) {
          const conflictSummary = conflictCheckResult.conflicts.map((c: any, idx: number) => 
            `\n${idx + 1}. "${c.event1.summary}" (${new Date(c.event1.start).toLocaleTimeString()}-${new Date(c.event1.end).toLocaleTimeString()}) overlaps with "${c.event2.summary}" (${new Date(c.event2.start).toLocaleTimeString()}-${new Date(c.event2.end).toLocaleTimeString()})`
          ).join('');
          
          result.reply = `⚠️ Yes, I found ${conflictCheckResult.conflicts.length} conflict(s) on ${checkDate}:${conflictSummary}\n\nWould you like me to help reschedule any of these?`;
        } else if (conflictCheckResult.tasks && conflictCheckResult.tasks.length > 0) {
          const taskSummary = conflictCheckResult.tasks.map((t: any, idx: number) => 
            `\n${idx + 1}. ${t.title}${t.due ? ` (due: ${new Date(t.due).toLocaleString()})` : ''}`
          ).join('');
          
          result.reply = `✅ No calendar event conflicts on ${checkDate}. You have ${conflictCheckResult.allEvents.length} event(s) and ${conflictCheckResult.tasks.length} task(s):${taskSummary}\n\nNote: Tasks don't block time, but you may want to schedule time for them.`;
        } else {
          result.reply = `✅ No conflicts found on ${checkDate}. You have ${conflictCheckResult.allEvents.length} event(s) with no overlaps.`;
        }
      } else {
        calendarActions.error = conflictCheckResult.error || 'Failed to check for conflicts';
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      calendarActions: Object.keys(calendarActions).length > 0 ? calendarActions : undefined,
      // Return the eventId for client-side tracking
      eventId: calendarActions.eventId || eventId || result.eventId,
    });
  } catch (error) {
    console.error("Conversation error:", error);
    return NextResponse.json(
      { 
        error: "Failed to process conversation",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}