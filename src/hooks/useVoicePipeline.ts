import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AppState, AppConfig, AppError, ConnectionState } from '../types';
import { AUDIO_CONFIG } from '../config/constants';
import { useLanguage } from '../contexts/LanguageContext';
import { debugService } from '../services/debugService';

interface UseVoicePipelineReturn {
  state: AppState;
  connectionState: ConnectionState;
  error: AppError | null;
  startConversation: () => Promise<void>;
  stopConversation: () => void;
  restartWithNewSettings: () => Promise<void>;
  isAudioSupported: boolean;
  audioLevel: number;
}

// Simple energy-based VAD in the browser with MediaRecorder utterance capture.
export const useVoicePipeline = (config: AppConfig): UseVoicePipelineReturn => {
  const { t } = useLanguage();
  const location = useLocation();
  const isDevRoute = location.pathname === '/dev' || location.pathname === '/debug';

  const [state, setState] = useState<AppState>('idle');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<AppError | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const gateGainRef = useRef<GainNode | null>(null);
  const preGainRef = useRef<GainNode | null>(null); // microphone pre-amplification
  const noiseFloorRef = useRef<number>(0.01); // adaptive baseline RMS of ambient noise
  const vadVoiceStateRef = useRef<boolean>(false); // hysteresis state

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const speakingRef = useRef<boolean>(false);
  const lastVoiceMsRef = useRef<number>(0);
  const vadIntervalRef = useRef<number | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const isAudioSupported = Boolean(
    navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices && window.AudioContext
  );

  // Clear error after some seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Apply volume changes to any active audio element
  useEffect(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.volume = config.volume / 100;
    }
  }, [config.volume]);

  // Apply mic gain changes live (preGain stage)
  useEffect(() => {
    if (preGainRef.current && audioContextRef.current) {
      const target = Math.max(0.5, Math.min(3.0, config.micGain ?? 1.5));
      try {
        preGainRef.current.gain.setTargetAtTime(target, audioContextRef.current.currentTime, 0.05);
      } catch {}
    }
  }, [config.micGain]);

  const computeAudioLevelAndVad = useCallback((): { level: number; rms: number } => {
    if (!analyserRef.current) return { level: 0, rms: 0 };

    const analyser = analyserRef.current;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Compute RMS around 128 center
    let sumSquares = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (dataArray[i] - 128) / 128; // -1..1
      sumSquares += val * val;
    }
    const rms = Math.sqrt(sumSquares / bufferLength); // 0..1

    // Map to 0..255 just for UI bar
    const level = Math.max(0, Math.min(255, Math.round(rms * 255)));

    // Return level (UI) and raw rms; VAD will use adaptive baseline in the loop
    return { level, rms } as { level: number; rms: number };
  }, [config.vadThreshold]);

  const monitorAudio = useCallback(() => {
    const tick = () => {
      const { level } = computeAudioLevelAndVad();
      setAudioLevel(level);
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [computeAudioLevelAndVad]);

  const startRecorder = useCallback(() => {
    if (!mediaStreamRef.current) return;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const streamForRecord = processedStreamRef.current || mediaStreamRef.current;
    if (!streamForRecord) return;
    const recorder = new MediaRecorder(streamForRecord, { mimeType, audioBitsPerSecond: 64000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Start debug tracking
        debugService.startRequest();
        debugService.generateConversationId();

        // Send to backend for STT -> LLM -> TTS
        // In development, always use relative URLs so CRA proxy works
        const API_BASE = process.env.NODE_ENV === 'production' 
          ? (process.env.REACT_APP_API_BASE_URL || '') 
          : 'http://localhost:3001';
        const form = new FormData();
        form.append('audio', blob, 'utterance.webm');
        
        // ROUTE-DEPENDENT CONFIG SENDING:
        // Home route (/): Send all config (local admin settings)
        // Dev route (/dev): Send minimal config, backend uses Firebase
        if (!isDevRoute) {
          // Home route: Send all config parameters to backend (override Firebase settings)
          form.append('systemPrompt', config.systemPrompt);
          form.append('temperature', String(config.temperature));
          form.append('voice', config.voice);
          form.append('language', (config.aiLanguage === 'en' ? 'en' : 'de'));
          form.append('ttsProvider', config.ttsProvider || 'openai');
          form.append('ttsModel', config.ttsModel || 'tts-1');
          form.append('greeting', config.greeting || '');
          // Provider-specific TTS settings
          if (config.openaiSpeed) form.append('openaiSpeed', String(config.openaiSpeed));
          if (config.piperSpeed) form.append('piperSpeed', String(config.piperSpeed));
          if (config.piperPitch) form.append('piperPitch', String(config.piperPitch));
          if (config.coquiSettings?.temperature) {
            form.append('coquiTemperature', String(config.coquiSettings.temperature));
          }
          console.log('🏠 Home route: Sending local config to backend');
        } else {
          // Dev route: Only send language, backend uses Firebase for everything else
          form.append('language', (config.aiLanguage === 'en' ? 'en' : 'de'));
          console.log('🔧 Dev route: Backend will use Firebase config');
        }

        const resp = await fetch(`${API_BASE}/api/voice/process`, {
          method: 'POST',
          body: form
        });

        if (!resp.ok) {
          setError({ type: 'api', message: t('error.general') });
          setState('error');
          return;
        }

        // Extract debug information from response headers
        const gptResponseHeader = resp.headers.get('X-GPT-Response');
        const userInputHeader = resp.headers.get('X-User-Input');
        const processingTimeHeader = resp.headers.get('X-Processing-Time');
        const sttHeader = resp.headers.get('X-STT-Duration');
        const llmHeader = resp.headers.get('X-LLM-Duration');
        const ttsHeader = resp.headers.get('X-TTS-Duration');
        
        let gptResponse = 'GPT response not available';
        let tokensUsed = 0;
        // Parse durations (ms)
        const sttMs = sttHeader ? parseInt(sttHeader, 10) || 0 : 0;
        const llmMs = llmHeader ? parseInt(llmHeader, 10) || 0 : 0;
        const ttsMs = ttsHeader ? parseInt(ttsHeader, 10) || 0 : 0;
        const totalMs = processingTimeHeader ? parseInt(processingTimeHeader, 10) || 0 : 0;
        
        if (gptResponseHeader) {
          try {
            gptResponse = atob(gptResponseHeader);
            // Rough token estimation (4 chars ≈ 1 token)
            tokensUsed = Math.ceil(gptResponse.length / 4);
          } catch (e) {
            console.warn('Failed to decode GPT response header:', e);
          }
        }

        // First push timing breakdown for Debug Console
        debugService.updateMetrics({ sttMs, llmMs, ttsMs, totalMs });

        // Record response for debug tracking
        debugService.recordResponse(gptResponse, tokensUsed);

        setState('speaking');

        // Prefer streaming playback via MediaSource if supported
        let audioTmp = activeAudioRef.current;
        if (!audioTmp) {
          audioTmp = new Audio();
          (audioTmp as any).style = (audioTmp as any).style || {};
          try { (audioTmp as any).style.display = 'none'; } catch {}
          try { document.body.appendChild(audioTmp); } catch {}
          activeAudioRef.current = audioTmp;
        }
        const audioEl = audioTmp as HTMLAudioElement;
        audioEl.volume = config.volume / 100;
        audioEl.preload = 'auto';
        (audioEl as any).playsInline = true;

        const tryStream = async () => {
          const enableStreaming = false; // Temporarily disabled for reliability
          const canUseMSE = enableStreaming && !!(resp.body && 'MediaSource' in window && (window as any).MediaSource &&
            (typeof (window as any).MediaSource.isTypeSupported === 'function') &&
            (window as any).MediaSource.isTypeSupported('audio/mpeg'));

          const fallbackToBlob = async (prebuiltBlob?: Blob) => {
            const audioBlob = prebuiltBlob || await resp.blob();
            const url = URL.createObjectURL(audioBlob);
            audioEl.src = url;
            try {
              await audioEl.play();
            } catch (err) {
              // Try unlocking by playing muted first
              const wasMuted = audioEl.muted;
              audioEl.muted = true;
              try {
                await audioEl.play();
                setTimeout(() => { audioEl.muted = wasMuted; }, 50);
              } catch (err2) {
                console.warn('Audio play failed', err2);
              }
            }
            audioEl.onended = () => {
              URL.revokeObjectURL(url);
              debugService.completeAudioPlayback();
              if (state !== 'idle') setState('listening');
            };
          };

          if (!canUseMSE) {
            await fallbackToBlob();
            return;
          }

          // Streaming with MediaSource for MP3
          const mediaSource = new MediaSource();
          const objectUrl = URL.createObjectURL(mediaSource);
          audioEl.src = objectUrl;

          let started = false;
          let aborted = false;
          let reader!: ReadableStreamDefaultReader<Uint8Array>;
          const receivedChunks: Uint8Array[] = [];

          const safeEnd = () => { try { mediaSource.endOfStream(); } catch {} };

          mediaSource.addEventListener('sourceopen', () => {
            let sourceBuffer: SourceBuffer;
            try {
              sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
            } catch (e) {
              URL.revokeObjectURL(objectUrl);
              // Fallback if MIME unsupported
              void fallbackToBlob();
              return;
            }

            reader = resp.body!.getReader();

            const appendChunk = (chunk: Uint8Array) => new Promise<void>((resolve) => {
              const onUpdate = () => { sourceBuffer.removeEventListener('updateend', onUpdate); resolve(); };
              sourceBuffer.addEventListener('updateend', onUpdate);
              sourceBuffer.appendBuffer(chunk);
            });

            const run = async () => {
              try {
                while (true) {
                  const { done, value } = await reader!.read();
                  if (done) break;
                  if (value && value.byteLength) {
                    receivedChunks.push(value);
                    await appendChunk(value);
                    if (!started) {
                      started = true;
                      try { await audioEl.play(); } catch {}
                    }
                  }
                }
                safeEnd();
              } catch (e) {
                // Any streaming error, fallback to blob
                safeEnd();
                URL.revokeObjectURL(objectUrl);
                const fallbackBlob = new Blob(receivedChunks, { type: 'audio/mpeg' });
                await fallbackToBlob(fallbackBlob);
              }
            };

            run();
          }, { once: true });

          // If playback hasn't started within 1200ms, abort streaming and fallback
          const watchdog = window.setTimeout(async () => {
            if (!started && !aborted) {
              aborted = true;
              try { reader?.cancel(); } catch {}
              safeEnd();
              URL.revokeObjectURL(objectUrl);
              const fallbackBlob = new Blob(receivedChunks, { type: 'audio/mpeg' });
              await fallbackToBlob(fallbackBlob);
            }
          }, 1200);

          audioEl.addEventListener('error', async () => {
            if (aborted) return;
            aborted = true;
            try { reader?.cancel(); } catch {}
            safeEnd();
            URL.revokeObjectURL(objectUrl);
            await fallbackToBlob();
          }, { once: true });

          audioEl.onended = () => {
            URL.revokeObjectURL(objectUrl);
            debugService.completeAudioPlayback();
            if (state !== 'idle') setState('listening');
            if (watchdog) window.clearTimeout(watchdog);
          };
        };

        await tryStream();
      } catch (e) {
        setError({ type: 'general', message: t('error.general') });
        setState('error');
      }
    };

    recorder.start();
  }, [config.systemPrompt, config.temperature, config.volume, config.voice, config.aiLanguage, t, state]);

  const stopRecorder = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
  }, []);

  const startConversation = useCallback(async () => {
    try {
      setError(null);
      setState('connecting');
      setConnectionState('connecting');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_CONFIG.sampleRate,
          channelCount: AUDIO_CONFIG.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false
        }
      });

      mediaStreamRef.current = stream;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      try { await audioContextRef.current.resume(); } catch {}
      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter to remove low-frequency rumble (traffic, mic handling)
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 120; // Hz
      highpass.Q.value = 0.707;

      // Low-pass filter to attenuate high-frequency ambient noise -> band-pass 120..4000 Hz
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 4000; // Hz
      lowpass.Q.value = 0.707;

      // Optional pre-amplification before compressor to help quiet mics
      const preGain = ctx.createGain();
      preGain.gain.value = Math.max(0.5, Math.min(3.0, config.micGain ?? 1.5));
      preGainRef.current = preGain;

      // Dynamics compressor to tame peaks and keep level consistent
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Simple noise gate: reduce gain when VAD says 'no voice'
      const gateGain = ctx.createGain();
      gateGain.gain.value = 1.0; // will be modulated by VAD loop
      gateGainRef.current = gateGain;

      // Analyser for VAD display and decision
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      // Destination for processed audio used by MediaRecorder
      const destination = ctx.createMediaStreamDestination();
      processedStreamRef.current = destination.stream;

      // Wire chain: source -> highpass -> lowpass -> preGain -> compressor -> [analyser for VAD] & [gate -> destination for recording]
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(preGain);
      preGain.connect(compressor);
      // Feed analyser BEFORE the gate so VAD sees the true signal level
      compressor.connect(analyser);
      // Gate only affects the recording/output path
      compressor.connect(gateGain);
      gateGain.connect(destination);

      // levels monitor
      monitorAudio();

      // VAD loop for utterance detection
      speakingRef.current = false;
      lastVoiceMsRef.current = performance.now();
      const interval = window.setInterval(() => {
        const { rms } = computeAudioLevelAndVad();
        const now = performance.now();

        // Update adaptive noise floor when not speaking
        const alpha = 0.98; // strong smoothing
        if (!vadVoiceStateRef.current) {
          noiseFloorRef.current = noiseFloorRef.current * alpha + rms * (1 - alpha);
        }

        // Hysteresis thresholds around adaptive floor
        const margin = 0.02 + 0.06 * config.vadThreshold; // widen margin for noisy environments
        const onThresh = noiseFloorRef.current + margin;   // need to exceed this to start voice
        const offThresh = noiseFloorRef.current + margin * 0.5; // drop below this to end voice

        const isVoice = vadVoiceStateRef.current
          ? rms > offThresh
          : rms > onThresh;

        if (isVoice) {
          lastVoiceMsRef.current = now;
          // Open gate quickly
          if (gateGainRef.current && audioContextRef.current) {
            gateGainRef.current.gain.setTargetAtTime(1.0, audioContextRef.current.currentTime, 0.015);
          }
          if (!speakingRef.current) {
            // speech started
            speakingRef.current = true;
            vadVoiceStateRef.current = true;
            setState('listening');
            startRecorder();
          }
        } else {
          // Not enough voice energy
          if (speakingRef.current) {
            const silenceFor = now - lastVoiceMsRef.current;
            if (silenceFor >= config.silenceDurationMs) {
              // speech ended
              speakingRef.current = false;
              vadVoiceStateRef.current = false;
              stopRecorder();
            }
          }
          // Close gate slowly while quiet
          if (gateGainRef.current && audioContextRef.current) {
            gateGainRef.current.gain.setTargetAtTime(0.04, audioContextRef.current.currentTime, 0.08);
          }
        }
      }, 50);
      vadIntervalRef.current = interval as unknown as number;

      setConnectionState('connected');
      setState('listening');
    } catch (err) {
      if ((err as any) instanceof DOMException && (err as any).name === 'NotAllowedError') {
        setError({ type: 'microphone', message: t('error.microphone') });
      } else {
        setError({ type: 'general', message: t('error.general') });
      }
      setState('error');
      setConnectionState('error');
    }
  }, [computeAudioLevelAndVad, monitorAudio, startRecorder, stopRecorder, config.silenceDurationMs, t]);

  const stopConversation = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (vadIntervalRef.current) window.clearInterval(vadIntervalRef.current);

    try { stopRecorder(); } catch {}

    if (activeAudioRef.current) {
      try { activeAudioRef.current.pause(); } catch {}
      activeAudioRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    processedStreamRef.current = null;
    gateGainRef.current = null;
    preGainRef.current = null;

    audioContextRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;

    setAudioLevel(0);
    setState('idle');
    setConnectionState('disconnected');
    setError(null);
  }, [stopRecorder]);

  const restartWithNewSettings = useCallback(async () => {
    if (state !== 'idle') {
      stopConversation();
      setTimeout(() => { startConversation(); }, 120);
    }
  }, [state, startConversation, stopConversation]);

  useEffect(() => {
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  return {
    state,
    connectionState,
    error,
    startConversation,
    stopConversation,
    restartWithNewSettings,
    isAudioSupported,
    audioLevel,
  };
};
