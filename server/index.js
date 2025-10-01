const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// Load environment variables BEFORE importing service modules
dotenv.config();
const multer = require('multer');
const { Readable } = require('stream');
const cfg = require('./config');
console.log("👉 process.env.PORT =", process.env.PORT);
console.log("👉 cfg.port =", cfg.port);
const path = require('path');
const fs = require('fs');

// Initialize Firebase
const { initializeFirebase } = require('./config/firebase');
const firebaseSettingsService = require('./services/firebaseSettings');


// Ensure fetch is available (Node 18+ has global fetch)
const ensureFetch = () => {
  if (typeof fetch === 'undefined') {
    // Lazy import node-fetch for older Node versions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    global.fetch = (...args) => import('node-fetch').then(({ default: fetchImpl }) => fetchImpl(...args));
  }
};
ensureFetch();

// Import AI services (after dotenv is configured so they can read env vars)
const whisperService = require('./services/whisper');
const gptService = require('./services/gpt');
const ttsService = require('./services/tts');

const app = express();
const PORT = cfg.port || 3001;

app.use(cors());
app.use(express.json());
// In-memory file uploads (no disk writes)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// API endpoint to get available TTS models for current provider
app.get('/api/tts/models', async (req, res) => {
  try {
    const currentSettings = firebaseSettingsService.getCurrentSettings();
    const provider = currentSettings.ttsProvider || cfg.providers.TTS || 'openai';
    
    let models = [];
    let modelsFound = true;
    
    let source = 'static';
    
    switch (provider) {
      case 'openai':
        models = ['tts-1', 'tts-1-hd'];
        modelsFound = true; // OpenAI always has predefined models
        source = 'static';
        break;
        
      case 'piper':
        const piperResult = await getPiperModels();
        models = piperResult.models;
        modelsFound = piperResult.found;
        source = piperResult.source || 'unknown';
        break;
        
      case 'coqui':
        const coquiResult = await getCoquiModels();
        models = coquiResult.models;
        modelsFound = coquiResult.found;
        source = coquiResult.source || 'unknown';
        break;
        
      default:
        models = ['tts-1'];
        modelsFound = true;
        source = 'fallback';
    }
    
    res.json({ provider, models, modelsFound, source });
  } catch (error) {
    console.error('Error fetching TTS models:', error);
    res.status(500).json({ error: 'Failed to fetch TTS models', details: error.message });
  }
});

// Get available Piper voices from external TTS server with local fallback
async function getPiperModels() {
  const piperConfig = cfg.ttsServers.piper;
  
  // Step 1: Try API first
  try {
    const voicesUrl = `${piperConfig.endpoint}${piperConfig.voicesRoute}`;
    console.log(`Fetching Piper voices from API: ${voicesUrl}`);
    
    const response = await fetch(voicesUrl, {
      method: 'GET',
      timeout: 8000, // 8 second timeout for API
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Voice-Chat/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Handle different response formats
      let voices = [];
      if (Array.isArray(data)) {
        voices = data;
      } else if (data.voices && Array.isArray(data.voices)) {
        voices = data.voices;
      } else if (data.models && Array.isArray(data.models)) {
        voices = data.models;
      } else if (typeof data === 'object' && Object.keys(data).length > 0) {
        voices = Object.keys(data);
      }
      
      if (voices.length > 0) {
        console.log(`✅ Found ${voices.length} Piper voices from API server`);
        return { models: voices.sort(), found: true, source: 'api' };
      }
    }
    
    console.log(`⚠️ Piper API responded with status: ${response.status}, trying local fallback...`);
  } catch (error) {
    console.log(`⚠️ Piper API failed: ${error.message}, trying local fallback...`);
  }
  
  // Step 2: Fallback to local folder scanning
  try {
    const fs = require('fs');
    const path = require('path');
    
    const possiblePaths = [
      piperConfig.localPath,
      '/app/models',
      './models', 
      '../models',
      './piper-models'
    ];
    
    console.log(`Scanning local Piper folders: ${possiblePaths.join(', ')}`);
    
    for (const modelsPath of possiblePaths) {
      try {
        if (fs.existsSync(modelsPath)) {
          const files = fs.readdirSync(modelsPath);
          const voices = files
            .filter(file => file.endsWith('.onnx'))
            .map(file => file.replace('.onnx', ''))
            .sort();
          
          if (voices.length > 0) {
            console.log(`✅ Found ${voices.length} Piper voices locally in ${modelsPath}`);
            return { models: voices, found: true, source: 'local' };
          }
        }
      } catch (err) {
        // Continue to next path
      }
    }
    
    console.log('❌ No Piper voices found in API or local folders');
    return { models: [], found: false, source: 'none' };
    
  } catch (error) {
    console.error('Error scanning local Piper folders:', error.message);
    return { models: [], found: false, source: 'error' };
  }
}

// Get available Coqui models from external TTS server with local fallback
async function getCoquiModels() {
  const coquiConfig = cfg.ttsServers.coqui;
  
  // Step 1: Try API first
  try {
    const modelsUrl = `${coquiConfig.endpoint}${coquiConfig.modelsRoute}`;
    console.log(`Fetching Coqui models from API: ${modelsUrl}`);
    
    const response = await fetch(modelsUrl, {
      method: 'GET',
      timeout: 8000, // 8 second timeout for API
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AI-Voice-Chat/1.0'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Handle different response formats
      let models = [];
      if (Array.isArray(data)) {
        models = data;
      } else if (data.models && Array.isArray(data.models)) {
        models = data.models;
      } else if (data.voices && Array.isArray(data.voices)) {
        models = data.voices;
      } else if (typeof data === 'object' && Object.keys(data).length > 0) {
        models = Object.keys(data);
      }
      
      if (models.length > 0) {
        console.log(`✅ Found ${models.length} Coqui models from API server`);
        return { models: models.sort(), found: true, source: 'api' };
      }
    }
    
    console.log(`⚠️ Coqui API responded with status: ${response.status}, trying local fallback...`);
  } catch (error) {
    console.log(`⚠️ Coqui API failed: ${error.message}, trying local fallback...`);
  }
  
  // Step 2: Fallback to local folder scanning
  try {
    const fs = require('fs');
    const path = require('path');
    
    const possiblePaths = [
      coquiConfig.localPath,
      '/app/coqui-models',
      './coqui-models',
      '../coqui-models',
      './models/coqui'
    ];
    
    console.log(`Scanning local Coqui folders: ${possiblePaths.join(', ')}`);
    
    for (const modelsPath of possiblePaths) {
      try {
        if (fs.existsSync(modelsPath)) {
          const files = fs.readdirSync(modelsPath);
          // Look for common Coqui model files (.json, .pth, directories)
          const models = files
            .filter(file => {
              const stat = fs.statSync(path.join(modelsPath, file));
              return stat.isDirectory() || file.endsWith('.json') || file.endsWith('.pth');
            })
            .map(file => file.replace(/\.(json|pth)$/, ''))
            .sort();
          
          if (models.length > 0) {
            console.log(`✅ Found ${models.length} Coqui models locally in ${modelsPath}`);
            return { models: models, found: true, source: 'local' };
          }
        }
      } catch (err) {
        // Continue to next path
      }
    }
    
    console.log('❌ No Coqui models found in API or local folders');
    return { models: [], found: false, source: 'none' };
    
  } catch (error) {
    console.error('Error scanning local Coqui folders:', error.message);
    return { models: [], found: false, source: 'error' };
  }
}

// API endpoint to check TTS server connectivity
app.get('/api/tts/servers/status', async (req, res) => {
  try {
    const results = {
      piper: { connected: false, endpoint: cfg.ttsServers.piper.endpoint },
      coqui: { connected: false, endpoint: cfg.ttsServers.coqui.endpoint }
    };

    // Test Piper server
    try {
      const piperUrl = `${cfg.ttsServers.piper.endpoint}${cfg.ttsServers.piper.voicesRoute}`;
      const piperResponse = await fetch(piperUrl, { method: 'GET', timeout: 5000 });
      results.piper.connected = piperResponse.ok;
      results.piper.status = piperResponse.status;
    } catch (error) {
      results.piper.error = error.message;
    }

    // Test Coqui server
    try {
      const coquiUrl = `${cfg.ttsServers.coqui.endpoint}${cfg.ttsServers.coqui.modelsRoute}`;
      const coquiResponse = await fetch(coquiUrl, { method: 'GET', timeout: 5000 });
      results.coqui.connected = coquiResponse.ok;
      results.coqui.status = coquiResponse.status;
    } catch (error) {
      results.coqui.error = error.message;
    }

    res.json(results);
  } catch (error) {
    console.error('Error checking TTS server status:', error);
    res.status(500).json({ error: 'Failed to check server status', details: error.message });
  }
});

// Initialize Firebase and settings service
async function initializeServices() {
  try {
    console.log('Initializing Firebase...');
    initializeFirebase();
    await firebaseSettingsService.initialize();
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Service initialization failed:', error);
  }
}

// Initialize services on startup
initializeServices();

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Version endpoint
app.get('/api/version', (req, res) => {
  const packageJson = require('../package.json');
  res.json({ 
    version: packageJson.version,
    name: packageJson.name
  });
});

// Provider/Config health snapshot (shallow)
app.get('/api/providers/health', (req, res) => {
  res.json({
    ok: true,
    providers: cfg.providers,
    models: cfg.models,
    openaiKeyPresent: Boolean(cfg.openaiApiKey),
    firebaseEnabled: firebaseSettingsService.isInitialized
  });
});

// Get current Firebase settings
app.get('/api/firebase/settings', (req, res) => {
  try {
    const settings = firebaseSettingsService.getCurrentSettings();
    res.json({
      ok: true,
      settings,
      source: 'firebase',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting Firebase settings:', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to get settings',
      source: 'fallback'
    });
  }
});


// Admin authentication using ADMIN_PASSWORD environment variable
app.post('/api/admin/auth', (req, res) => {
  try {
    const { password } = req.body || {};
    const adminPassword = cfg.adminPassword;
    if (!adminPassword) {
      return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD not set on server' });
    }
    if (password && password === adminPassword) {
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  } catch (err) {
    console.error('Admin auth error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});

// STT -> LLM -> TTS pipeline endpoint with Firebase settings integration
app.post('/api/voice/process', upload.single('audio'), async (req, res) => {
  try {
    const isTestMode = req.body.testMode === 'true';
    
    if (!req.file && !isTestMode) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // PRIORITY: Use request body parameters (from frontend), fallback to Firebase for dev routes
    // This allows home route to use local admin settings, dev routes to use Firebase settings
    
    const firebaseSettings = firebaseSettingsService.getCurrentSettings();
    
    // Check if request has config parameters (indicates home route with local config)
    const hasRequestConfig = req.body && (
      req.body.systemPrompt || 
      req.body.voice || 
      req.body.temperature ||
      req.body.ttsProvider
    );

    if (hasRequestConfig) {
      console.log('✅ Using request config (home route / local admin settings)');
    } else {
      console.log('🔧 Using Firebase config (dev route / no request config)');
    }

    // Use request parameters FIRST, then Firebase as fallback
    const language = (req.body && req.body.language) || firebaseSettings.aiLanguage || 'de';
    // System Prompt – garantiert Buddy als warmherziger älterer Mann
const systemPrompt = (req.body && req.body.systemPrompt) 
    || firebaseSettings.systemPrompt 
    || (language === 'en'
          ? 'You are a helpful, friendly assistant. Reply concisely and in English.'
          : 'Du bist Buddy, ein warmherziger älterer Mann, der ruhig, humorvoll und geduldig spricht. '
            + 'Du hörst aufmerksam zu und gibst hilfreiche, ermutigende Antworten. '
            + 'Du sprichst Deutsch und verwendest eine freundliche, respektvolle Sprache. '
            + 'Halte deine Antworten kurz und prägnant, aber warmherzig.');
    const temperature = (req.body && req.body.temperature ? Math.max(0, Math.min(2, parseFloat(req.body.temperature))) : null) || 
                       firebaseSettings.temperature || 0.7;
    const voice = (req.body && req.body.voice) || firebaseSettings.voice || 'alloy';
    const ttsProvider = (req.body && req.body.ttsProvider) || firebaseSettings.ttsProvider || 'openai';
    const ttsModel = (req.body && req.body.ttsModel) || firebaseSettings.ttsModel || 'tts-1';
    
    // Provider-specific TTS settings
    const openaiSpeed = (req.body && req.body.openaiSpeed ? parseFloat(req.body.openaiSpeed) : null) || firebaseSettings.openaiSpeed || 1.0;
    const piperSpeed = (req.body && req.body.piperSpeed ? parseFloat(req.body.piperSpeed) : null) || firebaseSettings.piperSpeed || 1.0;
    const piperPitch = (req.body && req.body.piperPitch ? parseFloat(req.body.piperPitch) : null) || firebaseSettings.piperPitch || 1.0;
    const coquiTemperature = (req.body && req.body.coquiTemperature ? parseFloat(req.body.coquiTemperature) : null) || 
                            (firebaseSettings.coquiSettings && firebaseSettings.coquiSettings.temperature) || 0.7;

    console.log('Using config for voice processing:', {
      source: hasRequestConfig ? 'request (local)' : 'firebase (dev)',
      systemPrompt: systemPrompt.substring(0, 50) + '...',
      voice,
      temperature,
      aiLanguage: language,
      ttsProvider,
      ttsModel
    });

    // Timings
    const tStart = Date.now();
    let sttMs = 0, llmMs = 0, ttsMs = 0;
    // 1) Transcribe with STT service (or use test message)
    const sttStart = Date.now();
    let userText;
    let assistantText;
    
    if (isTestMode && req.body.message) {
      userText = req.body.message;
      console.log(`🧪 Test mode: Using message "${userText}"`);
    } else {
      userText = await whisperService.transcribe(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        { language }
      );
    }
    const sttEnd = Date.now();
    sttMs = sttEnd - sttStart;

    // 2) Generate response with LLM service (skip if test mode)
    const llmStart = Date.now();
    if (isTestMode) {
      // Test mode: use the test message directly as TTS input (TTS-only test)
      assistantText = userText;
      console.log(`🔊 Test mode: Skipping LLM, using test message for TTS`);
    } else {
      assistantText = await gptService.generateResponse(userText, {
        systemPrompt,
        temperature,
        aiLanguage: language
      });
    }
    const llmEnd = Date.now();
    llmMs = llmEnd - llmStart;

    // 3) Synthesize speech with TTS service (with provider-specific settings)
    const ttsStart = Date.now();
    const ttsOptions = {
      voice,
      language,
      provider: ttsProvider,
      model: ttsModel,
      // Provider-specific options
      speed: ttsProvider === 'openai' ? openaiSpeed : (ttsProvider === 'piper' ? piperSpeed : 1.0),
      pitch: piperPitch || 1.0,
      temperature: coquiTemperature
    };
    const audioStream = await ttsService.synthesize(assistantText, ttsOptions);
    const ttsEnd = Date.now();
    ttsMs = ttsEnd - ttsStart;

    // Set audio headers and stream
    res.setHeader('Content-Type', ttsService.getContentType());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Duration', '0');
    
    // Add debug headers for developer console
    res.setHeader('X-GPT-Response', Buffer.from(assistantText).toString('base64'));
    res.setHeader('X-User-Input', Buffer.from(userText).toString('base64'));
    const totalMs = Date.now() - tStart;
    res.setHeader('X-Processing-Time', String(totalMs));
    res.setHeader('X-STT-Duration', String(sttMs));
    res.setHeader('X-LLM-Duration', String(llmMs));
    res.setHeader('X-TTS-Duration', String(ttsMs));
    // Expose custom headers so the browser can read them via fetch
    res.setHeader('Access-Control-Expose-Headers', 'X-GPT-Response, X-User-Input, X-Processing-Time, X-STT-Duration, X-LLM-Duration, X-TTS-Duration');

    // Convert Web ReadableStream to Node Readable and pipe to response
    if (typeof Readable.fromWeb === 'function') {
      Readable.fromWeb(audioStream).pipe(res);
    } else {
      // Fallback: manual reader pump
      const reader = audioStream.getReader();
      res.on('close', () => {
        try { reader.cancel(); } catch {}
      });
      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise(resolve => res.once('drain', resolve));
          }
        }
        res.end();
      };
      pump().catch(() => res.end());
    }
  } catch (err) {
    console.error('Voice pipeline error:', err);
    
    // Return appropriate error based on the error message
    if (err.message.includes('Whisper') || err.message.includes('transcription')) {
      return res.status(500).json({ error: 'STT service failed', details: err.message });
    } else if (err.message.includes('GPT') || err.message.includes('LLM')) {
      return res.status(500).json({ error: 'LLM service failed', details: err.message });
    } else if (err.message.includes('TTS')) {
      return res.status(500).json({ error: 'TTS service failed', details: err.message });
    } else {
      return res.status(500).json({ error: 'Server error in voice pipeline', details: err.message });
    }
  }
});

// Serve static frontend build if present (Railway single service deployment)
try {
  const buildPath = path.join(__dirname, '..', 'build');
  if (fs.existsSync(buildPath)) {
    console.log('✅ Serving static files from:', buildPath);
    app.use(express.static(buildPath));
    
    // Handle client-side routing (React Router) - must be AFTER all API routes
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      console.log('📄 Serving index.html for route:', req.path);
      res.sendFile(path.join(buildPath, 'index.html'));
    });
  } else {
    console.log('⚠️ Build directory not found:', buildPath);
  }
} catch (e) {
  console.error('❌ Error setting up static file serving:', e);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Realtime auth server listening on http://0.0.0.0:${PORT}`);
});
