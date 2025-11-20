/**
 * Calendar Agent - Mobile Version
 * Handles Google Calendar operations via API
 */

import { getAccessToken } from './auth';
import { ExtractedEventData } from './email-handler';
import { convertToCalendarFormat } from './qwen-agent';

export interface CalendarEvent {
  id?: string;
  summary: string;
  description: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{ email: string }>;
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export interface CalendarEventResult {
  success: boolean;
  eventId?: string;
  event?: CalendarEvent;
  error?: string;
}

const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
  eventData: ExtractedEventData
): Promise<CalendarEventResult> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in first.',
      };
    }
    
    // Convert to Google Calendar format
    const calendarEvent: CalendarEvent = {
      summary: eventData.title,
      description: eventData.description,
      location: eventData.location || '',
      start: {
        dateTime: eventData.start_time,
        timeZone: 'Asia/Manila',
      },
      end: {
        dateTime: eventData.end_time,
        timeZone: 'Asia/Manila',
      },
      attendees: eventData.attendees?.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };
    
    // Create event via Google Calendar API
    const response = await fetch(`${CALENDAR_API_URL}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calendarEvent),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Calendar API error: ${response.status}`);
    }
    
    const createdEvent = await response.json();
    
    return {
      success: true,
      eventId: createdEvent.id,
      event: createdEvent,
    };
  } catch (error) {
    console.error('Create calendar event error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get upcoming events
 */
export async function getUpcomingEvents(
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return [];
    }
    
    const now = new Date().toISOString();
    
    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(now)}&` +
      `maxResults=${maxResults}&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Get upcoming events error:', error);
    return [];
  }
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
  eventId: string,
  updates: Partial<CalendarEvent>
): Promise<CalendarEventResult> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in first.',
      };
    }
    
    // Get existing event first
    const getResponse = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events/${eventId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!getResponse.ok) {
      throw new Error(`Failed to fetch event: ${getResponse.status}`);
    }
    
    const existingEvent = await getResponse.json();
    
    // Merge updates
    const updatedEvent = { ...existingEvent, ...updates };
    
    // Update event
    const updateResponse = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events/${eventId}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedEvent),
      }
    );
    
    if (!updateResponse.ok) {
      throw new Error(`Failed to update event: ${updateResponse.status}`);
    }
    
    const updated = await updateResponse.json();
    
    return {
      success: true,
      eventId: updated.id,
      event: updated,
    };
  } catch (error) {
    console.error('Update calendar event error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(eventId: string): Promise<CalendarEventResult> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in first.',
      };
    }
    
    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to delete event: ${response.status}`);
    }
    
    return {
      success: true,
      eventId,
    };
  } catch (error) {
    console.error('Delete calendar event error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check for calendar conflicts
 */
export async function checkCalendarConflicts(
  startTime: string,
  endTime: string
): Promise<CalendarEvent[]> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return [];
    }
    
    const response = await fetch(
      `${CALENDAR_API_URL}/calendars/primary/events?` +
      `timeMin=${encodeURIComponent(startTime)}&` +
      `timeMax=${encodeURIComponent(endTime)}&` +
      `singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Check calendar conflicts error:', error);
    return [];
  }
}

/**
 * Get free/busy information
 */
export async function getFreeBusy(
  startTime: string,
  endTime: string
): Promise<any> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return null;
    }
    
    const response = await fetch(
      `${CALENDAR_API_URL}/freeBusy`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeMin: startTime,
          timeMax: endTime,
          items: [{ id: 'primary' }],
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error(`FreeBusy API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get free/busy error:', error);
    return null;
  }
}
