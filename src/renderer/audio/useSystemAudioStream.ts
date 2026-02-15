/**
 * System Audio Stream Hook
 * Captures system audio using Web Audio API via virtual audio devices
 * (BlackHole, Aggregate Device, etc.)
 */
import { useRef, useCallback } from "react";

export type SystemAudioSourcePreference = "blackhole" | "aggregate" | "auto";

/**
 * Find a system audio device by preference
 */
async function findSystemAudioDeviceId(
  pref: SystemAudioSourcePreference
): Promise<string | undefined> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((d) => d.kind === "audioinput");

  const byName = (name: string) =>
    inputs.find((d) => (d.label || "").toLowerCase().includes(name.toLowerCase()))?.deviceId;

  if (pref === "blackhole" || pref === "auto") {
    const id = byName("blackhole");
    if (id) {
      console.log("[system-audio] Found BlackHole device");
      return id;
    }
  }

  if (pref === "aggregate" || pref === "auto") {
    const id = byName("aggregate");
    if (id) {
      console.log("[system-audio] Found Aggregate device");
      return id;
    }
  }

  console.log("[system-audio] No preferred device found, using default");
  return undefined;
}

export function useSystemAudioStream(
  onRmsUpdate: (rms: number) => void,
  onPcmUpdate: (pcm: Float32Array, sampleRate: number) => void,
  preference: SystemAudioSourcePreference = "auto"
) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const isStartedRef = useRef(false);
  const gainRef = useRef<GainNode | null>(null);
  const isContextReadyRef = useRef(false);

  const start = useCallback(async () => {
    if (isStartingRef.current) {
      console.log("[system-audio] start ignored (startup in progress)");
      return;
    }

    if (isStartedRef.current) {
      console.log("[system-audio] start ignored (already started)");
      return;
    }

    console.log("[system-audio] start entering");
    isStartingRef.current = true;

    try {
      // First request permission with default device
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Then find the system audio device
      const deviceId = await findSystemAudioDeviceId(preference);

      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      console.log("[system-audio] Stream acquired");

      // Initialize AudioContext and worklet if not ready
      if (!isContextReadyRef.current) {
        const audioContext = new AudioContext({ sampleRate: 48000 });
        audioContextRef.current = audioContext;
        await audioContext.resume();
        await audioContext.audioWorklet.addModule("/pcm-worklet.js");
        isContextReadyRef.current = true;
        console.log("[system-audio] AudioContext initialized");
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
      const RMS_UPDATE_INTERVAL = 100; // ms

      workletNode.port.onmessage = (event) => {
        if (event.data.type === "audio") {
          const { rms, pcm } = event.data;
          const now = Date.now();

          // Throttle RMS updates
          if (now - lastRmsUpdate > RMS_UPDATE_INTERVAL) {
            onRmsUpdate(rms);
            lastRmsUpdate = now;
          }

          // Always send PCM data
          onPcmUpdate(pcm, audioContext.sampleRate);
        }
      };

      // Connect the audio graph
      source.connect(workletNode);
      workletNode.connect(gain);
      gain.connect(audioContext.destination);

      isStartedRef.current = true;
      console.log("[system-audio] start complete");
    } catch (error) {
      console.error("[system-audio] Error starting system audio stream:", error);
      throw error;
    } finally {
      isStartingRef.current = false;
    }
  }, [onRmsUpdate, onPcmUpdate, preference]);

  const stop = useCallback(() => {
    if (isStartingRef.current) {
      console.log("[system-audio] stop ignored (startup in progress)");
      return;
    }

    console.log("[system-audio] stop called");
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
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    console.log("[system-audio] stop complete");
  }, []);

  const isActive = useCallback(() => isStartedRef.current, []);

  return { start, stop, isActive };
}
