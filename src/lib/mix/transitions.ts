import { applyBlend, Blend } from "./blends";
import { findPrimaryDrop } from "../analysis/dropDetect";
import { AnalysisResult } from "../analysis/analyzeTrack";

/* =======================================================
   FX UTILITIES (keep your existing ones)
======================================================= */

export function applyDreamySweep(
  ctx: OfflineAudioContext,
  node: AudioNode,
  fadeStart: number,
  fadeDur: number
) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  const safeStart = Math.max(fadeStart - 2, 0);
  filter.frequency.setValueAtTime(18000, safeStart);
  filter.frequency.exponentialRampToValueAtTime(800, safeStart + fadeDur + 2);

  node.disconnect();
  node.connect(filter).connect(ctx.destination);
}

export function applyChaoticStutter(
  ctx: OfflineAudioContext,
  buf: AudioBuffer,
  fadeStart: number,
  secPerBeat: number
) {
  const quarter = secPerBeat / 4;
  const offset = Math.max(buf.duration - quarter, 0);
  for (let i = 0; i < 3; i++) {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const when = Math.max(0, fadeStart - (3 - i) * quarter);
    s.start(when, offset, quarter);
    s.connect(ctx.destination);
  }
}

export function applyEchoTag(
  ctx: OfflineAudioContext,
  node: AudioNode,
  fadeStart: number,
  secPerBeat: number,
  lengthBeats = 2
) {
  const delay = ctx.createDelay(1.0);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  const hp = ctx.createBiquadFilter();

  const delayTime = Math.max(0.06, Math.min(0.5, secPerBeat / 2));
  const at = Math.max(0, fadeStart - secPerBeat / 4);
  delay.delayTime.setValueAtTime(delayTime, at);

  feedback.gain.setValueAtTime(0.35, at);
  hp.type = "highpass";
  hp.frequency.setValueAtTime(400, at);

  const tap = ctx.createGain();
  node.connect(tap);

  tap.connect(wet).connect(delay).connect(hp).connect(ctx.destination);
  hp.connect(feedback).connect(delay);

  const start = Math.max(0, fadeStart - secPerBeat / 2);
  const end = fadeStart + lengthBeats * secPerBeat;
  wet.gain.setValueAtTime(0, start);
  wet.gain.linearRampToValueAtTime(0.9, fadeStart);
  wet.gain.linearRampToValueAtTime(0, end);
}

export function applyTapeStop(
  srcA: AudioBufferSourceNode,
  ctxCurrentTime: number,
  startTime: number,
  dur = 0.6
) {
  const t0 = Math.max(0, startTime);
  const t1 = t0 + Math.max(0.2, dur);
  const r = srcA.playbackRate;
  r.setValueAtTime(Math.max(0.001, r.value), t0);
  r.exponentialRampToValueAtTime(0.05, t1);
}

export function applyBeatRoll(
  ctx: OfflineAudioContext,
  bufA: AudioBuffer,
  fadeStart: number,
  secPerBeat: number
) {
  const d1 = secPerBeat / 2;
  const d2 = secPerBeat / 4;
  const d3 = secPerBeat / 8;

  const start1 = Math.max(0, fadeStart - (d1 + d2 + d3));
  const sliceStart = Math.max(0, bufA.duration - d1);

  const s1 = ctx.createBufferSource(); s1.buffer = bufA; s1.start(start1, sliceStart, d1); s1.connect(ctx.destination);
  const s2 = ctx.createBufferSource(); s2.buffer = bufA; s2.start(start1 + d1, bufA.duration - d2, d2); s2.connect(ctx.destination);
  const s3 = ctx.createBufferSource(); s3.buffer = bufA; s3.start(start1 + d1 + d2, bufA.duration - d3, d3); s3.connect(ctx.destination);
}

export function applyRiserNoise(
  ctx: OfflineAudioContext,
  fadeStart: number,
  fadeDur: number
) {
  const sr = ctx.sampleRate;
  const len = Math.floor((fadeDur + 1) * sr);
  const noiseBuf = ctx.createBuffer(1, len, sr);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.setValueAtTime(200, Math.max(0, fadeStart - 0.5));
  hp.frequency.exponentialRampToValueAtTime(4000, fadeStart + fadeDur);

  const gain = ctx.createGain();
  const start = Math.max(0, fadeStart - 0.5);
  gain.gain.setValueAtTime(0.0, start);
  gain.gain.linearRampToValueAtTime(0.7, fadeStart + fadeDur);

  src.connect(hp).connect(gain).connect(ctx.destination);
  src.start(start);
  src.stop(fadeStart + fadeDur + 0.1);
}

export function applySidechainPump(
  ctx: OfflineAudioContext,
  gainNodeA: GainNode,
  fadeStart: number,
  fadeDur: number,
  secPerBeat: number,
  depth = 0.6
) {
  const beats = Math.max(1, Math.round(fadeDur / secPerBeat));
  const t0 = fadeStart;
  for (let i = 0; i < beats; i++) {
    const bStart = t0 + i * secPerBeat;
    const bMid = bStart + secPerBeat * 0.15;
    const bEnd = bStart + secPerBeat;

    gainNodeA.gain.setValueAtTime(gainNodeA.gain.value, bStart);
    gainNodeA.gain.linearRampToValueAtTime(Math.max(0.001, 1 - depth), bMid);
    gainNodeA.gain.linearRampToValueAtTime(1, bEnd);
  }
}

export function applyStereoWidener(
  ctx: OfflineAudioContext,
  nodeB: AudioNode,
  fadeStart: number,
  fadeDur: number
) {
  const stereoCtx = ctx as OfflineAudioContext & {
    createStereoPanner?: () => StereoPannerNode;
  };
  const panner: StereoPannerNode | null = stereoCtx.createStereoPanner
    ? stereoCtx.createStereoPanner()
    : null;
  if (!panner) return;

  const safeStart = Math.max(0, fadeStart - 0.25);
  panner.pan.setValueAtTime(0, safeStart);
  panner.pan.linearRampToValueAtTime(0.6, fadeStart + fadeDur);

  nodeB.disconnect();
  nodeB.connect(panner).connect(ctx.destination);
}

/* =======================================================
   STRATEGY LAYER
======================================================= */

export interface TransitionParams {
  ctx: OfflineAudioContext;
  bufA: AudioBuffer;
  bufB: AudioBuffer;
  anaA: AnalysisResult;
  anaB: AnalysisResult;
  spliceCenter: number;
  crossfadeSec: number;
  blend: Blend;
}

/** Default pro crossfade */
export function basicCrossfade(params: TransitionParams) {
  const { ctx, bufA, bufB, spliceCenter, crossfadeSec, blend } = params;

  const srcA = ctx.createBufferSource(); srcA.buffer = bufA;
  const srcB = ctx.createBufferSource(); srcB.buffer = bufB;
  const gA = ctx.createGain(); gA.gain.setValueAtTime(1, 0);
  const gB = ctx.createGain(); gB.gain.setValueAtTime(0, 0);

  srcA.connect(gA).connect(ctx.destination);
  srcB.connect(gB).connect(ctx.destination);

  const fadeStart = spliceCenter - crossfadeSec / 2;
  const offsetA = Math.max(30, bufA.duration - (spliceCenter + crossfadeSec));

  srcA.start(0, offsetA);
  srcB.start(fadeStart, 0);

  applyBlend(gA.gain, gB.gain, fadeStart, crossfadeSec, blend);
}

/** BeatDrop: align B’s strongest drop at spliceCenter */
export function beatDropTransition(params: TransitionParams) {
  const { ctx, bufA, bufB, anaB, spliceCenter, crossfadeSec, blend } = params;

  const srcA = ctx.createBufferSource(); srcA.buffer = bufA;
  const srcB = ctx.createBufferSource(); srcB.buffer = bufB;
  const gA = ctx.createGain(); gA.gain.setValueAtTime(1, 0);
  const gB = ctx.createGain(); gB.gain.setValueAtTime(0, 0);

  srcA.connect(gA).connect(ctx.destination);
  srcB.connect(gB).connect(ctx.destination);

  const dropB = findPrimaryDrop(anaB);
  const whenB = Math.max(0, spliceCenter - dropB);

  const offsetA = Math.max(30, bufA.duration - spliceCenter);
  srcA.start(0, offsetA);
  srcB.start(whenB, 0);

  applyBlend(gA.gain, gB.gain, spliceCenter - crossfadeSec / 2, crossfadeSec, blend);
}
