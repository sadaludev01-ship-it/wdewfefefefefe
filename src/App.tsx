import React, { useState, useRef, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { VoiceChat } from './components/VoiceChat';
import { Admin } from './components/Admin';
import { DevConsole } from './components/DevConsole';
import { LanguageProvider } from './contexts/LanguageContext';
import { AppConfig, AppState } from './types';
import { DEFAULT_CONFIG } from './config/constants';
import { firebaseSettingsService } from './services/firebaseSettings';
import './App.css';

function App() {
  const location = useLocation();
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const raw = localStorage.getItem('appConfigV1');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppConfig>;
        return { ...DEFAULT_CONFIG, ...parsed } as AppConfig;
      }
    } catch {}
    return DEFAULT_CONFIG;
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [sessionState, setSessionState] = useState<AppState>('idle');
  const [isFirebaseEnabled, setIsFirebaseEnabled] = useState(false);
  const restartSessionRef = useRef<(() => void) | null>(null);
  const firebaseUnsubscribeRef = useRef<(() => void) | null>(null);

  // Route-dependent config loading
  useEffect(() => {
    const initializeConfigForRoute = async () => {
      if (location.pathname === '/dev' || location.pathname === '/debug') {
        // DEV ROUTES: Load settings from Firebase (DevConsole behavior)
        try {
          console.log('🔧 Dev Route: Loading config from Firebase');
          const firebaseConfig = await firebaseSettingsService.loadSettings();
          setConfig(firebaseConfig);
          setIsFirebaseEnabled(true);

          // Subscribe to real-time updates from Firebase
          const unsubscribe = firebaseSettingsService.subscribeToSettings((newConfig) => {
            console.log('🔄 Firebase config update:', newConfig);
            setConfig(newConfig);
          });
          
          firebaseUnsubscribeRef.current = unsubscribe;
        } catch (error) {
          console.error('Firebase initialization failed, falling back to localStorage:', error);
          setIsFirebaseEnabled(false);
        }
      } else {
        // HOME ROUTE: Load local config from localStorage (admin changes)
        console.log('🏠 Home Route: Loading local config from localStorage');
        setIsFirebaseEnabled(false);
        
        // Explicitly load from localStorage for home route
        try {
          const raw = localStorage.getItem('appConfigV1');
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<AppConfig>;
            const localConfig = { ...DEFAULT_CONFIG, ...parsed } as AppConfig;
            console.log('📦 Loaded local config from localStorage:', localConfig);
            setConfig(localConfig);
          } else {
            console.log('📦 No localStorage config found, using DEFAULT_CONFIG');
            setConfig(DEFAULT_CONFIG);
          }
        } catch (error) {
          console.error('Failed to load localStorage config:', error);
          setConfig(DEFAULT_CONFIG);
        }
      }
    };

    initializeConfigForRoute();

    // Cleanup Firebase subscription on unmount or route change
    return () => {
      if (firebaseUnsubscribeRef.current) {
        firebaseUnsubscribeRef.current();
        firebaseUnsubscribeRef.current = null;
      }
    };
  }, [location.pathname]);

  // Persist config changes to localStorage ONLY on home route (not dev routes)
  useEffect(() => {
    // Only persist to localStorage when on home route (not dev routes)
    if (location.pathname !== '/dev' && location.pathname !== '/debug') {
      try {
        localStorage.setItem('appConfigV1', JSON.stringify(config));
        console.log('💾 Saved config to localStorage:', config);
      } catch (e) {
        console.warn('Failed to persist config to localStorage', e);
      }
    } else {
      console.log('⏭️ Skipping localStorage save (on dev route)');
    }
  }, [config, location.pathname]);

  const handleConfigChange = (newConfig: AppConfig) => {
    setConfig(newConfig);
  };

  const handleSessionStateChange = (state: AppState) => {
    setSessionState(state);
  };

  const handleRestartSession = () => {
    if (restartSessionRef.current) {
      restartSessionRef.current();
    }
  };

  const setRestartSessionFunction = (restartFn: () => void) => {
    restartSessionRef.current = restartFn;
  };

  const handleAdminClick = () => {
    setShowAdmin(true);
  };

  const handleAdminClose = () => {
    setShowAdmin(false);
  };

  return (
    <LanguageProvider>
      <div className="App">
        <Routes>
          {/* Main Voice Chat Route */}
          <Route path="/" element={
            <>
              <VoiceChat
                config={config}
                onConfigChange={handleConfigChange}
                onAdminClick={handleAdminClick}
                onSessionStateChange={handleSessionStateChange}
                onSetRestartFunction={setRestartSessionFunction}
              />

              {showAdmin && (
                <Admin
                  config={config}
                  onConfigChange={handleConfigChange}
                  onClose={handleAdminClose}
                  isSessionActive={sessionState !== 'idle' && sessionState !== 'error'}
                  onRestartSession={handleRestartSession}
                />
              )}
            </>
          } />

          {/* Developer Console Routes: voice chat on top, dev console below */}
          <Route path="/dev" element={
            <div className="dev-layout">
              <div className="dev-voice-section">
                <VoiceChat
                  config={config}
                  onConfigChange={handleConfigChange}
                  onAdminClick={() => { /* hidden in dev route */ }}
                  onSessionStateChange={handleSessionStateChange}
                  onSetRestartFunction={setRestartSessionFunction}
                  hideAdminButton={true}
                />
              </div>
              <div className="dev-console-section">
                <DevConsole
                  config={config}
                  onConfigChange={handleConfigChange}
                  onClose={() => window.location.href = '/'}
                  isSessionActive={sessionState !== 'idle' && sessionState !== 'error'}
                  onRestartSession={handleRestartSession}
                  mode="embedded"
                />
              </div>
            </div>
          } />

          <Route path="/debug" element={
            <div className="dev-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '1rem', padding: '1rem', alignItems: 'start' }}>
              <div>
                <DevConsole
                  config={config}
                  onConfigChange={handleConfigChange}
                  onClose={() => window.location.href = '/'}
                  isSessionActive={sessionState !== 'idle' && sessionState !== 'error'}
                  onRestartSession={handleRestartSession}
                  mode="embedded"
                />
              </div>
              <div>
                <VoiceChat
                  config={config}
                  onConfigChange={handleConfigChange}
                  onAdminClick={() => { /* hidden in dev route */ }}
                  onSessionStateChange={handleSessionStateChange}
                  onSetRestartFunction={setRestartSessionFunction}
                  hideAdminButton={true}
                />
              </div>
            </div>
          } />
        </Routes>
      </div>
    </LanguageProvider>
  );
}

export default App;
