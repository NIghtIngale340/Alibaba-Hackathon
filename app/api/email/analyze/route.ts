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
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized - Please sign in" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { emailText, currentDate } = body;

    if (!emailText) {
      return NextResponse.json(
        { error: "Missing required field: emailText" },
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

    return NextResponse.json({
      success: true,
      ...result,
    });
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
