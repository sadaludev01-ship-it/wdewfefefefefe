// Backend Firebase settings service
const { getDatabase, firebaseConfig } = require('../config/firebase');

// Ensure fetch is available (Node 18+ has global fetch). For older Node, lazy-import node-fetch
function ensureFetch() {
  if (typeof fetch === 'undefined') {
    global.fetch = (...args) => import('node-fetch').then(({ default: fetchImpl }) => fetchImpl(...args));
  }
}
ensureFetch();
const { DEFAULT_CONFIG } = require('./defaultConfig');

const SETTINGS_PATH = 'buddy-voice-settings';
const PROFILES_PATH = 'personality-profiles';

class FirebaseSettingsService {
  constructor() {
    this.database = null;
    this.settingsCache = null;
    this.profilesCache = null;
    this.listeners = [];
    this.isInitialized = false;
    this.initializationPromise = null;
    this.pollIntervalMs = 2000; // 2s near realtime
    this.pollTimer = null;
    this.restBaseUrl = (firebaseConfig && firebaseConfig.databaseURL) ? firebaseConfig.databaseURL.replace(/\/$/, '') : '';
  }

  /**
   * Initialize Firebase connection and set up listeners
   */
  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    return this.initializationPromise;
  }

  async _doInitialize() {
    try {
      this.database = getDatabase();

      console.log('Initializing Firebase settings service...');

      if (this.database) {
        // Admin SDK available: use native listeners
        await this.loadSettings();
        // After loading, check and sync environment variables
        await this.syncEnvToFirebase();
        this.setupRealtimeListeners();
        this.isInitialized = true;
        console.log('Firebase settings service initialized with Admin SDK');
      } else if (this.restBaseUrl) {
        // Fallback: use REST polling (open rules required)
        await this.loadSettingsViaREST();
        // After loading, check and sync environment variables
        await this.syncEnvToFirebase();
        this.startRestPolling();
        this.isInitialized = true;
        console.log('Firebase settings service initialized with REST polling');
      } else {
        console.warn('No Firebase available, using default config');
        this.settingsCache = DEFAULT_CONFIG;
        // Still sync env vars to cache
        this.syncEnvToCache();
      }
      
    } catch (error) {
      console.error('Failed to initialize Firebase settings service:', error);
      this.settingsCache = DEFAULT_CONFIG;
      // Still sync env vars to cache
      this.syncEnvToCache();
    }
  }

  /**
   * Load settings from Firebase
   */
  async loadSettings() {
    try {
      if (!this.database) {
        return await this.loadSettingsViaREST();
      }

      const snapshot = await this.database.ref(SETTINGS_PATH).once('value');
      if (snapshot.exists()) {
        const firebaseSettings = snapshot.val();
        // Remove Firebase-specific fields
        const { lastUpdated, updatedBy, ...appConfig } = firebaseSettings;
        this.settingsCache = appConfig;
        console.log('Settings loaded from Firebase:', appConfig);
        return appConfig;
      } else {
        console.log('No settings found in Firebase, using defaults');
        this.settingsCache = DEFAULT_CONFIG;
        // Initialize Firebase with default config
        await this.saveSettings(DEFAULT_CONFIG, 'backend-initialization');
        return DEFAULT_CONFIG;
      }
    } catch (error) {
      console.error('Error loading settings from Firebase (Admin SDK):', error);
      // Fallback to REST mode if possible
      if (this.restBaseUrl) {
        try {
          console.warn('Falling back to REST polling for Firebase settings');
          // Disable Admin usage
          this.database = null;
          const cfg = await this.loadSettingsViaREST();
          this.startRestPolling();
          return cfg;
        } catch (e) {
          console.error('REST fallback also failed:', e);
        }
      }
      this.settingsCache = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Load settings via REST (fallback when Admin SDK is not available)
   */
  async loadSettingsViaREST() {
    try {
      if (!this.restBaseUrl) {
        this.settingsCache = DEFAULT_CONFIG;
        return DEFAULT_CONFIG;
      }
      const url = `${this.restBaseUrl}/${SETTINGS_PATH}.json`;
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error(`REST load failed: ${resp.status}`);
      const data = await resp.json();
      if (data && typeof data === 'object') {
        const { lastUpdated, updatedBy, ...appConfig } = data;
        this.settingsCache = { ...DEFAULT_CONFIG, ...appConfig };
        return this.settingsCache;
      }
      this.settingsCache = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    } catch (err) {
      console.error('Error loading settings via REST:', err);
      this.settingsCache = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save settings to Firebase
   */
  async saveSettings(config, updatedBy = 'backend') {
    try {
      const firebaseSettings = { ...config, lastUpdated: Date.now(), updatedBy };

      if (this.database) {
        await this.database.ref(SETTINGS_PATH).set(firebaseSettings);
        this.settingsCache = config;
        console.log('Settings saved to Firebase (Admin SDK) by:', updatedBy);
        return true;
      }

      if (this.restBaseUrl) {
        const url = `${this.restBaseUrl}/${SETTINGS_PATH}.json`;
        const resp = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(firebaseSettings) });
        if (!resp.ok) throw new Error(`REST save failed: ${resp.status}`);
        this.settingsCache = config;
        console.log('Settings saved to Firebase (REST) by:', updatedBy);
        return true;
      }

      console.warn('Firebase not available, cannot save settings');
      return false;
    } catch (error) {
      console.error('Error saving settings to Firebase:', error);
      return false;
    }
  }

  /**
   * Get current settings (from cache or default)
   */
  getCurrentSettings() {
    return this.settingsCache || DEFAULT_CONFIG;
  }

  /**
   * Setup real-time listeners for settings changes
   */
  setupRealtimeListeners() {
    if (!this.database) return;

    try {
      // Listen for settings changes
      const settingsRef = this.database.ref(SETTINGS_PATH);
      settingsRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
          const firebaseSettings = snapshot.val();
          const { lastUpdated, updatedBy, ...appConfig } = firebaseSettings;
          
          // Only update cache if it's different and not from backend
          if (updatedBy !== 'backend' && JSON.stringify(this.settingsCache) !== JSON.stringify(appConfig)) {
            this.settingsCache = appConfig;
            console.log('Settings updated from Firebase real-time listener:', appConfig, 'by:', updatedBy);
          }
        }
      });

      console.log('Real-time listeners set up for Firebase settings');
    } catch (error) {
      console.error('Error setting up Firebase real-time listeners:', error);
    }
  }

  /**
   * Start REST polling loop when Admin SDK is unavailable
   */
  startRestPolling() {
    if (!this.restBaseUrl) return;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      try {
        const latest = await this.loadSettingsViaREST();
        if (JSON.stringify(latest) !== JSON.stringify(this.settingsCache)) {
          this.settingsCache = latest;
          console.log('Settings updated via REST polling');
        }
      } catch (err) {
        // Non-fatal
      }
    }, this.pollIntervalMs);
  }

  /**
   * Load personality profiles
   */
  async loadProfiles() {
    try {
      if (!this.database) {
        return this.getDefaultProfiles();
      }

      const snapshot = await this.database.ref(PROFILES_PATH).once('value');
      if (snapshot.exists()) {
        let current = snapshot.val() || [];
        if (!Array.isArray(current)) current = [];
        // Migration step: assign lang: 'de' to any profile missing lang
        let migrated = false;
        current = current.map((p) => {
          if (p && !p.lang) { migrated = true; return { ...p, lang: 'de' }; }
          return p;
        });
        // Augment with English defaults if missing (migration safety)
        const hasEnglish = current.some((p) => p && p.lang === 'en');
        if (!hasEnglish) {
          const defaults = this.getDefaultProfiles();
          const toAdd = defaults.filter((d) => d.lang === 'en' && !current.some((c) => c.id === d.id));
          if (toAdd.length > 0) {
            current = [...current, ...toAdd];
            migrated = true;
            console.log(`Augmented profiles with ${toAdd.length} English defaults`);
          }
        }
        if (migrated) {
          await this.database.ref(PROFILES_PATH).set(current);
        }
        this.profilesCache = current;
        return current;
      } else {
        const defaultProfiles = this.getDefaultProfiles();
        this.profilesCache = defaultProfiles;
        await this.database.ref(PROFILES_PATH).set(defaultProfiles);
        return defaultProfiles;
      }
    } catch (error) {
      console.error('Error loading profiles from Firebase:', error);
      return this.getDefaultProfiles();
    }
  }

  /**
   * Get default personality profiles
   */
  getDefaultProfiles() {
    return [
      // German profiles
      {
        id: 'warmhearted-grandfather-de',
        name: 'Warmherziger Großvater',
        systemPrompt: 'Du bist ein warmherziger, älterer Mann, der ruhig, humorvoll und geduldig spricht. Du hörst aufmerksam zu und gibst hilfsreiche, ermutigende Antworten. Du sprichst Deutsch und verwendest eine freundliche, aber respektvolle Sprache. Halte deine Antworten kurz und prägnant, aber warmherzig.',
        description: 'Ein warmherziger, geduldiger älterer Herr, der aufmerksam zuhört und ermutigt',
        lang: 'de'
      },
      {
        id: 'friendly-nurse-de',
        name: 'Freundliche Krankenschwester',
        systemPrompt: 'Du bist eine freundliche, professionelle Krankenschwester, die einfühlsam und hilfsbereit ist. Du sprichst beruhigend und verständnisvoll, bist aber auch kompetent und verlässlich. Du gibst praktische Ratschläge und zeigst echte Anteilnahme.',
        description: 'Eine einfühlsame, professionelle Pflegekraft mit praktischen Ratschlägen',
        lang: 'de'
      },
      {
        id: 'witty-young-friend-de',
        name: 'Witziger junger Freund',
        systemPrompt: 'Du bist ein witziger, energiegeladener junger Freund, der das Leben leicht nimmt und gerne scherzt. Du bist optimistisch, spontan und bringst andere zum Lachen. Du sprichst locker und verwendest moderne Ausdrücke, bleibst aber respektvoll.',
        description: 'Ein humorvoller, energiegeladener Freund, der Leichtigkeit bringt',
        lang: 'de'
      },
      {
        id: 'silent-listener-de',
        name: 'Stiller Zuhörer',
        systemPrompt: 'Du bist ein ruhiger, aufmerksamer Zuhörer, der wenig spricht, aber jedes Wort sorgfältig wählt. Du stellst durchdachte Fragen und gibst bedächtige, tiefgehende Antworten. Du schätzt Stille und nachdenkliche Gespräche.',
        description: 'Ein ruhiger, nachdenklicher Zuhörer mit bedachten Antworten',
        lang: 'de'
      },
      {
        id: 'technical-expert-de',
        name: 'Technischer Experte',
        systemPrompt: 'Du bist ein technischer Experte, der komplexe Themen klar und verständlich erklärt. Du bist präzise, sachlich und hilfreich. Du liebst es, Probleme zu lösen und Wissen zu teilen. Du sprichst strukturiert und verwendest angemessene Fachbegriffe.',
        description: 'Ein sachkundiger Experte, der komplexe Themen verständlich erklärt',
        lang: 'de'
      },
      // English profiles
      {
        id: 'warmhearted-grandfather-en',
        name: 'Warmhearted Grandfather',
        systemPrompt: 'You are a warmhearted elderly gentleman who speaks calmly, with gentle humor and patience. You listen attentively and give encouraging, helpful replies. You speak English in a friendly yet respectful tone. Keep answers short and warm.',
        description: 'A kind, patient elder who listens and encourages',
        lang: 'en'
      },
      {
        id: 'friendly-nurse-en',
        name: 'Friendly Nurse',
        systemPrompt: 'You are a friendly, professional nurse who is empathetic and helpful. You speak calmly and reassuringly, while being competent and reliable. You give practical advice and show genuine care.',
        description: 'A caring, professional nurse offering comfort and practical advice',
        lang: 'en'
      },
      {
        id: 'witty-young-friend-en',
        name: 'Witty Young Friend',
        systemPrompt: 'You are a witty, energetic young friend who keeps things light and loves to joke. You are optimistic, spontaneous, and make others laugh. You speak casually using modern expressions, while staying respectful.',
        description: 'An energetic, humorous friend who brings lightness',
        lang: 'en'
      },
      {
        id: 'silent-listener-en',
        name: 'Silent Listener',
        systemPrompt: 'You are a quiet, attentive listener who speaks rarely, choosing every word carefully. You ask thoughtful questions and give measured, insightful replies. You value silence and reflective conversation.',
        description: 'A quiet, thoughtful listener with measured responses',
        lang: 'en'
      },
      {
        id: 'technical-expert-en',
        name: 'Technical Expert',
        systemPrompt: 'You are a technical expert who explains complex topics clearly. You are precise, factual, and helpful. You enjoy solving problems and sharing knowledge. You speak in a structured way using appropriate technical terms.',
        description: 'A knowledgeable expert who explains complexity clearly',
        lang: 'en'
      }
    ];
  }

  /**
   * Sync environment variables to Firebase (called on startup)
   */
  async syncEnvToFirebase() {
    try {
      const cfg = require('../config');
      const currentSettings = this.settingsCache || DEFAULT_CONFIG;
      
      // Check if we need to update TTS provider from env
      const envTtsProvider = cfg.providers.TTS;
      const envTtsModel = cfg.models.tts;
      
      let needsUpdate = false;
      const updatedSettings = { ...currentSettings };
      
      if (envTtsProvider && envTtsProvider !== currentSettings.ttsProvider) {
        updatedSettings.ttsProvider = envTtsProvider;
        needsUpdate = true;
        console.log(`Updating TTS provider from env: ${envTtsProvider}`);
      }
      
      if (envTtsModel && envTtsModel !== currentSettings.ttsModel) {
        updatedSettings.ttsModel = envTtsModel;
        needsUpdate = true;
        console.log(`Updating TTS model from env: ${envTtsModel}`);
      }
      
      // For Piper, try to detect available voices if provider is piper
      if (envTtsProvider === 'piper') {
        const piperVoices = await this.detectPiperVoices();
        if (piperVoices.length > 0) {
          updatedSettings.piperVoices = piperVoices;
          needsUpdate = true;
          console.log(`Detected ${piperVoices.length} Piper voices`);
        }
      }
      
      if (needsUpdate) {
        await this.saveSettings(updatedSettings, 'backend-env-sync');
        console.log('Environment variables synced to Firebase');
      }
      
    } catch (error) {
      console.error('Error syncing environment variables to Firebase:', error);
    }
  }

  /**
   * Sync environment variables to local cache only
   */
  syncEnvToCache() {
    try {
      const cfg = require('../config');
      const currentSettings = this.settingsCache || DEFAULT_CONFIG;
      
      const envTtsProvider = cfg.providers.TTS;
      const envTtsModel = cfg.models.tts;
      
      if (envTtsProvider) {
        currentSettings.ttsProvider = envTtsProvider;
      }
      if (envTtsModel) {
        currentSettings.ttsModel = envTtsModel;
      }
      
      this.settingsCache = currentSettings;
      console.log('Environment variables synced to local cache');
      
    } catch (error) {
      console.error('Error syncing environment variables to cache:', error);
    }
  }

  /**
   * Detect available Piper voices with API-first, local fallback
   */
  async detectPiperVoices() {
    const cfg = require('../config');
    const piperConfig = cfg.ttsServers.piper;
    
    // Step 1: Try API first
    try {
      const voicesUrl = `${piperConfig.endpoint}${piperConfig.voicesRoute}`;
      console.log(`Detecting Piper voices from API: ${voicesUrl}`);
      
      const response = await fetch(voicesUrl, {
        method: 'GET',
        timeout: 6000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AI-Voice-Chat-Firebase/1.0'
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
          console.log(`✅ Detected ${voices.length} Piper voices from API server`);
          return voices.sort();
        }
      }
      
      console.log(`⚠️ Piper API failed (status: ${response.status}), trying local fallback...`);
    } catch (error) {
      console.log(`⚠️ Piper API error: ${error.message}, trying local fallback...`);
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
              console.log(`✅ Detected ${voices.length} Piper voices locally in ${modelsPath}`);
              return voices;
            }
          }
        } catch (err) {
          // Continue to next path
        }
      }
      
      console.log('❌ No Piper voices found in API or local folders');
      return [];
      
    } catch (error) {
      console.error('Error scanning local Piper folders:', error.message);
      return [];
    }
  }

  /**
   * Cleanup listeners
   */
  cleanup() {
    if (this.database && this.listeners.length > 0) {
      this.database.ref(SETTINGS_PATH).off();
      this.listeners = [];
      console.log('Firebase listeners cleaned up');
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

// Export singleton instance
const firebaseSettingsService = new FirebaseSettingsService();
module.exports = firebaseSettingsService;
