// src/lib/analysis/score.ts
import type { EssentiaAnalysisResult } from "./essentiaClient";
import type { Candidate } from "./candidates";

export interface Weights {
  wDownbeat: number;     // + if both downbeats
  wEnergy: number;       // + valley at A, + rise at B
  wTempo: number;        // + tempo match
  wOnsetClash: number;   // - strong onsets inside xfade
  wValley: number;       // + valleys
  wBoundary: number;     // + boundaries
  wEdgePenalty: number;  // - near song edges
}
export const DEFAULT_WEIGHTS: Weights = {
  wDownbeat: 1.2, wEnergy: 0.9, wTempo: 0.6, wOnsetClash: 0.7,
  wValley: 0.6, wBoundary: 0.4, wEdgePenalty: 0.8,
};

export interface ScoredCandidate extends Candidate { score: number; subscores?: Record<string, number> }

const XF_SEC = 0.09; // assumed crossfade used by preview
const timeToFrame = (t: number, hop: number) => Math.max(0, Math.round(t / hop));
function localTrend(rms: number[], f: number, halfWin = 6) {
  const a0 = Math.max(0, f - halfWin), a1 = Math.max(0, f - 1);
  const b0 = Math.min(rms.length - 1, f + 1), b1 = Math.min(rms.length - 1, f + halfWin);
  let sa = 0, na = 0, sb = 0, nb = 0;
  for (let i = a0; i <= a1; i++) { sa += rms[i]; na++; }
  for (let i = b0; i <= b1; i++) { sb += rms[i]; nb++; }
  return { before: na ? sa / na : 0, after: nb ? sb / nb : 0 };
}
const onsetCount = (on: number[], t0: number, t1: number) => on.reduce((c, t) => c + (t >= t0 && t <= t1 ? 1 : 0), 0);

function edgePenalty(t: number, dur: number): number {
  // Penalize first/last 15s, tapering to 0 by 30s
  const pad = 15, taper = 30;
  const distStart = Math.max(0, pad - t);
  const distEnd = Math.max(0, pad - (dur - t));
  const raw = Math.max(distStart, distEnd);
  return Math.min(1, raw / taper); // 0..1
}

export function scoreCandidates(
  candidates: Candidate[],
  A: EssentiaAnalysisResult,
  B: EssentiaAnalysisResult,
  w: Weights = DEFAULT_WEIGHTS
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  for (const c of candidates) {
    const sDownbeat = (c.isDownbeatA && c.isDownbeatB) ? 1 : 0;

    const fA = timeToFrame(c.tA, A.frameHopSec);
    const fB = timeToFrame(c.tB, B.frameHopSec);
    const a = localTrend(A.rms, fA), b = localTrend(B.rms, fB);
    const aValley = Math.max(0, (a.before - a.after));   // want drop around A
    const bRise   = Math.max(0, (b.after  - b.before));  // want rise into B
    const sEnergy = 0.5 * (aValley + bRise);

    const tempoDiffPct = Math.min(1, Math.abs(A.bpm - B.bpm) / Math.max(1, A.bpm));
    const sTempo = 1 - tempoDiffPct;

    const clash = Math.min(1, (onsetCount(A.onsets, c.tA - XF_SEC, c.tA + XF_SEC) +
                               onsetCount(B.onsets, c.tB - XF_SEC, c.tB + XF_SEC)) / 4);

    const sValley = (c.isValleyA ? 0.5 : 0) + (c.isValleyB ? 0.5 : 0);
    const sBoundary = (c.fromBoundaryA ? 0.5 : 0) + (c.fromBoundaryB ? 0.5 : 0);

    const penEdge = 0.5 * edgePenalty(c.tA, A.beats.length ? A.beats[A.beats.length - 1] : A.rms.length * A.frameHopSec)
                  + 0.5 * edgePenalty(c.tB, B.beats.length ? B.beats[B.beats.length - 1] : B.rms.length * B.frameHopSec);

    const score =
      + w.wDownbeat   * sDownbeat
      + w.wEnergy     * sEnergy
      + w.wTempo      * sTempo
      + w.wValley     * sValley
      + w.wBoundary   * sBoundary
      - w.wOnsetClash * clash
      - w.wEdgePenalty * penEdge;

    out.push({ ...c, score, subscores: { sDownbeat, sEnergy, sTempo, clash, sValley, sBoundary, penEdge } });
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
