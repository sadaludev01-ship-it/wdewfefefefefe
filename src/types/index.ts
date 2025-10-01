// App state types
export type AppState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

// Configuration types
export interface AppConfig {
  systemPrompt: string;
  greeting: string;
  volume: number;
  showSubtitles: boolean;
  voice: 'nova' | 'shimmer' | 'echo' | 'onyx' | 'fable' | 'alloy' | 'ash' | 'sage' | 'coral';
  vadThreshold: number;
  silenceDurationMs: number;
  prefixPaddingMs: number;
  turnDetectionType: 'server_vad' | 'semantic_vad';
  temperature: number;
  aiLanguage?: 'de' | 'en';
  micGain?: number; // 0.5 .. 3.0
  ttsProvider?: 'openai' | 'coqui' | 'piper';
  ttsModel?: string;
  // Provider-specific settings
  openaiSpeed?: number; // OpenAI speed control (0.25-4.0)
  piperSpeed?: number; // Piper speed control (0.5-2.0)
  piperPitch?: number; // Piper pitch control (0.5-2.0)
  coquiSettings?: {
    temperature?: number;
    length_penalty?: number;
    repetition_penalty?: number;
    top_k?: number;
    top_p?: number;
  };
}

// Audio types
export interface AudioSettings {
  sampleRate: number;
  channels: number;
}

// WebRTC connection state
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Error types
export interface AppError {
  type: 'microphone' | 'connection' | 'api' | 'general';
  message: string;
}

// Admin interface
export interface AdminSettings extends AppConfig {
  adminPassword: string;
}

// OpenAI Realtime API event types
export interface RealtimeEvent {
  type: string;
  [key: string]: any;
}

export interface AudioData {
  data: ArrayBuffer;
  sampleRate: number;
}

// Debug metrics for developer console
export interface DebugMetrics {
  rawGptResponse?: string;
  audioStreamStatus?: 'idle' | 'processing' | 'playing';
  latencyMs?: number;
  sttMs?: number;
  llmMs?: number;
  ttsMs?: number;
  totalMs?: number;
  tokensUsed?: number;
  estimatedCost?: number;
  lastRequestTime?: number;
  lastResponseTime?: number;
  conversationId?: string;
}

// Predefined personality profiles
export interface PersonalityProfile {
  id: string;
  name: string;
  systemPrompt: string;
  description?: string;
  lang?: 'de' | 'en';
}

// Firebase settings interface
export interface FirebaseSettings extends AppConfig {
  lastUpdated?: number;
  updatedBy?: string;
}
