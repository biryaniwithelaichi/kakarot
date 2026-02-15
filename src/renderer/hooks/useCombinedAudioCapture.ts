/**
 * Combined Audio Capture Hook
 * Uses native AEC when available, falls back to web-based capture
 * Provides a unified interface for audio capture with echo cancellation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNativeAudioCapture } from "./useNativeAudioCapture";
// DISABLED: Using native mic capture instead of renderer mic
// import { useMicStream } from "@renderer/audio/useMicStream";
import { useSystemAudioStream, type SystemAudioSourcePreference } from "@renderer/audio/useSystemAudioStream";
import { PcmChunker, type PcmChunk } from "@renderer/audio/pcmChunker";
import { NoiseEstimator } from "@renderer/audio/noiseEstimator";
import { SilenceDetector, type ClassifiedChunk } from "@renderer/audio/silenceDetector";

export interface CombinedAudioCaptureOptions {
  /** Target sample rate for output (default: 16000 for transcription) */
  targetSampleRate?: number;
  /** Chunk duration in milliseconds (default: 1000) */
  chunkDurationMs?: number;
  /** System audio source preference */
  systemAudioPreference?: SystemAudioSourcePreference;
  /** Callback for processed audio chunks */
  onAudioChunk?: (chunk: ClassifiedChunk) => void;
  /** Callback for RMS level updates (for visualization) */
  onMicLevel?: (rms: number) => void;
  /** Callback for system audio RMS level */
  onSystemLevel?: (rms: number) => void;
}

export interface CombinedAudioCaptureResult {
  /** Whether capture is active */
  isCapturing: boolean;
  /** Whether using native AEC */
  isNativeAec: boolean;
  /** Whether headphones are connected */
  isHeadphonesConnected: boolean;
  /** Whether echo cancellation is enabled */
  isAecEnabled: boolean;
  /** Any error message */
  error: string | null;
  /** Start audio capture */
  start: () => Promise<void>;
  /** Stop audio capture */
  stop: () => void;
  /** Toggle echo cancellation */
  setAecEnabled: (enabled: boolean) => Promise<void>;
}

/**
 * Combined audio capture hook with automatic AEC selection
 */
export function useCombinedAudioCapture(
  options: CombinedAudioCaptureOptions = {}
): CombinedAudioCaptureResult {
  const {
    targetSampleRate = 16000,
    chunkDurationMs = 1000,
    systemAudioPreference = "auto",
    onAudioChunk,
    onMicLevel,
    onSystemLevel,
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingNative, setUsingNative] = useState(false);

  // Native AEC hook
  const nativeAudio = useNativeAudioCapture({
    autoStart: false,
    onProcessedAudio: useCallback(
      (samples: Float32Array, _timestamp: number) => {
        // Process native audio through chunker
        micChunkerRef.current?.addFrame(samples, 48000);
      },
      []
    ),
  });

  // Web audio hooks for fallback (RMS values set by callbacks below)
  const [, setMicRms] = useState(0);
  const [, setSystemRms] = useState(0);

  // Refs for audio processing
  const micChunkerRef = useRef<PcmChunker | null>(null);
  const systemChunkerRef = useRef<PcmChunker | null>(null);
  const noiseEstimatorRef = useRef<NoiseEstimator | null>(null);
  const silenceDetectorRef = useRef<SilenceDetector | null>(null);
  const onAudioChunkRef = useRef(onAudioChunk);

  // Update callback ref
  useEffect(() => {
    onAudioChunkRef.current = onAudioChunk;
  }, [onAudioChunk]);

  // Initialize processing pipeline
  useEffect(() => {
    noiseEstimatorRef.current = new NoiseEstimator();
    silenceDetectorRef.current = new SilenceDetector(noiseEstimatorRef.current);

    const handleChunk = (chunk: PcmChunk) => {
      if (silenceDetectorRef.current && onAudioChunkRef.current) {
        const classified = silenceDetectorRef.current.classifyChunk(chunk);
        onAudioChunkRef.current(classified);
      }
    };

    micChunkerRef.current = new PcmChunker(handleChunk, "mic", targetSampleRate, chunkDurationMs);
    systemChunkerRef.current = new PcmChunker(handleChunk, "system", targetSampleRate, chunkDurationMs);

    return () => {
      micChunkerRef.current?.destroy();
      systemChunkerRef.current?.destroy();
    };
  }, [targetSampleRate, chunkDurationMs]);

  // Web audio callbacks (reserved for fallback mode)
  const _handleMicPcm = useCallback((pcm: Float32Array, sampleRate: number) => {
    micChunkerRef.current?.addFrame(pcm, sampleRate);
  }, []);
  void _handleMicPcm;

  const handleSystemPcm = useCallback((pcm: Float32Array, sampleRate: number) => {
    systemChunkerRef.current?.addFrame(pcm, sampleRate);
  }, []);

  const _handleMicRms = useCallback(
    (rms: number) => {
      setMicRms(rms);
      onMicLevel?.(rms);
    },
    [onMicLevel]
  );
  void _handleMicRms;

  const handleSystemRms = useCallback(
    (rms: number) => {
      setSystemRms(rms);
      onSystemLevel?.(rms);
    },
    [onSystemLevel]
  );

  // DISABLED: Web audio mic capture - using native mic instead
  // Create a dummy micStream object for compatibility
  const _micStream = {
    start: async () => {
      console.log("[CombinedAudio] Renderer mic capture is disabled - using native mic instead");
    },
    stop: () => {
      console.log("[CombinedAudio] Renderer mic capture is disabled");
    },
  };
  void _micStream;

  const systemStream = useSystemAudioStream(handleSystemRms, handleSystemPcm, systemAudioPreference);

  // Start capture
  const start = useCallback(async () => {
    setError(null);

    try {
      // Try native first if available
      if (nativeAudio.isAvailable) {
        console.log("[CombinedAudio] Starting native audio capture");
        console.log("[CombinedAudio] Native state:", nativeAudio.state);
        console.log("[CombinedAudio] Native error:", nativeAudio.error);
        
        try {
          const success = await nativeAudio.start();
          if (success) {
            setUsingNative(true);
            setIsCapturing(true);
            console.log("[CombinedAudio] ✅ Native audio capture started");
            return;
          }
          console.error("[CombinedAudio] ❌ Native capture returned false, error:", nativeAudio.error);
        } catch (nativeErr) {
          console.error("[CombinedAudio] ❌ Native capture threw error:", nativeErr);
        }
        console.warn("[CombinedAudio] Falling back to web audio");
      } else {
        console.log("[CombinedAudio] Native audio not available, using web audio");
      }

      // Fall back to web audio (system only, mic is native)
      console.log("[CombinedAudio] Starting web audio capture (system audio only)");
      setUsingNative(false);
      // Only start system stream - mic is handled natively
      await systemStream.start();
      setIsCapturing(true);
      console.log("[CombinedAudio] Web audio capture started (system audio only)");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start audio capture";
      setError(message);
      console.error("[CombinedAudio] Error starting:", err);
    }
  }, [nativeAudio, systemStream]);

  // Stop capture
  const stop = useCallback(() => {
    if (usingNative) {
      nativeAudio.stop();
    } else {
      // Only stop system stream - mic is handled natively
      systemStream.stop();
    }

    // Flush any remaining audio
    micChunkerRef.current?.flush();
    systemChunkerRef.current?.flush();

    setIsCapturing(false);
    console.log("[CombinedAudio] Capture stopped");
  }, [usingNative, nativeAudio, systemStream]);

  // Toggle AEC
  const setAecEnabled = useCallback(
    async (enabled: boolean) => {
      if (usingNative) {
        await nativeAudio.setAecEnabled(enabled);
      }
      // Web audio doesn't have AEC, so this is a no-op
    },
    [usingNative, nativeAudio]
  );

  return {
    isCapturing,
    isNativeAec: usingNative && nativeAudio.state.isRunning,
    isHeadphonesConnected: nativeAudio.state.isHeadphonesConnected,
    isAecEnabled: nativeAudio.state.isEchoCancellationEnabled,
    error: error || nativeAudio.error,
    start,
    stop,
    setAecEnabled,
  };
}