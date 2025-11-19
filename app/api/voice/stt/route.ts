import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processVoiceInput, generateVoiceResponse } from "@/lib/voice-handler";

/**
 * POST /api/voice/stt
 * Speech-to-Text: Convert voice input to text
 */
export async function POST(request: NextRequest) {
  try {
    // Allow demo mode without authentication
    const session = await getServerSession(authOptions);
    const isDemoMode = request.headers.get('x-demo-mode') === 'true';

    if (!session && !isDemoMode) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { audioData, language } = body;

    if (!audioData) {
      return NextResponse.json(
        { error: "Missing required field: audioData" },
        { status: 400 }
      );
    }

    const qwenApiKey = process.env.QWEN_API_KEY;

    // Convert base64 to buffer if needed
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Process voice input
    const result = await processVoiceInput(audioBuffer, language, qwenApiKey);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("STT error:", error);
    return NextResponse.json(
      { 
        error: "Failed to process voice input",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
