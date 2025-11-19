import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateVoiceResponse } from "@/lib/voice-handler";

/**
 * POST /api/voice/tts
 * Text-to-Speech: Generate voice output from text
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
    const { text, language } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Missing required field: text" },
        { status: 400 }
      );
    }

    // Generate voice response
    const result = await generateVoiceResponse(text, language || 'en-US');

    return NextResponse.json({
      success: result.success,
      text: result.text,
      language: result.language,
    });
  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate voice response",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
