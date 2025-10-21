// src/lib/analysis/essentiaClient.ts
// Lightweight, on-device analysis (no WASM): BPM via autocorrelation of onset envelope,
// beat grid from BPM, simple energy (RMS), naive key stub (we'll swap for Essentia.js later).

export type KeyScale = "major" | "minor";

export interface EssentiaAnalysisResult {
  bpm: number;
  sampleRate: number;
  beats: number[];       // seconds
  onsets: number[];      // seconds (local maxima in onset envelope)
  rms: number[];         // per-frame RMS (hop-based)
  frameHopSec: number;   // seconds per hop
  key: { tonic: string; scale: KeyScale; confidence: number };
}

type LoadingStatus = { isLoaded: boolean; isLoading: boolean; error?: string };

let loaded = false;
let loading = false;
let lastError: string | undefined;

export function getEssentiaLoadingStatus(): LoadingStatus {
  return { isLoaded: loaded, isLoading: loading, error: lastError };
}

export async function loadEssentia(): Promise<void> {
  if (loaded || loading) return;
  try {
    loading = true;
    await new Promise((r) => setTimeout(r, 5)); // placeholder for WASM init later
    loaded = true;
    lastError = undefined;
  } catch (e) {
    lastError = e instanceof Error ? e.message : "Unknown error";
    loaded = false;
  } finally {
    loading = false;
  }
}

export async function analyzeBuffer(audioBuffer: AudioBuffer): Promise<EssentiaAnalysisResult> {
  await loadEssentia();

  const sr = audioBuffer.sampleRate;
  const ch = audioBuffer.getChannelData(0); // mono for analysis
  // analysis params (responsive on phones)
  const frameSize = 2048;
  const hopSize = 512;
  const hopSec = hopSize / sr;

  // --- RMS per frame ---
  const numFrames = Math.max(1, Math.floor((ch.length - frameSize) / hopSize));
  const rms = new Array<number>(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize;
    let sum = 0;
    for (let j = 0; j < frameSize; j++) {
      const v = ch[start + j] || 0;
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / frameSize);
  }

  // --- Onset envelope (half-wave rectified RMS diff) ---
  const onsetEnv = new Array<number>(numFrames);
  onsetEnv[0] = 0;
  for (let i = 1; i < numFrames; i++) {
    const d = rms[i] - rms[i - 1];
    onsetEnv[i] = d > 0 ? d : 0;
  }

  // normalize envelope
  let maxEnv = 1e-9;
  for (let i = 0; i < numFrames; i++) if (onsetEnv[i] > maxEnv) maxEnv = onsetEnv[i];
  if (maxEnv > 0) for (let i = 0; i < numFrames; i++) onsetEnv[i] /= maxEnv;

  // --- BPM via autocorrelation of onset envelope ---
  // Search 60–180 BPM
  const minBPM = 60, maxBPM = 180;
  const minLag = Math.floor((60 / maxBPM) / hopSec);
  const maxLag = Math.floor((60 / minBPM) / hopSec);
  let bestLag = minLag, bestVal = -Infinity;
  // mean-center
  let mean = 0; for (let i = 0; i < numFrames; i++) mean += onsetEnv[i]; mean /= numFrames;
  const envZ = onsetEnv.map(v => v - mean);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < numFrames; i++) acc += envZ[i] * envZ[i - lag];
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  const bpm = Math.max(60, Math.min(180, 60 / (bestLag * hopSec)));

  // --- Beat grid from BPM ---
  const beatSec = 60 / bpm;
  // seed: first strong onset in first few seconds, else time 0
  let seed = 0;
  {
    const windowFrames = Math.min(numFrames, Math.floor(5 / hopSec));
    let bestI = -1, bestE = 0;
    for (let i = 1; i < windowFrames - 1; i++) {
      if (onsetEnv[i] > onsetEnv[i - 1] && onsetEnv[i] > onsetEnv[i + 1] && onsetEnv[i] > 0.3) {
        if (onsetEnv[i] > bestE) { bestE = onsetEnv[i]; bestI = i; }
      }
    }
    if (bestI >= 0) seed = bestI * hopSec;
  }

  const beats: number[] = [];
  const dur = audioBuffer.duration;
  // extend backward a couple beats so we don't always start late
  let t = seed;
  while (t - beatSec > 0) t -= beatSec;
  // forward beats
  for (; t < dur; t += beatSec) beats.push(t);

  // --- Onset times (peaks) ---
  const onsets: number[] = [];
  for (let i = 1; i < numFrames - 1; i++) {
    if (onsetEnv[i] > 0.15 && onsetEnv[i] > onsetEnv[i - 1] && onsetEnv[i] > onsetEnv[i + 1]) {
      onsets.push(i * hopSec);
    }
  }

  // --- Key (stub) ---
  const key = { tonic: "C", scale: "major" as KeyScale, confidence: 0 };

  return {
    bpm,
    sampleRate: sr,
    beats,
    onsets,
    rms,
    frameHopSec: hopSec,
    key,
  };
}
