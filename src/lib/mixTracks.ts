// src/lib/mixTracks.ts
import { analyzeTrack } from "./analysis/analyzeTrack";
import { planSplice } from "./analysis/splicePlanner";
import { buildMixGraph, Vibe } from "./mix/buildMixGraph";
import type { BlendMode } from "./mix/blendEnvelopes";
import { audioBufferToWav, sliceAudioBuffer } from "./audio/audioBufferUtils";

/**
 * Decode a File into an AudioBuffer using an OfflineAudioContext.
 */
async function decodeFile(file: File, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
  const ab = await file.arrayBuffer();
  return await ctx.decodeAudioData(ab);
}

/**
 * Main mixer:
 * - analyzes tracks (BPM, beats, energy…)
 * - plans a musical splice (sections + energy trough + DTW nudge)
 * - renders either a fixed 30s preview window centered on the splice
 *   or the full-length mix
 * - supports vibe FX and modular blend envelopes
 */
export async function mixTracks(
  fileA: File,
  fileB: File,
  crossfadeSeconds = 8,
  vibe: Vibe = "dreamy",
  previewOnly = false,
  blendMode: BlendMode = "overlap"
): Promise<Blob> {
  const sampleRate = 44100;

  // 1) Decode both files
  const [bufA, bufB] = await Promise.all([
    decodeFile(fileA, sampleRate),
    decodeFile(fileB, sampleRate),
  ]);

  // 2) Analyze (re-uses your existing analyzer)
  const [analysisA, analysisB] = await Promise.all([
    analyzeTrack(fileA),
    analyzeTrack(fileB),
  ]);

  // Safe BPMs
  const bpmA = Number.isFinite(analysisA.bpm) && analysisA.bpm > 0 ? analysisA.bpm : 120;
  const bpmB = Number.isFinite(analysisB.bpm) && analysisB.bpm > 0 ? analysisB.bpm : 120;

  // 3) Plan a musical splice
  const plan = planSplice(analysisA, analysisB, bufA.duration, crossfadeSeconds, bufA, bufB);

  // 4) Tempo match B → A (±2% clamp)
  let playbackRateB = bpmA / bpmB;
  playbackRateB = Math.min(1.02, Math.max(0.98, playbackRateB));

  if (previewOnly) {
    // ---------- Fixed 30s PREVIEW (splice-centered) ----------
    const PRE = 15;
    const POST = 15;
    const windowStart = Math.max(0, plan.fadeStart - PRE);
    const windowDur = PRE + POST; // exactly 30s

    const ctx = new OfflineAudioContext(2, Math.ceil(windowDur * sampleRate), sampleRate);

    // Time-offset the schedule so the splice lives inside the preview window.
    buildMixGraph(
      ctx,
      bufA,
      bufB,
      plan,
      playbackRateB,
      vibe,
      bpmA,
      blendMode,
      windowStart // timeOffsetSec
    );

    const rendered = await ctx.startRendering();

    // Safety trim to exactly 30s
    const exactPreview = sliceAudioBuffer(rendered, 0, windowDur);
    const wav = audioBufferToWav(exactPreview);
    return new Blob([wav], { type: "audio/wav" });
  }

  // ---------- FULL RENDER ----------
  // How long do we need? Enough for A to play out and B from its entry point.
  const endA = bufA.duration;
  const endB = plan.fadeStart + Math.max(0, (bufB.duration - plan.entryBeatB)) / playbackRateB;
  const fullDuration = Math.min(180, Math.max(endA, endB) + 0.5); // 3 min cap + little tail

  const ctx = new OfflineAudioContext(2, Math.ceil(fullDuration * sampleRate), sampleRate);

  buildMixGraph(
    ctx,
    bufA,
    bufB,
    plan,
    playbackRateB,
    vibe,
    bpmA,
    blendMode,
    0 // no time offset for full render
  );

  const rendered = await ctx.startRendering();
  const wav = audioBufferToWav(rendered);
  return new Blob([wav], { type: "audio/wav" });
}
