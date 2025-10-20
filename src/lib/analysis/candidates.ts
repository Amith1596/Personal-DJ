/**
 * Candidate generation for splice point selection
 * Implements the algorithm from ALGORITHM_CORE.md
 */

import { EssentiaAnalysisResult } from './essentiaClient';

export interface Candidate {
  tA: number; // Time in track A (seconds)
  tB: number; // Time in track B (seconds)
  isDownbeatA: boolean;
  isDownbeatB: boolean;
  isStrongOnsetA: boolean;
  isStrongOnsetB: boolean;
}

export interface CandidateGenerationParams {
  analysisA: EssentiaAnalysisResult;
  analysisB: EssentiaAnalysisResult;
  rangeA: [number, number]; // [a1, a2] in seconds
  rangeB: [number, number]; // [b1, b2] in seconds
  crossfadeMs: number; // Minimum crossfade duration
  sampleRate: number;
}

/**
 * Generate candidate splice points within the specified ranges
 * Prioritizes downbeats, then strong onsets near downbeats
 */
export function generateCandidates(params: CandidateGenerationParams): Candidate[] {
  const { analysisA, analysisB, rangeA, rangeB, crossfadeMs } = params;
  
  const candidates: Candidate[] = [];
  const xfSec = crossfadeMs / 1000;
  
  // 1. Find downbeats within ranges
  const downbeatsA = findDownbeatsInRange(analysisA.beats, rangeA, analysisA.sampleRate);
  const downbeatsB = findDownbeatsInRange(analysisB.beats, rangeB, analysisB.sampleRate);
  
  // 2. Find strong onsets within ranges
  const strongOnsetsA = findStrongOnsetsInRange(analysisA.onsets, rangeA, analysisA.sampleRate);
  const strongOnsetsB = findStrongOnsetsInRange(analysisB.onsets, rangeB, analysisB.sampleRate);
  
  // 3. Generate downbeat-to-downbeat candidates
  for (const tA of downbeatsA) {
    for (const tB of downbeatsB) {
      if (isValidCandidate(tA, tB, rangeA, rangeB, xfSec)) {
        candidates.push({
          tA,
          tB,
          isDownbeatA: true,
          isDownbeatB: true,
          isStrongOnsetA: strongOnsetsA.includes(tA),
          isStrongOnsetB: strongOnsetsB.includes(tB)
        });
      }
    }
  }
  
  // 4. Generate downbeat-to-strong-onset candidates
  for (const tA of downbeatsA) {
    for (const tB of strongOnsetsB) {
      if (isValidCandidate(tA, tB, rangeA, rangeB, xfSec)) {
        candidates.push({
          tA,
          tB,
          isDownbeatA: true,
          isDownbeatB: false,
          isStrongOnsetA: strongOnsetsA.includes(tA),
          isStrongOnsetB: true
        });
      }
    }
  }
  
  // 5. Generate strong-onset-to-downbeat candidates
  for (const tA of strongOnsetsA) {
    for (const tB of downbeatsB) {
      if (isValidCandidate(tA, tB, rangeA, rangeB, xfSec)) {
        candidates.push({
          tA,
          tB,
          isDownbeatA: false,
          isDownbeatB: true,
          isStrongOnsetA: true,
          isStrongOnsetB: strongOnsetsB.includes(tB)
        });
      }
    }
  }
  
  // 6. If sparse, add strong-onset-to-strong-onset candidates
  if (candidates.length < 10) {
    for (const tA of strongOnsetsA) {
      for (const tB of strongOnsetsB) {
        if (isValidCandidate(tA, tB, rangeA, rangeB, xfSec)) {
          candidates.push({
            tA,
            tB,
            isDownbeatA: false,
            isDownbeatB: false,
            isStrongOnsetA: true,
            isStrongOnsetB: true
          });
        }
      }
    }
  }
  
  // 7. Sort by musical priority (downbeats first, then onsets)
  candidates.sort((a, b) => {
    const scoreA = (a.isDownbeatA ? 2 : 0) + (a.isDownbeatB ? 2 : 0) + 
                   (a.isStrongOnsetA ? 1 : 0) + (a.isStrongOnsetB ? 1 : 0);
    const scoreB = (b.isDownbeatA ? 2 : 0) + (b.isDownbeatB ? 2 : 0) + 
                   (b.isStrongOnsetA ? 1 : 0) + (b.isStrongOnsetB ? 1 : 0);
    return scoreB - scoreA;
  });
  
  return candidates;
}

/**
 * Find downbeats within the specified time range
 * Assumes beats array contains beat times in samples
 */
function findDownbeatsInRange(beats: number[], range: [number, number], sampleRate: number): number[] {
  const [startSec, endSec] = range;
  const startSample = startSec * sampleRate;
  const endSample = endSec * sampleRate;
  
  return beats
    .filter(beat => beat >= startSample && beat <= endSample)
    .map(beat => beat / sampleRate);
}

/**
 * Find strong onsets within the specified time range
 * Uses a threshold to identify "strong" onsets
 */
function findStrongOnsetsInRange(onsets: number[], range: [number, number], sampleRate: number): number[] {
  const [startSec, endSec] = range;
  const startSample = startSec * sampleRate;
  const endSample = endSec * sampleRate;
  
  return onsets
    .filter(onset => onset >= startSample && onset <= endSample)
    .map(onset => onset / sampleRate);
}

/**
 * Check if a candidate is valid (within safe crossfade window)
 */
function isValidCandidate(
  tA: number, 
  tB: number, 
  rangeA: [number, number], 
  rangeB: [number, number], 
  xfSec: number
): boolean {
  const [a1, a2] = rangeA;
  const [b1, b2] = rangeB;
  
  // Ensure both points are within their respective ranges
  if (tA < a1 || tA > a2 || tB < b1 || tB > b2) {
    return false;
  }
  
  // Ensure there's enough room for crossfade
  // Track A needs xfSec seconds before the end
  // Track B needs xfSec seconds after the start
  const remainingA = a2 - tA;
  const remainingB = tB - b1;
  
  return remainingA >= xfSec && remainingB >= xfSec;
}

/**
 * Get default ranges for full track analysis
 * Uses the last 30 seconds of track A and first 30 seconds of track B
 */
export function getDefaultRanges(
  analysisA: EssentiaAnalysisResult, 
  analysisB: EssentiaAnalysisResult
): { rangeA: [number, number]; rangeB: [number, number] } {
  const durationA = analysisA.beats.length > 0 ? 
    Math.max(...analysisA.beats) / analysisA.sampleRate : 30;
  const durationB = analysisB.beats.length > 0 ? 
    Math.max(...analysisB.beats) / analysisB.sampleRate : 30;
  
  const rangeA: [number, number] = [Math.max(0, durationA - 30), durationA];
  const rangeB: [number, number] = [0, Math.min(30, durationB)];
  
  return { rangeA, rangeB };
}
