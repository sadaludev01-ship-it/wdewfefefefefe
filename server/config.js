// Centralized server configuration
// Reads environment variables once and exposes provider settings, models, endpoints, and allowed voices

const dotenv = require('dotenv');
// Ensure env is loaded if not already
if (!process.env.__CONFIG_DOTENV_LOADED__) {
  dotenv.config();
  process.env.__CONFIG_DOTENV_LOADED__ = '1';
}

const cfg = {
  port: parseInt(process.env.PORT || '3001', 10),
  adminPassword: process.env.ADMIN_PASSWORD || '',

  // API keys
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Provider switches
  providers: {
    LLM: process.env.LLM_PROVIDER || 'openai',
    STT: process.env.STT_PROVIDER || 'openai',
    TTS: process.env.TTS_PROVIDER || 'openai',
  },

  // Models (defaults)
  models: {
    llm: process.env.LLM_MODEL || 'gpt-4o-mini',
    tts: process.env.TTS_MODEL || 'tts-1',
    stt: process.env.STT_MODEL || 'whisper-1',
  },

  // Allowed voices for OpenAI TTS
  allowedVoices: new Set((process.env.ALLOWED_VOICES || 'nova,shimmer,echo,onyx,fable,alloy,ash,sage,coral').split(',').map(v => v.trim()).filter(Boolean)),

  // Local endpoints for non-OpenAI providers
  local: {
    llmEndpoint: process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434', // Ollama default
    ttsEndpoint: process.env.LOCAL_TTS_ENDPOINT || 'http://localhost:5002',  // Coqui/Piper gateway
    sttEndpoint: process.env.LOCAL_STT_ENDPOINT || 'http://localhost:8001',  // faster-whisper REST (example)
  },

  // TTS Server Endpoints for Voice/Model Detection
  ttsServers: {
    piper: {
      endpoint: process.env.PIPER_TTS_ENDPOINT || 'http://localhost:59125',
      voicesRoute: process.env.PIPER_VOICES_ROUTE || '/voices',
      localPath: process.env.PIPER_MODELS_PATH || './piper-models'
    },
    coqui: {
      endpoint: process.env.COQUI_TTS_ENDPOINT || 'http://localhost:5002',
      modelsRoute: process.env.COQUI_MODELS_ROUTE || '/models',
      localPath: process.env.COQUI_MODELS_PATH || './coqui-models'
    }
  }
};

module.exports = cfg;
