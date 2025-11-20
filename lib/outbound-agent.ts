/**
 * Outbound Email Agent - Mobile Version
 * Handles email sending via Gmail API
 */

import { getAccessToken } from './auth';

export interface EmailDraft {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  body: string;
  replyToMessageId?: string;
  threadId?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

const GMAIL_API_URL = 'https://www.googleapis.com/gmail/v1/users/me';

/**
 * Send an email via Gmail API
 */
export async function sendEmail(draft: EmailDraft): Promise<EmailSendResult> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return {
        success: false,
        error: 'Not authenticated. Please sign in first.',
      };
    }
    
    // Build RFC 2822 formatted message
    const message = buildRFC2822Message(draft);
    
    // Base64url encode the message
    const encodedMessage = base64urlEncode(message);
    
    // Send via Gmail API
    const response = await fetch(`${GMAIL_API_URL}/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedMessage,
        threadId: draft.threadId,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gmail API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    return {
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    };
  } catch (error) {
    console.error('Send email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Draft an email reply based on context
 */
export async function draftReply(
  originalEmail: {
    from: string;
    subject: string;
    body: string;
    messageId: string;
    threadId: string;
  },
  replyContent: string,
  userEmail: string
): Promise<EmailDraft> {
  // Build reply subject
  const subject = originalEmail.subject.startsWith('Re:')
    ? originalEmail.subject
    : `Re: ${originalEmail.subject}`;
  
  // Build reply body with quoted original
  const body = `${replyContent}\n\n` +
    `On ${new Date().toLocaleString()}:\n` +
    `${originalEmail.body.split('\n').map(line => `> ${line}`).join('\n')}`;
  
  return {
    to: originalEmail.from,
    subject,
    body,
    replyToMessageId: originalEmail.messageId,
    threadId: originalEmail.threadId,
  };
}

/**
 * Generate email reply using AI
 */
export async function generateAIReply(
  emailContent: string,
  userContext: string,
  qwenApiKey: string,
  tone: 'professional' | 'casual' | 'friendly' = 'professional'
): Promise<string> {
  const apiUrl = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  
  const toneInstructions = {
    professional: 'Use formal, professional language. Be concise and clear.',
    casual: 'Use casual, relaxed language. Be friendly but not overly formal.',
    friendly: 'Use warm, friendly language. Be personable and approachable.',
  };
  
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${qwenApiKey}`,
      },
      body: JSON.stringify({
        model: "qwen-plus",
        messages: [
          {
            role: "system",
            content: `You are an AI email assistant. Draft a reply to the following email. ${toneInstructions[tone]}
            
Keep the reply concise (2-3 paragraphs max). Address all key points from the original email.

User context: ${userContext}`,
          },
          {
            role: "user",
            content: `Original email:\n${emailContent}\n\nDraft a suitable reply.`,
          },
        ],
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Qwen API error: ${response.status}`);
    }
    
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;
    
    if (!reply) {
      throw new Error('No reply generated');
    }
    
    return reply;
  } catch (error) {
    console.error('Generate AI reply error:', error);
    throw error;
  }
}

/**
 * Build RFC 2822 formatted message
 */
function buildRFC2822Message(draft: EmailDraft): string {
  const lines: string[] = [];
  
  // To header
  const toAddresses = Array.isArray(draft.to) ? draft.to.join(', ') : draft.to;
  lines.push(`To: ${toAddresses}`);
  
  // CC header (optional)
  if (draft.cc) {
    const ccAddresses = Array.isArray(draft.cc) ? draft.cc.join(', ') : draft.cc;
    lines.push(`Cc: ${ccAddresses}`);
  }
  
  // BCC header (optional)
  if (draft.bcc) {
    const bccAddresses = Array.isArray(draft.bcc) ? draft.bcc.join(', ') : draft.bcc;
    lines.push(`Bcc: ${bccAddresses}`);
  }
  
  // Subject
  lines.push(`Subject: ${draft.subject}`);
  
  // MIME headers
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  
  // In-Reply-To header (for threading)
  if (draft.replyToMessageId) {
    lines.push(`In-Reply-To: <${draft.replyToMessageId}>`);
    lines.push(`References: <${draft.replyToMessageId}>`);
  }
  
  // Empty line to separate headers from body
  lines.push('');
  
  // Body
  lines.push(draft.body);
  
  return lines.join('\r\n');
}

/**
 * Base64url encode (RFC 4648)
 */
function base64urlEncode(str: string): string {
  // Convert to base64
  const base64 = btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
  
  // Convert to base64url
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Get user's sent emails
 */
export async function getSentEmails(maxResults: number = 10): Promise<any[]> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return [];
    }
    
    const response = await fetch(
      `${GMAIL_API_URL}/messages?q=in:sent&maxResults=${maxResults}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Get sent emails error:', error);
    return [];
  }
}

/**
 * Get email message by ID
 */
export async function getMessage(messageId: string): Promise<any> {
  try {
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      return null;
    }
    
    const response = await fetch(
      `${GMAIL_API_URL}/messages/${messageId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );
    
    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get message error:', error);
    return null;
  }
}
