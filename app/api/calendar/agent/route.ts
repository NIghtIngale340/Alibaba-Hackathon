import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeEmailWithQwen, convertToCalendarFormat, AgentResponse } from "@/lib/qwen-agent";
import { google } from "googleapis";

/**
 * POST - Analyze email with Qwen agent and optionally create calendar event
 */
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
    const { emailContent, autoCreate = false } = body;

    if (!emailContent) {
      return NextResponse.json(
        { error: "Missing required field: emailContent" },
        { status: 400 }
      );
    }

    // Get Qwen API key from environment
    const qwenApiKey = process.env.QWEN_API_KEY;
    if (!qwenApiKey) {
      return NextResponse.json(
        { error: "Qwen API key not configured" },
        { status: 500 }
      );
    }

    // Analyze email with Qwen agent
    const agentResponse: AgentResponse = await analyzeEmailWithQwen(
      emailContent,
      qwenApiKey
    );

    // If no event should be created, return the analysis
    if (!agentResponse.create_event) {
      return NextResponse.json({
        success: true,
        shouldCreateEvent: false,
        reasoning: agentResponse.reasoning,
      });
    }

    // Event should be created
    const extractedEvent = agentResponse.event!;
    const calendarEvent = convertToCalendarFormat(extractedEvent);

    // If autoCreate is false, just return the extracted event
    if (!autoCreate) {
      return NextResponse.json({
        success: true,
        shouldCreateEvent: true,
        event: extractedEvent,
        calendarEvent,
        reasoning: agentResponse.reasoning,
      });
    }

    // Auto-create the event in Google Calendar
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
    const createdEvent = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: calendarEvent.summary,
        description: calendarEvent.description,
        location: calendarEvent.location,
        start: {
          dateTime: calendarEvent.start,
          timeZone: "UTC",
        },
        end: {
          dateTime: calendarEvent.end,
          timeZone: "UTC",
        },
        attendees: calendarEvent.attendees,
      },
    });

    return NextResponse.json({
      success: true,
      shouldCreateEvent: true,
      eventCreated: true,
      event: extractedEvent,
      calendarEvent: createdEvent.data,
      reasoning: agentResponse.reasoning,
      message: "Event analyzed and created successfully!",
    });
  } catch (error: any) {
    console.error("Calendar agent error:", error);

    // Check for insufficient scopes error
    if (
      error?.code === 403 ||
      error?.message?.includes("insufficient authentication scopes")
    ) {
      return NextResponse.json(
        {
          error: "Insufficient permissions",
          details:
            "Please sign out and sign in again to grant Calendar permissions",
          needsReauth: true,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to process email with calendar agent",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
