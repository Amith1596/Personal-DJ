// src/lib/analysis/candidates.ts
import type { EssentiaAnalysisResult } from "./essentiaClient";

export type TimeRange = { startSec: number; endSec: number };

export function getDefaultRanges(a: EssentiaAnalysisResult, b: EssentiaAnalysisResult) {
  // Default: last ~8s of A and first ~8s of B — but the *splice points* will be found
  // INSIDE these windows using beats & onsets (not just end->start).
  const tail = Math.min(8, Math.max(4, (60 / Math.max(60, Math.min(200, a.bpm))) * 8));
  const head = Math.min(8, Math.max(4, (60 / Math.max(60, Math.min(200, b.bpm))) * 8));

  return {
    rangeA: { startSec: Math.max(0, (a.beats[a.beats.length - 1] ?? a.sampleRate) - tail), endSec: (a.beats[a.beats.length - 1] ?? a.sampleRate) },
    rangeB: { startSec: 0, endSec: head },
  };
}

export interface Candidate {
  tA: number;
  tB: number;
  isDownbeatA: boolean;
  isDownbeatB: boolean;
  isStrongOnsetA: boolean;
  isStrongOnsetB: boolean;
}

function markDownbeats(beats: number[]): boolean[] {
  // Approx: every 4 beats is a downbeat.
  const flags: boolean[] = beats.map((_, i) => i % 4 === 0);
  return flags;
}

function isStrongOnset(onsets: number[], t: number, tol = 0.06): boolean {
  // Any onset within ±tol seconds
  for (let i = 0; i < onsets.length; i++) {
    if (Math.abs(onsets[i] - t) <= tol) return true;
  }
  return false;
}

export function generateCandidates(opts: {
  analysisA: EssentiaAnalysisResult;
  analysisB: EssentiaAnalysisResult;
  rangeA: TimeRange;
  rangeB: TimeRange;
  crossfadeMs: number;
  sampleRate: number;
}): Candidate[] {
  const { analysisA: A, analysisB: B, rangeA, rangeB } = opts;
  const beatsA = A.beats.filter(t => t >= rangeA.startSec && t <= rangeA.endSec);
  const beatsB = B.beats.filter(t => t >= rangeB.startSec && t <= rangeB.endSec);

  const dba = markDownbeats(beatsA);
  const dbb = markDownbeats(beatsB);

  const cand: Candidate[] = [];

  // Prefer downbeat↔downbeat pairs
  for (let i = 0; i < beatsA.length; i++) {
    if (!dba[i]) continue;
    for (let j = 0; j < beatsB.length; j++) {
      if (!dbb[j]) continue;
      cand.push({
        tA: beatsA[i],
        tB: beatsB[j],
        isDownbeatA: true,
        isDownbeatB: true,
        isStrongOnsetA: isStrongOnset(A.onsets, beatsA[i]),
        isStrongOnsetB: isStrongOnset(B.onsets, beatsB[j]),
      });
    }
  }

  // If too sparse, add strong-onset pairs (align strong to strong)
  if (cand.length < 8) {
    const onsetA = A.onsets.filter(t => t >= rangeA.startSec && t <= rangeA.endSec);
    const onsetB = B.onsets.filter(t => t >= rangeB.startSec && t <= rangeB.endSec);
    for (const ta of onsetA) {
      for (const tb of onsetB) {
        cand.push({
          tA: ta,
          tB: tb,
          isDownbeatA: false,
          isDownbeatB: false,
          isStrongOnsetA: true,
          isStrongOnsetB: true,
        });
      }
    }
  }

  // Also sprinkle beat↔beat (non-downbeat) if still few
  if (cand.length < 16) {
    for (const ta of beatsA) {
      for (const tb of beatsB) {
        cand.push({
          tA: ta,
          tB: tb,
          isDownbeatA: false,
          isDownbeatB: false,
          isStrongOnsetA: isStrongOnset(A.onsets, ta),
          isStrongOnsetB: isStrongOnset(B.onsets, tb),
        });
      }
    }
  }

  // Deduplicate near-equal pairs and cap list
  const uniq: Candidate[] = [];
  const seen = new Set<string>();
  for (const c of cand) {
    const k = `${Math.round(c.tA * 100)}-${Math.round(c.tB * 100)}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(c); }
    if (uniq.length >= 100) break;
  }
  return uniq;
}
