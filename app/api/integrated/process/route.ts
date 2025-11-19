import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processCalendarEvent } from "@/lib/qwen-agent";
import { analyzeEmailContent } from "@/lib/email-handler";
import { processVoiceInput } from "@/lib/voice-handler";
import { 
  processConversationInput,
  initializeConversation,
  getConversation 
} from "@/lib/conversation-handler";
import { createTask, delegateTask } from "@/lib/action-delegator";
import { google } from "googleapis";

/**
 * POST /api/integrated/process
 * Integrated endpoint that handles email, voice, or conversation input
 * and creates calendar events through the complete pipeline
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

    const qwenApiKey = process.env.QWEN_API_KEY;
    if (!qwenApiKey) {
      return NextResponse.json(
        { error: "Qwen API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { 
      inputType,  // 'email' | 'voice' | 'conversation'
      data,
      sessionId,
      language,
      autoCreate = false 
    } = body;

    if (!inputType || !data) {
      return NextResponse.json(
        { error: "Missing required fields: inputType, data" },
        { status: 400 }
      );
    }

    let extractedEvent: any = null;
    let conversationResponse: any = null;
    let finalSessionId = sessionId;

    // Step 1: Process input based on type
    switch (inputType) {
      case 'email':
        // Email Handler: Analyze email text
        const emailAnalysis = await analyzeEmailContent(data.emailText, qwenApiKey);
        
        if (!emailAnalysis.create_event) {
          return NextResponse.json({
            success: true,
            shouldCreateEvent: false,
            reasoning: emailAnalysis.reasoning,
            inputType: 'email',
          });
        }
        
        extractedEvent = emailAnalysis.event;
        break;

      case 'voice':
        // Voice Handler: Convert speech to text, then analyze
        const audioBuffer = Buffer.from(data.audioData, 'base64');
        const voiceResult = await processVoiceInput(audioBuffer, language, qwenApiKey);
        
        // Analyze the transcribed text
        const voiceAnalysis = await analyzeEmailContent(voiceResult.text, qwenApiKey);
        
        if (!voiceAnalysis.create_event) {
          return NextResponse.json({
            success: true,
            shouldCreateEvent: false,
            reasoning: voiceAnalysis.reasoning,
            transcription: voiceResult.text,
            inputType: 'voice',
          });
        }
        
        extractedEvent = voiceAnalysis.event;
        break;

      case 'conversation':
        // Conversation Handler: Multi-turn conversation
        if (!sessionId || !getConversation(sessionId)) {
          const newConversation = initializeConversation(
            sessionId || generateSessionId(),
            language || 'en-US'
          );
          finalSessionId = newConversation.sessionId;
        }
        
        conversationResponse = await processConversationInput(
          finalSessionId,
          data.userInput,
          qwenApiKey
        );
        
        if (!conversationResponse.readyToCreate) {
          return NextResponse.json({
            success: true,
            shouldCreateEvent: false,
            conversationResponse,
            sessionId: finalSessionId,
            inputType: 'conversation',
          });
        }
        
        extractedEvent = conversationResponse.partialEvent;
        break;

      default:
        return NextResponse.json(
          { error: "Invalid inputType. Must be: email, voice, or conversation" },
          { status: 400 }
        );
    }

    // Step 2: If we have an event and autoCreate is false, return for confirmation
    if (!autoCreate && extractedEvent) {
      return NextResponse.json({
        success: true,
        shouldCreateEvent: true,
        event: extractedEvent,
        inputType,
        sessionId: finalSessionId,
        message: "Event extracted successfully. Set autoCreate=true to create the event.",
      });
    }

    // Step 3: Delegate to Calendar Agent via Action Delegator
    if (extractedEvent) {
      const task = createTask('create_event', extractedEvent, 'normal');
      const delegationResult = await delegateTask(task);

      if (!delegationResult.success) {
        return NextResponse.json({
          success: false,
          error: "Failed to delegate calendar creation",
          details: delegationResult.error,
        }, { status: 500 });
      }

      // Step 4: Actually create the calendar event if autoCreate is true
      if (autoCreate) {
        const oAuth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );

        oAuth2Client.setCredentials({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        });

        const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

        const createdEvent = await calendar.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: extractedEvent.title,
            description: extractedEvent.description,
            location: extractedEvent.location,
            start: {
              dateTime: extractedEvent.start_time,
              timeZone: "UTC",
            },
            end: {
              dateTime: extractedEvent.end_time,
              timeZone: "UTC",
            },
            attendees: extractedEvent.attendees?.map((email: string) => ({ email })),
          },
        });

        return NextResponse.json({
          success: true,
          eventCreated: true,
          event: extractedEvent,
          calendarEvent: createdEvent.data,
          task: task,
          delegationResult,
          inputType,
          sessionId: finalSessionId,
        });
      }

      return NextResponse.json({
        success: true,
        eventReady: true,
        event: extractedEvent,
        task: task,
        delegationResult,
        inputType,
        sessionId: finalSessionId,
      });
    }

    return NextResponse.json({
      success: false,
      error: "Failed to extract event data",
    }, { status: 500 });

  } catch (error) {
    console.error("Integrated processing error:", error);
    return NextResponse.json(
      { 
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
