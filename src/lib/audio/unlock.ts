// src/lib/audio/unlock.ts
export async function unlockAudio(): Promise<void> {
  const Ctor = window.AudioContext ?? (window as Window).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  try {
    await ctx.resume();
    // Play 1 sample of silence to satisfy some autoplay policies
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    try { src.start(0); } catch {}
  } finally {
    try { await ctx.close(); } catch {}
  }
}
