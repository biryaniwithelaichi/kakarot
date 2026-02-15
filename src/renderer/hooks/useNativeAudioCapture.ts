/**
 * React Hook for Native Audio Capture with Echo Cancellation
 * Provides a high-level interface for the native AEC module
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface NativeAudioState {
  isRunning: boolean;
  isNative: boolean;
  isHeadphonesConnected: boolean;
  isEchoCancellationEnabled: boolean;
}

interface UseNativeAudioCaptureOptions {
  /** Whether to automatically start on mount */
  autoStart?: boolean;
  /** Sample rate for audio capture (default: 48000) */
  sampleRate?: number;
  /** Callback for processed (echo-cancelled) audio */
  onProcessedAudio?: (samples: Float32Array, timestamp: number) => void;
  /** Callback for raw microphone audio */
  onMicrophoneAudio?: (samples: Float32Array, timestamp: number) => void;
  /** Callback for system audio */
  onSystemAudio?: (samples: Float32Array, timestamp: number) => void;
}

interface UseNativeAudioCaptureResult {
  /** Whether native audio is available on this platform */
  isAvailable: boolean;
  /** Current audio state */
  state: NativeAudioState;
  /** Whether currently initializing */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Start audio capture */
  start: () => Promise<boolean>;
  /** Stop audio capture */
  stop: () => Promise<void>;
  /** Enable/disable echo cancellation */
  setAecEnabled: (enabled: boolean) => Promise<void>;
}

const DEFAULT_STATE: NativeAudioState = {
  isRunning: false,
  isNative: false,
  isHeadphonesConnected: false,
  isEchoCancellationEnabled: false,
};

/**
 * Hook for native audio capture with echo cancellation
 */
export function useNativeAudioCapture(
  options: UseNativeAudioCaptureOptions = {}
): UseNativeAudioCaptureResult {
  const {
    autoStart = false,
    sampleRate = 48000,
    onProcessedAudio,
    onMicrophoneAudio,
    onSystemAudio,
  } = options;

  const [isAvailable, setIsAvailable] = useState(false);
  const [state, setState] = useState<NativeAudioState>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store callbacks in refs to avoid subscription recreation
  const onProcessedRef = useRef(onProcessedAudio);
  const onMicRef = useRef(onMicrophoneAudio);
  const onSystemRef = useRef(onSystemAudio);

  useEffect(() => {
    onProcessedRef.current = onProcessedAudio;
    onMicRef.current = onMicrophoneAudio;
    onSystemRef.current = onSystemAudio;
  }, [onProcessedAudio, onMicrophoneAudio, onSystemAudio]);

  // Check if native audio is available
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const kakarot = (window as any).kakarot;
        if (!kakarot?.audio?.native) {
          setIsAvailable(false);
          setIsLoading(false);
          return;
        }

        const available = await kakarot.audio.native.isAvailable();
        setIsAvailable(available);

        if (available) {
          const currentState = await kakarot.audio.native.getState();
          setState(currentState);
        }
      } catch (err) {
        console.error("[useNativeAudioCapture] Error checking availability:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    checkAvailability();
  }, []);

  // Set up audio data listeners
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakarot = (window as any).kakarot;
    if (!kakarot?.audio?.native) return;

    const cleanupFunctions: Array<() => void> = [];

    // Processed audio (echo-cancelled)
    const unsubProcessed = kakarot.audio.native.onProcessedData(
      (data: { samples: number[]; timestamp: number }) => {
        if (onProcessedRef.current) {
          onProcessedRef.current(new Float32Array(data.samples), data.timestamp);
        }
      }
    );
    cleanupFunctions.push(unsubProcessed);

    // Raw microphone audio
    const unsubMic = kakarot.audio.native.onMicData(
      (data: { samples: number[]; timestamp: number }) => {
        if (onMicRef.current) {
          onMicRef.current(new Float32Array(data.samples), data.timestamp);
        }
      }
    );
    cleanupFunctions.push(unsubMic);

    // System audio
    const unsubSystem = kakarot.audio.native.onSystemData(
      (data: { samples: number[]; timestamp: number }) => {
        if (onSystemRef.current) {
          onSystemRef.current(new Float32Array(data.samples), data.timestamp);
        }
      }
    );
    cleanupFunctions.push(unsubSystem);

    return () => {
      cleanupFunctions.forEach((fn) => fn());
    };
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && isAvailable && !state.isRunning && !isLoading) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, isAvailable, isLoading]);

  const start = useCallback(async (): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakarot = (window as any).kakarot;
    if (!kakarot?.audio?.native) {
      console.error("[useNativeAudioCapture] window.kakarot.audio.native is not available");
      setError("Native audio not available");
      return false;
    }

    try {
      setError(null);
      console.log("[useNativeAudioCapture] Calling start with sampleRate:", sampleRate);
      const result = await kakarot.audio.native.start({ sampleRate });
      console.log("[useNativeAudioCapture] Start result:", JSON.stringify(result));

      if (result.success && result.state) {
        console.log("[useNativeAudioCapture] ✅ Success, state:", JSON.stringify(result.state));
        setState(result.state);
        return true;
      } else {
        const errorMsg = result.error || "Failed to start audio capture";
        console.error("[useNativeAudioCapture] ❌ Failed:", errorMsg);
        setError(errorMsg);
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[useNativeAudioCapture] ❌ Exception:", err);
      return false;
    }
  }, [sampleRate]);

  const stop = useCallback(async (): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakarot = (window as any).kakarot;
    if (!kakarot?.audio?.native) return;

    try {
      await kakarot.audio.native.stop();
      setState(DEFAULT_STATE);
    } catch (err) {
      console.error("[useNativeAudioCapture] Error stopping:", err);
    }
  }, []);

  const setAecEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kakarot = (window as any).kakarot;
    if (!kakarot?.audio?.native) return;

    try {
      await kakarot.audio.native.setAecEnabled(enabled);
      const newState = await kakarot.audio.native.getState();
      setState(newState);
    } catch (err) {
      console.error("[useNativeAudioCapture] Error setting AEC:", err);
    }
  }, []);

  return {
    isAvailable,
    state,
    isLoading,
    error,
    start,
    stop,
    setAecEnabled,
  };
}
