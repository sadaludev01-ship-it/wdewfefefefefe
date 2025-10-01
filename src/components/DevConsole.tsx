// Developer Console Component
import React, { useState, useEffect, useCallback } from 'react';
import { AppConfig, DebugMetrics, PersonalityProfile } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { firebaseSettingsService } from '../services/firebaseSettings';
import { debugService } from '../services/debugService';
import './Admin.css'; // Reuse admin styles

interface DevConsoleProps {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onClose: () => void;
  isSessionActive?: boolean;
  onRestartSession?: () => void;
  mode?: 'overlay' | 'embedded';
}

export const DevConsole: React.FC<DevConsoleProps> = ({
  config,
  onConfigChange,
  onClose,
  isSessionActive = false,
  onRestartSession,
  mode = 'overlay'
}) => {
  const { language, setLanguage, t } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [tempConfig, setTempConfig] = useState(config);
  const [saveMessage, setSaveMessage] = useState('');
  const [debugMetrics, setDebugMetrics] = useState<DebugMetrics>({});
  const [profiles, setProfiles] = useState<PersonalityProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState(config.systemPrompt);
  const [customGreeting, setCustomGreeting] = useState(config.greeting);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  const API_BASE = process.env.NODE_ENV === 'production' 
    ? (process.env.REACT_APP_API_BASE_URL || '') 
    : '';

  // Allowed OpenAI TTS voices
  const allowedVoices: AppConfig['voice'][] = ['nova', 'shimmer', 'echo', 'onyx', 'fable', 'alloy', 'ash', 'sage', 'coral'];
  const voiceLabel = (v: AppConfig['voice']) => v.charAt(0).toUpperCase() + v.slice(1);

  // Admin authentication
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
        loadPersonalityProfiles();
      } else {
        alert('Wrong password');
        setPassword('');
      }
    } catch (err) {
      alert('Authentication error');
    }
  };

  // Load personality profiles
  const loadPersonalityProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    try {
      const loadedProfiles = await firebaseSettingsService.loadProfiles();
      setProfiles(loadedProfiles);
    } catch (error) {
      console.error('Error loading personality profiles:', error);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  // Subscribe to debug metrics
  useEffect(() => {
    const unsubscribe = debugService.subscribe((metrics) => {
      setDebugMetrics(metrics);
    });

    return unsubscribe;
  }, []);

  // Sync tempConfig when external config changes
  useEffect(() => {
    setTempConfig(config);
    setCustomPrompt(config.systemPrompt);
    setCustomGreeting(config.greeting);
    // Set default test message based on AI language
    const defaultMsg = (config.aiLanguage === 'en') ? "Hello, how are you?" : "Hallo, wie geht's?";
    setTestMessage(defaultMsg);
  }, [config]);

  // Handle profile selection
  const handleProfileSelect = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      setSelectedProfile(profileId);
      setCustomPrompt(profile.systemPrompt);
      // Only update AI language, do NOT change UI language
      const updatedConfig = { 
        ...tempConfig, 
        systemPrompt: profile.systemPrompt,
        aiLanguage: profile.lang ?? tempConfig.aiLanguage
      };
      handleConfigChange(updatedConfig);
    }
  };

  // Apply system prompt changes
  const handleApplyPrompt = async () => {
    try {
      const updatedConfig = { ...tempConfig, systemPrompt: customPrompt };
      setTempConfig(updatedConfig);
      onConfigChange(updatedConfig);
      
      // Save to Firebase for global sync
      await firebaseSettingsService.saveSettings(updatedConfig, 'dev-console');
      
      setSaveMessage('System prompt applied and saved to Firebase!');
      setTimeout(() => setSaveMessage(''), 3000);

      // Restart session if active
      if (isSessionActive && onRestartSession) {
        onRestartSession();
      }
    } catch (error) {
      console.error('Error applying system prompt:', error);
      setSaveMessage('Error saving settings');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Apply greeting changes
  const handleApplyGreeting = async () => {
    try {
      const updatedConfig = { ...tempConfig, greeting: customGreeting };
      setTempConfig(updatedConfig);
      onConfigChange(updatedConfig);
      
      // Save to Firebase for global sync
      await firebaseSettingsService.saveSettings(updatedConfig, 'dev-console');
      
      setSaveMessage('Greeting message applied and saved to Firebase!');
      setTimeout(() => setSaveMessage(''), 3000);

      // Restart session if active
      if (isSessionActive && onRestartSession) {
        onRestartSession();
      }
    } catch (error) {
      console.error('Error applying greeting:', error);
      setSaveMessage('Error saving settings');
      setTimeout(() => setSaveMessage(''), 3000);
    }
  };

  // Handle config changes and save to Firebase
  const handleConfigChange = async (newConfig: AppConfig) => {
    try {
      setTempConfig(newConfig);
      onConfigChange(newConfig);
      
      // Save to Firebase for global sync
      await firebaseSettingsService.saveSettings(newConfig, 'dev-console');
      
    } catch (error) {
      console.error('Error syncing settings to Firebase:', error);
    }
  };

  // Test voice - TTS only (skip STT and LLM)
  const handleTestVoice = async () => {
    if (!testMessage.trim()) {
      return;
    }
    
    try {
      debugService.startRequest();
      debugService.generateConversationId();
      
      console.log(`🔊 Testing TTS with message: "${testMessage}"`);
      
      const form = new FormData();
      // Create a dummy audio blob (backend will use test mode)
      const audioBlob = new Blob([''], { type: 'audio/webm' });
      form.append('audio', audioBlob, 'test.webm');
      
      // Enable test mode (bypasses STT and LLM for TTS-only testing)
      form.append('testMode', 'true');
      form.append('message', testMessage);
      form.append('language', tempConfig.aiLanguage || 'de');

      // Send request to backend
      const response = await fetch(`${API_BASE}/api/voice/process`, {
        method: 'POST',
        body: form
      });

      if (!response.ok) {
        throw new Error(`Test failed: ${response.status}`);
      }

      // Get response headers for debug info
      const gptResponse = response.headers.get('X-GPT-Response');
      const userInput = response.headers.get('X-User-Input');
      
      if (gptResponse) {
        const decodedResponse = atob(gptResponse);
        debugService.recordResponse(decodedResponse, decodedResponse.length);
        console.log('🤖 LLM Response:', decodedResponse);
      }

      // Play audio response
      const audioBlob2 = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob2);
      const audio = new Audio(audioUrl);
      
      audio.onloadedmetadata = () => {
        console.log(`🔊 TTS Audio duration: ${audio.duration.toFixed(2)}s`);
      };
      
      audio.onended = () => {
        debugService.completeAudioPlayback();
        URL.revokeObjectURL(audioUrl);
        setIsTestRunning(false);
      };
      
      audio.onerror = () => {
        console.error('❌ Audio playback error');
        setIsTestRunning(false);
      };
      
      await audio.play();
      console.log('✅ Test message completed successfully');

    } catch (error) {
      console.error('❌ Error sending test message:', error);
      debugService.completeAudioPlayback();
      setIsTestRunning(false);
      alert(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Format latency display
  const formatLatency = (ms?: number) => {
    if (!ms) return 'N/A';
    return `${ms}ms`;
  };

  // Format cost display
  const formatCost = (cost?: number) => {
    if (!cost) return '$0.00';
    return `$${cost.toFixed(6)}`;
  };

  if (!isAuthenticated) {
    return (
      <div className={mode === 'overlay' ? 'admin-overlay' : 'admin-embedded'}>
        <div className="admin-card" style={mode === 'embedded' ? { maxWidth: '100%', width: '100%' } : undefined}>
          <div className="admin-header">
            <h1>{t('dev.title')}</h1>
            {mode === 'overlay' && (
              <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
            )}
          </div>
          <form onSubmit={handlePasswordSubmit}>
            <div className="group">
              <label htmlFor="password">{t('dev.password.title')}</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('dev.password.placeholder')}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <div className="actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="submit" disabled={!password.trim()}>
                {t('dev.access')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={mode === 'overlay' ? 'admin-overlay' : 'admin-embedded'}>
      <div className="admin-card" style={{ maxWidth: mode === 'overlay' ? '1200px' : '100%', width: mode === 'overlay' ? '95vw' : '100%' }}>
        <div className="admin-header">
          <h1>{t('dev.title')}</h1>
          {mode === 'overlay' && (
            <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: mode === 'overlay' ? '1fr 1fr' : '1fr', gap: '2rem' }}>
          {/* LEFT SIDE - Controls */}
          <div>
            {/* AI Language Switcher */}
            <div className="group">
              <label htmlFor="devLanguage">{t('dev.ai.language')}</label>
              <select
                id="devLanguage"
                value={tempConfig.aiLanguage || 'de'}
                onChange={(e) => {
                  const newAiLang = (e.target.value === 'en' ? 'en' : 'de') as 'de' | 'en';
                  
                  // Only update config (aiLanguage), do NOT update UI language
                  const updated = { ...tempConfig, aiLanguage: newAiLang } as AppConfig;
                  handleConfigChange(updated);
                }}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
              <small>{t('dev.ai.language.help')}</small>
            </div>

            <h2>{t('dev.prompt.tester')}</h2>
            
            {/* Personality Profiles */}
            <div className="group">
              <label htmlFor="profileSelect">{t('dev.profiles')}</label>
              <select
                id="profileSelect"
                value={selectedProfile}
                onChange={(e) => handleProfileSelect(e.target.value)}
                disabled={isLoadingProfiles}
              >
                <option value="">{t('dev.profiles.select')}</option>
                {profiles
                  .filter(profile => !profile.lang || profile.lang === language)
                  .map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              {isLoadingProfiles && <small>{t('dev.profiles.loading')}</small>}
            </div>

            {/* Custom System Prompt */}
            <div className="group">
              <label htmlFor="customPrompt">{t('dev.system.prompt')}</label>
              <textarea
                id="customPrompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={6}
                placeholder={t('dev.system.prompt.placeholder')}
                style={{ 
                  width: '100%', 
                  maxWidth: '80vw', 
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  overflowWrap: 'break-word',
                  wordWrap: 'break-word'
                }}
              />
              <button 
                type="button" 
                onClick={handleApplyPrompt}
                className="regular"
                style={{ marginTop: '0.5rem' }}
              >
                {t('dev.apply.prompt')}
              </button>
            </div>

            {/* Greeting Message */}
            <div className="group">
              <label htmlFor="customGreeting">{t('dev.greeting')}</label>
              <textarea
                id="customGreeting"
                value={customGreeting}
                onChange={(e) => setCustomGreeting(e.target.value)}
                rows={3}
                placeholder={t('dev.greeting.placeholder')}
              />
              <button 
                type="button" 
                onClick={handleApplyGreeting}
                className="regular"
                style={{ marginTop: '0.5rem' }}
              >
                {t('dev.apply.greeting')}
              </button>
            </div>

            {/* Voice & Audio Controls */}
            <h2>{t('dev.voice.audio')}</h2>
            
            <div className="group">
              <label htmlFor="devVoice">{t('dev.voice')}</label>
              <select
                id="devVoice"
                value={tempConfig.voice}
                onChange={(e) => {
                  const voice = e.target.value as AppConfig['voice'];
                  handleConfigChange({ ...tempConfig, voice });
                }}
              >
                {allowedVoices.map(voice => (
                  <option key={voice} value={voice}>{voiceLabel(voice)}</option>
                ))}
              </select>
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
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="devTemperature">{t('dev.temperature')}</label>
                <input
                  id="devTemperature"
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={tempConfig.temperature}
                  onChange={(e) => {
                    const temperature = parseFloat(e.target.value);
                    handleConfigChange({ ...tempConfig, temperature });
                  }}
                />
                <output>{tempConfig.temperature}</output>
              </div>
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="devMicGain">{t('dev.mic.gain')}</label>
                <input
                  id="devMicGain"
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={tempConfig.micGain ?? 1.5}
                  onChange={(e) => {
                    const micGain = parseFloat(e.target.value);
                    handleConfigChange({ ...tempConfig, micGain });
                  }}
                />
                <output>{(tempConfig.micGain ?? 1.5).toFixed(1)}×</output>
              </div>
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="devVadThreshold">{t('dev.vad.threshold')}</label>
                <input
                  id="devVadThreshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempConfig.vadThreshold}
                  onChange={(e) => {
                    const vadThreshold = parseFloat(e.target.value);
                    handleConfigChange({ ...tempConfig, vadThreshold });
                  }}
                />
                <output>{tempConfig.vadThreshold}</output>
              </div>
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="devSilenceMs">{t('dev.silence.duration')}</label>
                <input
                  id="devSilenceMs"
                  type="range"
                  min="200"
                  max="3000"
                  step="50"
                  value={tempConfig.silenceDurationMs}
                  onChange={(e) => {
                    const silenceDurationMs = parseInt(e.target.value, 10);
                    handleConfigChange({ ...tempConfig, silenceDurationMs });
                  }}
                />
                <output>{tempConfig.silenceDurationMs} ms</output>
              </div>
            </div>

            <div className="row">
              <div className="control-group">
                <label htmlFor="devVolume">{t('dev.volume')}</label>
                <input
                  id="devVolume"
                  type="range"
                  min="0"
                  max="100"
                  value={tempConfig.volume}
                  onChange={(e) => {
                    const volume = parseInt(e.target.value);
                    handleConfigChange({ ...tempConfig, volume });
                  }}
                />
                <output>{tempConfig.volume}%</output>
              </div>
            </div>

          </div>

          {/* RIGHT SIDE - Debug Console */}
          <div>
            <h2>{t('dev.debug.console')}</h2>
            
            <div className="group">
              <h3>{t('dev.conversation.metrics')}</h3>
              <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                <div><strong>{t('dev.conversation.id')}</strong> {debugMetrics.conversationId || 'None'}</div>
                <div><strong>{t('dev.audio.status')}</strong> <span style={{ 
                  color: debugMetrics.audioStreamStatus === 'processing' ? 'orange' : 
                        debugMetrics.audioStreamStatus === 'playing' ? 'green' : 'gray' 
                }}>{debugMetrics.audioStreamStatus ? t(`dev.audio.${debugMetrics.audioStreamStatus}`) || debugMetrics.audioStreamStatus : t('dev.audio.idle')}</span></div>
                {/*<div><strong>Total:</strong> {formatLatency(debugMetrics.totalMs)}</div>
                <div><strong>STT:</strong> {formatLatency(debugMetrics.sttMs)}</div>
                <div><strong>LLM:</strong> {formatLatency(debugMetrics.llmMs)}</div>
                <div><strong>TTS:</strong> {formatLatency(debugMetrics.ttsMs)}</div>*/}
                <div><strong>{t('dev.client.latency')}</strong> {formatLatency(debugMetrics.latencyMs)}</div>
                <div><strong>{t('dev.tokens.used')}</strong> {debugMetrics.tokensUsed || 0}</div>
                <div><strong>{t('dev.estimated.cost')}</strong> {formatCost(debugMetrics.estimatedCost)}</div>
                <div><strong>{t('dev.last.request')}</strong> {debugMetrics.lastRequestTime ? new Date(debugMetrics.lastRequestTime).toLocaleTimeString() : 'N/A'}</div>
                <div><strong>{t('dev.last.response')}</strong> {debugMetrics.lastResponseTime ? new Date(debugMetrics.lastResponseTime).toLocaleTimeString() : 'N/A'}</div>
              </div>
            </div>

            <div className="group">
              <h3>{t('dev.raw.gpt.response')}</h3>
              <div style={{ 
                background: '#f5f5f5', 
                padding: '1rem', 
                borderRadius: '4px', 
                maxHeight: '200px', 
                overflowY: 'auto',
                fontSize: '0.9rem',
                whiteSpace: 'pre-wrap'
              }}>
                {debugMetrics.rawGptResponse || t('dev.no.response')}
              </div>
            </div>

            <div className="group">
              <h3>{t('dev.current.config')}</h3>
              <div style={{ 
                background: '#f5f5f5', 
                padding: '1rem', 
                borderRadius: '4px', 
                maxHeight: '300px', 
                overflowY: 'auto',
                fontSize: '0.8rem',
                maxWidth: '80vw',
                overflowX: 'auto',
                boxSizing: 'border-box'
              }}>
                <pre style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word'
                }}>{JSON.stringify(tempConfig, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Save Message */}
        {saveMessage && (
          <div className="save-message" style={{ 
            position: mode === 'overlay' ? 'fixed' : 'absolute', 
            top: mode === 'overlay' ? '20px' : '16px', 
            right: mode === 'overlay' ? '20px' : '16px', 
            background: 'green', 
            color: 'white', 
            padding: '1rem', 
            borderRadius: '4px',
            zIndex: mode === 'overlay' ? 1000 : 1
          }}>
            {saveMessage}
          </div>
        )}
      </div>
    </div>
  );
};
