import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AppConfig } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { DEFAULT_CONFIG } from '../config/constants';
import { firebaseSettingsService } from '../services/firebaseSettings';
import './Admin.css';

interface AdminProps {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onClose: () => void;
  isSessionActive?: boolean;
  onRestartSession?: () => void;
}

export const Admin: React.FC<AdminProps> = ({ config, onConfigChange, onClose, isSessionActive = false, onRestartSession }) => {
  const location = useLocation();
  const { language, setLanguage, t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [tempConfig, setTempConfig] = useState(config);
  const [saveMessage, setSaveMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsFound, setModelsFound] = useState(true);
  const [modelsSource, setModelsSource] = useState<string>('static');
  const [firebaseTtsProvider, setFirebaseTtsProvider] = useState<string>('openai');
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'processing' | 'playing'>('idle');
  const isDevRoute = location.pathname === '/dev' || location.pathname === '/debug';
  const API_BASE = process.env.NODE_ENV === 'production' 
    ? (process.env.REACT_APP_API_BASE_URL || '') 
    : '';

  // Allowed OpenAI TTS voices
  const allowedVoices: AppConfig['voice'][] = ['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral'];
  const voiceLabel = (v: AppConfig['voice']) => v.charAt(0).toUpperCase() + v.slice(1);

  // Load ALL settings from Firebase (read-only, for reset on refresh)
  const loadSettingsFromFirebase = async () => {
    try {
      const firebaseSettings = await firebaseSettingsService.loadSettings();
      
      // Reset tempConfig to Firebase values (this happens on page refresh)
      const resetConfig = {
        ...config,
        ...firebaseSettings // Firebase values take precedence
      };
      
      console.log('🔄 Admin: Loading settings from Firebase (read-only):', resetConfig);
      setTempConfig(resetConfig);
      onConfigChange(resetConfig);
    } catch (error) {
      console.error('Error loading settings from Firebase:', error);
    }
  };

  // Load available TTS models from backend
  const loadAvailableModels = async () => {
    try {
      setIsLoadingModels(true);
      const response = await fetch(`${API_BASE}/api/tts/models`);
      if (response.ok) {
        const data = await response.json();
        setAvailableModels(data.models || []);
        setModelsFound(data.modelsFound !== false);
        setModelsSource(data.source || 'unknown');
        console.log(`Loaded ${data.models.length} models for ${data.provider} provider`);
      } else {
        console.error('Failed to fetch TTS models');
        setAvailableModels([]);
        setModelsFound(false);
        setModelsSource('error');
      }
    } catch (error) {
      console.error('Error loading TTS models:', error);
      setAvailableModels([]);
      setModelsFound(false);
      setModelsSource('error');
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    // Sanitize incoming config to allowed voices
    const isValidVoice = (allowedVoices as readonly string[]).includes((config as any).voice);
    const sanitized = isValidVoice ? config : { ...config, voice: 'alloy' as AppConfig['voice'] };
    setTempConfig(sanitized);
    // Set default test message based on AI language
    const defaultMsg = (config.aiLanguage === 'en') ? "Hello, how are you?" : "Hallo, wie geht's?";
    setTestMessage(defaultMsg);
    if (!isValidVoice) {
      onConfigChange(sanitized);
    }
  }, [config]);

  // Helper function for direct config changes (NO Firebase save)
  const handleDirectConfigChange = (newConfig: AppConfig) => {
    console.log('🔧 Admin: Direct config change (no Firebase save):', newConfig);
    setTempConfig(newConfig);
    onConfigChange(newConfig); // Apply directly to frontend/backend
  };

  // Test voice - TTS only (skip STT and LLM)
  const handleTestVoice = async () => {
    if (!testMessage.trim() || isTestRunning) {
      return;
    }

    setIsTestRunning(true);
    setTestStatus('processing');
    
    try {
      const form = new FormData();
      const audioBlob = new Blob([''], { type: 'audio/webm' });
      form.append('audio', audioBlob, 'test.webm');
      form.append('testMode', 'true');
      form.append('message', testMessage);
      
      // Send TTS-specific config only
      form.append('voice', tempConfig.voice);
      form.append('language', (tempConfig.aiLanguage === 'en' ? 'en' : 'de'));
      form.append('ttsProvider', tempConfig.ttsProvider || 'openai');
      form.append('ttsModel', tempConfig.ttsModel || 'tts-1');
      
      // Provider-specific TTS settings
      if (tempConfig.openaiSpeed) form.append('openaiSpeed', String(tempConfig.openaiSpeed));
      if (tempConfig.piperSpeed) form.append('piperSpeed', String(tempConfig.piperSpeed));
      if (tempConfig.piperPitch) form.append('piperPitch', String(tempConfig.piperPitch));
      if (tempConfig.coquiSettings?.temperature) {
        form.append('coquiTemperature', String(tempConfig.coquiSettings.temperature));
      }
      
      console.log('🔊 Admin TTS Test:', {
        voice: tempConfig.voice,
        ttsProvider: tempConfig.ttsProvider,
        ttsModel: tempConfig.ttsModel,
        message: testMessage
      });

      const response = await fetch(`${API_BASE}/api/voice/process`, {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        throw new Error(`Test failed: ${response.status}`);
      }

      const audioBlob2 = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob2);
      const audio = new Audio(audioUrl);
      
      setTestStatus('playing');
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsTestRunning(false);
        setTestStatus('idle');
      };
      
      audio.onerror = () => {
        setIsTestRunning(false);
        setTestStatus('idle');
      };
      
      await audio.play();

    } catch (error) {
      console.error('Error testing voice:', error);
      setIsTestRunning(false);
      setTestStatus('idle');
      alert(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Load settings based on route - ONLY on component mount (page refresh)
  useEffect(() => {
    if (isDevRoute) {
      // Dev route: Load from Firebase for DevConsole integration
      console.log('🔧 Admin (Dev Route): Loading from Firebase on mount');
      loadSettingsFromFirebase();
    } else {
      // Home route: Use current config (from localStorage via App.tsx)
      console.log('🏠 Admin (Home Route): Using local config from props');
      setTempConfig(config);
    }
  }, []); // Only runs once on component mount (page refresh)

  // Load models when authenticated or TTS provider changes
  useEffect(() => {
    if (isAuthenticated) {
      loadAvailableModels();
    }
  }, [isAuthenticated, tempConfig.ttsProvider]);

  // Real-time Firebase listener for TTS Provider (always reads from Firebase)
  useEffect(() => {
    const unsubscribe = firebaseSettingsService.subscribeToSettings((firebaseConfig) => {
      if (firebaseConfig.ttsProvider) {
        console.log('🔄 Admin: Firebase TTS Provider updated:', firebaseConfig.ttsProvider);
        setFirebaseTtsProvider(firebaseConfig.ttsProvider);
        
        // Update local config with Firebase TTS provider
        if (tempConfig.ttsProvider !== firebaseConfig.ttsProvider) {
          const updated = { ...tempConfig, ttsProvider: firebaseConfig.ttsProvider };
          setTempConfig(updated);
          
          // Reload models for new provider
          if (isAuthenticated) {
            loadAvailableModels();
          }
        }
      }
    });

    // Load initial value
    const loadInitialProvider = async () => {
      try {
        const firebaseConfig = await firebaseSettingsService.loadSettings();
        if (firebaseConfig.ttsProvider) {
          setFirebaseTtsProvider(firebaseConfig.ttsProvider);
          
          // Update local config
          if (tempConfig.ttsProvider !== firebaseConfig.ttsProvider) {
            const updated = { ...tempConfig, ttsProvider: firebaseConfig.ttsProvider };
            setTempConfig(updated);
          }
        }
      } catch (error) {
        console.error('Failed to load Firebase TTS provider:', error);
      }
    };
    loadInitialProvider();

    return () => unsubscribe();
  }, [isAuthenticated]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch(`${API_BASE}/api/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (resp.ok) {
        setIsAuthenticated(true);
        setPassword('');
      } else {
        alert('Falsches Passwort');
        setPassword('');
      }
    } catch (err) {
      alert('Fehler bei der Anmeldung');
    }
  };

  const handleSave = () => {
    onConfigChange(tempConfig);
    setSaveMessage(t('admin.settings.saved'));
    setTimeout(() => setSaveMessage(''), 3000);
    
    // If session is active and critical settings changed, suggest restart
    if (isSessionActive && (config.systemPrompt !== tempConfig.systemPrompt || 
        config.voice !== tempConfig.voice || 
        config.vadThreshold !== tempConfig.vadThreshold ||
        config.turnDetectionType !== tempConfig.turnDetectionType)) {
      if (window.confirm('Settings that require session restart have been changed. Restart now?')) {
        onRestartSession?.();
      }
    }
  };

  const handleUpdateFromFirebase = async () => {
    const confirmMessage = language === 'de' 
      ? 'Lokale Einstellungen mit den neuesten Firebase-Einstellungen aktualisieren?'
      : 'Update local settings with latest Firebase settings?';
    
    if (window.confirm(confirmMessage)) {
      try {
        const firebaseConfig = await firebaseSettingsService.loadSettings();
        console.log('🔄 Admin: Updating local config from Firebase:', firebaseConfig);
        setTempConfig(firebaseConfig);
        onConfigChange(firebaseConfig);
        
        const successMessage = language === 'de'
          ? '✅ Einstellungen von Firebase aktualisiert'
          : '✅ Settings updated from Firebase';
        setSaveMessage(successMessage);
        setTimeout(() => setSaveMessage(''), 3000);
      } catch (error) {
        console.error('Failed to load Firebase settings:', error);
        alert(language === 'de' 
          ? '❌ Fehler beim Laden der Firebase-Einstellungen'
          : '❌ Failed to load Firebase settings');
      }
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-overlay">
        <div className="admin-card">
          <div className="admin-header">
            <h1>{t('admin.access')}</h1>
            <button className="close-btn" onClick={handleClose} aria-label={t('admin.close')}>
              ×
            </button>
          </div>
          <form onSubmit={handlePasswordSubmit}>
            <div className="group">
              <label htmlFor="password">{t('admin.password')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('admin.password.placeholder')}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <div className="actions">
              <button type="submit" disabled={!password.trim()}>
                {t('admin.login')}
              </button>
            </div>
          </form>
          
        </div>
      </div>
    );
  }

  return (
    <div className="admin-overlay">
      <div className="admin-card">
        <div className="admin-header">
          <h1>{t('admin.title')}</h1>
          <button className="close-btn" onClick={handleClose} aria-label={t('admin.close')}>
            ×
          </button>
        </div>

        {/* Route Mode Indicator */}
        <div style={{
          padding: '8px 12px',
          marginBottom: '16px',
          backgroundColor: isDevRoute ? '#dbeafe' : '#dcfce7',
          border: isDevRoute ? '1px solid #3b82f6' : '1px solid #22c55e',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: '500',
          color: isDevRoute ? '#1e40af' : '#15803d'
        }}>
          {isDevRoute 
            ? (language === 'de' 
                ? '🔧 Dev-Modus: Einstellungen werden aus Firebase geladen' 
                : '🔧 Dev Mode: Settings loaded from Firebase')
            : (language === 'de'
                ? '🏠 Lokaler Modus: Änderungen werden im Browser gespeichert'
                : '🏠 Local Mode: Changes saved to browser session')}
        </div>

        <div className="group">
          <label htmlFor="aiLanguage">{language === 'de' ? 'KI-Sprache' : 'AI Language'}</label>
          <select
            id="aiLanguage"
            value={tempConfig.aiLanguage || 'de'}
            onChange={(e) => {
              const lang = (e.target.value === 'en' ? 'en' : 'de') as 'de' | 'en';
              // Update UI language
              setLanguage(lang);
              // Update config directly (NO Firebase save)
              const updated = { ...tempConfig, aiLanguage: lang } as AppConfig;
              handleDirectConfigChange(updated);
            }}
          >
            <option value="de">{language === 'de' ? 'Deutsch' : 'German'}</option>
            <option value="en">{language === 'de' ? 'Englisch' : 'English'}</option>
          </select>
          <small>
            {language === 'de' 
              ? 'Steuert die Sprache für Spracherkennung (STT) und Antworten. Standard: Deutsch.'
              : 'Controls the language for speech-to-text and responses. Default: German.'}
          </small>
        </div>

        <div className="group">
          <label htmlFor="prompt">{t('admin.system.prompt')}</label>
          <textarea
            id="prompt"
            value={tempConfig.systemPrompt}
            onChange={(e) => {
              const updated = { ...tempConfig, systemPrompt: e.target.value };
              handleDirectConfigChange(updated);
            }}
            placeholder={t('admin.system.prompt.placeholder')}
            rows={6}
          />
          <small>
            {t('help.system.prompt')}
          </small>
        </div>

        <div className="group">
          <label htmlFor="greet">{t('admin.greeting')}</label>
          <input
            id="greet"
            type="text"
            value={tempConfig.greeting}
            onChange={(e) => {
              const updated = { ...tempConfig, greeting: e.target.value };
              handleDirectConfigChange(updated);
            }}
            placeholder={t('admin.greeting.placeholder')}
          />
          <small>
            {t('help.greeting')}
          </small>
        </div>
        <div className="group">
          <label>{language === 'de' ? 'TTS Anbieter (Firebase)' : 'TTS Provider (Firebase)'}</label>
          <div style={{ 
            padding: '8px 12px', 
            backgroundColor: '#f5f5f5', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            fontWeight: '500',
            color: firebaseTtsProvider === 'openai' ? '#2563eb' : 
                   firebaseTtsProvider === 'piper' ? '#059669' : '#dc2626'
          }}>
            {firebaseTtsProvider === 'openai' && '🤖 OpenAI TTS'}
            {firebaseTtsProvider === 'coqui' && '🗣️ Coqui TTS'}  
            {firebaseTtsProvider === 'piper' && '🎵 Piper TTS'}
            {!firebaseTtsProvider && '❓ Unknown Provider'}
          </div>
          <small>
            {language === 'de' 
              ? 'TTS Anbieter aus Firebase (Echtzeit-Synchronisierung)'
              : 'TTS Provider from Firebase (real-time sync)'}
          </small>
        </div>


        {/* Provider-Specific Voice/Model Settings */}
        {tempConfig.ttsProvider === 'openai' && (
          <>
            {/* OpenAI TTS Model */}
            <div className="group">
              <label htmlFor="openaiModel">{language === 'de' ? 'OpenAI TTS Modell' : 'OpenAI TTS Model'}</label>
              {isLoadingModels ? (
                <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px' }}>
                  {language === 'de' ? 'Lade Modelle...' : 'Loading models...'}
                </div>
              ) : (
                <select
                  id="openaiModel"
                  value={tempConfig.ttsModel || 'tts-1'}
                  onChange={(e) => {
                    const updated = { ...tempConfig, ttsModel: e.target.value };
                    handleDirectConfigChange(updated);
                  }}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  ) : (
                    <>
                      <option value="tts-1">tts-1</option>
                      <option value="tts-1-hd">tts-1-hd</option>
                    </>
                  )}
                </select>
              )}
              <small>
                {language === 'de' ? 'OpenAI TTS Modell für Sprachgenerierung' : 'OpenAI TTS model for speech generation'}
              </small>
            </div>

            {/* OpenAI Voice */}
            <div className="group">
              <label htmlFor="openaiVoice">{language === 'de' ? 'OpenAI Stimme' : 'OpenAI Voice'}</label>
              <select
                id="openaiVoice"
                value={tempConfig.voice}
                onChange={(e) => {
                  const v = e.target.value as AppConfig['voice'];
                  const updated = { ...tempConfig, voice: allowedVoices.includes(v) ? v : 'alloy' };
                  handleDirectConfigChange(updated);
                }}
              >
                {allowedVoices.map(v => (
                  <option key={v} value={v}>{voiceLabel(v)}</option>
                ))}
              </select>
              <small>
                {language === 'de' ? 'OpenAI Stimme für Sprachausgabe' : 'OpenAI voice for speech output'}
              </small>
            </div>

            {/* Test Voice - TTS Only */}
            <div className="group">
              <label>{language === 'de' ? 'Stimme testen' : 'Test Voice'}</label>
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleTestVoice()}
                disabled={isTestRunning}
              />
              <button 
                type="button" 
                onClick={handleTestVoice}
                disabled={isTestRunning}
                style={{ marginTop: '0.5rem' }}
              >
                Play Test Voice
              </button>
              <small style={{ 
                display: 'inline-block',
                marginLeft: '12px',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: testStatus === 'idle' ? '#e0e0e0' : testStatus === 'processing' ? '#fff3cd' : '#d4edda',
                color: testStatus === 'idle' ? '#666' : testStatus === 'processing' ? '#856404' : '#155724',
                border: `1px solid ${testStatus === 'idle' ? '#bbb' : testStatus === 'processing' ? '#ffc107' : '#28a745'}`
              }}>
                {testStatus === 'idle' ? 'Idle' : testStatus === 'processing' ? 'Processing...' : 'Playing'}
              </small>
            </div>

            {/* OpenAI Speed Control */}
            <div className="control-group">
              <label htmlFor="openaiSpeed">{language === 'de' ? 'OpenAI Geschwindigkeit' : 'OpenAI Speed'}</label>
              <input
                id="openaiSpeed"
                type="range"
                min="0.25"
                max="4.0"
                step="0.25"
                value={tempConfig.openaiSpeed || 1.0}
                onChange={(e) => {
                  const openaiSpeed = parseFloat(e.target.value);
                  const updated = { ...tempConfig, openaiSpeed };
                  handleDirectConfigChange(updated);
                }}
              />
              <output>{(tempConfig.openaiSpeed || 1.0).toFixed(2)}×</output>
            </div>
          </>
        )}

        {tempConfig.ttsProvider === 'piper' && (
          <>
            <div className="group">
              <label htmlFor="piperVoice">{language === 'de' ? 'Piper Stimme' : 'Piper Voice'}</label>
              {isLoadingModels ? (
                <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px' }}>
                  {language === 'de' ? 'Lade Stimmen...' : 'Loading voices...'}
                </div>
              ) : !modelsFound ? (
                <div style={{ 
                  padding: '8px 12px', 
                  backgroundColor: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '4px',
                  color: '#dc2626'
                }}>
                  ❌ {language === 'de' ? 'Keine Piper Stimmen gefunden' : 'No Piper voices found'}
                </div>
              ) : (
                <select
                  id="piperVoice"
                  value={tempConfig.voice}
                  onChange={(e) => {
                    const updated = { ...tempConfig, voice: e.target.value as AppConfig['voice'] };
                    handleDirectConfigChange(updated);
                  }}
                  disabled={!modelsFound}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map(voice => (
                      <option key={voice} value={voice}>{voice}</option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {language === 'de' ? 'Keine Stimmen verfügbar' : 'No voices available'}
                    </option>
                  )}
                </select>
              )}
              <small>
                {language === 'de' 
                  ? `Piper Stimmen ${modelsSource === 'api' ? 'vom TTS Server' : 'lokal gefunden'}`
                  : `Piper voices ${modelsSource === 'api' ? 'from TTS server' : 'found locally'}`}
              </small>
            </div>
            
            <div className="row">
              <div className="control-group">
                <label htmlFor="piperSpeed">{language === 'de' ? 'Piper Geschwindigkeit' : 'Piper Speed'}</label>
                <input
                  id="piperSpeed"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={tempConfig.piperSpeed || 1.0}
                  onChange={(e) => {
                    const piperSpeed = parseFloat(e.target.value);
                    const updated = { ...tempConfig, piperSpeed };
                    handleDirectConfigChange(updated);
                  }}
                />
                <output>{(tempConfig.piperSpeed || 1.0).toFixed(1)}×</output>
              </div>
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="piperPitch">{language === 'de' ? 'Piper Tonhöhe' : 'Piper Pitch'}</label>
                <input
                  id="piperPitch"
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={tempConfig.piperPitch || 1.0}
                  onChange={(e) => {
                    const piperPitch = parseFloat(e.target.value);
                    const updated = { ...tempConfig, piperPitch };
                    handleDirectConfigChange(updated);
                  }}
                />
                <output>{(tempConfig.piperPitch || 1.0).toFixed(1)}×</output>
              </div>
            </div>
          </>
        )}

        {tempConfig.ttsProvider === 'coqui' && (
          <>
            {/* Coqui Model (acts as voice) */}
            <div className="group">
              <label htmlFor="coquiModel">{language === 'de' ? 'Coqui Modell' : 'Coqui Model'}</label>
              {isLoadingModels ? (
                <div style={{ padding: '8px 12px', backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px' }}>
                  {language === 'de' ? 'Lade Modelle...' : 'Loading models...'}
                </div>
              ) : !modelsFound ? (
                <div style={{ 
                  padding: '8px 12px', 
                  backgroundColor: '#fef2f2', 
                  border: '1px solid #fecaca', 
                  borderRadius: '4px',
                  color: '#dc2626'
                }}>
                  ❌ {language === 'de' ? 'Keine Coqui Modelle gefunden' : 'No Coqui models found'}
                </div>
              ) : (
                <select
                  id="coquiModel"
                  value={tempConfig.ttsModel || (availableModels[0] || '')}
                  onChange={(e) => {
                    const updated = { ...tempConfig, ttsModel: e.target.value };
                    handleDirectConfigChange(updated);
                  }}
                  disabled={!modelsFound}
                >
                  {availableModels.length > 0 ? (
                    availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {language === 'de' ? 'Keine Modelle verfügbar' : 'No models available'}
                    </option>
                  )}
                </select>
              )}
              <small>
                {language === 'de' 
                  ? `Coqui Modelle ${modelsSource === 'api' ? 'vom TTS Server' : 'lokal gefunden'}`
                  : `Coqui models ${modelsSource === 'api' ? 'from TTS server' : 'found locally'}`}
              </small>
            </div>

            {/* Coqui Temperature Control */}
            <div className="row">
              <div className="control-group">
                <label htmlFor="coquiTemp">{language === 'de' ? 'Coqui Temperatur' : 'Coqui Temperature'}</label>
                <input
                  id="coquiTemp"
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={tempConfig.coquiSettings?.temperature || 0.7}
                  onChange={(e) => {
                    const temperature = parseFloat(e.target.value);
                    const updated = {
                      ...tempConfig,
                      coquiSettings: { ...tempConfig.coquiSettings, temperature }
                    };
                    handleDirectConfigChange(updated);
                  }}
                />
                <output>{(tempConfig.coquiSettings?.temperature || 0.7).toFixed(1)}</output>
                <small>
                  {language === 'de' 
                    ? 'Steuert die Zufälligkeit der Coqui TTS Ausgabe'
                    : 'Controls randomness of Coqui TTS output'}
                </small>
              </div>
            </div>
          </>
        )}

        
        
        {/* TTS Provider Display (Read-Only) */}
        
        <div className="group">
          <label>{language === 'de' ? 'Erweiterte Einstellungen' : 'Advanced Settings'}</label>
          
          <div className="row">
            <div className="control-group">
              <label htmlFor="temperature">{language === 'de' ? 'Temperatur' : 'Temperature'}</label>
              <input
                id="temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={tempConfig.temperature}
                onChange={(e) => {
                  const updated = { ...tempConfig, temperature: parseFloat(e.target.value) };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              <output>{tempConfig.temperature}</output>
            </div>
          </div>

          <div className="row">
            <div className="control-group">
              <label htmlFor="micGain">{language === 'de' ? 'Mikrofon-Verstärkung (Empfindlichkeit)' : 'Mic Gain (Sensitivity)'}</label>
              <input
                id="micGain"
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={tempConfig.micGain ?? 1.5}
                onChange={(e) => {
                  const val = Math.max(0.5, Math.min(3.0, parseFloat(e.target.value)));
                  const updated = { ...tempConfig, micGain: val };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              <output>{(tempConfig.micGain ?? 1.5).toFixed(1)}×</output>
              <small>
                {language === 'de'
                  ? 'Erhöhen, wenn Ihre Stimme schwer erkannt wird (wirkt sich auf die Spracherkennung aus, nicht auf die Aufnahme-Lautstärke).'
                  : 'Increase if your voice is hard to detect (affects VAD only, not recording volume).'}
              </small>
            </div>
          </div>
          
          <div className="row">
            <div className="control-group">
              <label htmlFor="vadThreshold">{language === 'de' ? 'Spracherkennung Schwelle' : 'Voice Detection Threshold'}</label>
              <input
                id="vadThreshold"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={tempConfig.vadThreshold}
                onChange={(e) => {
                  const updated = { ...tempConfig, vadThreshold: parseFloat(e.target.value) };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              <output>{tempConfig.vadThreshold}</output>
              <small>
                {language === 'de'
                  ? 'Niedriger = empfindlicher, Höher = weniger empfindlich.'
                  : 'Lower = more sensitive, Higher = less sensitive.'}
              </small>
            </div>
          </div>
          
          <div className="row">
            <div className="control-group">
              <label htmlFor="silenceDuration">{language === 'de' ? 'Stille Dauer (ms)' : 'Silence Duration (ms)'}</label>
              <input
                id="silenceDuration"
                type="range"
                min="100"
                max="2000"
                step="100"
                value={tempConfig.silenceDurationMs}
                onChange={(e) => {
                  const updated = { ...tempConfig, silenceDurationMs: parseInt(e.target.value) };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              <output>{tempConfig.silenceDurationMs}ms</output>
            </div>
          </div>
          
          <div className="row">
            <label className="checkbox-label">
              <input
                type="radio"
                name="turnDetection"
                checked={tempConfig.turnDetectionType === 'server_vad'}
                onChange={() => {
                  const updated = { ...tempConfig, turnDetectionType: 'server_vad' as const };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              {language === 'de' ? 'Server VAD (empfohlen)' : 'Server VAD (recommended)'}
            </label>
            <label className="checkbox-label">
              <input
                type="radio"
                name="turnDetection"
                checked={tempConfig.turnDetectionType === 'semantic_vad'}
                onChange={() => {
                  const updated = { ...tempConfig, turnDetectionType: 'semantic_vad' as const };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              {language === 'de' ? 'Semantische VAD' : 'Semantic VAD'}
            </label>
          </div>
          
          <small>
            {language === 'de' 
              ? 'Diese Einstellungen beeinflussen die Spracherkennung und Antwortqualität'
              : 'These settings affect voice detection and response quality'
            }
          </small>
        </div>

        <div className="group">
          <label>{t('admin.default.settings')}</label>
          <div className="row">
            <div className="control-group">
              <label htmlFor="defaultVolume">{t('admin.default.volume')}</label>
              <input
                id="defaultVolume"
                type="range"
                min="0"
                max="100"
                value={tempConfig.volume}
                onChange={(e) => {
                  const updated = { ...tempConfig, volume: parseInt(e.target.value) };
                  setTempConfig(updated);
                  onConfigChange(updated);
                }}
              />
              <output>{tempConfig.volume}%</output>
            </div>
          </div>
          
        </div>


        <div className="actions">
          <div className="action-buttons">
            <button type="button" onClick={handleUpdateFromFirebase} className="secondary">
              {language === 'de' ? '🔄 Neueste Einstellungen abrufen' : '🔄 Update Latest Settings'}
            </button>
            <button type="button" onClick={handleSave} className="primary">
              {t('admin.save')}
            </button>
          </div>
          {saveMessage && (
            <div className="save-message">{t('admin.settings.saved')}</div>
          )}
        </div>

        <footer>
          <div className="info">
            <div>{t('admin.info.live.changes')}</div>
            <div>{t('admin.info.no.storage')}</div>
            <div>{t('admin.info.session.only')}</div>
            <div style={{marginTop: '8px', fontStyle: 'italic'}}>
              {language === 'de' 
                ? 'Hinweis: System-Prompt, Stimme und erweiterte Einstellungen erfordern Neustart. Lautstärke & Untertitel wirken sofort.' 
                : 'Note: System prompt, voice and advanced settings require restart. Volume & subtitles apply immediately.'
              }
            </div>
            {isSessionActive && (
              <div style={{marginTop: '8px', padding: '8px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px'}}>
                <strong>{language === 'de' ? '⚠️ Aktive Sitzung' : '⚠️ Active Session'}</strong><br/>
                {language === 'de' 
                  ? 'Einige Änderungen erfordern einen Neustart der Sitzung um wirksam zu werden.'
                  : 'Some changes require a session restart to take effect.'
                }
              </div>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
