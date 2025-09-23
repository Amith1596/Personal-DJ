// Tiny DTW on beat-synchronous 12D chroma to align A-end -> B-start.
// Returns how many beats to shift B forward (+) or back (−) for best match.
export function dtwOffsetBeats(
  chromA: number[][], // last K beats of A (each is 12D chroma)
  chromB: number[][]  // first K beats of B
): { offsetBeats: number; cost: number } {
  const n = chromA.length, m = chromB.length;
  if (n === 0 || m === 0) return { offsetBeats: 0, cost: 0 };

  const D = Array.from({ length: n + 1 }, () => Array(m + 1).fill(Infinity));
  D[0][0] = 0;

  const dist = (i: number, j: number) => 1 - cosine(chromA[i], chromB[j]); // cosine distance ∈ [0,2]
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = dist(i - 1, j - 1);
      D[i][j] = d + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }

  // Choose j* (prefix length of B) that best aligns with full A window
  let jBest = 1, best = D[n][1];
  for (let j = 2; j <= m; j++) {
    if (D[n][j] < best) { best = D[n][j]; jBest = j; }
  }

  // If jBest > n, B wants to be shifted later; if < n, earlier. Convert to signed beats:
  const offsetBeats = jBest - n;
  return { offsetBeats, cost: best };
}

function cosine(a: number[], b: number[]) {
  let num = 0, ax = 0, ay = 0;
  for (let k = 0; k < a.length; k++) { num += a[k] * b[k]; ax += a[k] * a[k]; ay += b[k] * b[k]; }
  return num / (Math.sqrt(ax * ay) || 1);
}
