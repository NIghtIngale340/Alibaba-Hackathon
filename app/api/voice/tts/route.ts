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
    const { text, language } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Missing required field: text" },
        { status: 400 }
      );
    }

    console.log(`TTS: Generating speech in ${language || 'en-US'}:`, text);

    // For demo mode or when DashScope is not available, return a flag to use Web Speech API
    // In production, this would call DashScope TTS API and return audio blob
    return NextResponse.json({
      success: true,
      text: text,
      language: language || 'en-US',
      useWebSpeech: true, // Signal to client to use Web Speech API fallback
      voiceSettings: {
        rate: 0.95,
        pitch: 1.1,
        volume: 1.0,
      },
      message: 'Using browser TTS - DashScope integration pending'
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
