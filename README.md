# Personal DJ

**AI-powered DJ mixer that creates professional transitions between tracks using music analysis.**

**Live:** [personal-dj-nine.vercel.app](https://personal-dj-nine.vercel.app)

![Status](https://img.shields.io/badge/status-live-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Python](https://img.shields.io/badge/Python-3.11-blue)

---

## What It Does

Upload two audio files, Personal DJ analyzes their musical structure, select a transition style, download a seamless DJ-quality mix.

### v1: Client-Side Mixer (Live on Vercel)

All processing happens in the browser. No backend needed.

1. Analyzes both tracks with Essentia.js (BPM, key, beats, energy, structure)
2. Generates 64-120 splice point candidates scored on 7 dimensions (downbeat alignment, energy matching, tempo compatibility, harmonic similarity, section boundaries, onset avoidance, edge penalties)
3. Applies your chosen transition effect with 3-band EQ blending and beatmatching
4. Renders the final mix client-side

**9 transition styles:** Dreamy Sweep, Echo Tag, Beat Drop, Tape Stop, Beat Roll, Riser Noise, Sidechain Pump, Stereo Widener, Chaotic Stutter

### v2: Backend Engine (Local Only)

Python backend with stem-aware mixing via Demucs. Runs locally, not deployed.

- **Audio analysis:** allin1 (structure/BPM/beats), librosa (energy/spectral), Essentia (key detection)
- **Mix planning:** Section scoring, cue point selection, 5 transition strategies based on Camelot key distance
- **Transition engine:** Stem separation (Demucs), stem swap, rhythm bridge, pitch shift, hard cut, beat loop
- **Manual mode:** Chain 2-5 songs with user-specified timestamps, preview transitions, render full mix
- **API:** FastAPI endpoints for upload, mix, status polling, and download
- **Frontend:** `/manual` route with WaveSurfer waveform display, draggable region markers, chain timeline

---

## Run Locally

### Frontend (v1)

```bash
pnpm install
pnpm dev
# Open http://localhost:3000
```

### Backend (v2)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# CLI (auto mode)
python spike_mix.py song1.mp3 song2.mp3 -o output.wav

# CLI (manual mode)
python spike_mix.py --manual song1.mp3 30 120 song2.mp3 0 90 -o output.wav

# API server
uvicorn app.main:app --reload
# API at http://localhost:8000, docs at http://localhost:8000/docs
```

Requires: Python 3.11+, ffmpeg (`brew install ffmpeg`), rubberband (`brew install rubberband`)

### Tests

```bash
cd backend
python -m pytest tests/ -v  # 118 tests
```

---

## Tech Stack

**Frontend:** Next.js 15, React 19, TypeScript, Essentia.js (WASM), Web Audio API, WaveSurfer.js, Tonal.js

**Backend:** Python 3.11, FastAPI, Demucs v4, allin1, librosa, Essentia, pyrubberband, pedalboard

---

## Architecture

```
Browser (Vercel)
  └── Next.js + React
      ├── Essentia.js (WASM) → v1 music analysis
      ├── Web Audio API → v1 mixing + effects
      ├── WaveSurfer.js → Waveform visualization
      └── /manual route → v2 manual mode UI

Local Backend (not deployed)
  └── FastAPI
      ├── audio_analyzer → allin1 + librosa + Essentia
      ├── mix_planner → Section scoring, cue points, strategy
      └── transition_engine → Demucs stems + rendering
```

---

## Author

Built by [Amith Pallankize](https://amithpallankize.com)

**License:** MIT
