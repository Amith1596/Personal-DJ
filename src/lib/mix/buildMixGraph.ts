import {
  applyDreamySweep,
  applyChaoticStutter,
  applyEchoTag,
  applyTapeStop,
  applyBeatRoll,
  applyRiserNoise,
  applySidechainPump,
  applyStereoWidener,
} from "./transitions";
import { SplicePlan } from "../analysis/splicePlanner";
import { applyBlendEnvelope, BlendMode } from "./blendEnvelopes";

export type Vibe =
  | "dreamy"
  | "chaotic"
  | "echoTag"
  | "tapeStop"
  | "beatRoll"
  | "riser"
  | "pump"
  | "widen";

/**
 * Build and schedule the mix graph.
 * - Uses modular blend envelopes
 * - Supports optional timeOffsetSec for fixed-window previews
 */
export function buildMixGraph(
  ctx: OfflineAudioContext,
  bufA: AudioBuffer,
  bufB: AudioBuffer,
  plan: SplicePlan,
  playbackRateB: number,
  vibe: Vibe,
  bpmA: number,
  blendMode: BlendMode = "overlap",
  timeOffsetSec = 0
) {
  const secPerBeat = 60 / (bpmA || 120);

  // Sources
  const srcA = ctx.createBufferSource(); srcA.buffer = bufA;
  const srcB = ctx.createBufferSource(); srcB.buffer = bufB; srcB.playbackRate.value = playbackRateB;

  // Gains
  const gainA = ctx.createGain();
  const gainB = ctx.createGain();
  gainA.gain.setValueAtTime(1, 0);
  gainB.gain.setValueAtTime(0, 0);

  srcA.connect(gainA).connect(ctx.destination);
  srcB.connect(gainB).connect(ctx.destination);

  // Fade timings (preview offset applied here)
  const fadeStart = Math.max(0, plan.fadeStart - timeOffsetSec);
  const fadeDur = Math.max(0, plan.fadeDur);

  // Blend envelope (modular)
  applyBlendEnvelope(gainA, gainB, fadeStart, fadeDur, blendMode);

  // Vibe FX
  switch (vibe) {
    case "dreamy":   applyDreamySweep(ctx, gainA, fadeStart, fadeDur); break;
    case "chaotic":  applyChaoticStutter(ctx, bufA, fadeStart, secPerBeat); break;
    case "echoTag":  applyEchoTag(ctx, gainA, fadeStart, secPerBeat); break;
    case "tapeStop": applyTapeStop(srcA, 0, Math.max(0, fadeStart - 0.4), 0.6); break;
    case "beatRoll": applyBeatRoll(ctx, bufA, fadeStart, secPerBeat); break;
    case "riser":    applyRiserNoise(ctx, fadeStart, fadeDur); break;
    case "pump":     applySidechainPump(ctx, gainA, fadeStart, fadeDur, secPerBeat, 0.55); break;
    case "widen":    applyStereoWidener(ctx, gainB, fadeStart, fadeDur); break;
  }

  // Start times (support preview offset)
  const startA_when = 0;
  const startA_offset = Math.max(0, timeOffsetSec);
  const startB_when = Math.max(0, plan.fadeStart - timeOffsetSec);
  const startB_offset = Math.max(0, Math.min(bufB.duration - 0.05, plan.entryBeatB));

  srcA.start(startA_when, startA_offset);
  srcB.start(startB_when, startB_offset);

  return { srcA, srcB, gainA, gainB };
}
