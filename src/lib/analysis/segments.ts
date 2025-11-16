// src/lib/analysis/segments.ts
import type { EssentiaAnalysisResult } from "./essentiaClient";

export interface SegmentBoundary { time: number; strength: number }
export interface InteriorRanges { rangeA: { startSec: number; endSec: number }; rangeB: { startSec: number; endSec: number } }

/** Foote-style novelty from RMS (cheap) + downbeat hints. Returns boundary peaks. */
export function estimateBoundaries(ana: EssentiaAnalysisResult): SegmentBoundary[] {
  const hop = ana.frameHopSec;
  const rms = ana.rms;
  const W = 12; // half window (frames)
  const N = rms.length;
  if (N < 3) return [];

  // normalize rms
  let max = 1e-9; for (const v of rms) if (v > max) max = v;
  const x = rms.map(v => v / max);

  // checkerboard kernel on local self-similarity (very light)
  const nov: number[] = new Array(N).fill(0);
  for (let i = W; i < N - W; i++) {
    let a = 0, b = 0;
    for (let u = 1; u <= W; u++) {
      a += Math.abs(x[i - u] - x[i + (W - u + 1)]);
      b += Math.abs(x[i - (W - u + 1)] - x[i + u]);
    }
    nov[i] = a + b;
  }
  // peak pick
  const peaks: SegmentBoundary[] = [];
  for (let i = 2; i < N - 2; i++) {
    if (nov[i] > nov[i - 1] && nov[i] > nov[i + 1] && nov[i] > 0.15) {
      peaks.push({ time: i * hop, strength: nov[i] });
    }
  }
  return peaks;
}

/** Choose interior search windows (avoid first/last 15s; bias to boundaries/valleys). */
export function chooseInteriorRanges(
  A: EssentiaAnalysisResult,
  B: EssentiaAnalysisResult
): InteriorRanges {
  const pad = 15; // seconds to avoid at both ends
  const segLenA = Math.max(20, Math.min(60, A.beats.length ? (60 / A.bpm) * 16 : 32));
  const segLenB = Math.max(20, Math.min(60, B.beats.length ? (60 / B.bpm) * 16 : 32));

  const rangeA = {
    startSec: Math.max(pad, (A.beats[0] ?? 0) + pad),
    endSec: Math.max(pad + segLenA, A.beats.length ? A.beats[A.beats.length - 1] - pad : A.rms.length * A.frameHopSec - pad),
  };
  const rangeB = {
    startSec: Math.max(pad, 0 + pad),
    endSec: Math.max(pad + segLenB, (B.beats[B.beats.length - 1] ?? B.rms.length * B.frameHopSec) - pad),
  };
  // Ensure sane ordering
  if (rangeA.endSec - rangeA.startSec < 8) rangeA.endSec = rangeA.startSec + 8;
  if (rangeB.endSec - rangeB.startSec < 8) rangeB.endSec = rangeB.startSec + 8;
  return { rangeA, rangeB };
}

/** Mark local valleys (quiet spots) near time t */
export function isValley(ana: EssentiaAnalysisResult, t: number, halfWinSec = 0.6): boolean {
  const hop = ana.frameHopSec;
  const f = Math.round(t / hop);
  const hw = Math.max(2, Math.round(halfWinSec / hop));
  let before = 0, nb = 0, after = 0, na = 0;
  for (let i = Math.max(0, f - hw); i < f; i++) { before += ana.rms[i] ?? 0; nb++; }
  for (let i = f; i <= Math.min(ana.rms.length - 1, f + hw); i++) { after += ana.rms[i] ?? 0; na++; }
  const mean = (before + after) / Math.max(1, nb + na);
  return (ana.rms[f] ?? 0) < mean * 0.85; // 15% under local mean
}
