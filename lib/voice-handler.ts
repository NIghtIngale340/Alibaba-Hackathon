/**
 * Voice Interaction System - Phase 3
 * Multilingual Speech-to-Text and Text-to-Speech
 */

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
 * Speech-to-Text using Alibaba Cloud Speech Recognition
 * Converts voice input to text in multiple languages
 */
export async function speechToText(
  audioBuffer: Buffer | ArrayBuffer,
  language?: string
): Promise<STTResult> {
  // For demo purposes, we'll use a mock implementation
  // In production, integrate with Alibaba Cloud Realtime Speech Recognition API
  
  // Detect language if not provided
  const detectedLanguage = language || 'en-US';
  
  // Mock STT result for demo
  // TODO: Replace with actual Alibaba Cloud API call
  const mockResult: STTResult = {
    text: "Sample transcribed text from voice input",
    language: detectedLanguage,
    confidence: 0.95,
  };
  
  console.log(`STT: Transcribed in ${detectedLanguage}:`, mockResult.text);
  
  return mockResult;
}

/**
 * Text-to-Speech using Alibaba Cloud TTS
 * Generates spoken responses in the user's language
 */
export async function textToSpeech(
  text: string,
  language: string = 'en-US'
): Promise<TTSResult> {
  // For demo purposes, we'll use a mock implementation
  // In production, integrate with Alibaba Cloud Text-to-Speech API
  
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  
  console.log(`TTS: Generating speech in ${language}:`, text);
  
  // Get voice settings for the language
  const settings = VOICE_SETTINGS[language as keyof typeof VOICE_SETTINGS] || VOICE_SETTINGS.default;
  
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
}

/**
 * Detect language from text content
 */
export function detectLanguage(text: string): string {
  // Simple language detection based on character patterns
  // In production, use a proper language detection library
  
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
 * Get the best available voice for the specified language
 * For use in browser with Web Speech API
 */
export function getBestVoice(language: string): { name?: string; settings: any } {
  const settings = VOICE_SETTINGS[language as keyof typeof VOICE_SETTINGS] || VOICE_SETTINGS.default;
  
  // If running in browser, check available voices
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    
    // Try to find a preferred female voice
    for (const preferredName of settings.preferredVoices) {
      const voice = voices.find(v => 
        v.name.includes(preferredName) && v.lang.startsWith(language.split('-')[0])
      );
      if (voice) {
        return { 
          name: voice.name,
          settings: settings,
        };
      }
    }
    
    // Fallback: find any female voice for the language
    const femaleVoice = voices.find(v => 
      v.lang.startsWith(language.split('-')[0]) && 
      (v.name.toLowerCase().includes('female') || 
       v.name.toLowerCase().includes('woman') ||
       v.name.toLowerCase().includes('zira') ||
       v.name.toLowerCase().includes('samantha') ||
       v.name.toLowerCase().includes('victoria'))
    );
    
    if (femaleVoice) {
      return {
        name: femaleVoice.name,
        settings: settings,
      };
    }
    
    // Last resort: any voice matching the language
    const anyVoice = voices.find(v => v.lang.startsWith(language.split('-')[0]));
    if (anyVoice) {
      return {
        name: anyVoice.name,
        settings: settings,
      };
    }
  }
  
  return { settings };
}

/**
 * Process voice input and convert to structured event data
 */
export async function processVoiceInput(
  audioBuffer: Buffer | ArrayBuffer,
  language?: string,
  qwenApiKey?: string
): Promise<{ text: string; language: string; confidence: number }> {
  // Convert speech to text
  const sttResult = await speechToText(audioBuffer, language);
  
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
