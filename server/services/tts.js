/**
 * Text-to-Speech Service
 * Supports multiple providers: OpenAI TTS, Local Coqui/Piper (future)
 */

// Ensure fetch is available (Node 18+ has global fetch)
const ensureFetch = () => {
  if (typeof fetch === 'undefined') {
    global.fetch = (...args) => import('node-fetch').then(({ default: fetchImpl }) => fetchImpl(...args));
  }
};
ensureFetch();

// Centralized config
const cfg = require('../config');

class TTSService {
  constructor() {
    this.provider = (cfg.providers?.TTS || 'openai');
    this.apiKey = cfg.openaiApiKey;
    this.model = cfg.models?.tts || 'tts-1';
    this.localEndpoint = cfg.local?.ttsEndpoint || 'http://localhost:5002';
    this.allowedVoices = cfg.allowedVoices || new Set(['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral']);
  }

  /**
   * Convert text to speech and return readable stream
   * @param {string} text - Text to convert to speech
   * @param {Object} options - TTS options
   * @returns {Promise<ReadableStream>} Audio stream
   */
  async synthesize(text, options = {}) {
    const { 
      voice = 'alloy',
      speed = 1.0,
      pitch = 1.0,
      language = 'de',
      provider = this.provider,  // Allow provider override from request
      model = this.model,         // Allow model override from request
      temperature = 0.7           // For Coqui TTS
    } = options;

    console.log('🎙️ TTS Synthesis:', { provider, model, voice, speed, pitch, language });

    // Sanitize voice to allowed values (for OpenAI)
    const sanitizedVoice = this.allowedVoices.has(voice) ? voice : 'alloy';
    
    // Use provider from options (allows request to override default)
    const activeProvider = provider || this.provider;
    const activeModel = model || this.model;

    switch (activeProvider) {
      case 'openai':
        return await this._synthesizeOpenAI(text, sanitizedVoice, speed, activeModel);
      case 'coqui':
        return await this._synthesizeCoqui(text, voice, language, temperature, activeModel);
      case 'piper':
        return await this._synthesizePiper(text, voice, language, speed, pitch);
      default:
        throw new Error(`Unknown TTS provider: ${activeProvider}`);
    }
  }

  /**
   * OpenAI TTS synthesis
   */
  async _synthesizeOpenAI(text, voice, speed = 1.0, model = 'tts-1') {
    if (!this.apiKey) {
      throw new Error('Missing OPENAI_API_KEY for TTS service');
    }

    // Always use tts-1 model (hardcoded for production)
    const fixedModel = 'tts-1';
    
    // Clamp speed to OpenAI's allowed range (0.25 - 4.0)
    const clampedSpeed = Math.max(0.25, Math.min(4.0, speed || 1.0));

    console.log(`🤖 OpenAI TTS: voice=${voice}, speed=${clampedSpeed.toFixed(2)}×, model=${fixedModel}`);

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        model: fixedModel,
        voice: voice,
        input: text,
        speed: 1
      })
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI TTS failed: ${errorText}`);
    }

    return response.body;
  }

  /**
   * Coqui TTS synthesis
   */
  async _synthesizeCoqui(text, voice, language, temperature = 0.7, model = null) {
    try {
      const coquiEndpoint = cfg.ttsServers?.coqui?.endpoint || this.localEndpoint;
      const requestBody = {
        text: text,
        language: language
      };
      
      // Add model if provided
      if (model) {
        requestBody.model = model;
      }
      
      // Add voice/speaker_id if provided
      if (voice) {
        requestBody.speaker_id = voice;
      }
      
      // Add temperature if provided
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }
      
      console.log('🗣️ Coqui TTS Request:', { endpoint: coquiEndpoint, ...requestBody });
      
      const response = await fetch(`${coquiEndpoint}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Coqui TTS failed: ${errorText}`);
      }

      return response.body;
    } catch (error) {
      throw new Error(`Coqui TTS service unavailable: ${error.message}`);
    }
  }

  /**
   * Piper TTS synthesis
   */
  async _synthesizePiper(text, voice, language, speed = 1.0, pitch = 1.0) {
    try {
      const piperEndpoint = cfg.ttsServers?.piper?.endpoint || this.localEndpoint;
      const requestBody = {
        text: text,
        language: language
      };
      
      // Add voice if provided
      if (voice) {
        requestBody.voice = voice;
      }
      
      // Add speed if not default
      if (speed && speed !== 1.0) {
        requestBody.speed = speed;
      }
      
      // Add pitch if not default
      if (pitch && pitch !== 1.0) {
        requestBody.pitch = pitch;
      }
      
      console.log('🎵 Piper TTS Request:', { endpoint: piperEndpoint, ...requestBody });
      
      const response = await fetch(`${piperEndpoint}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'audio/wav'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Piper TTS failed: ${errorText}`);
      }

      return response.body;
    } catch (error) {
      throw new Error(`Piper TTS service unavailable: ${error.message}`);
    }
  }

  /**
   * Get content type for the current provider
   */
  getContentType() {
    switch (this.provider) {
      case 'openai':
        return 'audio/mpeg';
      case 'coqui':
      case 'piper':
        return 'audio/wav';
      default:
        return 'audio/mpeg';
    }
  }
}

// Export singleton instance
const ttsService = new TTSService();
module.exports = ttsService;
