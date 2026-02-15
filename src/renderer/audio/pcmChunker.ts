/**
 * PCM Chunker
 * Collects PCM audio frames and emits fixed-duration chunks
 * Resamples audio to target sample rate (16kHz for transcription)
 */

export interface PcmChunk {
  samples: Float32Array;
  timestampStart: number;
  timestampEnd: number;
  source: "mic" | "system";
}

export type ChunkCallback = (chunk: PcmChunk) => void;

export class PcmChunker {
  private buffer: Float32Array[] = [];
  private totalSamples: number = 0;
  private readonly targetSampleRate: number;
  private readonly chunkDurationMs: number;
  private readonly targetSamplesPerChunk: number;
  private chunkStartTime: number = Date.now();
  private source: "mic" | "system";

  constructor(
    private onChunk: ChunkCallback,
    source: "mic" | "system",
    targetSampleRate: number = 16000,
    chunkDurationMs: number = 1000
  ) {
    this.source = source;
    this.targetSampleRate = targetSampleRate;
    this.chunkDurationMs = chunkDurationMs;
    this.targetSamplesPerChunk = this.targetSampleRate * (this.chunkDurationMs / 1000);
  }

  /**
   * Add a frame of PCM audio data
   */
  addFrame(pcm: Float32Array, inputSampleRate: number): void {
    const resampled = this.resamplePcm(pcm, inputSampleRate, this.targetSampleRate);
    this.buffer.push(resampled);
    this.totalSamples += resampled.length;

    // Emit chunks when we have enough samples
    while (this.totalSamples >= this.targetSamplesPerChunk) {
      this.emitChunk();
    }
  }

  /**
   * Resample PCM audio using linear interpolation
   */
  private resamplePcm(
    input: Float32Array,
    inputRate: number,
    outputRate: number
  ): Float32Array {
    if (inputRate === outputRate) {
      return input.slice();
    }

    const ratio = inputRate / outputRate;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const index = Math.floor(inputIndex);
      const fraction = inputIndex - index;

      if (index + 1 < input.length) {
        // Linear interpolation
        output[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
      } else {
        output[i] = input[index];
      }
    }

    return output;
  }

  /**
   * Emit a chunk from the buffer
   */
  private emitChunk(): void {
    if (this.totalSamples < this.targetSamplesPerChunk) return;

    const chunkSamples = new Float32Array(this.targetSamplesPerChunk);
    let samplesTaken = 0;
    const newBuffer: Float32Array[] = [];

    for (const frame of this.buffer) {
      const remaining = this.targetSamplesPerChunk - samplesTaken;

      if (remaining <= 0) {
        newBuffer.push(frame);
        continue;
      }

      if (frame.length <= remaining) {
        chunkSamples.set(frame, samplesTaken);
        samplesTaken += frame.length;
      } else {
        chunkSamples.set(frame.subarray(0, remaining), samplesTaken);
        samplesTaken += remaining;
        newBuffer.push(frame.subarray(remaining));
      }

      if (samplesTaken >= this.targetSamplesPerChunk) break;
    }

    this.buffer = newBuffer;
    this.totalSamples -= this.targetSamplesPerChunk;

    const timestampStart = this.chunkStartTime;
    const timestampEnd = Date.now();
    this.chunkStartTime = timestampEnd;

    const chunk: PcmChunk = {
      samples: chunkSamples,
      timestampStart,
      timestampEnd,
      source: this.source,
    };

    this.onChunk(chunk);

    console.log(
      `[pcm-chunker] Chunk emitted: ${this.source}, ` +
        `${((timestampEnd - timestampStart) / 1000).toFixed(2)}s, ` +
        `${chunkSamples.length} samples`
    );
  }

  /**
   * Flush remaining buffer as a partial chunk
   */
  flush(): void {
    if (this.totalSamples === 0) return;

    // Combine remaining buffer
    const totalLength = this.buffer.reduce((acc, f) => acc + f.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of this.buffer) {
      samples.set(frame, offset);
      offset += frame.length;
    }

    const timestampStart = this.chunkStartTime;
    const timestampEnd = Date.now();

    const chunk: PcmChunk = {
      samples,
      timestampStart,
      timestampEnd,
      source: this.source,
    };

    this.onChunk(chunk);
    console.log(`[pcm-chunker] Partial chunk flushed: ${samples.length} samples`);

    this.buffer = [];
    this.totalSamples = 0;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.buffer = [];
    this.totalSamples = 0;
  }
}
