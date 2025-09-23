import Meyda from "meyda";

// Average 12D chroma per beat interval: beats[k]..beats[k+1]
export function chromaPerBeat(buffer: AudioBuffer, beatsSec: number[]): number[][] {
  const sr = buffer.sampleRate;
  const mono = mixToMono(buffer);
  const winSec = 0.12, hopSec = 0.06;
  const win = Math.max(512, Math.floor(winSec * sr));
  const hop = Math.max(256, Math.floor(hopSec * sr));

  // frame-wise chroma
  const frames: number[][] = [];
  for (let i = 0; i + win <= mono.length; i += hop) {
    const frame = mono.subarray(i, i + win);
    const feats = Meyda.extract(["chroma"], frame, { sampleRate: sr, bufferSize: win } as any);
    frames.push(norm12(feats?.chroma || new Array(12).fill(0)));
  }
  // aggregate per beat
  const perBeat: number[][] = [];
  for (let b = 0; b < beatsSec.length - 1; b++) {
    const t0 = beatsSec[b], t1 = beatsSec[b + 1];
    const i0 = Math.max(0, Math.floor(t0 / hopSec));
    const i1 = Math.min(frames.length, Math.ceil(t1 / hopSec));
    if (i1 <= i0) { perBeat.push(new Array(12).fill(0)); continue; }
    const avg = new Array(12).fill(0);
    for (let i = i0; i < i1; i++) for (let k = 0; k < 12; k++) avg[k] += frames[i][k];
    for (let k = 0; k < 12; k++) avg[k] /= (i1 - i0);
    perBeat.push(norm12(avg));
  }
  return perBeat;
}

function mixToMono(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}
function norm12(v: number[]) {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map(x => x / n);
}
