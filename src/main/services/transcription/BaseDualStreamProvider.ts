import type { TranscriptSegment } from '@shared/types';
import type { ITranscriptionProvider, TranscriptCallback } from './TranscriptionProvider';

/**
 * Base class for dual-stream (mic + system) transcription providers.
 * Handles common state management for connection tracking and audio routing.
 */
export abstract class BaseDualStreamProvider implements ITranscriptionProvider {
  abstract readonly name: string;

  protected transcriptCallback: TranscriptCallback | null = null;
  protected startTime: number = 0;
  protected micConnected: boolean = false;
  protected systemConnected: boolean = false;

  onTranscript(callback: TranscriptCallback): void {
    this.transcriptCallback = callback;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  /**
   * Send audio to the appropriate stream based on source.
   * Subclasses must implement sendToMic and sendToSystem.
   */
  sendAudio(audioData: ArrayBuffer, source: 'mic' | 'system'): void {
    if (source === 'mic' && this.micConnected) {
      this.sendToMic(audioData);
    } else if (source === 'system' && this.systemConnected) {
      this.sendToSystem(audioData);
    }
  }

  protected abstract sendToMic(audioData: ArrayBuffer): void;
  protected abstract sendToSystem(audioData: ArrayBuffer): void;

  protected setConnectionState(source: 'mic' | 'system', connected: boolean): void {
    if (source === 'mic') {
      this.micConnected = connected;
    } else {
      this.systemConnected = connected;
    }
  }

  protected resetState(): void {
    this.micConnected = false;
    this.systemConnected = false;
    this.transcriptCallback = null;
  }

  protected createBaseSegment(
    id: string,
    text: string,
    source: 'mic' | 'system',
    isFinal: boolean,
    confidence: number,
    words: TranscriptSegment['words']
  ): TranscriptSegment {
    return {
      id,
      text,
      timestamp: Date.now() - this.startTime,
      source,
      confidence,
      isFinal,
      words,
    };
  }
}
