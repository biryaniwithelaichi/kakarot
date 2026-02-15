import { app, ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/ipcChannels';
import { getContainer } from '../core/container';
import { createLogger } from '../core/logger';
import { createTranscriptionProvider, ITranscriptionProvider } from '../services/transcription';
import { getDeepgramTokenService } from '../services/DeepgramTokenService';
import { SystemAudioService } from '../services/SystemAudioService';
import { CalloutService } from '../services/CalloutService';
import { MicActivityMonitor } from '../services/MicActivityMonitor';
import { AECProcessor } from '../audio/native/AECProcessor';
import { AECSync } from '../audio/AECSync';
import { showCalloutWindow } from '../windows/calloutWindow';
import { AUDIO_CONFIG, matchesQuestionPattern, FEATURE_FLAGS } from '../config/constants';
import { getDatabase, saveDatabase } from '../data/database';
import type { CalendarAttendee, RecordingState } from '@shared/types';
import type { IndicatorWindow } from '../windows/IndicatorWindow';

const logger = createLogger('RecordingHandlers');

let transcriptionProvider: ITranscriptionProvider | null = null;
let systemAudioService: SystemAudioService | null = null;
let aecProcessor: AECProcessor | null = null;
let aecSync: AECSync | null = null;
let micActivityMonitor: MicActivityMonitor | null = null;
let stopInProgress = false;
let activeCalendarContext: {
  calendarEventId: string;
  calendarEventTitle: string;
  calendarEventAttendees?: CalendarAttendee[];
  calendarEventStart: string;
  calendarEventEnd: string;
  calendarProvider: string;
} | null = null;
let isPaused = false;
let lastMicApps: string[] = [];
let meetingAppSeen = false;
let autoStopTimer: NodeJS.Timeout | null = null;
let indicatorAmplitudeTimer: NodeJS.Timeout | null = null;
let latestSystemAmplitude = 0;
let latestMicAmplitude = 0;

// 📊 Audio packet counter for logging
let micAudioDataCount = 0;

// ✅ REMOVED: Audio buffering logic (MIN_BUFFER_SAMPLES, micAudioBuffer)
// Audio is now sent immediately to Deepgram for better real-time transcription

export function registerRecordingHandlers(
  mainWindow: BrowserWindow,
  calloutWindow: BrowserWindow,
  options?: {
    indicatorWindow?: IndicatorWindow | null;
    onRecordingStateChange?: (state: RecordingState) => void;
  }
): void {
  const indicatorWindow = options?.indicatorWindow ?? null;
  const setRecordingState = (state: RecordingState): void => {
    mainWindow.webContents.send(IPC_CHANNELS.RECORDING_STATE, state);
    options?.onRecordingStateChange?.(state);
  };
  const calloutService: CalloutService | null = FEATURE_FLAGS.enableCallouts ? new CalloutService() : null;
  const selfAppTokens = [app.getName(), 'com.kakarot.app']
    .filter(Boolean)
    .map((token) => token.toLowerCase());
  const AUTO_STOP_GRACE_MS = 5000;
  const MEETING_APP_BUNDLE_IDS = new Set([
    'com.google.chrome',
    'com.google.chrome.canary',
    'com.microsoft.edgemac',
    'com.microsoft.edge',
    'com.brave.browser',
    'com.vivaldi.vivaldi',
    'company.thebrowser.browser', // Arc
    'org.mozilla.firefox',
    'com.apple.safari',
    'us.zoom.xos',
    'com.microsoft.teams',
    'com.microsoft.teams2',
    'com.webex.meetingmanager',
    'com.cisco.webexmeetingsapp',
  ]);

  const clearAutoStopTimer = (): void => {
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
  };

  const startIndicatorAmplitudeLoop = (): void => {
    if (!indicatorWindow || indicatorAmplitudeTimer) return;
    indicatorAmplitudeTimer = setInterval(() => {
      const combined = Math.sqrt(
        (latestSystemAmplitude * latestSystemAmplitude +
          latestMicAmplitude * latestMicAmplitude) /
          2
      );
      indicatorWindow.sendAudioAmplitude(Math.min(1, combined));
    }, 16);
  };

  const stopIndicatorAmplitudeLoop = (): void => {
    if (indicatorAmplitudeTimer) {
      clearInterval(indicatorAmplitudeTimer);
      indicatorAmplitudeTimer = null;
    }
  };

  const resetMicMonitorState = (): void => {
    clearAutoStopTimer();
    lastMicApps = [];
    meetingAppSeen = false;
  };

  const isSelfApp = (appIdOrName: string): boolean => {
    const lower = appIdOrName.toLowerCase();
    return selfAppTokens.some((token) => lower.includes(token));
  };

  const normalizeAppId = (entry: string): string => {
    const trimmed = entry.trim();
    const colonIndex = trimmed.indexOf(':');
    const value = colonIndex >= 0 ? trimmed.slice(colonIndex + 1) : trimmed;
    return value.toLowerCase();
  };

  const isMeetingApp = (entry: string): boolean => {
    const normalized = normalizeAppId(entry);
    if (MEETING_APP_BUNDLE_IDS.has(normalized)) {
      return true;
    }
    return false;
  };

  const getMicEntries = (apps: string[]): string[] => {
    return apps.filter((entry) => entry.toLowerCase().startsWith('mic:'));
  };

  const handleMicAppsUpdate = (apps: string[], raw: string, timestamp: number): void => {
    lastMicApps = apps;
    mainWindow.webContents.send(IPC_CHANNELS.MIC_APPS_UPDATE, {
      apps,
      raw,
      timestamp,
    });
    logger.debug('Mic activity update', { apps, raw });

    const micApps = getMicEntries(apps);
    const externalMicApps = micApps.filter((entry) => !isSelfApp(entry));
    const meetingApps = externalMicApps.filter((entry) => isMeetingApp(entry));

    if (meetingApps.length > 0) {
      meetingAppSeen = true;
      clearAutoStopTimer();
      return;
    }

    if (!meetingAppSeen || autoStopTimer) {
      return;
    }

    autoStopTimer = setTimeout(() => {
      autoStopTimer = null;
      if (stopInProgress || !meetingAppSeen) {
        return;
      }

      const latestMicApps = getMicEntries(lastMicApps);
      const latestExternalMicApps = latestMicApps.filter((entry) => !isSelfApp(entry));
      const latestMeetingApps = latestExternalMicApps.filter((entry) => isMeetingApp(entry));

      if (latestMeetingApps.length === 0 && transcriptionProvider) {
        logger.info('Auto-stopping recording (no meeting mic apps detected)', {
          lastMicApps,
        });
        void stopRecording('auto');
      } else {
        logger.debug('Auto-stop aborted; meeting mic apps detected', {
          latestMeetingApps,
        });
      }
    }, AUTO_STOP_GRACE_MS);
  };

  const startMicActivityMonitor = (): void => {
    if (micActivityMonitor) {
      return;
    }

    micActivityMonitor = new MicActivityMonitor((update) => {
      handleMicAppsUpdate(update.apps, update.raw, update.timestamp);
    });
    micActivityMonitor.start();
    logger.info('Mic activity monitor started');
  };

  const stopMicActivityMonitor = (): void => {
    if (micActivityMonitor) {
      micActivityMonitor.stop();
      micActivityMonitor = null;
    }
    resetMicMonitorState();
    logger.info('Mic activity monitor stopped');
  };

  const stopRecording = async (reason: 'manual' | 'auto'): Promise<any> => {
    if (stopInProgress) {
      logger.warn('Recording stop requested while already stopping', { reason });
      return null;
    }
    stopInProgress = true;
    clearAutoStopTimer();
    stopIndicatorAmplitudeLoop();
    stopMicActivityMonitor();
    if (reason === 'auto') {
      mainWindow.webContents.send(IPC_CHANNELS.RECORDING_AUTO_STOPPED);
    }

    try {
      logger.info('Recording stop requested', { reason });
      const { meetingRepo, noteGenerationService, calendarService } = getContainer();
      const meetingId = meetingRepo.getCurrentMeetingId();
      const calendContext = activeCalendarContext;
      activeCalendarContext = null;

      setRecordingState('processing');

      // Cancel any pending callouts immediately to prevent timer firing during cleanup
      calloutService?.reset();

      // CRITICAL: Stop audio capture FIRST before cleaning up AEC resources
      // This prevents race conditions where callbacks try to access null AEC objects

      // Step 1: Stop system audio capture (prevents new callbacks from firing)
      if (systemAudioService) {
        const sas = systemAudioService;
        systemAudioService = null;
        await sas.stop().catch((error) => logger.error('System audio stop error', error));
        logger.info('System audio capture stopped');
      }

      // Step 2: Stop native mic capture
      if (aecProcessor && aecProcessor.isMicrophoneCapturing()) {
        logger.info('Stopping native microphone capture');
        aecProcessor.stopMicrophoneCapture();
      }

      // Step 3: Wait for any in-flight audio callbacks to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Step 4: Now safe to clean up AEC resources
      // Clean up AEC sync
      if (aecSync) {
        const finalStats = aecSync.getStats();
        logger.info('Final AEC sync stats', finalStats);
        aecSync.clear();
        aecSync = null;
      }

      // Clean up AEC processor
      if (aecProcessor) {
        try {
          aecProcessor.destroy();
        } catch (error) {
          logger.warn('Error destroying AEC processor', { error: (error as Error).message });
        }
        aecProcessor = null;
      }

      // Reset mic audio counter (no buffer to reset anymore)
      micAudioDataCount = 0;

      // Disconnect transcription and wait for it to flush
      if (transcriptionProvider) {
        const tp = transcriptionProvider;
        transcriptionProvider = null;
        await tp.disconnect().catch((error) => logger.error('Transcription disconnect error', error));
        logger.info('Transcription provider disconnected');
      }

      isPaused = false;

      // Wait for any remaining finals to arrive and be stored
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const meeting = await meetingRepo.endCurrentMeeting();
      logger.info('Meeting ended', { id: meeting?.id, transcriptCount: meeting?.transcript.length });

      // Auto-generate notes in background (only if sufficient transcript)
      if (meeting && meetingId) {
        // Re-fetch meeting to get all transcript segments
        const fullMeeting = meetingRepo.findById(meeting.id);
        
        // Skip note generation if transcript has fewer than 2 segments
        if (fullMeeting && fullMeeting.transcript.length < 2) {
          logger.info('Skipping notes generation - insufficient transcript', {
            meetingId: meeting.id,
            transcriptLength: fullMeeting.transcript.length
          });
          // CRITICAL: Emit completion event so frontend can navigate correctly
          mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_COMPLETE, {
            meetingId: meeting.id,
            title: fullMeeting.title || 'Untitled Meeting',
            overview: '',
          });
          setRecordingState('idle');
          return meeting;
        }

        mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_GENERATING, { meetingId: meeting.id });

        if (fullMeeting && fullMeeting.transcript.length > 0) {
          // Generate notes safely with try/catch
          try {
            logger.info('Notes generation started', { meetingId: meeting.id });
            const notes = await noteGenerationService.generateNotes(fullMeeting);
            
            if (notes) {
              logger.info('Notes generated successfully', { meetingId: meeting.id });
              // Store the full structured notes object for rich UI rendering
              meetingRepo.updateNotes(meeting.id, notes, notes.notesMarkdown, notes.notesMarkdown);
              meetingRepo.updateOverview(meeting.id, notes.overview);

              // Persist extracted participants to meeting.people for prep search
              if (notes.participants && notes.participants.length > 0) {
                const peopleData = notes.participants.map((name: string) => ({ name }));
                meetingRepo.updatePeople(meeting.id, peopleData);
                logger.info('Stored extracted participants', {
                  meetingId: meeting.id,
                  participantCount: notes.participants.length,
                  participants: notes.participants
                });
              }

              saveDatabase();

              // Preserve calendar-derived titles; only override when we don't have a calendar context
              if (!calendContext) {
                logger.info('Updating meeting title with AI-generated title (no calendar context)', {
                  meetingId: meeting.id,
                  aiTitle: notes.title
                });
                const db = getDatabase();
                db.run('UPDATE meetings SET title = ? WHERE id = ?', [notes.title, meeting.id]);
                saveDatabase();
              } else {
                logger.info('Preserving calendar-derived title (calendar context exists)', {
                  meetingId: meeting.id,
                  calendarTitle: fullMeeting.title,
                  aiTitleNotUsed: notes.title
                });
              }

              // Link notes back to calendar event if context exists
              if (calendContext) {
                calendarService.linkNotesToEvent(
                  calendContext.calendarEventId,
                  meeting.id,
                  calendContext.calendarProvider as 'google' | 'outlook' | 'icloud'
                ).catch((err) => {
                  logger.error('Failed to link notes to calendar event', {
                    calendarEventId: calendContext.calendarEventId,
                    error: (err as Error).message,
                  });
                });
              }

              mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_COMPLETE, {
                meetingId: meeting.id,
                title: notes.title,
                overview: notes.overview,
              });
            } else {
              logger.info('Notes generation skipped (no notes returned)', { meetingId: meeting.id });
              mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_COMPLETE, {
                meetingId: meeting.id,
                title: fullMeeting.title || 'Untitled Meeting',
                overview: '',
              });
            }
          } catch (error) {
            logger.error('Notes generation failed', { 
              meetingId: meeting.id, 
              error: (error as Error).message 
            });
            // Still emit completion event so renderer can navigate
            mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_COMPLETE, {
              meetingId: meeting.id,
              title: fullMeeting.title || 'Untitled Meeting',
              overview: '',
            });
          }
          setRecordingState('idle');
        } else {
          logger.warn('No transcript segments to generate notes from');
          setRecordingState('idle');
        }
      } else {
        logger.warn('No meeting or meetingId available for notes generation');
        // CRITICAL: Still emit completion event so frontend doesn't get stuck
        mainWindow.webContents.send(IPC_CHANNELS.MEETING_NOTES_COMPLETE, {
          meetingId: meetingId || 'unknown',
          title: 'Meeting Error',
          overview: '',
        });
        setRecordingState('idle');
      }

      return meeting;
    } finally {
      stopInProgress = false;
    }
  };

  ipcMain.handle(IPC_CHANNELS.RECORDING_START, async (_, calendarContext?: any) => {
    logger.info('Recording start requested', { hasCalendarContext: !!calendarContext });
    const { meetingRepo, settingsRepo } = getContainer();
    const settings = settingsRepo.getSettings();
    logger.debug('Using transcription provider', { provider: 'Deepgram (WebSocket streaming, low-latency)' });

    // Store calendar context for later linking
    if (calendarContext) {
      activeCalendarContext = calendarContext;
      logger.info('Calendar context attached to recording', {
        eventId: calendarContext.calendarEventId,
        title: calendarContext.calendarEventTitle,
      });
    }

    // Start meeting with calendar title and attendees if available
    const meetingTitle = calendarContext?.calendarEventTitle;
    const attendeeEmails = calendarContext?.calendarEventAttendees;
    const meetingId = await meetingRepo.startNewMeeting(meetingTitle, attendeeEmails);
    logger.info('Meeting started', { 
      meetingId,
      meetingTitle, 
      hadCalendarContext: !!calendarContext,
      attendeeCount: attendeeEmails?.length || 0,
      actualTitle: meetingTitle || 'will use default timestamp'
    });

    setRecordingState('recording');
    startMicActivityMonitor();
    startIndicatorAmplitudeLoop();

    // Initialize AEC processor for echo cancellation
    try {
      aecProcessor = new AECProcessor({
        enableAec: true,
        enableNs: true,
        enableAgc: true,  // ✅ ENABLED: Automatically boosts mic volume (important for built-in mics)
        frameDurationMs: 10,
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      });
      logger.info('✅ AEC processor initialized for recording session');

      // Initialize AECSync for render/capture synchronization
      try {
        aecSync = new AECSync(aecProcessor);
        logger.info('✅ AECSync initialized for recording session');
      } catch (error) {
        logger.error('Failed to initialize AECSync', { error: (error as Error).message });
        aecSync = null;
      }
    } catch (error) {
      logger.error('Failed to initialize AEC processor', { error: (error as Error).message });
      aecProcessor = null;
      aecSync = null;
      // Continue without AEC if initialization fails
    }

    // Fetch temporary Deepgram token from backend (API key stays secure on server)
    const tokenService = getDeepgramTokenService();
    const tokenResponse = await tokenService.getTemporaryToken();
    logger.info('Deepgram temporary token acquired', {
      expiresIn: tokenResponse.expires_in,
    });

    // Create transcription provider with token (no local API key - fully secure)
    transcriptionProvider = createTranscriptionProvider({ token: tokenResponse.access_token });
    logger.info('Using transcription provider', {
      name: transcriptionProvider.name,
      authMethod: 'JWT token (secure)',
    });

    // Set up transcript forwarding
    transcriptionProvider.onTranscript((segment, isFinal) => {
      logger.debug('Transcript received', {
        source: segment.source,
        isFinal,
        textPreview: segment.text.slice(0, 30),
      });

      const channel = isFinal ? IPC_CHANNELS.TRANSCRIPT_FINAL : IPC_CHANNELS.TRANSCRIPT_UPDATE;

      mainWindow.webContents.send(channel, {
        segment,
        meetingId: meetingRepo.getCurrentMeetingId(),
      });

      // Store final segments and process callout logic
      if (isFinal) {
        meetingRepo.addTranscriptSegment(segment);

        if (calloutService) {
          // Add to callout service sliding window for context
          calloutService.addTranscriptSegment(segment);

          // Check for questions from system audio (other speakers)
          if (segment.source === 'system' && matchesQuestionPattern(segment.text)) {
            calloutService.scheduleCallout(segment.text, (callout) => {
              calloutWindow.webContents.send(IPC_CHANNELS.CALLOUT_SHOW, callout);
              showCalloutWindow();
            });
          }

          // Check if mic response should cancel pending callout
          if (segment.source === 'mic') {
            calloutService.checkForMicResponse(segment.text);
          }
        }
      }
    });

    transcriptionProvider
      .connect()
      .then(() => {
        logger.info('Transcription provider connected');

        if (transcriptionProvider) {
          systemAudioService = new SystemAudioService();

          // Pass shared AEC processor
          if (aecProcessor) {
            systemAudioService.setAECProcessor(aecProcessor);
          }

          // Feed system audio to AECSync for synchronization
          if (aecSync) {
            systemAudioService.onSystemAudio((samples, timestamp) => {
              // Null-safety check: aecSync might be cleaned up during shutdown
              if (aecSync) {
                aecSync.addRenderAudio(samples, timestamp);
              }
            });
          }

          systemAudioService.onAudioLevel((level) => {
            latestSystemAmplitude = level;
            mainWindow.webContents.send(IPC_CHANNELS.AUDIO_LEVELS, { system: level });
          });

          systemAudioService
            .start(transcriptionProvider)
            .then(() => {
              logger.info('System audio capture started');

              // ✅ OPTIMIZED: Start native microphone capture with IMMEDIATE streaming
              if (aecProcessor && transcriptionProvider) {
                const tp = transcriptionProvider; // Capture in closure
                
                const success = aecProcessor.startMicrophoneCapture((samples, timestamp) => {
                  // This callback runs in main process with native timestamps!
                  micAudioDataCount++;
                  if (micAudioDataCount % AUDIO_CONFIG.PACKET_LOG_INTERVAL === 1) {
                    logger.debug('Native mic audio received', {
                      size: samples.length,
                      timestamp,
                      count: micAudioDataCount,
                    });
                  }

                  // Skip if paused
                  if (isPaused || !tp) {
                    return;
                  }

                  // Process mic audio through AEC with synchronized timestamps
                  let cleanFloat32: Float32Array | null = null;

                  if (aecSync) {
                    // Use synchronized AEC processing with native timestamp!
                    cleanFloat32 = aecSync.processCaptureWithSync(samples, timestamp);
                    
                    // Log sync stats occasionally
                    if (micAudioDataCount % 100 === 0) {
                      const stats = aecSync.getStats();
                      logger.debug('AEC sync performance', {
                        syncRate: `${stats.syncRate.toFixed(1)}%`,
                        bufferSize: stats.bufferSize,
                        packet: micAudioDataCount
                      });
                    }
                  } else if (aecProcessor && aecProcessor.isReady()) {
                    // Fallback: direct AEC without sync
                    cleanFloat32 = aecProcessor.processCaptureAudio(samples);
                  }

                  // Update mic amplitude for indicator (use clean audio if available)
                  const micSamples = cleanFloat32 ?? samples;
                  let micSumSquares = 0;
                  for (let i = 0; i < micSamples.length; i++) {
                    const sample = micSamples[i];
                    micSumSquares += sample * sample;
                  }
                  const micRms = Math.sqrt(micSumSquares / micSamples.length);
                  latestMicAmplitude = Math.min(1, micRms * 3);

                  // ✅ CRITICAL CHANGE: Send audio IMMEDIATELY without buffering
                  if (cleanFloat32 && cleanFloat32.length > 0) {
                    // Convert echo-cancelled audio to Int16
                    const cleanInt16 = new Int16Array(cleanFloat32.length);
                    for (let i = 0; i < cleanFloat32.length; i++) {
                      cleanInt16[i] = Math.max(-32768, Math.min(32767, cleanFloat32[i] * 32768));
                    }
                    
                    // 🚀 SEND IMMEDIATELY - No buffering, no delays
                    // This allows Deepgram's VAD to naturally detect speech boundaries
                    tp.sendAudio(cleanInt16.buffer as ArrayBuffer, 'mic');
                    
                    // Log occasionally for debugging
                    if (micAudioDataCount % 100 === 1) {
                      logger.debug('📤 Mic audio sent to Deepgram (AEC - immediate streaming)', { 
                        samples: cleanInt16.length,
                        bytes: cleanInt16.buffer.byteLength,
                        packet: micAudioDataCount
                      });
                    }
                  } else {
                    // Fallback to raw audio if AEC processing fails
                    if (micAudioDataCount % 100 === 1) {
                      logger.warn('AEC processing returned empty, using raw mic audio', { micAudioDataCount });
                    }
                    
                    const rawInt16 = new Int16Array(samples.length);
                    for (let i = 0; i < samples.length; i++) {
                      rawInt16[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
                    }
                    
                    // 🚀 SEND IMMEDIATELY - No buffering
                    tp.sendAudio(rawInt16.buffer as ArrayBuffer, 'mic');
                    
                    if (micAudioDataCount % 100 === 1) {
                      logger.debug('📤 Mic audio sent to Deepgram (raw - immediate streaming)', { 
                        samples: rawInt16.length,
                        bytes: rawInt16.buffer.byteLength,
                        packet: micAudioDataCount
                      });
                    }
                  }
                });

                if (success) {
                  logger.info('✅ Native microphone capture started with immediate streaming (no buffering)');
                  logger.info('🎯 Audio packets are sent directly to Deepgram for optimal VAD and sentence formation');
                } else {
                  logger.error('❌ Failed to start native microphone capture');
                }
              }
            })
            .catch((error) => {
              logger.error('System audio capture failed', error);
            });
        }
      })
      .catch((error) => {
        logger.error('Transcription provider connection failed', error);
      });

    return meetingId;
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_STOP, async () => stopRecording('manual'));

  ipcMain.handle(IPC_CHANNELS.RECORDING_PAUSE, async () => {
    isPaused = true;
    // Cancel pending callouts - don't show callouts while paused
    calloutService?.cancelPendingCallout();
    
    // Pause system audio
    if (systemAudioService) {
      systemAudioService.pause();
    }
    
    // Stop microphone capture (we'll restart on resume)
    if (aecProcessor && aecProcessor.isMicrophoneCapturing()) {
      logger.info('Stopping microphone capture on pause');
      aecProcessor.stopMicrophoneCapture();
    }
    
    // Pause transcription provider
    if (transcriptionProvider) {
      transcriptionProvider.pause?.();
    }
    
    setRecordingState('paused');
  });

  ipcMain.handle(IPC_CHANNELS.RECORDING_RESUME, async () => {
    isPaused = false;

    // Resume system audio
    if (systemAudioService) {
      systemAudioService.resume();
    }

    // Restart microphone capture if it was stopped
    if (aecProcessor && !aecProcessor.isMicrophoneCapturing()) {
      logger.info('Restarting microphone capture on resume');
      aecProcessor.startMicrophoneCapture((samples: Float32Array, timestamp: number) => {
        micAudioDataCount += samples.length;
        if (transcriptionProvider && !isPaused) {
          transcriptionProvider.send?.(samples, timestamp, 'microphone');
        }
      });
    }

    // Resume transcription provider
    if (transcriptionProvider) {
      transcriptionProvider.resume?.();
    }

    setRecordingState('recording');
  });

  // Discard recording - stops everything without generating notes and deletes the meeting
  ipcMain.handle(IPC_CHANNELS.RECORDING_DISCARD, async () => {
    logger.info('Recording discard requested');
    const { meetingRepo } = getContainer();
    const meetingId = meetingRepo.getCurrentMeetingId();

    // Cancel any pending callouts
    calloutService?.reset();
    activeCalendarContext = null;
    stopMicActivityMonitor();

    // Stop system audio capture
    if (systemAudioService) {
      const sas = systemAudioService;
      systemAudioService = null;
      await sas.stop().catch((error) => logger.error('System audio stop error on discard', error));
      logger.info('System audio capture stopped (discard)');
    }

    // Stop native mic capture
    if (aecProcessor && aecProcessor.isMicrophoneCapturing()) {
      logger.info('Stopping native microphone capture (discard)');
      aecProcessor.stopMicrophoneCapture();
    }

    // Wait for in-flight audio callbacks
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Clean up AEC sync
    if (aecSync) {
      aecSync.clear();
      aecSync = null;
    }

    // Clean up AEC processor
    if (aecProcessor) {
      try {
        aecProcessor.destroy();
      } catch (error) {
        logger.warn('Error destroying AEC processor on discard', { error: (error as Error).message });
      }
      aecProcessor = null;
    }

    // Reset mic audio counter
    micAudioDataCount = 0;

    // Disconnect transcription
    if (transcriptionProvider) {
      const tp = transcriptionProvider;
      transcriptionProvider = null;
      await tp.disconnect().catch((error) => logger.error('Transcription disconnect error on discard', error));
      logger.info('Transcription provider disconnected (discard)');
    }

    isPaused = false;

    // Delete the meeting if it exists
    if (meetingId) {
      try {
        meetingRepo.clearCurrentMeeting();
        meetingRepo.delete(meetingId);
        logger.info('Meeting discarded', { meetingId });
      } catch (error) {
        logger.error('Failed to delete meeting on discard', { error: (error as Error).message });
      }
    } else {
      meetingRepo.clearCurrentMeeting();
    }

    setRecordingState('idle');
    logger.info('Recording discarded successfully');
  });
}

// Expose transcription state for other handlers (e.g., audioHandlers)
export function getActiveTranscriptionProvider(): ITranscriptionProvider | null {
  return transcriptionProvider;
}

export function isRecordingPaused(): boolean {
  return isPaused;
}
