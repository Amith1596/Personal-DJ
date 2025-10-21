// src/lib/analysis/score.ts
import type { EssentiaAnalysisResult } from "./essentiaClient";
import type { Candidate } from "./candidates";

export interface Weights {
  wDownbeat: number;   // + if both are downbeats
  wEnergy: number;     // + valley at A, + rise at B
  wTempo: number;      // - tempo mismatch
  wOnsetClash: number; // - strong onsets inside the xfade window
  // (Chroma/Key left for real Essentia later)
}
export const DEFAULT_WEIGHTS: Weights = {
  wDownbeat: 1.2,
  wEnergy: 0.8,
  wTempo: 0.6,
  wOnsetClash: 0.7,
};

export interface ScoredCandidate extends Candidate {
  score: number;
  subscores?: Record<string, number>;
}

function timeToFrame(t: number, hopSec: number): number {
  return Math.max(0, Math.round(t / hopSec));
}

function localRMSTrend(rms: number[], frame: number, halfWin = 6): { meanBefore: number; meanAfter: number } {
  const a0 = Math.max(0, frame - halfWin), a1 = Math.max(0, frame - 1);
  const b0 = Math.min(rms.length - 1, frame + 1), b1 = Math.min(rms.length - 1, frame + halfWin);
  let sumA = 0, nA = 0, sumB = 0, nB = 0;
  for (let i = a0; i <= a1; i++) { sumA += rms[i]; nA++; }
  for (let i = b0; i <= b1; i++) { sumB += rms[i]; nB++; }
  return { meanBefore: nA ? sumA / nA : 0, meanAfter: nB ? sumB / nB : 0 };
}

function onsetCountNear(onsets: number[], t0: number, t1: number): number {
  let c = 0; for (const t of onsets) if (t >= t0 && t <= t1) c++; return c;
}

/** Score higher for: downbeat alignment, energy valley→rise; score lower for tempo mismatch & onset clashes */
export function scoreCandidates(
  candidates: Candidate[],
  A: EssentiaAnalysisResult,
  B: EssentiaAnalysisResult,
  weights: Weights = DEFAULT_WEIGHTS
): ScoredCandidate[] {
  const xfSec = 0.09; // assume ~90ms crossfade (can be parameterized)
  const scored: ScoredCandidate[] = [];

  for (const c of candidates) {
    // Downbeat bonus
    const sDownbeat = (c.isDownbeatA && c.isDownbeatB) ? 1 : 0;

    // Energy shape: prefer a small dip before tA (outgoing) and a rise after tB (incoming)
    const fA = timeToFrame(c.tA, A.frameHopSec);
    const fB = timeToFrame(c.tB, B.frameHopSec);
    const { meanBefore: aBefore, meanAfter: aAfter } = localRMSTrend(A.rms, fA);
    const { meanBefore: bBefore, meanAfter: bAfter } = localRMSTrend(B.rms, fB);
    const aValley = Math.max(0, (aBefore - aAfter));   // positive if energy dropping around A splice
    const bRise   = Math.max(0, (bAfter  - bBefore));  // positive if energy rising into B splice
    const sEnergy = 0.5 * (aValley + bRise);           // normalize-ish

    // Tempo mismatch penalty (0..1)
    const tempoDiffPct = Math.min(1, Math.abs(A.bpm - B.bpm) / Math.max(1, A.bpm));
    const sTempo = 1 - tempoDiffPct; // higher is better

    // Onset clash penalty: any strong onset inside the crossfade windows?
    const clashA = onsetCountNear(A.onsets, c.tA - xfSec, c.tA + xfSec);
    const clashB = onsetCountNear(B.onsets, c.tB - xfSec, c.tB + xfSec);
    const onsetClash = Math.min(1, (clashA + clashB) / 4); // 0 (none) .. ~1 (lots)

    const score =
      + weights.wDownbeat   * sDownbeat
      + weights.wEnergy     * sEnergy
      + weights.wTempo      * sTempo
      - weights.wOnsetClash * onsetClash;

    scored.push({
      ...c,
      score,
      subscores: { sDownbeat, sEnergy, sTempo, onsetClash },
    });
  }

  scored.sort((x, y) => y.score - x.score);
  return scored;
}
