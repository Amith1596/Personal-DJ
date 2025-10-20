import type { AnalysisResult } from "./analyzeTrack";

/** Simple centered moving average. */
function smooth(arr: Float32Array, w: number): Float32Array {
  const n = arr.length;
  const out = new Float32Array(n);
  const hw = Math.max(1, Math.floor(w / 2));
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = i - hw; k <= i + hw; k++) {
      if (k >= 0 && k < n) { s += arr[k]; c++; }
    }
    out[i] = c ? s / c : 0;
  }
  return out;
}

function normalize(arr: Float32Array): Float32Array {
  let min = Infinity, max = -Infinity;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
  const span = Math.max(1e-9, max - min);
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - min) / span;
  return out;
}

/**
 * Find the strongest "drop" (big spectral-flux spike + rising energy),
 * then snap to nearest downbeat using BPM.
 */
export function findPrimaryDrop(analysis: AnalysisResult): number {
  const { spectralFlux, rms, timesSec, bpm, frameDurationSec } = analysis;
  if (spectralFlux.length === 0 || timesSec.length === 0) {
    return 0;
  }

  const fluxSm = normalize(smooth(spectralFlux, 7));
  const rmsSm  = normalize(smooth(rms, 21));

  // Energy rise vs previous ~2s
  const backFrames = Math.max(1, Math.round(2 / frameDurationSec));
  const rise = new Float32Array(rmsSm.length);
  for (let i = 0; i < rmsSm.length; i++) {
    let s = 0, c = 0;
    for (let k = i - backFrames; k < i; k++) {
      if (k >= 0) { s += rmsSm[k]; c++; }
    }
    const prevAvg = c ? s / c : rmsSm[i];
    rise[i] = Math.max(0, rmsSm[i] - prevAvg);
  }
  const riseN = normalize(rise);

  // Score peaks; ignore first/last 15% to avoid intros/outros
  const lo = Math.floor(0.15 * fluxSm.length);
  const hi = Math.floor(0.85 * fluxSm.length);
  let bestIdx = lo, bestScore = -1;
  for (let i = lo + 1; i < hi - 1; i++) {
    const isPeak = fluxSm[i] > fluxSm[i - 1] && fluxSm[i] >= fluxSm[i + 1];
    if (!isPeak) continue;
    const score = 0.6 * fluxSm[i] + 0.4 * riseN[i];
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  const secPerBeat = 60 / Math.max(60, Math.min(200, bpm || 120));
  const t = timesSec[bestIdx] ?? 0;
  const snapped = Math.round(t / secPerBeat) * secPerBeat;
  return Math.max(0, snapped);
}
