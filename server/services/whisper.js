/**
 * Speech-to-Text Service
 * Supports multiple providers: OpenAI Whisper, Local Whisper (future)
 */

// Ensure fetch is available (Node 18+ has global fetch)
const ensureFetch = () => {
  if (typeof fetch === 'undefined') {
    global.fetch = (...args) => import('node-fetch').then(({ default: fetchImpl }) => fetchImpl(...args));
  }
};
ensureFetch();

// Ensure FormData and Blob are available (Node 18+ via undici)
try {
  if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { FormData: UndiciFormData, Blob: UndiciBlob } = require('undici');
    // Attach to global for downstream usage
    if (typeof FormData === 'undefined') global.FormData = UndiciFormData;
    if (typeof Blob === 'undefined') global.Blob = UndiciBlob;
  }
} catch (_) {
  // ignore; will fail later with a clearer error if needed
}

// Centralized config
const cfg = require('../config');

class WhisperService {
  constructor() {
    this.provider = (cfg.providers?.STT || 'openai');
    this.apiKey = cfg.openaiApiKey;
    this.model = cfg.models?.stt || 'whisper-1';
  }

  /**
   * Transcribe audio buffer to text
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} mimetype - Audio MIME type
   * @param {string} originalname - Original filename
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} Transcribed text
   */
  async transcribe(audioBuffer, mimetype = 'audio/webm', originalname = 'audio.webm', options = {}) {
    const { language = 'de' } = options;

    switch (this.provider) {
      case 'openai':
        return await this._transcribeOpenAI(audioBuffer, mimetype, originalname, language);
      case 'local':
        // Future implementation for local Whisper
        throw new Error('Local Whisper not implemented yet');
      default:
        throw new Error(`Unknown STT provider: ${this.provider}`);
    }
  }

  /**
   * OpenAI Whisper API transcription
   */
  async _transcribeOpenAI(audioBuffer, mimetype, originalname, language) {
    // Read API key at call-time to avoid issues with load order
    const apiKey = cfg.openaiApiKey || this.apiKey;
    if (!apiKey) {
      throw new Error('Missing OPENAI_API_KEY for Whisper service');
    }

    const formData = new FormData();
    const fileName = originalname || `audio.${(mimetype && mimetype.split('/')[1]) || 'webm'}`;
    const blob = new Blob([audioBuffer], { type: mimetype });
    
    formData.append('file', blob, fileName);
    formData.append('model', this.model);
    formData.append('language', language);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper transcription failed: ${errorText}`);
    }

    const data = await response.json();
    const text = (data && (data.text || data.transcription || data.data || '')) || '';
    
    if (!text.trim()) {
      throw new Error('Empty transcription result');
    }

    return text.trim();
  }

  /**
   * Future: Local Whisper implementation
   */
  async _transcribeLocal(audioBuffer, options) {
    const endpoint = cfg.local?.sttEndpoint;
    if (!endpoint) {
      throw new Error('Local STT endpoint not configured');
    }
    const language = options?.language || 'de';

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: options?.mimetype || 'audio/webm' });
    formData.append('file', blob, options?.originalname || 'audio.webm');
    formData.append('language', language);

    const response = await fetch(`${endpoint.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Local Whisper transcription failed: ${errorText}`);
    }
    const data = await response.json();
    const text = (data && (data.text || data.transcription || '')) || '';
    if (!text.trim()) {
      throw new Error('Empty transcription result');
    }
    return text.trim();
  }
}

// Export singleton instance
const whisperService = new WhisperService();
module.exports = whisperService;
