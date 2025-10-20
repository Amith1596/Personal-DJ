import { AnalysisResult } from "./analyzeTrack";
import { chromaPerBeat } from "./chroma";
import { detectSections } from "./sections";
import { dtwOffsetBeats } from "./dtw";

export interface SplicePlan {
  /** seconds in Track A where crossfade begins */
  fadeStart: number;
  /** seconds of crossfade duration */
  fadeDur: number;
  /** seconds offset into Track B where it should start */
  entryBeatB: number;
}

/**
 * Section-aware, energy-aware, DTW-nudged splice planner.
 * Order of decisions:
 *  1) DJ guardrails (min intro/outro window)
 *  2) Section boundary candidate (A end-of-phrase) if available
 *  3) Energy trough refinement near candidate (smoothed ~1s bins)
 *  4) Avoid strong onset at fadeStart (nudge back 1 beat)
 *  5) DTW over last K beats of A vs first K beats of B to nudge B entry (whole-beat offset)
 *  6) Clamp everything to safe bounds
 */
export function planSplice(
  analysisA: AnalysisResult,
  analysisB: AnalysisResult,
  durationA: number,
  crossfadeSeconds: number,
  bufA?: AudioBuffer, // optional buffers enable section/DTW features
  bufB?: AudioBuffer
): SplicePlan {
  const {
    bpm: bpmA,
    beats: beatsA,
    energyProfile: epA,
    spectralFlux: fluxA,
    frameDurationSec: frameStepA,
  } = analysisA;

  const {
    bpm: bpmB,
    beats: beatsB,
  } = analysisB;

  // -------- 0) Defensive defaults --------
  const safeBpmA = Number.isFinite(bpmA) && bpmA > 0 ? bpmA : 120;
  const _safeBpmB = Number.isFinite(bpmB) && bpmB > 0 ? bpmB : 120; // TODO: used in tempo normalization
  const secPerBeatA = 60 / safeBpmA;
  // const secPerBeatB = 60 / safeBpmB;

  // Empty-beat protection
  const beatsAsec = (beatsA && beatsA.length ? beatsA : [0, durationA]).slice();
  const beatsBsec = (beatsB && beatsB.length ? beatsB : [0]).slice();

  // -------- 1) DJ guardrails: intro/outro window in A --------
  const minIntro = 30;  // A must play at least this long before any splice
  const minOutro = 15;  // leave some tail after splice
  const earliest = Math.max(0, Math.min(minIntro, Math.max(0, durationA - crossfadeSeconds - minOutro)));
  // Latest start that still fits the full fade + tail
  const latest = Math.max(earliest, durationA - crossfadeSeconds - minOutro);

  // If song is very short, compress window reasonably
  const windowStart = Math.min(earliest, Math.max(0, durationA * 0.3));
  const windowEnd = Math.max(windowStart, latest);

  // -------- 2) Section boundary candidate (if buffers provided) --------
  let candidate = windowEnd; // fallback: last allowed time
  let dtwEntrySecB: number | undefined; // optional DTW-based entry point for B (in seconds)

  const haveBuffers = !!bufA && !!bufB && beatsAsec.length > 2 && beatsBsec.length > 1;
  if (haveBuffers && bufA && bufB) {
    // Beat-synchronous chroma
    const chromA = chromaPerBeat(bufA, beatsAsec);
    const chromB = chromaPerBeat(bufB, beatsBsec);

    // Section boundaries in seconds
    const boundsA = detectSections(beatsAsec, chromA);
    const boundsB = detectSections(beatsBsec, chromB);

    // Choose last boundary in windowStart..windowEnd (prefer end-of-phrase near window end)
    const endAinWin = boundsA.filter((t) => t >= windowStart && t <= windowEnd);
    if (endAinWin.length > 0) {
      candidate = endAinWin[endAinWin.length - 1];
    } else {
      // fallback: last beat within window
      const beatsInWin = beatsAsec.filter((t) => t >= windowStart && t <= windowEnd);
      if (beatsInWin.length > 0) candidate = beatsInWin[beatsInWin.length - 1];
    }

    // -------- 5) DTW harmonic nudge (compute now; finalize later) --------
    const K = 8; // beats window (~2 bars @ 4/4) for harmonic alignment
    // Find the beat index at/after candidate
    let aIdxEnd = beatsAsec.findIndex((t) => t >= candidate);
    if (aIdxEnd === -1) aIdxEnd = beatsAsec.length - 1; // clamp if candidate past last beat
    const aIdxStart = Math.max(0, aIdxEnd - K);

    const aSlice = chromA.slice(aIdxStart, Math.min(aIdxEnd, chromA.length));
    const bSlice = chromB.slice(0, Math.min(K, chromB.length));

    if (aSlice.length > 0 && bSlice.length > 0) {
      const { offsetBeats } = dtwOffsetBeats(aSlice, bSlice);

      // Baseline: first beat of B shifted by DTW offset
      let entryBeatIndex = Math.max(0, Math.min(beatsBsec.length - 1, offsetBeats));
      let entrySec = beatsBsec[entryBeatIndex] || 0;

      // If we have a strong B boundary, prefer it, then add offset
      if (boundsB.length > 0) {
        const b0 = boundsB[0];
        // nearest beat to boundary
        let nearest = 0;
        let bestD = Infinity;
        for (let i = 0; i < beatsBsec.length; i++) {
          const d = Math.abs(beatsBsec[i] - b0);
          if (d < bestD) { bestD = d; nearest = i; }
        }
        entryBeatIndex = Math.max(0, Math.min(beatsBsec.length - 1, nearest + offsetBeats));
        entrySec = beatsBsec[entryBeatIndex];
      }

      dtwEntrySecB = entrySec;
    }
  } else {
    // No buffers/sections: fall back to last beat in window or windowEnd
    const beatsInWin = beatsAsec.filter((t) => t >= windowStart && t <= windowEnd);
    if (beatsInWin.length > 0) candidate = beatsInWin[beatsInWin.length - 1];
  }

  // -------- 3) Energy trough refinement near candidate (±2 beats) --------
  let fadeStart = candidate;
  if (Array.isArray(epA) && epA.length > 0) {
    let bestEnergy = Infinity;
    const searchRadius = 2 * secPerBeatA;
    for (let i = 0; i < epA.length; i++) {
      const t = i; // energyProfile uses ~1s bins
      if (t < windowStart || t > windowEnd) continue;
      if (Math.abs(t - candidate) <= searchRadius) {
        const e = epA[i]!;
        if (e < bestEnergy) { bestEnergy = e; fadeStart = t; }
      }
    }
  }

  // Clamp fadeStart into safe window
  fadeStart = Math.min(Math.max(fadeStart, windowStart), windowEnd);

  // -------- 4) Avoid strong onset at fadeStart (nudge back 1 beat) --------
  if (fluxA && fluxA.length && Number.isFinite(frameStepA) && frameStepA > 0) {
    const idx = Math.max(0, Math.min(fluxA.length - 1, Math.floor(fadeStart / frameStepA)));
    const meanFlux = fluxA.reduce((s, v) => s + v, 0) / (fluxA.length || 1);
    if ((fluxA[idx] ?? 0) > 2 * meanFlux) {
      fadeStart = Math.max(windowStart, fadeStart - secPerBeatA);
    }
  }

  // -------- 6) Final durations and B entry --------
  // Ensure fadeDur non-negative and fits remaining audio
  const rawFadeDur = Math.min(crossfadeSeconds, Math.max(0, durationA - fadeStart));
  const fadeDur = Number.isFinite(rawFadeDur) ? rawFadeDur : Math.max(0, crossfadeSeconds);

  // Entry into B:
  // Prefer DTW-based entry; otherwise first beat; always clamp to buffer range
  let entryBeatB = 0;
  if (typeof dtwEntrySecB === "number" && Number.isFinite(dtwEntrySecB)) {
    entryBeatB = dtwEntrySecB;
  } else if (beatsBsec.length > 0) {
    entryBeatB = beatsBsec[0];
  }

  // Safety clamps
  if (!Number.isFinite(entryBeatB) || entryBeatB < 0) entryBeatB = 0;

  // Final sanity clamps on fadeStart/fadeDur
  if (!Number.isFinite(fadeStart) || fadeStart < 0) fadeStart = 0;
  if (!Number.isFinite(fadeDur) || fadeDur < 0) {
    // If this happens (tiny tracks), fallback to short fade
    fadeStart = Math.max(0, durationA - 2);
    entryBeatB = 0;
  }

  return { fadeStart, fadeDur, entryBeatB };
}
