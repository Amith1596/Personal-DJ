import { analyzeTrack } from "./analysis/analyzeTrack";
import { basicCrossfade, beatDropTransition, TransitionParams } from "./mix/transitions";
import { applyBlend, Blend } from "./mix/blends";

export type Vibe =
  | "dreamy" | "chaotic" | "echoTag" | "tapeStop" | "beatRoll"
  | "riser"  | "pump"    | "widen"   | "beatDrop";

export async function mixTracks(
  fileA: File,
  fileB: File,
  crossfadeSec: number,
  vibe: Vibe,
  previewOnly: boolean,
  blend: Blend = "equalPower"
): Promise<Blob> {
  const RT =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const rt = new RT();
  const [bufA, bufB] = await Promise.all([
    fileA.arrayBuffer().then((ab) => rt.decodeAudioData(ab)),
    fileB.arrayBuffer().then((ab) => rt.decodeAudioData(ab)),
  ]);
  await rt.close();

  const [anaA, anaB] = await Promise.all([analyzeTrack(fileA), analyzeTrack(fileB)]);

  const sr = 44100;
  const ch = 2;
  const regionDur = previewOnly ? 45 : Math.max(45, crossfadeSec + 20);
  const frames = Math.ceil(regionDur * sr);
  const ctx = new OfflineAudioContext(ch, frames, sr);

  const spliceCenter = regionDur / 2;

  const params: TransitionParams = {
    ctx, bufA, bufB, anaA, anaB,
    spliceCenter, crossfadeSec, blend
  };

  if (vibe === "beatDrop") {
    beatDropTransition(params);
  } else {
    basicCrossfade(params);
  }

  const rendered = await ctx.startRendering();
  const wav = audioBufferToWav(rendered);
  return new Blob([new DataView(wav)], { type: "audio/wav" });
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1, bitDepth = 16;

  const samples = buffer.length * numCh;
  const blockAlign = (numCh * bitDepth) >> 3;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples * (bitDepth >> 3);
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);

  function wstr(o: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  }

  let o = 0;
  wstr(o, "RIFF"); o += 4;
  view.setUint32(o, 36 + dataSize, true); o += 4;
  wstr(o, "WAVE"); o += 4;
  wstr(o, "fmt "); o += 4;
  view.setUint32(o, 16, true); o += 4;
  view.setUint16(o, format, true); o += 2;
  view.setUint16(o, numCh, true); o += 2;
  view.setUint32(o, sampleRate, true); o += 4;
  view.setUint32(o, byteRate, true); o += 4;
  view.setUint16(o, blockAlign, true); o += 2;
  view.setUint16(o, bitDepth, true); o += 2;
  wstr(o, "data"); o += 4;
  view.setUint32(o, dataSize, true); o += 4;

  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

  let idx = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const sample = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(
        44 + idx,
        (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0,
        true
      );
      idx += 2;
    }
  }
  return ab;
}
