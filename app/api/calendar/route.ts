import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

/**
 * Check for conflicting events in the calendar
 */
async function checkForConflicts(
  calendar: any,
  startTime: string,
  endTime: string,
  excludeEventId?: string
) {
  try {
    console.log(`[checkForConflicts] Checking conflicts for startTime: ${startTime}, endTime: ${endTime}`);
    
    // Validate that times are in valid ISO format
    if (!startTime || !endTime) {
      console.error('[checkForConflicts] Invalid times provided:', { startTime, endTime });
      return [];
    }
    
    // Try to parse the dates to validate
    try {
      new Date(startTime);
      new Date(endTime);
    } catch (parseError) {
      console.error('[checkForConflicts] Failed to parse dates:', { startTime, endTime, error: parseError });
      return [];
    }
    
    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: startTime,
      timeMax: endTime,
      singleEvents: true,
      orderBy: "startTime",
    });

    const conflictingEvents = (events.data.items || []).filter((event: any) => {
      // Exclude the event being updated
      if (excludeEventId && event.id === excludeEventId) {
        return false;
      }
      
      // Check if events overlap
      const eventStart = new Date(event.start?.dateTime || event.start?.date);
      const eventEnd = new Date(event.end?.dateTime || event.end?.date);
      const newStart = new Date(startTime);
      const newEnd = new Date(endTime);
      
      // Events overlap if: (newStart < eventEnd) AND (newEnd > eventStart)
      return newStart < eventEnd && newEnd > eventStart;
    });

    return conflictingEvents;
  } catch (error) {
    console.error("Error checking conflicts:", error);
    return [];
  }
}

/**
 * Find all overlapping events for a specific date
 */
async function findConflictsForDate(
  calendar: any,
  date: string // YYYY-MM-DD format
) {
  try {
    // Parse the date string
    const dateParts = date.split('-');
    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
    const day = parseInt(dateParts[2]);
    
    // Query a wider range to ensure we catch all events
    // Start from 2 days before at midnight UTC to 2 days after
    const startOfDay = new Date(Date.UTC(year, month, day - 2, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, day + 2, 23, 59, 59, 999));

    console.log(`[Conflict Check] Checking date ${date} (wide range for debugging)`);
    console.log(`[Conflict Check] UTC Range: ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);

    // First, list all calendars to see what's available
    try {
      const calendarList = await calendar.calendarList.list();
      console.log('[Conflict Check] Available calendars:', calendarList.data.items?.map((cal: any) => ({
        id: cal.id,
        summary: cal.summary,
        primary: cal.primary
      })));
    } catch (err) {
      console.log('[Conflict Check] Could not list calendars:', err);
    }

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const eventsList = events.data.items || [];
    console.log(`[Conflict Check] Total events in range: ${eventsList.length}`);
    
    if (eventsList.length > 0) {
      console.log('[Conflict Check] All events found:', eventsList.map((e: any) => ({
        summary: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      })));
    }
    
    // Filter events to only those on the requested date in Manila timezone
    const targetDate = new Date(Date.UTC(year, month, day));
    const filteredEvents = eventsList.filter((event: any) => {
      const eventStart = new Date(event.start?.dateTime || event.start?.date);
      
      // Convert to Manila time (UTC+8) and check if it's on the target date
      const manilaTime = new Date(eventStart.getTime() + (8 * 60 * 60 * 1000));
      const eventDateStr = manilaTime.toISOString().split('T')[0];
      const targetDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      console.log(`[Conflict Check] Event "${event.summary}": UTC=${eventStart.toISOString()}, Manila date=${eventDateStr}, Target=${targetDateStr}, Match=${eventDateStr === targetDateStr}`);
      
      return eventDateStr === targetDateStr;
    });
    
    console.log(`[Conflict Check] Events on ${date} (Manila time): ${filteredEvents.length}`);
    
    // Find overlapping events within the filtered set
    const conflicts: any[] = [];
    for (let i = 0; i < filteredEvents.length; i++) {
      for (let j = i + 1; j < filteredEvents.length; j++) {
        const event1 = filteredEvents[i];
        const event2 = filteredEvents[j];
        
        const start1 = new Date(event1.start?.dateTime || event1.start?.date);
        const end1 = new Date(event1.end?.dateTime || event1.end?.date);
        const start2 = new Date(event2.start?.dateTime || event2.start?.date);
        const end2 = new Date(event2.end?.dateTime || event2.end?.date);
        
        // Check if events overlap: (start1 < end2) AND (start2 < end1)
        const overlaps = start1 < end2 && start2 < end1;
        
        console.log(`[Conflict Check] Comparing "${event1.summary}" (${start1.toISOString()}-${end1.toISOString()}) with "${event2.summary}" (${start2.toISOString()}-${end2.toISOString()}): ${overlaps ? 'CONFLICT!' : 'no overlap'}`);
        
        if (overlaps) {
          console.log(`[Conflict Check] ⚠️ CONFLICT FOUND: "${event1.summary}" overlaps with "${event2.summary}"`);
          
          // Only add if not already in conflicts
          if (!conflicts.find(c => c.pair?.includes(event1.id) && c.pair?.includes(event2.id))) {
            conflicts.push({
              pair: [event1.id, event2.id],
              event1: {
                id: event1.id,
                summary: event1.summary,
                start: event1.start?.dateTime || event1.start?.date,
                end: event1.end?.dateTime || event1.end?.date,
                location: event1.location,
              },
              event2: {
                id: event2.id,
                summary: event2.summary,
                start: event2.start?.dateTime || event2.start?.date,
                end: event2.end?.dateTime || event2.end?.date,
                location: event2.location,
              },
            });
          }
        }
      }
    }

    console.log(`[Conflict Check] Total conflicts found: ${conflicts.length}`);

    return {
      allEvents: filteredEvents.map((event: any) => ({
        id: event.id,
        summary: event.summary,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
      })),
      conflicts,
      hasConflicts: conflicts.length > 0,
    };
  } catch (error) {
    console.error("Error finding conflicts for date:", error);
    return {
      allEvents: [],
      conflicts: [],
      hasConflicts: false,
    };
  }
}

// GET - List upcoming calendar events or check for conflicts
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Check if this is a conflict check request
    const { searchParams } = new URL(request.url);
    const checkConflicts = searchParams.get('checkConflicts');
    const date = searchParams.get('date'); // YYYY-MM-DD format

    if (checkConflicts === 'true' && date) {
      // Find conflicts for the specified date
      const conflictData = await findConflictsForDate(calendar, date);
      
      // Also check Google Tasks for time-based tasks
      let tasksOnDate: any[] = [];
      try {
        const tasks = google.tasks({ version: 'v1', auth: oAuth2Client });
        
        // Get all task lists
        const taskLists = await tasks.tasklists.list();
        
        for (const taskList of taskLists.data.items || []) {
          const tasksResponse = await tasks.tasks.list({
            tasklist: taskList.id!,
            showCompleted: false,
          });
          
          // Filter tasks for the target date
          const dateTasks = (tasksResponse.data.items || []).filter(task => {
            if (!task.due) return false;
            const taskDate = task.due.split('T')[0]; // Get YYYY-MM-DD
            return taskDate === date;
          });
          
          tasksOnDate.push(...dateTasks.map(task => ({
            id: task.id,
            title: task.title,
            due: task.due,
            notes: task.notes,
            source: 'task',
          })));
        }
        
        console.log(`[Conflict Check] Found ${tasksOnDate.length} tasks on ${date}`);
        if (tasksOnDate.length > 0) {
          console.log('[Conflict Check] Tasks:', tasksOnDate.map(t => ({ title: t.title, due: t.due })));
        }
      } catch (taskError) {
        console.log('[Conflict Check] Could not fetch tasks (may need permission):', taskError);
      }
      
      return NextResponse.json({
        success: true,
        date,
        hasConflicts: conflictData.hasConflicts,
        conflicts: conflictData.conflicts,
        allEvents: conflictData.allEvents,
        tasks: tasksOnDate,
        message: conflictData.hasConflicts 
          ? `Found ${conflictData.conflicts.length} conflict(s) on ${date}`
          : tasksOnDate.length > 0
          ? `No event conflicts found on ${date}, but ${tasksOnDate.length} task(s) exist`
          : `No conflicts found on ${date}`,
      });
    }

    // List upcoming events from primary calendar
    const eventsRes = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    return NextResponse.json({
      success: true,
      events: eventsRes.data.items ?? [],
    });
  } catch (error: any) {
    console.error("Calendar API error:", error);
    
    // Check for insufficient scopes error
    if (error?.code === 403 || error?.message?.includes("insufficient authentication scopes")) {
      return NextResponse.json(
        { 
          error: "Insufficient permissions",
          details: "Please sign out and sign in again to grant Calendar permissions",
          needsReauth: true
        },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to fetch calendar events",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// POST - Create a new calendar event
export async function POST(request: NextRequest) {
  try {
    const isDemoMode = request.headers.get('x-demo-mode') === 'true';
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      if (isDemoMode) {
        // In demo mode, return success without actually creating event
        const body = await request.json();
        return NextResponse.json({
          success: true,
          message: "Event created successfully (demo mode)!",
          event: { id: 'demo-' + Date.now() }
        });
      }
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    // Check if this is a task creation request
    if (body.createTask) {
      const { taskTitle, taskDue, taskNotes } = body;
      
      if (!taskTitle) {
        return NextResponse.json(
          { error: "Missing required field: taskTitle" },
          { status: 400 }
        );
      }

      const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );

      oAuth2Client.setCredentials({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });

      const tasks = google.tasks({ version: 'v1', auth: oAuth2Client });

      // Get the default task list
      const taskLists = await tasks.tasklists.list();
      const defaultList = taskLists.data.items?.[0];

      if (!defaultList || !defaultList.id) {
        return NextResponse.json(
          { error: "No task list found" },
          { status: 404 }
        );
      }

      // Create the task
      const task = await tasks.tasks.insert({
        tasklist: defaultList.id,
        requestBody: {
          title: taskTitle,
          notes: taskNotes || '',
          due: taskDue ? new Date(taskDue).toISOString() : undefined,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Task created successfully!",
        task: task.data,
      });
    }
    
    // Support both direct fields and event object
    let summary, start, end, description, location, checkConflicts;
    if (body.event) {
      summary = body.event.summary;
      start = body.event.start;
      end = body.event.end;
      description = body.event.description;
      location = body.event.location;
      checkConflicts = body.checkConflicts !== false; // Default to true
    } else {
      summary = body.summary;
      start = body.start;
      end = body.end;
      description = body.description;
      location = body.location;
      checkConflicts = body.checkConflicts !== false; // Default to true
    }

    // Validate required fields
    if (!summary || !start || !end) {
      return NextResponse.json(
        { error: "Missing required fields: summary, start, and end are required" },
        { status: 400 }
      );
    }
    
    // Validate date formats
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format", details: `Start: ${start}, End: ${end}. Dates must be in ISO 8601 format.` },
          { status: 400 }
        );
      }
      
      if (endDate <= startDate) {
        return NextResponse.json(
          { error: "Invalid date range", details: "End time must be after start time" },
          { status: 400 }
        );
      }
    } catch (dateError) {
      return NextResponse.json(
        { error: "Failed to parse dates", details: `Start: ${start}, End: ${end}` },
        { status: 400 }
      );
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Check for conflicts if requested
    if (checkConflicts) {
      const conflicts = await checkForConflicts(calendar, start, end);
      
      if (conflicts.length > 0) {
        return NextResponse.json({
          success: false,
          hasConflicts: true,
          conflicts: conflicts.map((event: any) => ({
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            location: event.location,
          })),
          message: `Found ${conflicts.length} conflicting event(s). Please choose a different time or set checkConflicts=false to override.`,
        }, { status: 409 });
      }
    }

    // Create the event
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description: description || "",
        location: location || "",
        start: {
          dateTime: start,
          timeZone: "Asia/Manila",
        },
        end: {
          dateTime: end,
          timeZone: "Asia/Manila",
        },
      },
    });

    return NextResponse.json({
      success: true,
      event: event.data,
      message: "Event created successfully!",
    });
  } catch (error: any) {
    console.error("Calendar API error:", error);
    
    // Check for insufficient scopes error
    if (error?.code === 403 || error?.message?.includes("insufficient authentication scopes")) {
      return NextResponse.json(
        { 
          error: "Insufficient permissions",
          details: "Please sign out and sign in again to grant Calendar permissions",
          needsReauth: true
        },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to create calendar event",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// PATCH - Update an existing calendar event
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { eventId, summary, start, end, description, location, checkConflicts } = body;

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing required field: eventId" },
        { status: 400 }
      );
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Get existing event - add better error handling
    let existingEvent;
    try {
      existingEvent = await calendar.events.get({
        calendarId: "primary",
        eventId: eventId,
      });
    } catch (error: any) {
      console.error(`Failed to find event with ID: ${eventId}`, error);
      if (error?.code === 404) {
        return NextResponse.json(
          { 
            error: "Event not found",
            details: `No event exists with ID: ${eventId}. The event may have been deleted or the ID is incorrect.`,
            eventId: eventId
          },
          { status: 404 }
        );
      }
      throw error; // Re-throw other errors
    }

    if (!existingEvent.data) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      summary: summary || existingEvent.data.summary,
      description: description !== undefined ? description : existingEvent.data.description,
      location: location !== undefined ? location : existingEvent.data.location,
    };

    // Update start and end times if provided
    if (start) {
      updateData.start = {
        dateTime: start,
        timeZone: "Asia/Manila",
      };
    } else {
      updateData.start = existingEvent.data.start;
    }

    if (end) {
      updateData.end = {
        dateTime: end,
        timeZone: "Asia/Manila",
      };
    } else {
      updateData.end = existingEvent.data.end;
    }

    // Check for conflicts if requested and time is being changed
    if (checkConflicts !== false && (start || end)) {
      const conflicts = await checkForConflicts(
        calendar,
        updateData.start.dateTime || updateData.start.date,
        updateData.end.dateTime || updateData.end.date,
        eventId // Exclude the event being updated
      );
      
      if (conflicts.length > 0) {
        return NextResponse.json({
          success: false,
          hasConflicts: true,
          conflicts: conflicts.map((event: any) => ({
            id: event.id,
            summary: event.summary,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            location: event.location,
          })),
          message: `Found ${conflicts.length} conflicting event(s). Please choose a different time or set checkConflicts=false to override.`,
        }, { status: 409 });
      }
    }

    // Update the event
    const updatedEvent = await calendar.events.update({
      calendarId: "primary",
      eventId: eventId,
      requestBody: updateData,
    });

    return NextResponse.json({
      success: true,
      event: updatedEvent.data,
      message: "Event updated successfully!",
    });
  } catch (error: any) {
    console.error("Calendar API error:", error);
    
    if (error?.code === 403 || error?.message?.includes("insufficient authentication scopes")) {
      return NextResponse.json(
        { 
          error: "Insufficient permissions",
          details: "Please sign out and sign in again to grant Calendar permissions",
          needsReauth: true
        },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to update calendar event",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// DELETE - Delete a calendar event
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: "Missing required parameter: eventId" },
        { status: 400 }
      );
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

    // Delete the event
    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
    });

    return NextResponse.json({
      success: true,
      message: "Event deleted successfully!",
    });
  } catch (error: any) {
    console.error("Calendar API error:", error);
    
    if (error?.code === 403 || error?.message?.includes("insufficient authentication scopes")) {
      return NextResponse.json(
        { 
          error: "Insufficient permissions",
          details: "Please sign out and sign in again to grant Calendar permissions",
          needsReauth: true
        },
        { status: 403 }
      );
    }

    if (error?.code === 404) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to delete calendar event",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
