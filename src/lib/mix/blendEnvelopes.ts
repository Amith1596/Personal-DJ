// src/lib/mix/blendEnvelopes.ts
export type BlendMode = "overlap" | "dipThenPunch" | "gapCut" | "punchIn";

/**
 * Apply gain automation for the selected blend mode.
 * Times are on the render timeline (already time-offset for preview if needed).
 */
export function applyBlendEnvelope(
  gainA: GainNode,
  gainB: GainNode,
  fadeStart: number,
  fadeDur: number,
  mode: BlendMode
) {
  const fadeEnd = fadeStart + Math.max(0, fadeDur);

  switch (mode) {
    case "overlap": {
      // Equal-power: gainA=cos², gainB=sin²
      const steps = 128;
      for (let i = 0; i <= steps; i++) {
        const t = fadeStart + (i / steps) * fadeDur;
        const theta = (i / steps) * (Math.PI / 2);
        gainA.gain.setValueAtTime(Math.cos(theta) ** 2, t);
        gainB.gain.setValueAtTime(Math.sin(theta) ** 2, t);
      }
      break;
    }

    case "dipThenPunch": {
      const t0 = fadeStart;
      const tMid = t0 + fadeDur * 0.4;
      const tPunch = t0 + fadeDur * 0.55;

      gainA.gain.setValueAtTime(1.0, t0);
      gainA.gain.linearRampToValueAtTime(0.15, tMid);
      gainA.gain.linearRampToValueAtTime(0.0, fadeEnd);

      gainB.gain.setValueAtTime(0.0, t0);
      gainB.gain.linearRampToValueAtTime(0.85, tPunch);
      gainB.gain.linearRampToValueAtTime(1.0, fadeEnd);
      break;
    }

    case "gapCut": {
      // tiny silent breath between A and B
      const gap = Math.min(0.08, fadeDur * 0.15);
      const cutA = fadeStart + Math.max(0, (fadeDur * 0.5) - gap / 2);
      const riseB = cutA + gap;

      gainA.gain.setValueAtTime(1, fadeStart);
      gainA.gain.linearRampToValueAtTime(0, cutA);

      gainB.gain.setValueAtTime(0, fadeStart);
      gainB.gain.setValueAtTime(0, riseB);
      gainB.gain.linearRampToValueAtTime(1, fadeEnd);
      break;
    }

    case "punchIn": {
      const duck = Math.min(0.12, fadeDur * 0.25);
      const tDuck = fadeStart + duck;

      gainA.gain.setValueAtTime(1, fadeStart);
      gainA.gain.linearRampToValueAtTime(0.25, tDuck);
      gainA.gain.linearRampToValueAtTime(0.0, fadeEnd);

      gainB.gain.setValueAtTime(0, fadeStart);
      gainB.gain.linearRampToValueAtTime(0.9, tDuck);
      gainB.gain.linearRampToValueAtTime(1.0, fadeEnd);
      break;
    }
  }
}
