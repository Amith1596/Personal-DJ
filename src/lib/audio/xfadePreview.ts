// src/lib/audio/xfadePreview.ts
export type PreviewRecipe = "none" | "dreamy" | "echoTag" | "proEqBlend";

export type RenderPreviewMetrics = {
  bpm: number; peakDb: number;
  usedTA: number; usedTB: number;
  trackADuration: number; trackBDuration: number;
  contextSeconds: number; overlapSeconds: number;
};

export type RenderPreviewResult = { wav: Blob; metrics: RenderPreviewMetrics };

function getAudioContextCtor(): typeof AudioContext {
  const Ctor = window.AudioContext ?? (window as Window).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio API not supported.");
  return Ctor;
}

export async function renderTwoBarPreview(
  fileA: File, fileB: File,
  bpm: number = 120, bars: number = 2, crossfadeMs: number = 90,
  recipe: PreviewRecipe = "none",
  spliceTA?: number, spliceTB?: number,
  beatmatchRatio?: number
): Promise<RenderPreviewResult> {
  const AudioContextCtor = getAudioContextCtor();
  const actx = new AudioContextCtor();

  const [bufA, bufB] = await Promise.all([
    fileA.arrayBuffer().then(ab => actx.decodeAudioData(ab.slice(0))),
    fileB.arrayBuffer().then(ab => actx.decodeAudioData(ab.slice(0))),
  ]);

  // Timeline math
  const secPerBar = (60 / Math.max(1, bpm)) * 4;
  const segSec = Math.max(0.5, bars * secPerBar);
  const xfSec  = Math.max(0.01, crossfadeMs / 1000);
  const T_overlap = Math.max(0, segSec - xfSec);
  const ctxDur = segSec + (segSec - xfSec);

  // Splice positions
  const tA = typeof spliceTA === "number" ? clamp(spliceTA, 0, Math.max(0, bufA.duration - xfSec))
                                          : Math.max(0, bufA.duration - xfSec);
  const tB = typeof spliceTB === "number" ? clamp(spliceTB, 0, Math.max(0, bufB.duration - xfSec))
                                          : 0;

  const aOffset = clamp(tA - T_overlap, 0, Math.max(0, bufA.duration - xfSec));
  const bOffset = clamp(tB, 0, Math.max(0, bufB.duration - xfSec));

  const sr = actx.sampleRate;
  const oac = new OfflineAudioContext(2, Math.ceil(ctxDur * sr), sr);

  // Master with ~ -3 dB headroom
  const master = oac.createGain(); master.gain.value = 0.7071; master.connect(oac.destination);

  // --- Sources
  const sA = oac.createBufferSource(); sA.buffer = bufA;
  const sB = oac.createBufferSource(); sB.buffer = bufB;
  if (beatmatchRatio && isFinite(beatmatchRatio) && beatmatchRatio > 0) {
    sB.playbackRate.setValueAtTime(beatmatchRatio, 0);
  }

  // --- Pre-gains for crossfade (these are where we draw the xfade curves)
  const gA = oac.createGain();
  const gB = oac.createGain();

  // Route sources into their pre-gains
  sA.connect(gA);
  sB.connect(gB);

  // --- Optional effect chains per recipe
  // We'll end with: outA.connect(master), outB.connect(master)
  const outA: AudioNode = gA;
  let outB: AudioNode = gB;

  const want3Band = recipe === "proEqBlend" || recipe === "dreamy";
  if (recipe === "dreamy") {
    // LP sweep on B before the 3-band split
    const lp = oac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(16000, Math.max(0, T_overlap - 0.02));
    lp.frequency.exponentialRampToValueAtTime(900, T_overlap + xfSec);
    gB.connect(lp);
    outB = lp; // continue from lp into 3-band below if enabled
  }

  if (want3Band) {
    // 3-band splits for A and B
    const splitA = make3Band(oac); outA.connect(splitA.input);
    const splitB = make3Band(oac); outB.connect(splitB.input);

    // Club-style automation across the crossfade
    const t0 = T_overlap, t1 = T_overlap + xfSec;
    // A fades lows/highs faster; B fades in
    ramp(splitA.low.gain, 1, 0.2, t0, t1);
    ramp(splitB.low.gain, 0, 1.0, t0, t1);

    ramp(splitA.high.gain, 1, 0.4, t0, t1);
    ramp(splitB.high.gain, 0, 1.0, t0, t1);

    ramp(splitA.mid.gain, 1, 0.6, t0, t1);
    ramp(splitB.mid.gain, 0, 0.9, t0, t1);

    // Mix to master
    splitA.low.connect(master); splitA.mid.connect(master); splitA.high.connect(master);
    splitB.low.connect(master); splitB.mid.connect(master); splitB.high.connect(master);
  } else {
    // No 3-band: simple route once to master
    outA.connect(master);
    outB.connect(master);
  }

  // --- Equal-power crossfade on the pre-gains (stable regardless of chains)
  const N = 64;
  const aCurve = new Float32Array(N);
  const bCurve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    aCurve[i] = Math.cos((x * Math.PI) / 2); // 1→0
    bCurve[i] = Math.sin((x * Math.PI) / 2); // 0→1
  }
  gA.gain.setValueAtTime(1, 0);
  gA.gain.setValueCurveAtTime(aCurve, T_overlap, xfSec);
  gB.gain.setValueAtTime(0, 0);
  gB.gain.setValueCurveAtTime(bCurve, T_overlap, xfSec);

  // --- Schedule playback
  const durA = Math.min(segSec, Math.max(0, bufA.duration - aOffset));
  sA.start(0, aOffset, durA);
  const rateB = sB.playbackRate.value || 1;
  const durB = Math.min(segSec, Math.max(0, (bufB.duration - bOffset) / rateB));
  sB.start(T_overlap, bOffset, durB);

  // --- Render
  const rendered = await oac.startRendering();

  // Peak meter
  const L = rendered.getChannelData(0);
  const R = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : L;
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  const peakDb = 20 * Math.log10(Math.max(1e-6, peak));

  const wav = audioBufferToWav(rendered);
  return {
    wav: new Blob([wav], { type: "audio/wav" }),
    metrics: {
      bpm, peakDb, usedTA: tA, usedTB: tB,
      trackADuration: bufA.duration, trackBDuration: bufB.duration,
      contextSeconds: ctxDur, overlapSeconds: xfSec,
    },
  };
}

export default renderTwoBarPreview;

/* ---------------- helpers ---------------- */
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function ramp(param: AudioParam, from: number, to: number, t0: number, t1: number) {
  const a = Math.max(0, t0);
  const b = Math.max(a, t1);
  param.setValueAtTime(from, a);
  param.linearRampToValueAtTime(to, b);
}

function make3Band(ctx: BaseAudioContext) {
  const input = ctx.createGain();

  const low  = ctx.createBiquadFilter(); low.type  = "lowshelf";  low.frequency.value = 200;  low.gain.value = 0;
  const mid  = ctx.createBiquadFilter(); mid.type  = "peaking";   mid.frequency.value = 1000; mid.Q.value = 0.7; mid.gain.value = 0;
  const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 6000; high.gain.value = 0;

  input.connect(low); input.connect(mid); input.connect(high);
  return { input, low, mid, high };
}

function audioBufferToWav(ab: AudioBuffer): ArrayBuffer {
  const numCh = ab.numberOfChannels, numFrames = ab.length, sampleRate = ab.sampleRate;
  const bytesPerSample = 2, blockAlign = numCh * bytesPerSample, byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign, totalSize = 44 + dataSize;
  const out = new ArrayBuffer(totalSize), dv = new DataView(out); let pos = 0;
  const ws = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(pos++, s.charCodeAt(i)); };
  const u16 = (v: number) => { dv.setUint16(pos, v, true); pos += 2; };
  const u32 = (v: number) => { dv.setUint32(pos, v, true); pos += 4; };
  ws("RIFF"); u32(totalSize - 8); ws("WAVE"); ws("fmt "); u32(16); u16(1); u16(numCh);
  u32(sampleRate); u32(byteRate); u16(blockAlign); u16(16); ws("data"); u32(dataSize);
  const ch: Float32Array[] = Array.from({ length: numCh }, (_, i) => ab.getChannelData(i));
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][i]));
      dv.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true); pos += 2;
    }
  }
  return out;
}
