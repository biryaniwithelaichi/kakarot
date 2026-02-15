/**
 * Noise Estimator
 * Tracks ambient noise floor using exponential moving average
 * Updates during silence periods for accurate adaptive thresholding
 */

export class NoiseEstimator {
  private noiseFloor: number;
  private readonly alpha: number; // EMA smoothing factor
  private lastLogTime: number = 0;
  private readonly logThrottleMs: number;

  /**
   * Create a noise estimator
   * @param initialNoiseFloor Initial noise floor estimate
   * @param alpha Smoothing factor (0-1). Lower = slower adaptation
   * @param logThrottleMs Minimum time between log messages
   */
  constructor(
    initialNoiseFloor: number = 0.01,
    alpha: number = 0.05,
    logThrottleMs: number = 5000
  ) {
    this.noiseFloor = initialNoiseFloor;
    this.alpha = alpha;
    this.logThrottleMs = logThrottleMs;
  }

  /**
   * Update noise floor estimate with a silence RMS measurement
   * Only call this during confirmed silence periods
   */
  updateWithSilenceRms(rms: number): void {
    // Exponential moving average update
    this.noiseFloor = this.noiseFloor * (1 - this.alpha) + rms * this.alpha;

    const now = Date.now();
    if (now - this.lastLogTime > this.logThrottleMs) {
      console.log(`[noise-estimator] floor updated: ${this.noiseFloor.toFixed(4)}`);
      this.lastLogTime = now;
    }
  }

  /**
   * Get the current noise floor estimate
   */
  getNoiseFloor(): number {
    return this.noiseFloor;
  }

  /**
   * Calculate an adaptive threshold based on current noise floor
   * @param absoluteMin Absolute minimum threshold
   * @param noiseMultiplier Multiplier for noise floor
   */
  getAdaptiveThreshold(absoluteMin: number, noiseMultiplier: number): number {
    return Math.max(absoluteMin, this.noiseFloor * noiseMultiplier);
  }

  /**
   * Reset to initial state
   */
  reset(initialNoiseFloor: number = 0.01): void {
    this.noiseFloor = initialNoiseFloor;
    this.lastLogTime = 0;
  }
}
