// Debug service for tracking conversation metrics
import { DebugMetrics } from '../types';

class DebugService {
  private metrics: DebugMetrics = {
    audioStreamStatus: 'idle',
    latencyMs: 0,
    sttMs: 0,
    llmMs: 0,
    ttsMs: 0,
    totalMs: 0,
    tokensUsed: 0,
    estimatedCost: 0
  };

  private listeners: Array<(metrics: DebugMetrics) => void> = [];

  /**
   * Update debug metrics
   */
  updateMetrics(updates: Partial<DebugMetrics>): void {
    this.metrics = { ...this.metrics, ...updates };
    this.notifyListeners();
  }

  /**
   * Get current metrics
   */
  getMetrics(): DebugMetrics {
    return { ...this.metrics };
  }

  /**
   * Track request start
   */
  startRequest(): void {
    this.updateMetrics({
      lastRequestTime: Date.now(),
      audioStreamStatus: 'processing'
    });
  }

  /**
   * Track response received
   */
  recordResponse(gptResponse: string, tokensUsed?: number): void {
    const now = Date.now();
    const latencyMs = this.metrics.lastRequestTime ? now - this.metrics.lastRequestTime : 0;
    
    // Rough cost estimation (GPT-4o-mini: $0.15/1M input, $0.60/1M output tokens)
    const estimatedCost = tokensUsed ? (tokensUsed * 0.0000006) : 0;

    this.updateMetrics({
      rawGptResponse: gptResponse,
      lastResponseTime: now,
      latencyMs,
      tokensUsed: tokensUsed || 0,
      estimatedCost,
      audioStreamStatus: 'playing'
    });
  }

  /**
   * Track audio playback completion
   */
  completeAudioPlayback(): void {
    this.updateMetrics({
      audioStreamStatus: 'idle'
    });
  }

  /**
   * Subscribe to metrics updates
   */
  subscribe(callback: (metrics: DebugMetrics) => void): () => void {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of metrics updates
   */
  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback(this.metrics);
      } catch (error) {
        console.error('Error in debug metrics listener:', error);
      }
    });
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      audioStreamStatus: 'idle',
      latencyMs: 0,
      tokensUsed: 0,
      estimatedCost: 0
    };
    this.notifyListeners();
  }

  /**
   * Generate conversation ID
   */
  generateConversationId(): string {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.updateMetrics({ conversationId: id });
    return id;
  }
}

// Export singleton instance
export const debugService = new DebugService();
export default debugService;
