// src/lib/analysis/essentiaClient.ts
// Essentia.js (WASM) loader via CDN (<script>) with a typed, safe fallback analyzer.

export type KeyScale = "major" | "minor";
export interface EssentiaAnalysisResult {
  bpm: number;
  sampleRate: number;
  beats: number[];
  onsets: number[];
  rms: number[];
  frameHopSec: number;
  key: { tonic: string; scale: KeyScale; confidence: number };
}

type LoadingStatus = {
  isLoaded: boolean;
  isLoading: boolean;
  error?: string;
  backend: "essentia" | "fallback" | null;
};

let loaded = false;
let loading = false;
let lastError: string | undefined;
let backend: LoadingStatus["backend"] = null;

export function getEssentiaLoadingStatus(): LoadingStatus {
  return { isLoaded: loaded, isLoading: loading, error: lastError, backend };
}

/* -------------------- Essentia globals (typed) -------------------- */

interface RhythmOut { bpm?: number; tempo?: number }
interface OnsetOut { onsets?: number[]; onsetTimes?: number[] }
interface KeyOut { key?: string; scale?: string; strength?: number }

// What methods we *use* from the Essentia wrapper:
interface EssentiaCore {
  RhythmExtractor2013?: (mono: Float32Array, sr: number) => RhythmOut;
  OnsetDetectionGlobal?: (mono: Float32Array, sr: number) => OnsetOut;
  KeyExtractor?: (mono: Float32Array, sr: number) => KeyOut;
}

// Global constructors/shims provided by the CDN scripts
type EssentiaCtor = new (module: unknown) => EssentiaCore;
type EssentiaWASMFactory = () => Promise<unknown>;

function getEssentiaFromWindow(): {
  Essentia?: EssentiaCtor;
  EssentiaWASM?: EssentiaWASMFactory;
} {
  const w = window as unknown as {
    Essentia?: unknown;
    EssentiaWASM?: unknown;
  };
  const Essentia = (typeof w.Essentia === "function") ? (w.Essentia as EssentiaCtor) : undefined;
  const EssentiaWASM = (typeof w.EssentiaWASM === "function") ? (w.EssentiaWASM as EssentiaWASMFactory) : undefined;
  return { Essentia, EssentiaWASM };
}

/* -------------------- Loader -------------------- */

export async function loadEssentia(): Promise<void> {
  if (loaded || loading) return;
  loading = true;
  lastError = undefined;
  backend = null;

  try {
    const ok = await tryLoadEssentiaFromCDN();
    backend = ok ? "essentia" : "fallback";
    loaded = true;
  } catch (err) {
    backend = "fallback";
    lastError = err instanceof Error ? err.message : String(err);
    loaded = true; // still usable via fallback
  } finally {
    loading = false;
  }
}

async function tryLoadEssentiaFromCDN(): Promise<boolean> {
  // Already present?
  const g = getEssentiaFromWindow();
  if (g.Essentia && g.EssentiaWASM) return true;

  try {
    await injectScriptOnce(
      "https://cdn.jsdelivr.net/npm/essentia.js/dist/essentia.js-core.js",
      "essentia-core"
    );
    await injectScriptOnce(
      "https://cdn.jsdelivr.net/npm/essentia.js/dist/essentia-wasm.web.js",
      "essentia-wasm"
    );
  } catch {
    return false;
  }

  const gg = getEssentiaFromWindow();
  return !!(gg.Essentia && gg.EssentiaWASM);
}

function injectScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/* -------------------- Public analysis API -------------------- */

export async function analyzeBuffer(audioBuffer: AudioBuffer): Promise<EssentiaAnalysisResult> {
  await loadEssentia();
  if (backend === "essentia") {
    try {
      return await analyzeWithEssentia(audioBuffer);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Fall through to fallback
    }
  }
  return analyzeFallback(audioBuffer);
}

/* -------------------- Essentia-based analysis (guarded) -------------------- */

async function analyzeWithEssentia(audioBuffer: AudioBuffer): Promise<EssentiaAnalysisResult> {
  const { Essentia, EssentiaWASM } = getEssentiaFromWindow();
  if (!Essentia || !EssentiaWASM) throw new Error("Essentia globals not available");

  const wasmModule = await EssentiaWASM();
  const core: EssentiaCore = new Essentia(wasmModule);

  const sr = audioBuffer.sampleRate;

  // Mono mixdown
  const ch0 = audioBuffer.getChannelData(0);
  let mono = ch0;
  if (audioBuffer.numberOfChannels > 1) {
    const ch1 = audioBuffer.getChannelData(1);
    mono = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mono[i] = 0.5 * (ch0[i] + ch1[i]);
  }

  if (typeof core.RhythmExtractor2013 !== "function") {
    throw new Error("RhythmExtractor2013 not exposed in this bundle");
  }
  const r = core.RhythmExtractor2013(mono, sr) as RhythmOut;
  const bpm = (typeof r.bpm === "number" ? r.bpm : (typeof r.tempo === "number" ? r.tempo : 120));

  // Beat grid
  const beatSec = 60 / Math.max(1, bpm);
  const beats: number[] = [];
  for (let t = 0; t < audioBuffer.duration; t += beatSec) beats.push(t);

  // Onsets (best-effort)
  if (typeof core.OnsetDetectionGlobal !== "function") {
    throw new Error("OnsetDetectionGlobal not exposed in this bundle");
  }
  const onsetOut = core.OnsetDetectionGlobal(mono, sr) as OnsetOut;
  const onsets = (Array.isArray(onsetOut.onsets) ? onsetOut.onsets
                  : Array.isArray(onsetOut.onsetTimes) ? onsetOut.onsetTimes
                  : []) as number[];

  // Key (optional)
  let key = { tonic: "C", scale: "major" as KeyScale, confidence: 0 };
  if (typeof core.KeyExtractor === "function") {
    try {
      const ko = core.KeyExtractor(mono, sr) as KeyOut;
      key = {
        tonic: typeof ko.key === "string" ? ko.key : "C",
        scale: (typeof ko.scale === "string" && ko.scale.toLowerCase() === "minor") ? "minor" : "major",
        confidence: typeof ko.strength === "number" ? ko.strength : 0,
      };
    } catch {
      // keep default key
    }
  }

  // Frame RMS to match fallback API
  const { rms, hopSec } = computeFrameRMS(mono, sr);

  return { bpm, sampleRate: sr, beats, onsets, rms, frameHopSec: hopSec, key };
}

/* -------------------- Lightweight fallback analyzer -------------------- */

function analyzeFallback(audioBuffer: AudioBuffer): EssentiaAnalysisResult {
  const sr = audioBuffer.sampleRate;
  const ch0 = audioBuffer.getChannelData(0);

  // Frame RMS
  const { rms, hopSec } = computeFrameRMS(ch0, sr);

  // Onset envelope
  const onsetEnv = new Array<number>(rms.length);
  onsetEnv[0] = 0;
  for (let i = 1; i < rms.length; i++) {
    const d = rms[i] - rms[i - 1];
    onsetEnv[i] = d > 0 ? d : 0;
  }
  let maxEnv = 1e-9;
  for (let i = 0; i < onsetEnv.length; i++) if (onsetEnv[i] > maxEnv) maxEnv = onsetEnv[i];
  if (maxEnv > 0) for (let i = 0; i < onsetEnv.length; i++) onsetEnv[i] /= maxEnv;

  // BPM via autocorrelation (60..180 BPM)
  const bpm = estimateBPMFromEnvelope(onsetEnv, hopSec, 60, 180);

  // Beat grid
  const beatSec = 60 / bpm;
  const beats: number[] = [];
  let t = 0;
  const dur = audioBuffer.duration;
  while (t < dur) { beats.push(t); t += beatSec; }

  // Onset peaks
  const onsets: number[] = [];
  for (let i = 1; i < onsetEnv.length - 1; i++) {
    if (onsetEnv[i] > 0.15 && onsetEnv[i] > onsetEnv[i - 1] && onsetEnv[i] > onsetEnv[i + 1]) {
      onsets.push(i * hopSec);
    }
  }

  const key = { tonic: "C", scale: "major" as KeyScale, confidence: 0 };
  return { bpm, sampleRate: sr, beats, onsets, rms, frameHopSec: hopSec, key };
}

/* -------------------- helpers -------------------- */

function computeFrameRMS(signal: Float32Array, sr: number, frameSize = 2048, hopSize = 512) {
  const numFrames = Math.max(1, Math.floor((signal.length - frameSize) / hopSize));
  const rms = new Array<number>(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize; let sum = 0;
    for (let j = 0; j < frameSize; j++) { const v = signal[start + j] || 0; sum += v * v; }
    rms[i] = Math.sqrt(sum / frameSize);
  }
  return { rms, hopSec: hopSize / sr };
}

function estimateBPMFromEnvelope(env: number[], hopSec: number, minBPM: number, maxBPM: number): number {
  const minLag = Math.floor((60 / maxBPM) / hopSec);
  const maxLag = Math.floor((60 / minBPM) / hopSec);
  let mean = 0; for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= Math.max(1, env.length);
  const z = env.map(v => v - mean);
  let bestLag = minLag, bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < z.length; i++) acc += z[i] * z[i - lag];
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  return Math.max(60, Math.min(180, 60 / (bestLag * hopSec)));
}
