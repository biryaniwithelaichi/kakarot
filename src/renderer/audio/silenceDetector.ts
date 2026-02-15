/**
 * Silence Detector
 * Classifies audio chunks as speech or silence using adaptive thresholding
 * Works with NoiseEstimator for robust detection
 */

import { PcmChunk } from "./pcmChunker";
import { NoiseEstimator } from "./noiseEstimator";

export type AudioState = "speech" | "silence";

export interface ClassifiedChunk {
  chunk: PcmChunk;
  state: AudioState;
  rms: number;
  speechConfidence: number;
}

export interface SilenceDetectorConfig {
  absoluteMinThreshold: number;
  noiseMultiplier: number;
  thresholdLogThrottleMs: number;
}

const DEFAULT_CONFIG: SilenceDetectorConfig = {
  absoluteMinThreshold: 0.012,
  noiseMultiplier: 2.5,
  thresholdLogThrottleMs: 10000,
};

export class SilenceDetector {
  private readonly config: SilenceDetectorConfig;
  private lastThresholdLog: number = 0;

  constructor(
    private noiseEstimator: NoiseEstimator,
    config: Partial<SilenceDetectorConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify a chunk as speech or silence
   */
  classifyChunk(chunk: PcmChunk): ClassifiedChunk {
    // Calculate RMS (Root Mean Square)
    let sum = 0;
    for (let i = 0; i < chunk.samples.length; i++) {
      sum += chunk.samples[i] * chunk.samples[i];
    }
    const rms = Math.sqrt(sum / chunk.samples.length);

    // Get adaptive threshold
    const adaptiveThreshold = this.noiseEstimator.getAdaptiveThreshold(
      this.config.absoluteMinThreshold,
      this.config.noiseMultiplier
    );

    // Log threshold periodically
    const now = Date.now();
    if (now - this.lastThresholdLog > this.config.thresholdLogThrottleMs) {
      console.log(`[silence-detector] adaptive threshold: ${adaptiveThreshold.toFixed(4)}`);
      this.lastThresholdLog = now;
    }

    // Classify
    const state: AudioState = rms > adaptiveThreshold ? "speech" : "silence";

    // Update noise estimate during silence
    if (state === "silence") {
      this.noiseEstimator.updateWithSilenceRms(rms);
    }

    // Calculate speech confidence (0-1)
    const speechConfidence =
      state === "speech"
        ? Math.min(Math.max((rms - adaptiveThreshold) / adaptiveThreshold, 0), 1)
        : 0;

    return {
      chunk,
      state,
      rms,
      speechConfidence,
    };
  }

  /**
   * Get current threshold for debugging
   */
  getCurrentThreshold(): number {
    return this.noiseEstimator.getAdaptiveThreshold(
      this.config.absoluteMinThreshold,
      this.config.noiseMultiplier
    );
  }
}
