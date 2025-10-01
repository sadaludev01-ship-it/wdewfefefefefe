// Alternative authentication methods for OpenAI Realtime API
// Since browser WebSockets have limitations with custom headers

export interface RealtimeConnectionOptions {
  apiKey: string;
  model?: string;
}

export const createRealtimeWebSocketConnection = async (options: RealtimeConnectionOptions): Promise<WebSocket> => {
  const { apiKey, model = 'gpt-4o-realtime-preview-2024-10-01' } = options;

  // Method 1: URL-based authentication (current approach)
  const urlWithAuth = `wss://api.openai.com/v1/realtime?model=${model}&authorization=Bearer+${encodeURIComponent(apiKey)}&openai-beta=realtime%3Dv1`;
  
  // Method 2: Alternative URL format
  const urlAlt = `wss://api.openai.com/v1/realtime?model=${model}&api-key=${apiKey}`;
  
  // Method 3: Standard URL (authentication via first message)
  const urlStandard = `wss://api.openai.com/v1/realtime?model=${model}`;

  // Try Method 1 first
  try {
    console.log('Attempting URL-based authentication...');
    const ws = new WebSocket(urlWithAuth);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      ws.onopen = () => {
        clearTimeout(timeout);
        console.log('Connected with URL-based auth');
        resolve(ws);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        ws.close();
        reject(error);
      };
    });
  } catch (error) {
    console.warn('Method 1 failed, trying alternative methods...', error);
    
    // Try Method 2: Alternative URL format
    try {
      console.log('Attempting alternative URL format...');
      const ws = new WebSocket(urlAlt);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.onopen = () => {
          clearTimeout(timeout);
          console.log('Connected with alternative URL');
          resolve(ws);
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          ws.close();
          reject(error);
        };
      });
    } catch (error2) {
      console.warn('Method 2 failed, trying method 3...', error2);
      
      // Method 3: Authentication via first message
      const ws = new WebSocket(urlStandard);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.onopen = () => {
          // Send authentication message first
          ws.send(JSON.stringify({
            type: 'auth',
            token: apiKey,
            'openai-beta': 'realtime=v1'
          }));
          
          clearTimeout(timeout);
          console.log('Connected with message-based auth');
          resolve(ws);
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          ws.close();
          reject(error);
        };
      });
    }
  }
};

// Helper function to add authentication headers to messages
export const addAuthToMessage = (message: any, apiKey: string) => {
  return {
    ...message,
    authorization: `Bearer ${apiKey}`,
    'openai-beta': 'realtime=v1'
  };
};
