import { NativeAudioCapture, isNativeAudioAvailable } from "./nativeAudioCapture";
import { AECProcessor, type AECConfig, type AECMetrics } from "./native/AECProcessor";
import { createLogger } from "@main/core/logger";

const logger = createLogger("AudioService");

export interface AudioServiceConfig {
  sampleRate: number;
  enableEchoCancellation: boolean;
  disableAecOnHeadphones: boolean;
}

const DEFAULT_CONFIG: AudioServiceConfig = {
  sampleRate: 48000,
  enableEchoCancellation: true,
  disableAecOnHeadphones: true,
};

export type AudioDataCallback = (samples: Float32Array, timestamp: number) => void;

/**
 * Audio Service manages audio capture with optional echo cancellation
 */
export class AudioService {
  private config: AudioServiceConfig;
  private nativeCapture: NativeAudioCapture | null = null;
  private aecProcessor: AECProcessor | null = null;
  private aecMetricsInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Callbacks
  private onMicrophoneAudio: AudioDataCallback | null = null;
  private onSystemAudio: AudioDataCallback | null = null;
  private onProcessedAudio: AudioDataCallback | null = null;

  constructor(config: Partial<AudioServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if native echo cancellation is available
   */
  static isNativeAvailable(): boolean {
    return isNativeAudioAvailable();
  }

  /**
   * Set the callback for raw microphone audio
   */
  setMicrophoneAudioCallback(callback: AudioDataCallback | null): void {
    this.onMicrophoneAudio = callback;
  }

  /**
   * Set the callback for system audio
   */
  setSystemAudioCallback(callback: AudioDataCallback | null): void {
    this.onSystemAudio = callback;
  }

  /**
   * Set the callback for processed (echo-cancelled) audio
   */
  setProcessedAudioCallback(callback: AudioDataCallback | null): void {
    this.onProcessedAudio = callback;
  }

  /**
   * Start audio capture
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      logger.warn("Audio service already running");
      return true;
    }

    // Check if native capture is available
    if (!isNativeAudioAvailable()) {
      logger.warn("Native audio capture not available, using fallback");
      return this.startFallback();
    }

    // Create native capture instance
    this.nativeCapture = new NativeAudioCapture(this.config.sampleRate);

    // Set up event handlers
    this.nativeCapture.on("microphoneAudio", (samples: Float32Array, timestamp: number) => {
      if (this.onMicrophoneAudio) {
        this.onMicrophoneAudio(samples, timestamp);
      }
    });

    this.nativeCapture.on("systemAudio", (samples: Float32Array, timestamp: number) => {
      if (this.onSystemAudio) {
        this.onSystemAudio(samples, timestamp);
      }
    });

    this.nativeCapture.on("processedAudio", (samples: Float32Array, timestamp: number) => {
      if (this.onProcessedAudio) {
        this.onProcessedAudio(samples, timestamp);
      }
    });

    this.nativeCapture.on("headphoneStatusChanged", (isHeadphones: boolean) => {
      logger.info(`Headphone status changed: ${isHeadphones}`);
      if (this.config.disableAecOnHeadphones && this.nativeCapture) {
        this.nativeCapture.setEchoCancellationEnabled(!isHeadphones);
      }
    });

    this.nativeCapture.on("error", (error: Error) => {
      logger.error("Native audio capture error", { error: error.message });
    });

    // Start capture
    const success = await this.nativeCapture.start();

    if (success) {
      this.isRunning = true;
      logger.info("Audio service started with native capture");

      // Set initial echo cancellation state in native capture
      if (this.config.enableEchoCancellation) {
        const headphones = this.nativeCapture.isHeadphonesConnected();
        this.nativeCapture.setEchoCancellationEnabled(
          !headphones || !this.config.disableAecOnHeadphones
        );
      } else {
        this.nativeCapture.setEchoCancellationEnabled(false);
      }

      // Initialize WebRTC AEC processor for render/capture path
      this.initializeAECProcessor();
    } else {
      logger.error("Failed to start native audio capture");
      this.nativeCapture = null;
    }

    return success;
  }

  /**
   * Fallback to web-based audio capture (no AEC)
   */
  private async startFallback(): Promise<boolean> {
    logger.warn("Fallback audio capture not implemented - use renderer-side capture");
    this.isRunning = true;
    return true;
  }

  /**
   * Initialize the AEC processor if enabled
   */
  private initializeAECProcessor(): void {
    if (!this.config.enableEchoCancellation) {
      logger.info("Echo cancellation disabled, skipping AEC processor");
      return;
    }

    try {
      const aecConfig: AECConfig = {
        enableAec: true,
        enableNs: true,
        enableAgc: false,
        disableAecOnHeadphones: this.config.disableAecOnHeadphones,
        frameDurationMs: 10,
        sampleRate: this.config.sampleRate,
      };

      this.aecProcessor = new AECProcessor(aecConfig);
      logger.info("WebRTC AEC processor initialized");

      // Optional: Log AEC metrics every 5 seconds
      this.aecMetricsInterval = setInterval(() => {
        if (this.aecProcessor && this.aecProcessor.isReady()) {
          const metrics = this.aecProcessor.getMetrics();
          if (metrics.erle !== undefined) {
            logger.debug("AEC metrics", {
              erle: metrics.erle,
              rerl: metrics.rerl,
              residualEchoLevel: metrics.residualEchoLevel,
              renderDelayMs: metrics.renderDelayMs,
              converged: metrics.converged,
            });
          }
        }
      }, 5000);
    } catch (error) {
      logger.error("Failed to initialize AEC processor", {
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn("Continuing without echo cancellation");
      this.aecProcessor = null;
    }
  }

  /**
   * Stop audio capture
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.nativeCapture) {
      this.nativeCapture.stop();
      this.nativeCapture.removeAllListeners();
      this.nativeCapture = null;
    }

    if (this.aecMetricsInterval) {
      clearInterval(this.aecMetricsInterval);
      this.aecMetricsInterval = null;
    }

    if (this.aecProcessor) {
      this.aecProcessor.destroy();
      this.aecProcessor = null;
    }

    this.isRunning = false;
    logger.info("Audio service stopped");
  }

  /**
   * Enable or disable echo cancellation
   */
  setEchoCancellationEnabled(enabled: boolean): void {
    this.config.enableEchoCancellation = enabled;

    if (this.nativeCapture) {
      const headphones = this.nativeCapture.isHeadphonesConnected();
      this.nativeCapture.setEchoCancellationEnabled(
        enabled && (!headphones || !this.config.disableAecOnHeadphones)
      );
    }
  }

  /**
   * Get current state
   */
  getState(): {
    isRunning: boolean;
    isNative: boolean;
    isHeadphonesConnected: boolean;
    isEchoCancellationEnabled: boolean;
  } {
    return {
      isRunning: this.isRunning,
      isNative: this.nativeCapture !== null,
      isHeadphonesConnected: this.nativeCapture?.isHeadphonesConnected() ?? false,
      isEchoCancellationEnabled: this.config.enableEchoCancellation,
    };
  }

  /**
   * Get the AEC processor for advanced operations
   */
  getAECProcessor(): AECProcessor | null {
    return this.aecProcessor;
  }

  /**
   * Get current AEC metrics (echo suppression quality)
   */
  getAECMetrics(): AECMetrics {
    if (this.aecProcessor && this.aecProcessor.isReady()) {
      return this.aecProcessor.getMetrics();
    }
    return {};
  }
}

// Singleton instance
let audioServiceInstance: AudioService | null = null;

/**
 * Get the audio service singleton
 */
export function getAudioService(): AudioService {
  if (!audioServiceInstance) {
    audioServiceInstance = new AudioService();
  }
  return audioServiceInstance;
}
