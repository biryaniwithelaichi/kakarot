import { EventEmitter } from "events";

// Native module callback type - receives (buffer, timestamp, source)
type AudioCallback = (buffer: Float32Array, timestamp: number, source: string) => void;

// Native module interface - matches actual native module exports
interface NativeAudioModule {
  startAudioCapture(sampleRate: number, callback: AudioCallback): boolean;
  stopAudioCapture(): boolean;
  setEchoCancellationEnabled(enabled: boolean): void;
  setAdaptationRate?(rate: number): void;
  isHeadphonesConnected(): boolean;
  isCapturing?(): boolean;
}

export interface AudioCaptureEvents {
  microphoneAudio: (samples: Float32Array, timestamp: number) => void;
  systemAudio: (samples: Float32Array, timestamp: number) => void;
  processedAudio: (samples: Float32Array, timestamp: number) => void;
  headphoneStatusChanged: (isHeadphones: boolean) => void;
  error: (error: Error) => void;
}

let nativeModule: NativeAudioModule | null = null;

// Try to load the native module
function loadNativeModule(): NativeAudioModule | null {
  if (nativeModule !== null) {
    return nativeModule;
  }

  try {
    // Try different paths for the native module
    const paths = [
      "../../build/Release/audio_capture_native.node",
      "../../../build/Release/audio_capture_native.node",
      "../../../../build/Release/audio_capture_native.node",
    ];

    for (const modulePath of paths) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        nativeModule = require(modulePath) as NativeAudioModule;
        console.log("[NativeAudioCapture] Module loaded from:", modulePath);
        return nativeModule;
      } catch {
        // Try next path
      }
    }

    console.warn("[NativeAudioCapture] Native module not found in any path");
    return null;
  } catch (err) {
    console.warn("[NativeAudioCapture] Failed to load native module:", err);
    return null;
  }
}

/**
 * Check if native audio capture is available
 */
export function isNativeAudioAvailable(): boolean {
  return loadNativeModule() !== null;
}

/**
 * Native Audio Capture class
 * Emits events for microphone, system, and processed audio
 */
export class NativeAudioCapture extends EventEmitter {
  private isCapturing = false;
  private sampleRate: number;

  constructor(sampleRate: number = 48000) {
    super();
    this.sampleRate = sampleRate;
  }

  /**
   * Start audio capture with echo cancellation
   */
  async start(): Promise<boolean> {
    const module = loadNativeModule();
    if (!module) {
      console.error("[NativeAudioCapture] Native module not available");
      this.emit("error", new Error("Native audio module not available"));
      return false;
    }

    if (this.isCapturing) {
      console.warn("[NativeAudioCapture] Already capturing");
      return true;
    }

    try {
      // Native module callback receives: (buffer: Float32Array, timestamp: number, source: string)
      // Native module sends: 'microphone', 'system', or 'processed'
      const callback = (buffer: Float32Array, timestamp: number, source: string) => {
        switch (source) {
          case 'mic':
          case 'microphone':
            this.emit("microphoneAudio", buffer, timestamp);
            break;
          case 'system':
            this.emit("systemAudio", buffer, timestamp);
            break;
          case 'processed':
            this.emit("processedAudio", buffer, timestamp);
            break;
          default:
            console.warn("[NativeAudioCapture] Unknown source:", source);
        }
      };

      const success = module.startAudioCapture(this.sampleRate, callback);

      if (success) {
        this.isCapturing = true;
        console.log("[NativeAudioCapture] Started successfully");
      } else {
        console.error("[NativeAudioCapture] Failed to start");
        this.emit("error", new Error("Failed to start audio capture"));
      }

      return success;
    } catch (err) {
      console.error("[NativeAudioCapture] Error starting:", err);
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  /**
   * Stop audio capture
   */
  stop(): void {
    const module = loadNativeModule();
    if (!module || !this.isCapturing) {
      return;
    }

    try {
      module.stopAudioCapture();
      this.isCapturing = false;
      console.log("[NativeAudioCapture] Stopped");
    } catch (err) {
      console.error("[NativeAudioCapture] Error stopping:", err);
    }
  }

  /**
   * Enable or disable echo cancellation
   */
  setEchoCancellationEnabled(enabled: boolean): void {
    const module = loadNativeModule();
    if (module) {
      module.setEchoCancellationEnabled(enabled);
    }
  }

  /**
   * Set the adaptation rate for the echo canceller
   * @param rate Value between 0.0 and 1.0
   */
  setAdaptationRate(rate: number): void {
    const module = loadNativeModule();
    if (module?.setAdaptationRate) {
      module.setAdaptationRate(Math.max(0, Math.min(1, rate)));
    }
  }

  /**
   * Check if headphones are connected
   */
  isHeadphonesConnected(): boolean {
    const module = loadNativeModule();
    return module ? module.isHeadphonesConnected() : false;
  }

  /**
   * Check if currently capturing
   */
  getIsCapturing(): boolean {
    return this.isCapturing;
  }
}
