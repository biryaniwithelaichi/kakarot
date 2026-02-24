import { useRef, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { createLogger } from '@renderer/lib/logger';

// Static worklet processor URL - served from public directory
const WORKLET_PROCESSOR_URL = '/audio-capture-processor.js';
const logger = createLogger('AudioCapture');

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
        logger.error('Worklet processor error', event);
      };

      sourceNode.connect(workletNode);
      return { worklet: workletNode, sourceNode };
    },
    [setAudioLevels]
  );

  const startCapture = useCallback(async () => {
    try {
      isPausedRef.current = false;
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
      micTrack.onended = () => logger.error('Mic track ended unexpectedly');

      const micResult = await setupMicWorklet(micAudioContextRef.current, micStreamRef.current);
      if (micResult) {
        micWorkletRef.current = micResult.worklet;
        micSourceRef.current = micResult.sourceNode;
      }
    } catch (error) {
      logger.error('Failed to start mic capture', error);
    }
  }, [setupMicWorklet]);

  const stopCapture = useCallback(async () => {
    try {
      // First, pause to stop worklet from processing
      isPausedRef.current = true;
      logger.debug('Paused worklet processing');

      // Wait a tick to let any pending messages flush
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Disconnect and stop all nodes first
      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
          logger.debug('Source node disconnected');
        } catch (err) {
          logger.warn('Error disconnecting source', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        micSourceRef.current = null;
      }

      if (micWorkletRef.current) {
        try {
          micWorkletRef.current.disconnect();
          logger.debug('Worklet node disconnected');
        } catch (err) {
          logger.warn('Error disconnecting worklet', {
            error: err instanceof Error ? err.message : String(err),
          });
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
            logger.debug('Stopped audio track', { label: track.label, readyState: track.readyState });
          } catch (err) {
            logger.warn('Error stopping track', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
        logger.debug('All tracks stopped', { trackCount });
        micStreamRef.current = null;
      }

      // Wait a bit before closing context
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Close audio context - this is critical for releasing mic
      if (micAudioContextRef.current) {
        try {
          const state = micAudioContextRef.current.state;
          logger.debug('Closing audio context', { state });
          
          if (state !== 'closed') {
            // Try to close the context
            await micAudioContextRef.current.close();
            logger.debug('Audio context closed successfully');
          }
        } catch (err) {
          logger.warn('Error closing audio context', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        micAudioContextRef.current = null;
      }

      micWorkletLoadedRef.current = false;
      logger.info('Capture fully stopped and all resources released');
    } catch (err) {
      logger.error('Error in stopCapture', err);
    }
  }, []);

  const pause = useCallback(async () => {
    isPausedRef.current = true;
    logger.debug('Pausing - stopping tracks to release OS microphone');
    
    try {
      // Stop all tracks to fully release the microphone to the OS
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => {
          try {
            track.enabled = false;
            track.stop();
            logger.debug('Paused - stopped audio track', { label: track.label });
          } catch (err) {
            logger.warn('Error stopping track on pause', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
        micStreamRef.current = null;
      }
      
      // Disconnect nodes but keep context (for lower overhead on resume)
      if (micSourceRef.current) {
        try {
          micSourceRef.current.disconnect();
          logger.debug('Paused - source node disconnected');
        } catch (err) {
          logger.warn('Error disconnecting source on pause', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        micSourceRef.current = null;
      }
      
      if (micWorkletRef.current) {
        try {
          micWorkletRef.current.disconnect();
          logger.debug('Paused - worklet node disconnected');
        } catch (err) {
          logger.warn('Error disconnecting worklet on pause', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        micWorkletRef.current = null;
      }
      
      logger.info('Pause complete - OS microphone released');
    } catch (err) {
      logger.error('Error in pause', err);
    }
  }, []);

  const resume = useCallback(async () => {
    isPausedRef.current = false;
    logger.debug('Resuming - restarting microphone capture');
    
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
      micTrack.onended = () => logger.error('Mic track ended unexpectedly on resume');

      // Reconnect nodes
      if (micAudioContextRef.current) {
        const micResult = await setupMicWorklet(micAudioContextRef.current, micStreamRef.current);
        if (micResult) {
          micWorkletRef.current = micResult.worklet;
          micSourceRef.current = micResult.sourceNode;
          logger.info('Resume complete - microphone capture restarted');
        }
      } else {
        logger.warn('Audio context lost, cannot resume');
      }
    } catch (err) {
      logger.error('Error in resume', err);
    }
  }, [setupMicWorklet]);

  return {
    startCapture,
    stopCapture,
    pause,
    resume,
  };
}
