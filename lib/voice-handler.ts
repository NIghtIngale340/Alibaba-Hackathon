/**
 * Voice Interaction System - Mobile Version (React Native)
 * Multilingual Speech-to-Text and Text-to-Speech using Expo AV
 */

import { Audio } from 'expo-av';

export interface VoiceInput {
  text: string;
  language: string;
  confidence: number;
}

export interface VoiceOutput {
  text: string;
  language: string;
  audioUrl?: string;
}

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
}

export interface TTSResult {
  text: string;
  language: string;
  success: boolean;
  voiceName?: string; // Specific voice to use
  voiceSettings?: {
    rate: number;
    pitch: number;
    volume: number;
  };
}

const SUPPORTED_LANGUAGES = [
  'en-US', // English
  'zh-CN', // Chinese (Simplified)
  'es-ES', // Spanish
  'fr-FR', // French
  'de-DE', // German
  'ja-JP', // Japanese
  'ko-KR', // Korean
];

// Recommended voice settings for natural-sounding female voice
const VOICE_SETTINGS = {
  'en-US': {
    preferredVoices: ['Google US English', 'Microsoft Zira', 'Samantha', 'Victoria'],
    rate: 0.95,      // Slightly slower for clarity
    pitch: 1.1,      // Slightly higher for pleasant female tone
    volume: 1.0,
  },
  'zh-CN': {
    preferredVoices: ['Google 普通话（中国大陆）', 'Microsoft Huihui', 'Ting-Ting'],
    rate: 0.9,
    pitch: 1.15,
    volume: 1.0,
  },
  default: {
    preferredVoices: [],
    rate: 0.95,
    pitch: 1.1,
    volume: 1.0,
  },
};

/**
 * Speech-to-Text using Expo Speech Recognition (or cloud service)
 * Converts voice input to text in multiple languages
 */
export async function speechToText(
  audioUri: string,
  language?: string
): Promise<STTResult> {
  // For mobile, we need to use a cloud service like Google Speech-to-Text
  // or implement using expo-speech-recognition
  
  // Detect language if not provided
  const detectedLanguage = language || 'en-US';
  
  // Mock STT result for demo
  // TODO: Replace with actual Alibaba Cloud API call or Google Speech-to-Text
  const mockResult: STTResult = {
    text: "Sample transcribed text from voice input",
    language: detectedLanguage,
    confidence: 0.95,
  };
  
  console.log(`STT: Transcribed in ${detectedLanguage}:`, mockResult.text);
  
  return mockResult;
}

/**
 * Text-to-Speech using Expo Speech
 * Generates spoken responses in the user's language
 */
export async function textToSpeech(
  text: string,
  language: string = 'en-US'
): Promise<TTSResult> {
  // For demo purposes, we'll use Expo Speech
  // In production, integrate with Alibaba Cloud Text-to-Speech API
  
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  
  console.log(`TTS: Generating speech in ${language}:`, text);
  
  // Get voice settings for the language
  const settings = VOICE_SETTINGS[language as keyof typeof VOICE_SETTINGS] || VOICE_SETTINGS.default;
  
  try {
    // Use Expo Speech (need to install: expo install expo-speech)
    const Speech = await import('expo-speech');
    
    await Speech.speak(text, {
      language: language,
      pitch: settings.pitch,
      rate: settings.rate,
      volume: settings.volume,
    });
    
    // Mock TTS result for demo
    // TODO: Replace with actual Alibaba Cloud API call
    const result: TTSResult = {
      text,
      language,
      success: true,
      voiceSettings: {
        rate: settings.rate,
        pitch: settings.pitch,
        volume: settings.volume,
      },
    };
    
    return result;
  } catch (error) {
    console.error('TTS Error:', error);
    return {
      text,
      language,
      success: false,
      voiceSettings: {
        rate: settings.rate,
        pitch: settings.pitch,
        volume: settings.volume,
      },
    };
  }
}

/**
 * Stop any ongoing speech
 */
export async function stopSpeech(): Promise<void> {
  try {
    const Speech = await import('expo-speech');
    await Speech.stop();
  } catch (error) {
    console.error('Stop speech error:', error);
  }
}

/**
 * Check if speech is in progress
 */
export async function isSpeaking(): Promise<boolean> {
  try {
    const Speech = await import('expo-speech');
    return await Speech.isSpeakingAsync();
  } catch (error) {
    return false;
  }
}

/**
 * Detect language from text content
 */
export function detectLanguage(text: string): string {
  // Check for Chinese characters
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh-CN';
  }
  
  // Check for Japanese characters
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) {
    return 'ja-JP';
  }
  
  // Check for Korean characters
  if (/[\uac00-\ud7af]/.test(text)) {
    return 'ko-KR';
  }
  
  // Default to English
  return 'en-US';
}

/**
 * Request microphone permissions
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Permission request error:', error);
    return false;
  }
}

/**
 * Start recording audio
 */
export async function startRecording(): Promise<Audio.Recording | null> {
  try {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      throw new Error('Microphone permission denied');
    }
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    
    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );
    
    return recording;
  } catch (error) {
    console.error('Start recording error:', error);
    return null;
  }
}

/**
 * Stop recording audio and return URI
 */
export async function stopRecording(recording: Audio.Recording): Promise<string | null> {
  try {
    // Check if recording is still active before stopping
    const status = await recording.getStatusAsync();
    if (!status.canRecord && !status.isRecording) {
      // Already stopped, just get URI
      const uri = recording.getURI();
      return uri;
    }
    
    // Only stop if still recording
    if (status.isRecording) {
      await recording.stopAndUnloadAsync();
    }
    
    const uri = recording.getURI();
    return uri;
  } catch (error) {
    console.error('Stop recording error:', error);
    return null;
  }
}

/**
 * Play audio from URI
 */
export async function playAudio(uri: string): Promise<void> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    await sound.playAsync();
  } catch (error) {
    console.error('Play audio error:', error);
  }
}

/**
 * Process voice input and convert to structured event data
 */
export async function processVoiceInput(
  audioUri: string,
  language?: string,
  qwenApiKey?: string
): Promise<{ text: string; language: string; confidence: number }> {
  // Convert speech to text
  const sttResult = await speechToText(audioUri, language);
  
  // Detect language if needed
  const finalLanguage = sttResult.language || detectLanguage(sttResult.text);
  
  console.log("Voice input processed:", {
    text: sttResult.text,
    language: finalLanguage,
    confidence: sttResult.confidence,
  });
  
  return {
    text: sttResult.text,
    language: finalLanguage,
    confidence: sttResult.confidence,
  };
}

/**
 * Generate voice response from text
 */
export async function generateVoiceResponse(
  text: string,
  language: string = 'en-US'
): Promise<TTSResult> {
  return await textToSpeech(text, language);
}

/**
 * Create confirmation message in the user's language
 */
export function createConfirmationMessage(
  eventTitle: string,
  eventDate: string,
  eventTime: string,
  language: string = 'en-US'
): string {
  const templates: Record<string, string> = {
    'en-US': `I'll create a calendar event: "${eventTitle}" on ${eventDate} at ${eventTime}. Should I proceed?`,
    'zh-CN': `我将创建日历事件："${eventTitle}"，时间是${eventDate} ${eventTime}。要继续吗？`,
    'es-ES': `Voy a crear un evento de calendario: "${eventTitle}" el ${eventDate} a las ${eventTime}. ¿Continúo?`,
    'fr-FR': `Je vais créer un événement : "${eventTitle}" le ${eventDate} à ${eventTime}. Dois-je continuer ?`,
    'de-DE': `Ich erstelle einen Kalendereintrag: "${eventTitle}" am ${eventDate} um ${eventTime}. Soll ich fortfahren?`,
    'ja-JP': `カレンダーイベント「${eventTitle}」を${eventDate} ${eventTime}に作成します。よろしいですか？`,
    'ko-KR': `캘린더 이벤트를 만들겠습니다: "${eventTitle}", ${eventDate} ${eventTime}. 진행할까요?`,
  };
  
  return templates[language] || templates['en-US'];
}

/**
 * Create clarification question in the user's language
 */
export function createClarificationQuestion(
  missingField: string,
  language: string = 'en-US'
): string {
  const templates: Record<string, Record<string, string>> = {
    'en-US': {
      time: 'What time should this event be scheduled?',
      date: 'What date should this event be on?',
      duration: 'How long should this event last?',
      location: 'Where will this event take place?',
    },
    'zh-CN': {
      time: '这个事件应该安排在什么时间？',
      date: '这个事件应该在哪一天？',
      duration: '这个事件应该持续多长时间？',
      location: '这个事件将在哪里举行？',
    },
    'es-ES': {
      time: '¿A qué hora debe programarse este evento?',
      date: '¿En qué fecha debe estar este evento?',
      duration: '¿Cuánto tiempo debe durar este evento?',
      location: '¿Dónde tendrá lugar este evento?',
    },
  };
  
  const langTemplates = templates[language] || templates['en-US'];
  return langTemplates[missingField] || langTemplates['time'];
}
