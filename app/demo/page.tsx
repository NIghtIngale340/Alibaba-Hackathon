'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, MessageSquare, Volume2, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

interface EmailAnalysis {
  event_details: {
    summary: string;
    description: string;
    start: string;
    end: string;
    location?: string;
  } | null;
  confidence: number;
  reasoning: string;
  event_type: string;
  urgency: 'high' | 'medium' | 'low';
  requires_clarification?: boolean;
  clarification_questions?: string[];
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type DemoPhase = 'input' | 'analyzing' | 'results' | 'voice' | 'conversation' | 'action' | 'complete';

export default function EmailAgentDemo() {
  const [phase, setPhase] = useState<DemoPhase>('input');
  const [emailContent, setEmailContent] = useState('');
  const [analysis, setAnalysis] = useState<EmailAnalysis | null>(null);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [userResponse, setUserResponse] = useState('');
  const [actionResult, setActionResult] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [eventId, setEventId] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Multiple sample emails for demo
  const sampleEmails = [
    {
      name: "Team Meeting",
      content: `Hi there,

Can we schedule a team sync to discuss the Q1 roadmap? I'm thinking next Tuesday, January 16th at 2:00 PM in Conference Room B. We should cover:

1. Feature prioritization
2. Resource allocation
3. Timeline adjustments

Let me know if this works for everyone.

Thanks!`
    },
    {
      name: "Client Call",
      content: `Hey team,

Just got off the phone with ABC Corp. They want to schedule a product demo next Wednesday, January 17th at 11:00 AM. 

Could someone from engineering join? It'll be a virtual call via Zoom.

Client contact: john.smith@abccorp.com

- Sarah`
    },
    {
      name: "Interview Request",
      content: `Dear Hiring Manager,

I'm writing to schedule an interview for the Senior Developer position. 

I'm available on:
- Thursday, January 18th, 3:00 PM
- Friday, January 19th, 10:00 AM

The interview will be held at your downtown office, 123 Main Street, Suite 400.

Looking forward to meeting you!

Best regards,
Jane Doe`
    },
    {
      name: "Doctor Appointment",
      content: `Hi Mark,

This is a reminder that your annual checkup is scheduled for:

Date: Monday, January 22nd, 2024
Time: 9:30 AM
Location: City Medical Center, Building A, 3rd Floor

Please arrive 15 minutes early to complete paperwork.

If you need to reschedule, please call us at (555) 123-4567.

- Dr. Wilson's Office`
    },
    {
      name: "Unclear Meeting",
      content: `Hey,

Can we meet sometime next week to discuss the project? Maybe Tuesday afternoon?

Let me know what works.

Thanks!`
    },
    {
      name: "Conference Invite",
      content: `Subject: Tech Summit 2024

You're invited to our annual Tech Summit!

When: Friday, January 26th, 9:00 AM - 5:00 PM
Where: Grand Convention Center, Hall B
Keynote: 10:00 AM - Building the Future with AI

RSVP by January 20th: events@techsummit.com

Agenda includes:
- Morning keynotes
- Afternoon workshops
- Evening networking dinner (6:00 PM)

See you there!`
    },
    {
      name: "No Meeting",
      content: `Hi team,

Just wanted to share the latest project update. We've completed the first phase and are ahead of schedule!

Great work everyone. Keep it up!

- Manager`
    }
  ];

  const loadSample = () => {
    setEmailContent(sampleEmails[currentSampleIndex].content);
    setCurrentSampleIndex((prev) => (prev + 1) % sampleEmails.length);
  };

  // Phase 1: Analyze Email with Qwen-Max
  const analyzeEmail = async () => {
    if (!emailContent.trim()) {
      setError('Please enter email content');
      return;
    }

    setIsProcessing(true);
    setError('');
    setPhase('analyzing');

    try {
      const response = await fetch('/api/email/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-demo-mode': 'true'
        },
        body: JSON.stringify({ 
          content: emailContent,
          currentDate: new Date().toISOString() 
        }),
      });

      if (!response.ok) throw new Error('Analysis failed');

      const data = await response.json();
      setAnalysis(data);
      setPhase('results');

      // Automatically proceed to voice summary
      setTimeout(() => speakSummary(data), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('input');
    } finally {
      setIsProcessing(false);
    }
  };

  // Phase 2: Voice Summary with DashScope TTS
  const speakSummary = async (analysisData: EmailAnalysis) => {
    setPhase('voice');
    setIsSpeaking(true);

    const summary = generateSummary(analysisData);

    try {
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-demo-mode': 'true'
        },
        body: JSON.stringify({
          text: summary,
          language: 'en-US',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // If API returns useWebSpeech flag or no audio blob, use Web Speech API
        if (data.useWebSpeech || !response.headers.get('content-type')?.includes('audio')) {
          useWebSpeech(summary, analysisData);
        } else {
          // If we get audio blob (future DashScope integration)
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          
          if (audioRef.current) {
            audioRef.current.src = audioUrl;
            audioRef.current.play();
            audioRef.current.onended = () => {
              setIsSpeaking(false);
              proceedAfterVoice(analysisData);
            };
          }
        }
      } else {
        useWebSpeech(summary, analysisData);
      }
    } catch (err) {
      console.error('TTS error:', err);
      useWebSpeech(summary, analysisData);
    }
  };

  const useWebSpeech = (text: string, analysisData: EmailAnalysis) => {
    if ('speechSynthesis' in window) {
      // Wait for voices to load
      const speak = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        
        // Apply improved voice settings for natural female voice
        utterance.rate = 0.95;   // Slightly slower for clarity
        utterance.pitch = 1.1;   // Slightly higher for pleasant female tone
        utterance.volume = 1.0;
        
        // Try to select a female voice
        const voices = speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
          v.lang.startsWith('en') && 
          (v.name.includes('Google US English') ||
           v.name.includes('Samantha') ||
           v.name.includes('Victoria') ||
           v.name.includes('Zira') ||
           v.name.toLowerCase().includes('female'))
        );
        
        if (femaleVoice) {
          utterance.voice = femaleVoice;
          console.log('Using voice:', femaleVoice.name);
        }
        
        utterance.onend = () => {
          setIsSpeaking(false);
          proceedAfterVoice(analysisData);
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          proceedAfterVoice(analysisData);
        };
        speechSynthesis.speak(utterance);
      };
      
      // Ensure voices are loaded
      if (speechSynthesis.getVoices().length > 0) {
        speak();
      } else {
        speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
      }
    } else {
      setIsSpeaking(false);
      proceedAfterVoice(analysisData);
    }
  };

  const proceedAfterVoice = (analysisData: EmailAnalysis) => {
    // Always go to conversation phase to get user input
    setPhase('conversation');
    
    const { event_details } = analysisData;
    const missing = [];
    if (event_details) {
      if (!event_details.end || event_details.end === event_details.start) missing.push('end time');
      if (!event_details.location) missing.push('location');
    }
    
    if (missing.length > 0) {
      addMessage('assistant', `I need the ${missing.join(' and ')}. Would you like me to email them to ask, or add it anyway?`);
    } else {
      addMessage('assistant', 'Should I add this to your calendar, or would you like to make changes?');
    }
    
    // Auto-start listening after a short delay
    setTimeout(() => startVoiceListening(), 800);
  };

  const generateSummary = (data: EmailAnalysis): string => {
    if (!data.event_details) {
      return `No meeting found in this email.`;
    }

    const { summary, start, location, end } = data.event_details;
    const date = new Date(start);
    const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    // Concise summary
    let response = `${summary}. ${dateStr} at ${timeStr}`;
    if (location) response += `, ${location}`;
    
    // Missing info detection
    const missing = [];
    if (!end || end === start) missing.push('end time');
    if (!location) missing.push('location');
    
    if (missing.length > 0) {
      response += `. Missing ${missing.join(' and ')}. What would you like to do?`;
    } else {
      response += `. Add to calendar?`;
    }
    
    return response;
  };

  // Phase 3: Multi-turn Conversation (if needed)
  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setConversationHistory(prev => [...prev, { role, content, timestamp: new Date() }]);
  };

  const handleUserResponse = async () => {
    const message = userResponse.trim();
    if (!message) return;

    addMessage('user', message);
    setUserResponse('');
    setVoiceTranscript('');
    setIsProcessing(true);

    try {
      // Call Qwen-Max for intelligent conversation
      const response = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-demo-mode': 'true'
        },
        body: JSON.stringify({
          message: message,
          emailAnalysis: analysis,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          emailContent: emailContent,
          currentDate: new Date().toISOString(),
          eventId: eventId, // Pass eventId for reschedule/delete operations
          hasConflicts: conflicts.length > 0, // Pass conflict status
          conflictInfo: conflicts.length > 0 ? conflicts : null // Pass conflict details
        }),
      });

      if (!response.ok) throw new Error('Conversation failed');

      const data = await response.json();
      
      // Handle calendar actions and conflicts
      if (data.calendarActions) {
        if (data.calendarActions.hasConflicts) {
          setConflicts(data.calendarActions.conflicts || []);
          
          // Use the AI's reply which now includes conflict information
          addMessage('assistant', data.reply);
          speakResponse(data.reply);
        } else {
          // Clear conflicts if successful
          setConflicts([]);
          
          // Update eventId if event was created/updated
          if (data.calendarActions.eventId) {
            setEventId(data.calendarActions.eventId);
          }
          
          // Clear eventId if deleted
          if (data.calendarActions.eventDeleted) {
            setEventId(null);
          }
          
          addMessage('assistant', data.reply);
          speakResponse(data.reply);
        }
      } else {
        addMessage('assistant', data.reply);
        speakResponse(data.reply);
      }

      // Execute actions based on AI decision
      if (data.actions && data.actions.length > 0) {
        setTimeout(async () => {
          await executeMultipleActions(data.actions, data);
        }, 1500);
      } else if (data.conversationComplete) {
        // User explicitly ended conversation
        setTimeout(() => {
          setActionResult('✓ Conversation completed');
          setPhase('complete');
        }, 1500);
      } else {
        // Continue conversation - wait for next user input
        setTimeout(() => startVoiceListening(), 2500);
      }
    } catch (err) {
      console.error('Conversation error:', err);
      setError('Conversation failed');
      addMessage('assistant', 'Sorry, I had trouble understanding. Could you rephrase that?');
      setTimeout(() => startVoiceListening(), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeMultipleActions = async (actions: string[], data: any) => {
    setPhase('action');
    const results: string[] = [];

    for (const action of actions) {
      if (action === 'add_to_calendar' || action === 'create_event') {
        await executeAction(data.updatedAnalysis || analysis);
        results.push('✓ Added to calendar');
      } else if (action === 'send_email' || action === 'draft_email') {
        const emailResult = await draftEmail(data.emailDraft);
        results.push(emailResult);
      } else if (action === 'reschedule') {
        if (data.updatedAnalysis) {
          await executeAction(data.updatedAnalysis);
          results.push('✓ Rescheduled event');
        }
      }
    }

    setActionResult(results.join('\n'));
    
    // Continue conversation after actions unless explicitly complete
    if (!data.conversationComplete) {
      setPhase('conversation');
      setTimeout(() => startVoiceListening(), 2500);
    } else {
      setPhase('complete');
    }
  };

  const draftEmail = async (emailDraft?: any) => {
    if (!emailDraft) return '✓ Email drafted (check drafts)';
    
    // In production, this would call Gmail API to create draft
    return `✓ Email drafted to ${emailDraft.to || 'recipient'}: "${emailDraft.subject || 'Meeting Follow-up'}"'`;
  };

  const formatConflictMessage = (conflicts: any[]) => {
    if (!conflicts || conflicts.length === 0) return '';
    
    const count = conflicts.length;
    let message = `⚠️ I found ${count} conflicting event${count > 1 ? 's' : ''} at that time:\n\n`;
    
    conflicts.forEach((conflict, i) => {
      const startTime = new Date(conflict.start).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
      message += `${i + 1}. ${conflict.summary} - ${startTime}`;
      if (conflict.location) message += ` at ${conflict.location}`;
      message += '\n';
    });
    
    message += '\nWould you like to choose a different time or keep both events?';
    return message;
  };

  const speakResponse = (text: string) => {
    if ('speechSynthesis' in window) {
      // Wait for voices to load
      const speak = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        
        // Apply improved voice settings for natural female voice
        utterance.rate = 0.95;   // Slightly slower for clarity
        utterance.pitch = 1.1;   // Slightly higher for pleasant female tone
        utterance.volume = 1.0;
        
        // Try to select a female voice
        const voices = speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
          v.lang.startsWith('en') && 
          (v.name.includes('Google US English') ||
           v.name.includes('Samantha') ||
           v.name.includes('Victoria') ||
           v.name.includes('Zira') ||
           v.name.toLowerCase().includes('female'))
        );
        
        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }
        
        speechSynthesis.speak(utterance);
      };
      
      // Ensure voices are loaded
      if (speechSynthesis.getVoices().length > 0) {
        speak();
      } else {
        speechSynthesis.addEventListener('voiceschanged', speak, { once: true });
      }
    }
  };

  // Phase 4: Action Delegation
  const executeAction = async (analysisData: EmailAnalysis | null) => {
    if (!analysisData?.event_details) {
      setActionResult('No action needed - email analyzed successfully.');
      setPhase('complete');
      return;
    }

    setIsProcessing(true);

    try {
      // Delegate to Calendar Agent
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-demo-mode': 'true'
        },
        body: JSON.stringify({
          action: 'create',
          event: analysisData.event_details,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setActionResult(`✓ Meeting added to calendar: ${analysisData.event_details.summary}`);
      } else {
        throw new Error('Failed to create calendar event');
      }
    } catch (err) {
      setActionResult(`⚠ Could not add to calendar: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
      setPhase('complete');
    }
  };

  // Voice Recognition Setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setVoiceTranscript(transcript);
        
        // Set final result
        if (event.results[event.results.length - 1].isFinal) {
          setUserResponse(transcript);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        // Auto-submit only if transcript contains actionable words
        const transcript = voiceTranscript.trim().toLowerCase();
        const hasAction = transcript.includes('yes') || transcript.includes('add') || 
                         transcript.includes('email') || transcript.includes('no') || 
                         transcript.includes('cancel') || transcript.includes('calendar');
        
        if (transcript && hasAction && transcript.length > 2) {
          setTimeout(() => {
            if (voiceTranscript.trim()) { // Double check it hasn't been cleared
              handleUserResponse();
            }
          }, 300);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };
    }
  }, [voiceTranscript]);

  const startVoiceListening = () => {
    if (recognitionRef.current && !isListening) {
      setVoiceTranscript('');
      setUserResponse('');
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopVoiceListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const reset = () => {
    stopVoiceListening();
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    setPhase('input');
    setEmailContent('');
    setAnalysis(null);
    setError('');
    setConversationHistory([]);
    setUserResponse('');
    setActionResult('');
    setVoiceTranscript('');
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <audio ref={audioRef} className="hidden" />
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Email Handler Agent Demo</h1>
        <p className="text-muted-foreground">
          Phase 2: Email Analysis with Alibaba Cloud Qwen-Max + DashScope
        </p>
      </div>

      {/* Progress Indicators */}
      <div className="mb-8 flex items-center gap-4 overflow-x-auto pb-2">
        <PhaseIndicator 
          label="1. Email Input" 
          active={phase === 'input'} 
          complete={['analyzing', 'results', 'voice', 'conversation', 'action', 'complete'].includes(phase)}
          icon={<Mail className="w-4 h-4" />}
        />
        <PhaseIndicator 
          label="2. AI Analysis" 
          active={phase === 'analyzing'} 
          complete={['results', 'voice', 'conversation', 'action', 'complete'].includes(phase)}
          icon={<Loader2 className="w-4 h-4 animate-spin" />}
        />
        <PhaseIndicator 
          label="3. Results" 
          active={phase === 'results'} 
          complete={['voice', 'conversation', 'action', 'complete'].includes(phase)}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <PhaseIndicator 
          label="4. Voice Summary" 
          active={phase === 'voice'} 
          complete={['conversation', 'action', 'complete'].includes(phase)}
          icon={<Volume2 className="w-4 h-4" />}
        />
        {analysis?.requires_clarification && (
          <PhaseIndicator 
            label="5. Conversation" 
            active={phase === 'conversation'} 
            complete={['action', 'complete'].includes(phase)}
            icon={<MessageSquare className="w-4 h-4" />}
          />
        )}
        <PhaseIndicator 
          label="6. Calendar Action" 
          active={phase === 'action'} 
          complete={phase === 'complete'}
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6">
        {/* Input Phase */}
        {phase === 'input' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Step 1: Enter Email Content
              </CardTitle>
              <CardDescription>
                Paste an email that contains a meeting request or scheduling information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste email content here..."
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={analyzeEmail} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                  Analyze with Qwen-Max
                </Button>
                <Button onClick={loadSample} variant="outline">
                  Load Sample: {sampleEmails[currentSampleIndex].name}
                </Button>
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Analysis Phase */}
        {phase === 'analyzing' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Analyzing with Qwen-Max...</h3>
              <p className="text-muted-foreground">
                Extracting intent, entities, urgency, and generating summary
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results Phase */}
        {(phase === 'results' || phase === 'voice' || phase === 'conversation' || phase === 'action' || phase === 'complete') && analysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Step 2: Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Event Type:</span>
                <Badge>{analysis.event_type}</Badge>
                <span className="font-semibold ml-4">Urgency:</span>
                <Badge variant={analysis.urgency === 'high' ? 'destructive' : analysis.urgency === 'medium' ? 'default' : 'secondary'}>
                  {analysis.urgency}
                </Badge>
                <span className="font-semibold ml-4">Confidence:</span>
                <Badge variant="outline">{(analysis.confidence * 100).toFixed(0)}%</Badge>
              </div>

              {analysis.event_details && (
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <p><strong>Summary:</strong> {analysis.event_details.summary}</p>
                  <p><strong>Date/Time:</strong> {new Date(analysis.event_details.start).toLocaleString()}</p>
                  {analysis.event_details.location && <p><strong>Location:</strong> {analysis.event_details.location}</p>}
                  <p><strong>Description:</strong> {analysis.event_details.description}</p>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                <strong>AI Reasoning:</strong> {analysis.reasoning}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Voice Phase */}
        {(phase === 'voice' || (isSpeaking && phase !== 'input')) && (
          <Card>
            <CardContent className="py-8 text-center">
              <Volume2 className="w-12 h-12 mx-auto mb-4 text-blue-600 animate-pulse" />
              <h3 className="text-lg font-semibold mb-2">Speaking Summary...</h3>
              <p className="text-muted-foreground">
                Using DashScope Text-to-Speech
              </p>
            </CardContent>
          </Card>
        )}

        {/* Conversation Phase */}
        {phase === 'conversation' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Step 3: Clarification Needed
                </div>
                {eventId && (
                  <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                    <Calendar className="w-3 h-3 mr-1" />
                    Event in Calendar
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                The AI needs more information to proceed
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.role === 'assistant' 
                        ? 'bg-blue-50 dark:bg-blue-950 ml-0 mr-12' 
                        : 'bg-green-50 dark:bg-green-950 ml-12 mr-0'
                    }`}
                  >
                    <p className="text-sm font-semibold mb-1">
                      {msg.role === 'assistant' ? '🤖 AI Assistant' : '👤 You'}
                    </p>
                    <p className="whitespace-pre-line">{msg.content}</p>
                  </div>
                ))}
              </div>

              {/* Show conflicts if any */}
              {conflicts.length > 0 && (
                <Alert className="border-orange-600 bg-orange-50 dark:bg-orange-950">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    <strong className="block mb-2">⚠️ Schedule Conflicts Detected</strong>
                    <div className="space-y-2">
                      {conflicts.map((conflict, i) => (
                        <div key={i} className="text-sm bg-white dark:bg-gray-800 p-2 rounded">
                          <strong>{conflict.summary}</strong>
                          <div className="text-xs text-muted-foreground">
                            {new Date(conflict.start).toLocaleString()} - {new Date(conflict.end).toLocaleTimeString()}
                          </div>
                          {conflict.location && (
                            <div className="text-xs">📍 {conflict.location}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">\n                {isListening && (
                  <Alert className="border-blue-600 bg-blue-50 dark:bg-blue-950">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    <AlertDescription>
                      <strong>Listening...</strong> {voiceTranscript || 'Speak now'}
                    </AlertDescription>
                  </Alert>
                )}
                
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type or speak your response..."
                    value={userResponse || voiceTranscript}
                    onChange={(e) => setUserResponse(e.target.value)}
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleUserResponse();
                      }
                    }}
                  />
                  <div className="flex flex-col gap-2">
                    <Button 
                      onClick={isListening ? stopVoiceListening : startVoiceListening}
                      variant={isListening ? "destructive" : "outline"}
                      size="icon"
                      title={isListening ? "Stop listening" : "Start voice input"}
                    >
                      <Volume2 className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                    </Button>
                    <Button 
                      onClick={handleUserResponse} 
                      disabled={isProcessing || (!userResponse.trim() && !voiceTranscript.trim())}
                      size="icon"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  💡 Try saying: "Email them to ask" or "Yes, add it" or "No, cancel"
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Phase */}
        {(phase === 'action' || phase === 'complete') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Step 4: Calendar Action
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {phase === 'action' && isProcessing ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Delegating to Calendar Agent...</p>
                </div>
              ) : (
                <Alert>
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertDescription className="text-base">
                    {actionResult}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Complete Phase */}
        {phase === 'complete' && (
          <Card className="border-green-600">
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
              <h3 className="text-2xl font-bold mb-2">Workflow Complete!</h3>
              <p className="text-muted-foreground mb-6">
                Email analyzed, voice summary delivered, and action executed.
              </p>
              <Button onClick={reset}>
                Try Another Email
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Phase Indicator Component
function PhaseIndicator({ 
  label, 
  active, 
  complete, 
  icon 
}: { 
  label: string; 
  active: boolean; 
  complete: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all whitespace-nowrap ${
      active ? 'border-blue-600 bg-blue-50 dark:bg-blue-950' :
      complete ? 'border-green-600 bg-green-50 dark:bg-green-950' :
      'border-gray-300 bg-gray-50 dark:bg-gray-900'
    }`}>
      {icon}
      <span className={`text-sm font-medium ${
        active ? 'text-blue-600' :
        complete ? 'text-green-600' :
        'text-muted-foreground'
      }`}>
        {label}
      </span>
    </div>
  );
}
