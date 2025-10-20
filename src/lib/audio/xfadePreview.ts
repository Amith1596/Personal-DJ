// src/lib/audio/xfadePreview.ts
export async function renderTwoBarPreview(
  fileA: File,
  fileB: File,
  bpm: number = 120,
  bars: number = 2,
  crossfadeMs: number = 90
): Promise<{ wav: Blob; metrics: { bpm: number; peakDb: number } }> {
  const secPerBar = (60 / bpm) * 4;
  const segSec = Math.max(0.5, bars * secPerBar);
  const xfSec = crossfadeMs / 1000;

  const actx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const [bufA, bufB] = await Promise.all([
    fileA.arrayBuffer().then((ab) => actx.decodeAudioData(ab.slice(0))),
    fileB.arrayBuffer().then((ab) => actx.decodeAudioData(ab.slice(0))),
  ]);

  const sr = actx.sampleRate;
  const aStart = Math.max(0, bufA.duration - segSec);
  const ctxDur = segSec + (segSec - xfSec); // tail of A + head of B minus overlap
  const oac = new OfflineAudioContext(2, Math.ceil(ctxDur * sr), sr);

  const gA = oac.createGain();
  const gB = oac.createGain();
  const sA = oac.createBufferSource();
  const sB = oac.createBufferSource();
  sA.buffer = bufA;
  sB.buffer = bufB;

  // Schedule: A at t=0 from aStart for segSec; B at (segSec - xfSec) from 0 for segSec
  sA.connect(gA).connect(oac.destination);
  sB.connect(gB).connect(oac.destination);
  sA.start(0, aStart, Math.min(segSec, bufA.duration - aStart));
  sB.start(Math.max(0, segSec - xfSec), 0, Math.min(segSec, bufB.duration));

  // Equal-power crossfade in [segSec - xfSec, segSec]
  const t0 = Math.max(0, segSec - xfSec);
  const N = 64;
  const aCurve = new Float32Array(N);
  const bCurve = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    aCurve[i] = Math.cos((x * Math.PI) / 2); // 1→0
    bCurve[i] = Math.sin((x * Math.PI) / 2); // 0→1
  }
  gA.gain.setValueAtTime(1, 0);
  gA.gain.setValueCurveAtTime(aCurve, t0, xfSec);
  gB.gain.setValueAtTime(0, 0);
  gB.gain.setValueCurveAtTime(bCurve, t0, xfSec);

  const rendered = await oac.startRendering();

  // Peak meter + WAV encode
  let peak = 0;
  const chL = rendered.getChannelData(0);
  const chR = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : chL;
  for (let i = 0; i < chL.length; i++) peak = Math.max(peak, Math.abs(chL[i]), Math.abs(chR[i]));
  const peakDb = 20 * Math.log10(Math.max(1e-6, peak));

  const wav = audioBufferToWav(rendered);
  return { wav: new Blob([wav], { type: "audio/wav" }), metrics: { bpm, peakDb } };
}

function audioBufferToWav(ab: AudioBuffer): ArrayBuffer {
  const numCh = ab.numberOfChannels;
  const len = ab.length * numCh * 2 + 44;
  const out = new ArrayBuffer(len);
  const dv = new DataView(out);
  let pos = 0;

  function writeStr(s: string) {
    for (let i = 0; i < s.length; i++) dv.setUint8(pos++, s.charCodeAt(i));
  }
  function write32(v: number) { dv.setUint32(pos, v, true); pos += 4; }
  function write16(v: number) { dv.setUint16(pos, v, true); pos += 2; }

  writeStr("RIFF"); write32(len - 8); writeStr("WAVE");
  writeStr("fmt "); write32(16); write16(1); write16(numCh);
  write32(ab.sampleRate); write32(ab.sampleRate * numCh * 2);
  write16(numCh * 2); write16(16);
  writeStr("data"); write32(len - 44);

  const chData = Array.from({ length: numCh }, (_, c) => ab.getChannelData(c));
  for (let i = 0; i < ab.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chData[c][i]));
      dv.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
  }
  return out;
}
