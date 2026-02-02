import { useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

// Static worklet processor URL - served from public directory
const WORKLET_PROCESSOR_URL = '/audio-capture-processor.js';

// Microphone-only audio capture hook
// System audio is captured in main process via AudioTee
export function useAudioCapture() {
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micWorkletRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isPausedRef = useRef(false);
  const micWorkletLoadedRef = useRef(false);

  const setAudioLevels = useAppStore((state) => state.setAudioLevels);

  const setupMicWorklet = useCallback(
    async (
      audioContext: AudioContext,
      stream: MediaStream
    ): Promise<{ worklet: AudioWorkletNode; sourceNode: MediaStreamAudioSourceNode } | null> => {
      if (!micWorkletLoadedRef.current) {
        await audioContext.audioWorklet.addModule(WORKLET_PROCESSOR_URL);
        micWorkletLoadedRef.current = true;
      }

      const sourceNode = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor');

      workletNode.port.onmessage = (event) => {
        if (isPausedRef.current) return;

        const { pcmData, level } = event.data;
        window.kakarot.audio.sendData(pcmData, 'mic');

        const currentLevels = useAppStore.getState().audioLevels;
        setAudioLevels({ ...currentLevels, mic: level });
      };

      workletNode.onprocessorerror = (event) => {
        console.error('[AudioCapture] Worklet processor error:', event);
      };

      sourceNode.connect(workletNode);
      return { worklet: workletNode, sourceNode };
    },
    [setAudioLevels]
  );

  const startCapture = useCallback(async () => {
    try {
      micAudioContextRef.current = new AudioContext();

      if (micAudioContextRef.current.state === 'suspended') {
        await micAudioContextRef.current.resume();
      }

      // Disable browser AEC - it only cancels echo from audio played BY this app,
      // not from other apps (Zoom, Meet, etc.). Our native AEC handles external audio.
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          echoCancellation: false,     // Disable - doesn't help with external audio
          noiseSuppression: false,     // Let native module handle this
          autoGainControl: false,      // Let native module handle this
        },
        video: false,
      });

      const micTrack = micStreamRef.current.getAudioTracks()[0];
      micTrack.onended = () => console.error('[AudioCapture] Mic track ended unexpectedly');

      const micResult = await setupMicWorklet(micAudioContextRef.current, micStreamRef.current);
      if (micResult) {
        micWorkletRef.current = micResult.worklet;
        micSourceRef.current = micResult.sourceNode;
      }
    } catch (error) {
      console.error('[AudioCapture] Failed to start mic capture:', error);
    }
  }, [setupMicWorklet]);

  const stopCapture = useCallback(async () => {
    try {
      // First, pause to stop worklet from processing
      isPausedRef.current = true;
      console.log('[AudioCapture] Paused worklet processing');

      // Wait a tick to let any pending messages flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Disconnect and stop all nodes first
      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
          console.log('[AudioCapture] Source node disconnected');
        } catch (err) {
          console.warn('[AudioCapture] Error disconnecting source:', err);
        }
        micSourceRef.current = null;
      }

      if (micWorkletRef.current) {
        try {
          micWorkletRef.current.disconnect();
          console.log('[AudioCapture] Worklet node disconnected');
        } catch (err) {
          console.warn('[AudioCapture] Error disconnecting worklet:', err);
        }
        micWorkletRef.current = null;
      }

      // Stop all tracks to release the microphone - this is critical
      if (micStreamRef.current) {
        const trackCount = micStreamRef.current.getTracks().length;
        micStreamRef.current.getTracks().forEach((track) => {
          try {
            // Force stop the track
            track.enabled = false;
            track.stop();
            console.log('[AudioCapture] Stopped audio track:', track.label, 'readyState:', track.readyState);
          } catch (err) {
            console.warn('[AudioCapture] Error stopping track:', err);
          }
        });
        console.log('[AudioCapture] All tracks stopped:', trackCount);
        micStreamRef.current = null;
      }

      // Wait a bit before closing context
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Close audio context - this is critical for releasing mic
      if (micAudioContextRef.current) {
        try {
          const state = micAudioContextRef.current.state;
          console.log('[AudioCapture] Closing audio context, state:', state);
          
          if (state !== 'closed') {
            // Try to close the context
            await micAudioContextRef.current.close();
            console.log('[AudioCapture] Audio context closed successfully');
          }
        } catch (err) {
          console.warn('[AudioCapture] Error closing audio context:', err);
        }
        micAudioContextRef.current = null;
      }

      micWorkletLoadedRef.current = false;
      console.log('[AudioCapture] ✅ Capture fully stopped and all resources released');
    } catch (err) {
      console.error('[AudioCapture] Error in stopCapture:', err);
    }
  }, []);

  const pause = useCallback(async () => {
    isPausedRef.current = true;
    console.log('[AudioCapture] Pausing - stopping tracks to release OS microphone');
    
    try {
      // Stop all tracks to fully release the microphone to the OS
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => {
          try {
            track.enabled = false;
            track.stop();
            console.log('[AudioCapture] Paused - stopped audio track:', track.label);
          } catch (err) {
            console.warn('[AudioCapture] Error stopping track on pause:', err);
          }
        });
        micStreamRef.current = null;
      }
      
      // Disconnect nodes but keep context (for lower overhead on resume)
      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
          console.log('[AudioCapture] Paused - source node disconnected');
        } catch (err) {
          console.warn('[AudioCapture] Error disconnecting source on pause:', err);
        }
        micSourceRef.current = null;
      }
      
      if (micWorkletRef.current) {
        try {
          micWorkletRef.current.disconnect();
          console.log('[AudioCapture] Paused - worklet node disconnected');
        } catch (err) {
          console.warn('[AudioCapture] Error disconnecting worklet on pause:', err);
        }
        micWorkletRef.current = null;
      }
      
      console.log('[AudioCapture] ✅ Pause complete - OS microphone released');
    } catch (err) {
      console.error('[AudioCapture] Error in pause:', err);
    }
  }, []);

  const resume = useCallback(async () => {
    isPausedRef.current = false;
    console.log('[AudioCapture] Resuming - restarting microphone capture');
    
    try {
      // Get a fresh microphone stream
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      const micTrack = micStreamRef.current.getAudioTracks()[0];
      micTrack.onended = () => console.error('[AudioCapture] Mic track ended unexpectedly on resume');

      // Reconnect nodes
      if (micAudioContextRef.current) {
        const micResult = await setupMicWorklet(micAudioContextRef.current, micStreamRef.current);
        if (micResult) {
          micWorkletRef.current = micResult.worklet;
          micSourceRef.current = micResult.sourceNode;
          console.log('[AudioCapture] ✅ Resume complete - microphone capture restarted');
        }
      } else {
        console.warn('[AudioCapture] Audio context lost, cannot resume');
      }
    } catch (err) {
      console.error('[AudioCapture] Error in resume:', err);
    }
  }, [setupMicWorklet]);

  return {
    startCapture,
    stopCapture,
    pause,
    resume,
  };
}
