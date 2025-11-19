import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { 
  processConversationInput,
  initializeConversation,
  getConversation 
} from "@/lib/conversation-handler";

/**
 * POST /api/conversation
 * Process multi-turn conversation for event creation
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionId, userInput, language } = body;

    if (!userInput) {
      return NextResponse.json(
        { error: "Missing required field: userInput" },
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

    // Initialize conversation if new
    let finalSessionId = sessionId;
    if (!sessionId || !getConversation(sessionId)) {
      const newConversation = initializeConversation(
        sessionId || generateSessionId(),
        language || 'en-US'
      );
      finalSessionId = newConversation.sessionId;
    }

    // Process the user input
    const response = await processConversationInput(
      finalSessionId,
      userInput,
      qwenApiKey
    );

    return NextResponse.json({
      success: true,
      sessionId: finalSessionId,
      ...response,
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

/**
 * GET /api/conversation?sessionId=xxx
 * Get conversation context
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing required parameter: sessionId" },
        { status: 400 }
      );
    }

    const conversation = getConversation(sessionId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Get conversation error:", error);
    return NextResponse.json(
      { 
        error: "Failed to get conversation",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
