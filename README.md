# Personal DJ

**AI-powered DJ mixer that creates professional transitions between tracks using music analysis.**

**Live:** [personal-dj-nine.vercel.app](https://personal-dj-nine.vercel.app)

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

---

## What It Does

Upload two audio files → Personal DJ analyzes their musical structure → Select a transition style → Download a seamless DJ-quality mix.

**How it works:**
1. Analyzes both tracks with Essentia.js (BPM, key, beats, energy, structure)
2. Generates 64-120 splice point candidates scored on 7 dimensions (downbeat alignment, energy matching, tempo compatibility, harmonic similarity, section boundaries, onset avoidance, edge penalties)
3. Applies your chosen transition effect with 3-band EQ blending and beatmatching
4. Renders the final mix — all client-side, no server needed

### Transition Styles
9 built-in effects: Dreamy Sweep, Echo Tag, Beat Drop, Tape Stop, Beat Roll, Riser Noise, Sidechain Pump, Stereo Widener, Chaotic Stutter

---

## Tech Stack

- **Next.js 15** + React 19 + TypeScript
- **Essentia.js** (WASM) — BPM detection, beat tracking, key estimation, energy analysis
- **Web Audio API** — Real-time mixing, 3-band EQ, effects rendering
- **WaveSurfer.js** — Waveform visualization
- **Tonal.js** — Music theory (harmonic compatibility)
- **PWA** — Installable, works offline

---

## Run Locally

```bash
pnpm install
pnpm dev
# Open http://localhost:3000
```

Upload Track A and Track B, pick a vibe, download your mix.

---

## Audio Engineering

- Sample-accurate beat grid alignment
- Zero-crossing nudge for click prevention
- 3-band frequency splitting (low/mid/high) for smooth EQ transitions
- Dynamic time warping for harmonic matching
- Peak limiting to -0.3 dBFS
- 100% client-side — no uploads, no servers, works offline

### QA Panel

Developer testing interface at `/qa` with manual splice point override, candidate inspection, beatmatching toggle, and detailed audio metrics.

---

## Architecture

```
Browser
  └── Next.js + React
      ├── Essentia.js (WASM) → Music analysis (BPM, key, beats, energy)
      ├── Web Audio API → Mixing, effects, 3-band EQ
      └── WaveSurfer.js → Waveform visualization
```

Entirely client-side. No backend, no API keys, no cost. Privacy-preserving — audio never leaves the browser.

---

## Roadmap

Multi-track backend (3-4 song mashups) using Python + librosa + Demucs for AI stem separation is in development.

---

## Author

Built by [Amith Pallankize](https://amithpallankize.com) — Ex-Microsoft SWE, Wharton MBA '26

**License:** MIT
