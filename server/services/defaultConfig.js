// Default configuration for backend
const DEFAULT_CONFIG = {
  systemPrompt: `You are a helpful, friendly assistant. Reply concisely and in English.`,
  greeting: 'Hi, how are you?',
  volume: 80,
  showSubtitles: false,
  voice: 'alloy',
  vadThreshold: 0,
  silenceDurationMs: 500,
  prefixPaddingMs: 300,
  turnDetectionType: 'server_vad',
  temperature: 0.8,
  aiLanguage: 'en',
  micGain: 1.5,
  ttsProvider: 'openai', // Default provider
  ttsModel: 'tts-1',
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

module.exports = {
  DEFAULT_CONFIG
};
