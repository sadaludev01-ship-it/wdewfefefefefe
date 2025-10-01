import React, { useEffect } from 'react';
import { AppConfig, AppState } from '../types';
import { useVoicePipeline } from '../hooks/useVoicePipeline';
import { useLanguage } from '../contexts/LanguageContext';
import './VoiceChat.css';

interface VoiceChatProps {
  config: AppConfig;
  onConfigChange: (config: AppConfig) => void;
  onAdminClick: () => void;
  onSessionStateChange?: (state: AppState) => void;
  onSetRestartFunction?: (restartFn: () => void) => void;
  hideAdminButton?: boolean;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({
  config,
  onConfigChange,
  onAdminClick,
  onSessionStateChange,
  onSetRestartFunction,
  hideAdminButton = false
}) => {
  const { language, setLanguage, t } = useLanguage();
  const {
    state,
    error,
    startConversation,
    stopConversation,
    restartWithNewSettings,
    isAudioSupported,
    audioLevel
  } = useVoicePipeline(config);

  // Treat both 'speaking' and any future 'responding' as 'listening' for UI purposes
  const uiState: AppState = ((state as any) === 'responding' || state === 'speaking') ? 'listening' : state;
  const isListeningLike = uiState === 'listening';

  // Notify parent component of state changes
  useEffect(() => {
    onSessionStateChange?.(state);
  }, [state, onSessionStateChange]);

  // Provide restart function to parent
  useEffect(() => {
    onSetRestartFunction?.(restartWithNewSettings);
  }, [restartWithNewSettings, onSetRestartFunction]);

  const handleMainButtonClick = async () => {
    if (uiState === 'idle') {
      await startConversation();
    } else {
      stopConversation();
    }
  };



  const handleLanguageToggle = () => {
    const newLang = language === 'de' ? 'en' : 'de';
    // Update ONLY UI language, do NOT update aiLanguage
    setLanguage(newLang);
    // No config update needed - aiLanguage stays independent
  };

  const getButtonText = () => {
    switch (uiState) {
      case 'idle':
        return t('start.speaking');
      case 'connecting':
        return t('connecting');
      case 'listening':
        return t('stop');
      case 'error':
        return t('retry');
      default:
        return t('start.speaking');
    }
  };

  const getStatusText = () => {
    if (error) {
      return error.message;
    }
    return t(`status.${uiState}`) || t('status.ready');
  };

  const getButtonClass = () => {
    const baseClass = 'big-btn';
    switch (uiState) {
      case 'listening':
        return `${baseClass} listen`;
      case 'error':
        return `${baseClass} error`;
      default:
        return baseClass;
    }
  };

  if (!isAudioSupported) {
    return (
      <div className="wrap">
        <div className="card">
          <div className="error-message">
            <h2>{t('error.audio.unsupported')}</h2>
            <p>{t('error.audio.unsupported.message')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="card" role="region" aria-label="Buddy Sprach-Companion">
        <header>
          <div className="brand">
            <div className="logo" aria-hidden="true">
              <div className="logo-inner"></div>
            </div>
            <div>
              <div className="brand-name">{t('app.title')}</div>
              <div className="brand-subtitle">AI Voice Chat</div>
            </div>
          </div>
          <div className="header-controls">
            <button
              className="language-toggle"
              onClick={handleLanguageToggle}
              aria-label={t('language.toggle')}
              title={t('language.toggle')}
            >
              {language === 'de' ? t('language.en') : t('language.de')}
            </button>
            {!hideAdminButton && (
              <button
                className="admin-btn"
                onClick={onAdminClick}
                aria-label={t('admin.access')}
              >
                {t('admin')}
              </button>
            )}
          </div>
        </header>

        <div className="panel">
          <div className="cta">
            <button
              className={getButtonClass()}
              onClick={handleMainButtonClick}
              disabled={uiState === 'connecting'}
              aria-pressed={uiState !== 'idle'}
              aria-label={getButtonText()}
            >
              {getButtonText()}
            </button>
            <div className="status-container">
              <div className="status" aria-live="polite">
                {getStatusText()}
              </div>
              {uiState === 'listening' && (
                <div 
                  className="audio-level" 
                  style={{ '--level': audioLevel / 255 } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <div className="level-bar"></div>
                </div>
              )}
            </div>
          </div>

        </div>

        <footer>
          <span>
            {t('footer.ready')}
          </span>
        </footer>
      </div>
    </div>
  );
};
