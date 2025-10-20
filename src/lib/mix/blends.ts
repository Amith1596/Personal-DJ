export type Blend = "equalPower" | "sCurve" | "log" | "cut" | "ducked";

/**
 * Generate gain curves for two tracks across a crossfade.
 * Returns { a, b } for Track A (out) and Track B (in).
 */
function makeCurve(kind: Blend, n = 256): { a: Float32Array; b: Float32Array } {
  const a = new Float32Array(n);
  const b = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const x = i / (n - 1); // 0..1 across fade
    let ga = 1 - x;
    let gb = x;

    if (kind === "equalPower") {
      ga = Math.cos((Math.PI / 2) * x);
      gb = Math.sin((Math.PI / 2) * x);
    } else if (kind === "sCurve") {
      const s = x * x * (3 - 2 * x); // cubic Hermite
      ga = 1 - s; gb = s;
    } else if (kind === "log") {
      const k = 7; // steeper near ends
      ga = Math.pow(1 - x, 1 / Math.log2(k));
      gb = Math.pow(x, 1 / Math.log2(k));
    } else if (kind === "ducked") {
      // equal-power with a mid-fade dip on A (pseudo sidechain)
      const baseA = Math.cos((Math.PI / 2) * x);
      const dip = 1 - Math.exp(-Math.pow((x - 0.35) / 0.18, 2));
      ga = Math.max(0, baseA * (1 - 0.35 * dip));
      gb = Math.sin((Math.PI / 2) * x);
    } else if (kind === "cut") {
      ga = x < 1 ? 1 : 0;
      gb = x > 0 ? 1 : 0;
    }

    a[i] = ga;
    b[i] = gb;
  }
  return { a, b };
}

/** Apply the chosen blend curve across a crossfade window. */
export function applyBlend(
  gainA: AudioParam,
  gainB: AudioParam,
  start: number,
  dur: number,
  kind: Blend
) {
  const { a, b } = makeCurve(kind);
  // Set curves; host params will interpolate sample-accurately.
  gainA.setValueCurveAtTime(a, start, dur);
  gainB.setValueCurveAtTime(b, start, dur);
}
