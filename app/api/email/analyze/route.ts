import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { analyzeEmailContent } from "@/lib/email-handler";

/**
 * POST /api/email/analyze
 * Analyze email content and extract structured event data
 */
export async function POST(request: NextRequest) {
  try {
    // Check for demo mode
    const isDemoMode = request.headers.get('x-demo-mode') === 'true';
    
    const session = await getServerSession(authOptions);

    if (!session && !isDemoMode) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    // Accept both 'emailText' and 'content' field names
    const emailText = body.emailText || body.content;
    const currentDate = body.currentDate;

    if (!emailText) {
      return NextResponse.json(
        { error: "Missing required field: emailText or content" },
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

    // Analyze the email
    const result = await analyzeEmailContent(emailText, qwenApiKey, currentDate);

    // Transform result to match demo page expectations
    if (result.create_event && result.event) {
      return NextResponse.json({
        event_details: {
          summary: result.event.title,
          description: result.event.description,
          start: result.event.start_time,
          end: result.event.end_time,
          location: result.event.location || undefined,
        },
        confidence: result.confidence || 0.9,
        reasoning: result.reasoning || 'Event detected in email',
        event_type: result.event_type || 'meeting',
        urgency: 'medium' as const,
        requires_clarification: !result.event.end_time || !result.event.location,
        clarification_questions: [],
      });
    } else {
      return NextResponse.json({
        event_details: null,
        confidence: 0.1,
        reasoning: result.reasoning || 'No event found in email',
        event_type: 'none',
        urgency: 'low' as const,
      });
    }
  } catch (error) {
    console.error("Email analysis error:", error);
    return NextResponse.json(
      { 
        error: "Failed to analyze email",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
