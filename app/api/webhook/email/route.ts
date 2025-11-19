import { NextRequest, NextResponse } from "next/server";
import { uploadToOSS } from "@/lib/oss";

interface EmailData {
  subject: string;
  body: string;
  sender: string;
  threadId: string;
  receivedAt: string;
}

export async function POST(request: NextRequest) {
  try {
    const data: EmailData = await request.json();

    // Validate email data
    if (!data.subject || !data.body || !data.sender) {
      return NextResponse.json(
        { error: "Missing required email fields" },
        { status: 400 }
      );
    }

    // Create email object
    const emailData = {
      subject: data.subject,
      body: data.body,
      sender: data.sender,
      threadId: data.threadId || "",
      receivedAt: data.receivedAt || new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `emails/${data.sender}/${timestamp}-${data.threadId || "no-thread"}.json`;

    // Upload to OSS
    const ossUrl = await uploadToOSS(fileName, JSON.stringify(emailData, null, 2));

    console.log(`Email stored in OSS: ${ossUrl}`);

    return NextResponse.json({
      success: true,
      message: "Email processed successfully",
      ossUrl,
      fileName,
    });
  } catch (error) {
    console.error("Email webhook error:", error);
    return NextResponse.json(
      { error: "Failed to process email", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve processed emails
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sender = searchParams.get("sender");

    return NextResponse.json({
      success: true,
      message: "Email retrieval endpoint",
      sender: sender || "all",
    });
  } catch (error) {
    console.error("Email retrieval error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve emails" },
      { status: 500 }
    );
  }
}
