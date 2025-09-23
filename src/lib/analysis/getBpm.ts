// src/lib/getBpm.ts
import { guess } from "web-audio-beat-detector";
import MusicTempo from "music-tempo";

/**
 * Detects BPM of an AudioBuffer.
 * 1. Try web-audio-beat-detector
 * 2. Fallback to music-tempo
 */
export async function getBpm(audioBuffer: AudioBuffer): Promise<number | null> {
  try {
    // --- Pass 1: web-audio-beat-detector ---
    try {
      const bpm = await guess(audioBuffer);
      if (typeof bpm === "number" && !isNaN(bpm) && bpm > 0) {
        return Math.round(bpm);
      }
    } catch (err) {
      console.warn("Primary BPM detection failed:", err);
    }

    // --- Pass 2: music-tempo fallback ---
    const channelData = audioBuffer.getChannelData(0);
    const samples: number[] = [];

    // Downsample for speed (~1kHz resolution)
    const step = Math.floor(audioBuffer.sampleRate / 1000);
    for (let i = 0; i < channelData.length; i += step) {
      samples.push(channelData[i]);
    }

    const mt = new MusicTempo(samples);
    if (mt.tempo && !isNaN(mt.tempo) && mt.tempo > 0) {
      return Math.round(mt.tempo);
    }

    return null; // if both fail
  } catch (err) {
    console.error("BPM detection error:", err);
    return null;
  }
}
