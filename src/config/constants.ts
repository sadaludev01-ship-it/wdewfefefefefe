import { AppConfig } from '../types';

// Default application configuration
export const DEFAULT_CONFIG: AppConfig = {
  systemPrompt: `Du bist Buddy, ein warmherziger älterer Mann, der ruhig, humorvoll und geduldig spricht. Du hörst aufmerksam zu und gibst hilfsreiche, ermutigende Antworten. Du sprichst Deutsch und verwendest eine freundliche, aber respektvolle Sprache. Halte deine Antworten kurz und prägnant, aber warmherzig.`,
  greeting: 'Schön, dass du da bist. Wie geht es dir heute?',
  volume: 80,
  showSubtitles: false,
  voice: 'alloy',
  vadThreshold: 0,
  silenceDurationMs: 500,
  prefixPaddingMs: 300,
  turnDetectionType: 'server_vad',
  temperature: 0.8,
  aiLanguage: 'de',
  micGain: 1.5,
  ttsProvider: 'openai',
  ttsModel: 'tts-1',
  openaiSpeed: 1.0,
  piperSpeed: 1.0,
  piperPitch: 1.0,
  coquiSettings: {
    temperature: 0.7,
    length_penalty: 1.0,
    repetition_penalty: 1.0,
    top_k: 50,
    top_p: 0.85
  }
};

// Audio configuration
export const AUDIO_CONFIG = {
  sampleRate: 24000,
  channels: 1,
  format: 'pcm16'
};

// WebRTC configuration
export const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

// Error messages in German (kept for fallback, but now handled by translations)
export const ERROR_MESSAGES = {
  microphone: 'Mikrofon nicht verfügbar. Bitte überprüfen Sie Ihre Berechtigungen.',
  connection: 'Verbindung zur OpenAI API fehlgeschlagen. Bitte versuchen Sie es erneut.',
  api: 'API-Fehler. Bitte überprüfen Sie Ihren API-Schlüssel.',
  general: 'Ein unerwarteter Fehler ist aufgetreten.',
  noApiKey: 'Server: OPENAI_API_KEY ist nicht gesetzt.'
};

// Status messages in German (kept for fallback, but now handled by translations)
export const STATUS_MESSAGES = {
  idle: 'Bereit',
  connecting: 'Verbinde...',
  listening: 'Höre zu...',
  speaking: 'Antworte...',
  error: 'Fehler'
};
