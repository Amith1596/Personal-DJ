/**
 * Snap a user-selected time to the nearest musically sensible beat.
 *
 * Within a ±windowSec range, scores each beat by:
 *   - Proximity to the click (50%)
 *   - Downbeat bonus: every 4th beat (30%)
 *   - Phrase boundary bonus: every 16th beat / 4-bar phrase (20%)
 *
 * Returns the raw time if no beats fall within the window.
 */
export function snapToBeat(
  rawTime: number,
  beats: number[],
  bpm: number,
  windowSec = 2,
): number {
  if (beats.length === 0 || bpm <= 0) return rawTime;

  const secPerBeat = 60 / bpm;
  const candidates = beats.filter((b) => Math.abs(b - rawTime) <= windowSec);
  if (candidates.length === 0) return rawTime;

  let best = rawTime;
  let bestScore = -Infinity;

  for (const beat of candidates) {
    const proximity = 1 - Math.abs(beat - rawTime) / windowSec;
    const beatIndex = Math.round(beat / secPerBeat);
    const isDownbeat = beatIndex % 4 === 0;
    const isPhrase = beatIndex % 16 === 0;

    const score =
      proximity * 0.5 +
      (isDownbeat ? 0.3 : 0) +
      (isPhrase ? 0.2 : 0);

    if (score > bestScore) {
      bestScore = score;
      best = beat;
    }
  }

  return best;
}
