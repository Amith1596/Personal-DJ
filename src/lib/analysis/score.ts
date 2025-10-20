/**
 * Scoring system for splice point candidates
 * Implements the scoring function from ALGORITHM_CORE.md
 */

import { EssentiaAnalysisResult } from './essentiaClient';
import { Candidate } from './candidates';

export interface ScoreBreakdown {
  downbeatAlign: number;
  chromaCosine: number;
  energyMatch: number;
  tempoDiff: number;
  keyDistance: number;
  clickRisk: number;
  total: number;
}

export interface ScoredCandidate extends Candidate {
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoringWeights {
  w1: number; // DownbeatAlign
  w2: number; // ChromaCosine
  w3: number; // EnergyMatch
  w4: number; // TempoDiffPct
  w5: number; // KeyDistanceSemitones
  w6: number; // ClickRisk
}

// Default weights from ALGORITHM_CORE.md
export const DEFAULT_WEIGHTS: ScoringWeights = {
  w1: 1.2, // DownbeatAlign
  w2: 1.0, // ChromaCosine
  w3: 0.4, // EnergyMatch
  w4: 0.6, // TempoDiffPct
  w5: 0.6, // KeyDistanceSemitones
  w6: 0.8, // ClickRisk
};

/**
 * Score all candidates and return the best one
 */
export function scoreCandidates(
  candidates: Candidate[],
  analysisA: EssentiaAnalysisResult,
  analysisB: EssentiaAnalysisResult,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredCandidate[] {
  const scoredCandidates: ScoredCandidate[] = candidates.map(candidate => {
    const breakdown = calculateScoreBreakdown(candidate, analysisA, analysisB);
    const total = calculateTotalScore(breakdown, weights);
    
    return {
      ...candidate,
      score: total,
      breakdown: {
        ...breakdown,
        total
      }
    };
  });
  
  // Sort by score (highest first)
  return scoredCandidates.sort((a, b) => b.score - a.score);
}

/**
 * Calculate the total score for a candidate
 */
function calculateTotalScore(breakdown: Omit<ScoreBreakdown, 'total'>, weights: ScoringWeights): number {
  return (
    weights.w1 * breakdown.downbeatAlign +
    weights.w2 * breakdown.chromaCosine +
    weights.w3 * breakdown.energyMatch -
    weights.w4 * breakdown.tempoDiff -
    weights.w5 * breakdown.keyDistance -
    weights.w6 * breakdown.clickRisk
  );
}

/**
 * Calculate all score components for a candidate
 */
function calculateScoreBreakdown(
  candidate: Candidate,
  analysisA: EssentiaAnalysisResult,
  analysisB: EssentiaAnalysisResult
): Omit<ScoreBreakdown, 'total'> {
  return {
    downbeatAlign: calculateDownbeatAlign(candidate),
    chromaCosine: calculateChromaCosine(candidate, analysisA, analysisB),
    energyMatch: calculateEnergyMatch(candidate, analysisA, analysisB),
    tempoDiff: calculateTempoDiff(analysisA.bpm, analysisB.bpm),
    keyDistance: calculateKeyDistance(analysisA.key, analysisB.key),
    clickRisk: calculateClickRisk(candidate, analysisA, analysisB)
  };
}

/**
 * Downbeat alignment score (1.0 for downbeat↔downbeat, 0.5 for near, 0.0 otherwise)
 */
function calculateDownbeatAlign(candidate: Candidate): number {
  if (candidate.isDownbeatA && candidate.isDownbeatB) {
    return 1.0;
  }
  
  // TODO: Implement "near downbeat" detection (±⅛–¼ beat)
  // For now, give partial credit for strong onsets
  if (candidate.isStrongOnsetA && candidate.isStrongOnsetB) {
    return 0.5;
  }
  
  return 0.0;
}

/**
 * Chroma cosine similarity over 1-2 beat window around splice
 */
function calculateChromaCosine(
  candidate: Candidate,
  analysisA: EssentiaAnalysisResult,
  analysisB: EssentiaAnalysisResult
): number {
  // Get chroma frames around the splice points
  const windowSec = 1.0; // 1 second window
  const chromaA = extractChromaWindow(analysisA, candidate.tA, windowSec);
  const chromaB = extractChromaWindow(analysisB, candidate.tB, windowSec);
  
  if (chromaA.length === 0 || chromaB.length === 0) {
    return 0.0;
  }
  
  // Calculate cosine similarity
  return cosineSimilarity(chromaA, chromaB);
}

/**
 * Energy match score based on RMS slopes around splice points
 */
function calculateEnergyMatch(
  candidate: Candidate,
  analysisA: EssentiaAnalysisResult,
  analysisB: EssentiaAnalysisResult
): number {
  const windowSec = 2.0; // 2 second window
  
  const slopeA = calculateRMSslope(analysisA, candidate.tA, windowSec);
  const slopeB = calculateRMSslope(analysisB, candidate.tB, windowSec);
  
  // Normalize slopes and calculate similarity
  const maxSlope = Math.max(Math.abs(slopeA), Math.abs(slopeB), 0.001);
  const normalizedA = slopeA / maxSlope;
  const normalizedB = slopeB / maxSlope;
  
  // Return similarity (1.0 - difference)
  return 1.0 - Math.abs(normalizedA - normalizedB);
}

/**
 * Tempo difference penalty (percentage)
 */
function calculateTempoDiff(bpmA: number, bpmB: number): number {
  const avgBpm = (bpmA + bpmB) / 2;
  return Math.abs(bpmA - bpmB) / avgBpm;
}

/**
 * Key distance penalty (semitones, circle of fifths aware)
 */
function calculateKeyDistance(keyA: { tonic: string; scale: string }, keyB: { tonic: string; scale: string }): number {
  // TODO: Implement proper circle of fifths distance
  // For now, use simple semitone distance
  const semitonesA = noteToSemitones(keyA.tonic);
  const semitonesB = noteToSemitones(keyB.tonic);
  
  if (semitonesA === -1 || semitonesB === -1) {
    return 0.5; // Unknown key penalty
  }
  
  const distance = Math.abs(semitonesA - semitonesB);
  
  // Same key = 0, perfect fifth = 0.2, relative major/minor = 0.3
  if (distance === 0) return 0.0;
  if (distance === 7) return 0.2; // Perfect fifth
  if (distance === 3 || distance === 9) return 0.3; // Minor third / major sixth
  
  // Scale to 0-1 range
  return Math.min(distance / 12, 1.0);
}

/**
 * Click risk penalty based on zero-crossing distance and onset clash
 */
function calculateClickRisk(
  candidate: Candidate,
  analysisA: EssentiaAnalysisResult,
  analysisB: EssentiaAnalysisResult
): number {
  // TODO: Implement zero-crossing detection
  // For now, use onset proximity as a proxy
  const onsetProximityA = findNearestOnset(analysisA.onsets, candidate.tA, analysisA.sampleRate);
  const onsetProximityB = findNearestOnset(analysisB.onsets, candidate.tB, analysisB.sampleRate);
  
  const threshold = 0.1; // 100ms threshold
  const riskA = onsetProximityA < threshold ? 1.0 : 0.0;
  const riskB = onsetProximityB < threshold ? 1.0 : 0.0;
  
  return (riskA + riskB) / 2;
}

/**
 * Extract chroma window around a time point
 */
function extractChromaWindow(analysis: EssentiaAnalysisResult, timeSec: number, windowSec: number): number[] {
  // TODO: Implement proper chroma window extraction
  // For now, return a simple average
  const windowSize = Math.min(analysis.chromaFrames.length, Math.floor(windowSec * analysis.sampleRate / 1024));
  const startIdx = Math.max(0, Math.floor(timeSec * analysis.sampleRate / 1024) - windowSize / 2);
  const endIdx = Math.min(analysis.chromaFrames.length, startIdx + windowSize);
  
  if (startIdx >= endIdx) return [];
  
  const window = analysis.chromaFrames.slice(startIdx, endIdx);
  return Array.from(window);
}

/**
 * Calculate RMS slope around a time point
 */
function calculateRMSslope(analysis: EssentiaAnalysisResult, timeSec: number, windowSec: number): number {
  const windowSize = Math.min(analysis.rms.length, Math.floor(windowSec * analysis.sampleRate / 1024));
  const startIdx = Math.max(0, Math.floor(timeSec * analysis.sampleRate / 1024) - windowSize / 2);
  const endIdx = Math.min(analysis.rms.length, startIdx + windowSize);
  
  if (endIdx - startIdx < 2) return 0;
  
  const rmsWindow = analysis.rms.slice(startIdx, endIdx);
  const firstHalf = rmsWindow.slice(0, Math.floor(rmsWindow.length / 2));
  const secondHalf = rmsWindow.slice(Math.floor(rmsWindow.length / 2));
  
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  
  return avgSecond - avgFirst;
}

/**
 * Find nearest onset to a time point
 */
function findNearestOnset(onsets: number[], timeSec: number, sampleRate: number): number {
  const timeSample = timeSec * sampleRate;
  let minDistance = Infinity;
  
  for (const onset of onsets) {
    const distance = Math.abs(onset - timeSample) / sampleRate;
    minDistance = Math.min(minDistance, distance);
  }
  
  return minDistance === Infinity ? 1.0 : minDistance;
}

/**
 * Convert note name to semitones (C=0, C#=1, D=2, etc.)
 */
function noteToSemitones(note: string): number {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return notes.indexOf(note);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
