/**
 * Microphone Stream Hook
 * Captures microphone audio using Web Audio API and AudioWorklet
 */
import { useRef, useCallback } from "react";

export interface MicStreamCallbacks {
  onRmsUpdate: (rms: number) => void;
  onPcmUpdate: (pcm: Float32Array, sampleRate: number) => void;
}

export function useMicStream(
  onRmsUpdate: (rms: number) => void,
  onPcmUpdate: (pcm: Float32Array, sampleRate: number) => void
) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartedRef = useRef(false);
  const isStartingRef = useRef(false);
  const gainRef = useRef<GainNode | null>(null);
  const isContextReadyRef = useRef(false);

  const start = useCallback(async () => {
    if (isStartingRef.current) {
      console.log("[mic] startMic ignored (startup in progress)");
      return;
    }

    if (isStartedRef.current) {
      console.log("[mic] startMic ignored (already started)");
      return;
    }

    console.log("[mic] startMic entering");
    isStartingRef.current = true;

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // We handle this ourselves
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      console.log("[mic] getUserMedia success");
      streamRef.current = stream;

      // Small delay to ensure stream is ready
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Initialize AudioContext and worklet if not ready
      if (!isContextReadyRef.current) {
        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;
        await audioContext.resume();
        await audioContext.audioWorklet.addModule("/pcm-worklet.js");
        isContextReadyRef.current = true;
        console.log("[mic] AudioContext initialized");
      }

      const audioContext = audioContextRef.current!;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const workletNode = new AudioWorkletNode(audioContext, "pcm-worklet");
      processorRef.current = workletNode;

      // Create gain node with zero gain to prevent feedback
      const gain = audioContext.createGain();
      gain.gain.value = 0;
      gainRef.current = gain;

      // Handle worklet messages
      let lastRmsUpdate = 0;
      let lastLogTime = 0;
      const RMS_UPDATE_INTERVAL = 100; // ms
      const LOG_INTERVAL = 1000; // ms

      workletNode.port.onmessage = (event) => {
        try {
          if (event.data.type === "audio") {
            const { rms, pcm } = event.data;
            const now = Date.now();

            // Throttle RMS updates
            if (now - lastRmsUpdate > RMS_UPDATE_INTERVAL) {
              onRmsUpdate(rms);
              lastRmsUpdate = now;
            }

            // Throttle logging
            if (now - lastLogTime > LOG_INTERVAL) {
              console.log(`[mic] RMS: ${rms.toFixed(4)}`);
              lastLogTime = now;
            }

            // Always send PCM data
            onPcmUpdate(pcm, audioContext.sampleRate);
          }
        } catch (error) {
          console.error("[mic] Error in onmessage:", error);
        }
      };

      // Connect the audio graph
      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioContext.destination);

      isStartedRef.current = true;
      console.log("[mic] startMic fully active");
    } catch (error) {
      console.error("[mic] Error starting mic:", error);
      throw error;
    } finally {
      isStartingRef.current = false;
    }
  }, [onRmsUpdate, onPcmUpdate]);

  const stop = useCallback(() => {
    if (isStartingRef.current) {
      console.log("[mic] stopMic ignored (startup in progress)");
      return;
    }

    console.log("[mic] stopMic called");
    isStartedRef.current = false;

    if (gainRef.current) {
      gainRef.current.disconnect();
      gainRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      isContextReadyRef.current = false;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      streamRef.current = null;
    }

    console.log("[mic] stopMic complete");
  }, []);

  const isActive = useCallback(() => isStartedRef.current, []);

  return { start, stop, isActive };
}
