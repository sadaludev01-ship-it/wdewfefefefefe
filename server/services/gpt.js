/**
 * Chat Completion Service (LLM)
 * Supports multiple providers: OpenAI GPT, Local LLaMA (future)
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

class GPTService {
  constructor() {
    this.provider = (cfg.providers?.LLM || 'openai');
    this.apiKey = cfg.openaiApiKey;
    this.model = cfg.models?.llm || 'gpt-4o-mini';
    this.localEndpoint = cfg.local?.llmEndpoint || 'http://localhost:11434'; // Ollama default
  }

  /**
   * Generate chat completion
   * @param {string} userText - User input text
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Assistant response text
   */
  async generateResponse(userText, options = {}) {
    const {
      systemPrompt = 'Du bist ein hilfreicher, freundlicher Assistent. Antworte knapp, präzise und auf Deutsch.',
      temperature = 0.7,
      maxTokens = 1000,
      aiLanguage = 'de'
    } = options;

    switch (this.provider) {
      case 'openai':
        return await this._generateOpenAI(userText, systemPrompt, temperature, maxTokens, aiLanguage);
      case 'ollama':
        return await this._generateOllama(userText, systemPrompt, temperature, maxTokens);
      case 'local':
        return await this._generateLocal(userText, systemPrompt, temperature, maxTokens);
      default:
        throw new Error(`Unknown LLM provider: ${this.provider}`);
    }
  }

  /**
   * OpenAI GPT API completion
   */
  async _generateOpenAI(userText, systemPrompt, temperature, maxTokens, aiLanguage = 'de') {
    if (!this.apiKey) {
      throw new Error('Missing OPENAI_API_KEY for GPT service');
    }

    const langRules = (aiLanguage === 'en')
      ? 'Important: Always reply in English, concisely.'
      : 'Wichtige Regeln: Antworte stets auf Deutsch und halte dich kurz.';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        temperature: Math.max(0, Math.min(2, temperature)),
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: `${systemPrompt}\n\n${langRules}` },
          { role: 'user', content: userText }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI GPT completion failed: ${errorText}`);
    }

    const data = await response.json();
    const assistantText = data?.choices?.[0]?.message?.content?.trim?.() || '';
    
    if (!assistantText) {
      throw new Error('Empty GPT response');
    }

    return assistantText;
  }

  /**
   * Future: Ollama local LLM completion
   */
  async _generateOllama(userText, systemPrompt, temperature, maxTokens) {
    try {
      const response = await fetch(`${this.localEndpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model || 'llama2',
          prompt: `${systemPrompt}\n\nUser: ${userText}\n\nAssistant:`,
          temperature: temperature,
          max_tokens: maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama completion failed: ${errorText}`);
      }

      const data = await response.json();
      const assistantText = data?.response?.trim?.() || '';
      
      if (!assistantText) {
        throw new Error('Empty Ollama response');
      }

      return assistantText;
    } catch (error) {
      throw new Error(`Ollama service unavailable: ${error.message}`);
    }
  }

  /**
   * Future: Generic local LLM completion (LM Studio, TGI, etc.)
   */
  async _generateLocal(userText, systemPrompt, temperature, maxTokens) {
    try {
      // OpenAI-compatible endpoint for LM Studio, TGI, etc.
      const response = await fetch(`${this.localEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model || 'local-model',
          temperature: Math.max(0, Math.min(2, temperature)),
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local LLM completion failed: ${errorText}`);
      }

      const data = await response.json();
      const assistantText = data?.choices?.[0]?.message?.content?.trim?.() || '';
      
      if (!assistantText) {
        throw new Error('Empty local LLM response');
      }

      return assistantText;
    } catch (error) {
      throw new Error(`Local LLM service unavailable: ${error.message}`);
    }
  }
}

// Export singleton instance
const gptService = new GPTService();
module.exports = gptService;
