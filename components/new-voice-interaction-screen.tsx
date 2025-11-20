/**
 * Voice Interaction Screen - Redesigned with Proper Conversation Flow
 * Based on alibaba-hackerz demo implementation
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';

// Import voice and email handlers
import { textToSpeech, speechToText, startRecording, stopRecording, generateVoiceResponse } from '../lib/voice-handler';
import { analyzeEmailContent, ExtractedEventData } from '../lib/email-handler';

interface Email {
  id: string;
  from: string;
  subject: string;
  body: string;
  snippet: string;
}

interface VoiceInteractionScreenProps {
  email?: Email;
  onComplete?: () => void;
  onDismiss?: () => void;
}

type ConversationMessage = {
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
};

type DemoPhase = 
  | 'analyzing'      // Analyzing email
  | 'speaking'       // AI is speaking
  | 'listening'      // Listening to user
  | 'processing'     // Processing user input
  | 'action'         // Taking action
  | 'complete';      // Done

export default function VoiceInteractionScreen({
  email,
  onComplete,
  onDismiss,
}: VoiceInteractionScreenProps = {}) {
  const [phase, setPhase] = useState<DemoPhase>('analyzing');
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [extractedEvent, setExtractedEvent] = useState<ExtractedEventData | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingTimeout, setRecordingTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Demo email if none provided
  const demoEmail: Email = {
    id: 'demo_001',
    from: 'demo@example.com',
    subject: 'Demo Email',
    body: 'This is a demo email for testing the voice interaction feature.',
    snippet: 'Demo email snippet',
  };
  
  const activeEmail = email || demoEmail;

  useEffect(() => {
    initializeInteraction();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (phase === 'listening') {
      startPulseAnimation();
    } else {
      stopPulseAnimation();
    }
  }, [phase]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.setValue(1);
  };

  const addMessage = (role: 'assistant' | 'user', content: string) => {
    setConversation(prev => [...prev, { role, content, timestamp: new Date() }]);
  };

  const initializeInteraction = async () => {
    try {
      setPhase('analyzing');
      
      // Analyze email
      const analysis = await analyzeEmailContent(activeEmail.body, process.env.EXPO_PUBLIC_QWEN_API_KEY);
      
      if (analysis.create_event && analysis.event) {
        setExtractedEvent(analysis.event);
        
        // Generate summary
        const summary = generateEmailSummary(analysis.event, activeEmail.from);
        await speakMessage(summary);
        
        // Set to complete - user can manually tap to respond
        setPhase('complete');
      } else {
        // No event detected
        const summary = `Email from ${activeEmail.from}: ${activeEmail.subject}. ${analysis.reasoning}. Would you like to reply?`;
        await speakMessage(summary);
        
        // Set to complete - user can manually tap to respond
        setPhase('complete');
      }
    } catch (error) {
      console.error('Initialize interaction error:', error);
      addMessage('assistant', 'Sorry, I had trouble analyzing the email. Please try again.');
      setPhase('complete');
    }
  };

  const generateEmailSummary = (event: ExtractedEventData, sender: string): string => {
    const date = new Date(event.start_time).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const time = new Date(event.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    // Check for missing information
    const missing = [];
    if (!event.end_time || event.end_time === event.start_time) missing.push('end time');
    if (!event.location) missing.push('location');

    let summary = `${event.title}. ${date} at ${time}`;
    if (event.location) summary += `, ${event.location}`;

    if (missing.length > 0) {
      summary += `. Missing ${missing.join(' and ')}. What would you like to do?`;
    } else {
      summary += `. Add to calendar?`;
    }

    return summary;
  };

  const speakMessage = async (message: string): Promise<void> => {
    setPhase('speaking');
    addMessage('assistant', message);

    try {
      await textToSpeech(message, 'en-US');
    } catch (error) {
      console.error('TTS error:', error);
    }
  };

  const startListening = async (): Promise<void> => {
    setPhase('listening');
    addMessage('assistant', '🎤 Listening...');

    try {
      const recordingInstance = await startRecording();
      if (recordingInstance) {
        setRecording(recordingInstance);

        // Auto-stop after 5 seconds
        const timeout = setTimeout(async () => {
          if (recordingInstance) {
            await stopListeningManually(recordingInstance);
          }
        }, 5000);
        setRecordingTimeout(timeout);
      }
    } catch (error) {
      console.error('Recording error:', error);
      addMessage('assistant', 'Failed to start recording. Please check microphone permissions.');
      setPhase('complete');
    }
  };

  const stopListeningManually = async (recordingInstance?: Audio.Recording): Promise<void> => {
    const rec = recordingInstance || recording;
    if (!rec) return;

    try {
      // Clear timeout
      if (recordingTimeout) {
        clearTimeout(recordingTimeout);
        setRecordingTimeout(null);
      }

      const audioUri = await stopRecording(rec);
      setRecording(null);

      if (audioUri) {
        setPhase('processing');
        
        // Convert speech to text
        const sttResult = await speechToText(audioUri, 'en-US');
        addMessage('user', sttResult.text);

        // Process the user's response
        await processUserResponse(sttResult.text);
      }
    } catch (error) {
      console.error('Stop listening error:', error);
      addMessage('assistant', 'Sorry, I had trouble hearing you. Could you try again?');
      setTimeout(() => startListening(), 1000);
    }
  };

  const processUserResponse = async (userInput: string): Promise<void> => {
    const input = userInput.toLowerCase();

    try {
      // Simple intent detection (can be enhanced with Qwen API)
      if (input.includes('yes') || input.includes('add') || input.includes('create') || input.includes('confirm')) {
        // User wants to create the event
        await handleConfirm();
      } else if (input.includes('no') || input.includes('cancel') || input.includes('dismiss')) {
        // User wants to cancel
        await handleCancel();
      } else if (input.includes('change') || input.includes('modify') || input.includes('different')) {
        // User wants to modify
        const response = "What would you like to change?";
        await speakMessage(response);
        setPhase('complete'); // Don't auto-restart listening
      } else {
        // Unclear intent - ask for clarification
        const response = "I didn't quite catch that. Would you like me to add this to your calendar? Say yes or no.";
        await speakMessage(response);
        setPhase('complete'); // Don't auto-restart listening
      }
    } catch (error) {
      console.error('Process response error:', error);
      await speakMessage('Sorry, I had trouble understanding. Could you repeat that?');
      setPhase('complete'); // Don't auto-restart listening
    }
  };

  const handleConfirm = async () => {
    setPhase('action');
    addMessage('assistant', '✅ Creating calendar event...');

    try {
      // Simulate calendar creation
      await new Promise(resolve => setTimeout(resolve, 1500));

      const success = true; // Replace with actual calendar API call

      if (success) {
        await speakMessage('Calendar event created successfully! Anything else?');
      } else {
        await speakMessage('Failed to create calendar event. Please try again later.');
      }

      setPhase('complete');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 3000);
    } catch (error) {
      console.error('Create event error:', error);
      await speakMessage('Sorry, I encountered an error creating the event.');
      setPhase('complete');
    }
  };

  const handleCancel = async () => {
    await speakMessage('Okay, I won\'t create the event. Is there anything else I can help with?');
    setPhase('complete');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 3000);
  };

  const cleanup = async () => {
    if (recordingTimeout) {
      clearTimeout(recordingTimeout);
    }
    if (recording) {
      try {
        const status = await recording.getStatusAsync();
        if (status.isRecording) {
          await recording.stopAndUnloadAsync();
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎧 Voice Interaction</Text>
        <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Email Info */}
      <View style={styles.emailInfo}>
        <Text style={styles.emailFrom}>From: {activeEmail.from}</Text>
        <Text style={styles.emailSubject}>{activeEmail.subject}</Text>
      </View>

      {/* Phase Indicator */}
      <View style={styles.phaseIndicator}>
        <Text style={styles.phaseText}>
          {phase === 'analyzing' && '🔍 Analyzing'}
          {phase === 'speaking' && '🔊 Speaking'}
          {phase === 'listening' && '🎤 Listening'}
          {phase === 'processing' && '⚙️ Processing'}
          {phase === 'action' && '✨ Taking Action'}
          {phase === 'complete' && '✅ Complete'}
        </Text>
      </View>

      {/* Conversation History */}
      <ScrollView style={styles.conversation} contentContainerStyle={styles.conversationContent}>
        {conversation.map((msg, index) => (
          <View
            key={index}
            style={[
              styles.message,
              msg.role === 'user' ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            <Text style={styles.messageText}>{msg.content}</Text>
            <Text style={styles.messageTime}>
              {msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Microphone Button */}
      {phase === 'listening' && (
        <View style={styles.micContainer}>
          <Animated.View style={[styles.micButton, { transform: [{ scale: pulseAnim }] }]}>
            <TouchableOpacity onPress={() => stopListeningManually()} style={styles.micTouchable}>
              <Text style={styles.micIcon}>🎤</Text>
              <Text style={styles.micText}>Recording...</Text>
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.tapText}>Tap to stop</Text>
        </View>
      )}

      {/* Response Button - when complete */}
      {phase === 'complete' && (
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.responseButton} 
            onPress={() => startListening()}
          >
            <Text style={styles.responseButtonText}>🎤 Tap to Respond</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading Indicator */}
      {(phase === 'analyzing' || phase === 'processing' || phase === 'action') && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: '#2a2a2a',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  emailInfo: {
    padding: 16,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  emailFrom: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  emailSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  phaseIndicator: {
    padding: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  phaseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  conversation: {
    flex: 1,
    padding: 16,
  },
  conversationContent: {
    paddingBottom: 20,
  },
  message: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
  },
  messageText: {
    fontSize: 15,
    color: '#fff',
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 11,
    color: '#aaa',
  },
  micContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  micButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  micTouchable: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 80,
  },
  micText: {
    fontSize: 16,
    color: '#fff',
    marginTop: 8,
    fontWeight: '600',
  },
  tapText: {
    fontSize: 14,
    color: '#999',
    marginTop: 16,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
  },
  actionButtons: {
    padding: 20,
    alignItems: 'center',
  },
  responseButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 25,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  responseButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
