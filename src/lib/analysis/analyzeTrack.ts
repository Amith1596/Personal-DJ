import Meyda from "meyda";
import { getBpm } from "./getBpm";
import { getBeatGrid } from "./beatGrid";

export type AnalysisResult = {
  bpm: number;
  beats: number[];
  rms: Float32Array;
  spectralFlux: Float32Array;
  hopSize: number;            // samples between frames
  sampleRate: number;         // Hz
  frameDurationSec: number;   // seconds between feature points
  timesSec: Float32Array;     // timestamp for each frame
  energyProfile: number[];    // smoothed energy (1s resolution)
};

/**
 * Analyze a track (File) and extract:
 * - BPM (tempo)
 * - Beat grid (downbeats)
 * - RMS energy per frame
 * - Spectral flux (onsets)
 * - Energy profile (smoothed RMS)
 */
export async function analyzeTrack(file: File): Promise<AnalysisResult> {
  // Safari fallback
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const audioCtx: AudioContext = new AudioCtx();

  // Decode file to an AudioBuffer
  const arrayBuffer = await file.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);

  // --- BPM + Beat grid ---
  const bpm = (await getBpm(decoded)) || 120;
  const beats = await getBeatGrid(decoded);

  // --- Mix down to mono ---
  const mono = new Float32Array(decoded.length);
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      mono[i] += data[i] / decoded.numberOfChannels;
    }
  }

  // --- Frame settings ---
  const frameSize = 1024; // analysis window
  const hopSize = 512;    // step between frames
  const numFrames = Math.max(0, Math.floor((mono.length - frameSize) / hopSize) + 1);

  const rms = new Float32Array(numFrames);
  const spectralFlux = new Float32Array(numFrames);

  let prevAmp: number[] | null = null;
  let frameIndex = 0;

  for (let i = 0; i + frameSize <= mono.length; i += hopSize) {
    const frame = mono.subarray(i, i + frameSize);

    // Compute RMS + amplitude spectrum
    const feats = Meyda.extract(["rms", "amplitudeSpectrum"], frame, {
      sampleRate: decoded.sampleRate,
      bufferSize: frameSize,
    } as any);

    rms[frameIndex] = feats?.rms ?? 0;

    const amp = feats?.amplitudeSpectrum as Float32Array | undefined;
    if (prevAmp && amp) {
      let flux = 0;
      const len = Math.min(prevAmp.length, amp.length);
      for (let k = 0; k < len; k++) {
        const diff = amp[k] - prevAmp[k];
        if (diff > 0) flux += diff;
      }
      spectralFlux[frameIndex] = flux;
    } else {
      spectralFlux[frameIndex] = 0;
    }

    prevAmp = amp ? Array.from(amp) : null;
    frameIndex++;
  }

  const frameDurationSec = hopSize / decoded.sampleRate;
  const timesSec = new Float32Array(numFrames);
  for (let n = 0; n < numFrames; n++) timesSec[n] = n * frameDurationSec;

  // --- Energy profile (smooth RMS into ~1s windows) ---
  const smoothWindow = Math.floor(decoded.sampleRate / hopSize); // ~1 sec
  const energyProfile: number[] = [];
  for (let i = 0; i < rms.length; i += smoothWindow) {
    const slice = rms.slice(i, i + smoothWindow);
    const avg = slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
    energyProfile.push(avg);
  }

  // Free resources
  audioCtx.close();

  // --- Debug summary ---
  const avgRms = rms.reduce((sum, v) => sum + v, 0) / (rms.length || 1);
  const fluxWithIndex = Array.from(spectralFlux).map((v, i) => ({
    value: v,
    time: timesSec[i],
  }));
  const topFlux = fluxWithIndex.sort((a, b) => b.value - a.value).slice(0, 5);

  console.log("✅ Analysis Summary:", {
    bpm,
    beatsCount: beats.length,
    avgRms: avgRms.toFixed(4),
    topFlux,
  });

  return {
    bpm,
    beats,
    rms,
    spectralFlux,
    hopSize,
    sampleRate: decoded.sampleRate,
    frameDurationSec,
    timesSec,
    energyProfile,
  };
}
