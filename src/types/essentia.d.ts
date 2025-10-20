declare module 'essentia.js' {
  export class Essentia {
    constructor(wasm: unknown, debug?: boolean);
    RhythmExtractor(audioData: Float32Array, sampleRate: number): { bpm: number };
    BeatTrackerMultiFeature(audioData: Float32Array, sampleRate: number): { ticks: number[] };
    KeyExtractor(audioData: Float32Array, sampleRate: number): { key: string; scale: string; strength: number };
    HPCP(audioData: Float32Array, sampleRate: number): { hpcp: Float32Array };
    OnsetRate(audioData: Float32Array, sampleRate: number): { onsets: number[] };
    RMS(audioData: Float32Array, sampleRate: number): { rms: Float32Array };
  }
  
  export const EssentiaWASM: unknown;
}
