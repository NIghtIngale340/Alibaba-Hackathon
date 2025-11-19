import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { google } from "googleapis";

// GET - List upcoming calendar events
export async function GET() {
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
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { summary, start, end, description, location } = body;

    // Validate required fields
    if (!summary || !start || !end) {
      return NextResponse.json(
        { error: "Missing required fields: summary, start, and end are required" },
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

    // Create the event
    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary,
        description: description || "",
        location: location || "",
        start: {
          dateTime: start,
          timeZone: "UTC",
        },
        end: {
          dateTime: end,
          timeZone: "UTC",
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
