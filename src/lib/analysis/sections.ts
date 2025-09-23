// Foote-style novelty curve over beat-synchronous chroma to get section boundaries.
export function detectSections(beatsSec: number[], beatChroma: number[][]): number[] {
  const N = beatChroma.length;
  if (N < 4) return [];
  // cosine similarity on beats
  const sim: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) sim[i][j] = cosine(beatChroma[i], beatChroma[j]);
  }
  // checkerboard kernel around diagonal
  const w = Math.min(8, Math.floor(N / 6)); // ~2 bars @ 4/4
  const novelty = new Float32Array(N).fill(0);
  for (let t = w; t < N - w; t++) {
    let s = 0;
    for (let i = -w; i < w; i++) {
      for (let j = -w; j < w; j++) {
        const k = ((i < 0 && j < 0) || (i >= 0 && j >= 0)) ? 1 : -1;
        s += k * sim[t + i][t + j];
      }
    }
    novelty[t] = s;
  }
  // threshold + peak pick
  const mu = mean(novelty), sd = std(novelty, mu);
  const thr = mu + 0.8 * sd;
  const peaks: number[] = [];
  for (let t = 1; t < N - 1; t++) {
    if (novelty[t] > thr && novelty[t] > novelty[t - 1] && novelty[t] > novelty[t + 1]) peaks.push(t);
  }
  // map beat indices to seconds
  return peaks.map(bi => beatsSec[Math.min(bi, beatsSec.length - 1)]);
}

function cosine(a: number[], b: number[]) {
  let num = 0, ax = 0, ay = 0;
  for (let i = 0; i < a.length; i++) { num += a[i] * b[i]; ax += a[i] * a[i]; ay += b[i] * b[i]; }
  return num / (Math.sqrt(ax * ay) || 1);
}
function mean(x: Float32Array) { let s = 0; for (const v of x) s += v; return s / (x.length || 1); }
function std(x: Float32Array, m: number) { let s = 0; for (const v of x) s += (v - m) ** 2; return Math.sqrt(s / (x.length || 1)); }
