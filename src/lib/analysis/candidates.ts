// src/lib/analysis/candidates.ts
import type { EssentiaAnalysisResult } from "./essentiaClient";
import { chooseInteriorRanges, estimateBoundaries, isValley } from "./segments";

export type TimeRange = { startSec: number; endSec: number };

export interface Candidate {
  tA: number; tB: number;
  isDownbeatA: boolean; isDownbeatB: boolean;
  isStrongOnsetA: boolean; isStrongOnsetB: boolean;
  isValleyA: boolean; isValleyB: boolean;
  fromBoundaryA?: boolean; fromBoundaryB?: boolean;
}

export function getDefaultRanges(a: EssentiaAnalysisResult, b: EssentiaAnalysisResult) {
  return chooseInteriorRanges(a, b);
}

function markDownbeats(beats: number[]): boolean[] { return beats.map((_, i) => i % 4 === 0); }
function near(list: number[], t: number, tol = 0.06): boolean { return list.some(x => Math.abs(x - t) <= tol); }

export function generateCandidates(opts: {
  analysisA: EssentiaAnalysisResult; analysisB: EssentiaAnalysisResult;
  rangeA: TimeRange; rangeB: TimeRange; crossfadeMs: number; sampleRate: number;
}): Candidate[] {
  const { analysisA: A, analysisB: B, rangeA, rangeB } = opts;

  const beatsA = A.beats.filter(t => t >= rangeA.startSec && t <= rangeA.endSec);
  const beatsB = B.beats.filter(t => t >= rangeB.startSec && t <= rangeB.endSec);
  const dba = markDownbeats(beatsA), dbb = markDownbeats(beatsB);

  const bndsA = estimateBoundaries(A).map(b => b.time).filter(t => t >= rangeA.startSec && t <= rangeA.endSec);
  const bndsB = estimateBoundaries(B).map(b => b.time).filter(t => t >= rangeB.startSec && t <= rangeB.endSec);

  const cand: Candidate[] = [];

  // 1) Downbeat ↔ downbeat pairs that are valleys or boundaries
  for (let i = 0; i < beatsA.length; i++) if (dba[i]) {
    const ta = beatsA[i];
    const vA = isValley(A, ta);
    const bdA = near(bndsA, ta, 0.4);
    for (let j = 0; j < beatsB.length; j++) if (dbb[j]) {
      const tb = beatsB[j];
      const vB = isValley(B, tb);
      const bdB = near(bndsB, tb, 0.4);
      cand.push({
        tA: ta, tB: tb,
        isDownbeatA: true, isDownbeatB: true,
        isStrongOnsetA: near(A.onsets, ta), isStrongOnsetB: near(B.onsets, tb),
        isValleyA: vA, isValleyB: vB,
        fromBoundaryA: bdA, fromBoundaryB: bdB,
      });
    }
  }

  // 2) Boundary-aligned pairs (if we need more): boundary→boundary within ±1 beat
  if (cand.length < 32) {
    for (const ta of bndsA) {
      const closestBeatB = beatsB.reduce((best, t) => Math.abs(t - ta) < Math.abs(best - ta) ? t : best, beatsB[0] ?? 0);
      if (!isFinite(closestBeatB)) continue;
      cand.push({
        tA: ta, tB: closestBeatB,
        isDownbeatA: false, isDownbeatB: false,
        isStrongOnsetA: near(A.onsets, ta), isStrongOnsetB: near(B.onsets, closestBeatB),
        isValleyA: isValley(A, ta), isValleyB: isValley(B, closestBeatB),
        fromBoundaryA: true, fromBoundaryB: near(bndsB, closestBeatB, 0.4),
      });
    }
  }

  // 3) Sprinkle beat↔beat if still few
  if (cand.length < 64) {
    for (const ta of beatsA) for (const tb of beatsB) {
      cand.push({
        tA: ta, tB: tb,
        isDownbeatA: false, isDownbeatB: false,
        isStrongOnsetA: near(A.onsets, ta), isStrongOnsetB: near(B.onsets, tb),
        isValleyA: isValley(A, ta), isValleyB: isValley(B, tb),
      });
      if (cand.length >= 120) break;
    }
  }

  // Dedup & cap
  const uniq: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of cand) {
    const k = `${Math.round(c.tA * 100)}-${Math.round(c.tB * 100)}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(c); }
    if (uniq.length >= 120) break;
  }
  return uniq;
}
