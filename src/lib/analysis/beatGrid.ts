// src/lib/beatGrid.ts
import { guess } from "web-audio-beat-detector";

/**
 * Returns array of beat times (in seconds) for a buffer.
 * @param buffer AudioBuffer
 */
export async function getBeatGrid(buffer: AudioBuffer): Promise<number[]> {
  const bpm = await guess(buffer).catch(() => null);
  if (!bpm || bpm <= 0) return [];

  const secPerBeat = 60 / bpm;

  // crude: assume beat starts at 0; later we refine with onset phase
  const beats: number[] = [];
  for (let t = 0; t < buffer.duration; t += secPerBeat) {
    beats.push(t);
  }
  return beats;
}
