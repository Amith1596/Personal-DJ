# Personal DJ v2 - Build Context

## Mission

AI that amplifies human creativity in music. DJs pick parts of songs
they love. The system handles the technical execution: analysis,
section selection, transition engineering, rendering.

**v1.0 (SHIPPED):** Client-side 2-track mixer with crossfade vibes.
Live at https://personal-dj-nine.vercel.app

**v2.0 (BUILDING):** Upload 2 songs via web UI. System analyzes both,
selects the best sections, engineers a seamless transition, outputs a
mixed audio file. DJs pick parts, not full songs. Quality over quantity.
Nail 2-song transitions before expanding to playlists.

---

## Core Pipeline

```
Upload 2 songs
    |
    v
[1. ANALYZE] ──── allin1 (structure, BPM, beats, downbeats)
    |               librosa (energy, spectral, onset)
    |               Essentia (key detection via KeyExtractor)
    |
    v
[2. SELECT SECTIONS] ── Score each segment: type_weight * energy * duration_penalty
    |                     Chorus=1.0, Drop=1.0, Verse=0.7, Bridge=0.5, Intro/Outro=0.2
    |                     Select "best part" per song (what a DJ would play)
    |
    v
[3. PLAN TRANSITION] ── Score all (exit_A, entry_B) cue point pairs
    |                     Factors: camelot_compat(0.30) + energy_continuity(0.25)
    |                              + bpm_proximity(0.25) + structural_fitness(0.20)
    |                     Pick highest-scoring pair
    |                     Select transition strategy based on key distance
    |
    v
[4. EXECUTE TRANSITION] ── Strategy depends on Camelot distance:
    |                        0-1: Stem swap (8-bar, swap drums>bass>melody>vocals)
    |                        2-3: Rhythm bridge (drums+bass only in overlap)
    |                        4-5: Pitch-shift smaller delta to match
    |                        6+:  Hard cut on downbeat (clean break)
    |                        ANY: Beat-loop repeat (loop last 1-2 bars of A while B enters)
    |
    v
[5. RENDER] ──── Combine selected sections + transition
                  Normalize, export WAV/MP3
```

---

## Tech Stack

| Tool | Purpose | License | Install |
|------|---------|---------|---------|
| **Demucs v4** (`htdemucs_ft`) | Stem separation (vocals, drums, bass, other) | MIT | `pip install demucs` |
| **allin1** | Structure analysis (segments, beats, BPM, downbeats) | MIT | `pip install allin1` |
| **librosa** | Energy curves, onset detection, spectral analysis | ISC | `pip install librosa` |
| **Essentia** | Key detection (KeyExtractor), advanced MIR | AGPL-3.0 | `pip install essentia` |
| **madmom** | Beat/downbeat tracking (DBN-based, more accurate than librosa) | BSD | `pip install madmom` |
| **Pedalboard** | Audio FX (reverb, delay, filter sweeps, compression) | GPL-3.0 | `pip install pedalboard` |
| **pyrubberband** | Time-stretching, pitch-shifting | MIT | `pip install pyrubberband` + `brew install rubberband` |
| **pydub + ffmpeg** | Format conversion, final export | MIT | `pip install pydub` + `brew install ffmpeg` |
| **FastAPI** | Web API | MIT | `pip install fastapi uvicorn` |
| **soundfile** | WAV I/O | BSD | `pip install soundfile` |

### Transition FX (2-tier system)

**Tier 1 (Default): Curated FX Library**
- Pre-made CC-licensed samples: risers, downlifters, impacts, white noise sweeps
- Stored in `backend/assets/fx/`
- Categories: `risers/`, `impacts/`, `sweeps/`, `textures/`
- Zero computation. Deterministic. Reliable.

**Tier 2 (Optional): AI-Generated Bridges**
- **Magenta RealTime** (Google): Apache 2.0 code + CC-BY 4.0 weights. Open, local, free.
  Explicit BPM conditioning. Proven transition interpolation.
- **Lyria RealTime API**: Free via Gemini API (`lyria-realtime-exp`). Stream-based,
  text-conditioned. Fallback if Magenta quality insufficient.
- Use case: difficult key pairs where curated FX aren't enough.
  Generate a 4-8 bar bridge that matches the target BPM and bridges the harmonic gap.

---

## Key Algorithms

### Section Scoring

```python
def score_segment(segment, energy_curve, sr):
    TYPE_WEIGHTS = {
        "chorus": 1.0, "drop": 1.0, "verse": 0.7,
        "bridge": 0.5, "intro": 0.2, "outro": 0.2
    }
    weight = TYPE_WEIGHTS.get(segment["label"], 0.5)
    start_sample = int(segment["start"] * sr)
    end_sample = int(segment["end"] * sr)
    avg_energy = np.mean(energy_curve[start_sample:end_sample])
    duration = segment["end"] - segment["start"]
    # Penalize very short (<15s) or very long (>90s) sections
    dur_penalty = 1.0 if 15 <= duration <= 90 else 0.7
    return weight * avg_energy * dur_penalty
```

### Energy Curve

```python
def compute_energy(y, sr, hop_length=512):
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    # Normalize each to [0,1]
    rms_n = rms / (rms.max() + 1e-8)
    cent_n = cent / (cent.max() + 1e-8)
    onset_n = onset / (onset.max() + 1e-8)
    return 0.5 * rms_n + 0.3 * cent_n + 0.2 * onset_n
```

### Cue Point Scoring

```python
def score_cue_pair(exit_a, entry_b, key_a, key_b, energy_a, energy_b, bpm_a, bpm_b):
    camelot_dist = camelot_distance(key_a, key_b)
    camelot_score = max(0, 1.0 - camelot_dist / 6)
    energy_score = 1.0 - abs(energy_a - energy_b)
    bpm_score = 1.0 - min(abs(bpm_a - bpm_b) / 20.0, 1.0)
    struct_a = 1.0 if exit_a["label"] in ("chorus", "drop") else 0.5
    struct_b = 1.0 if entry_b["label"] in ("verse", "intro", "build") else 0.5
    struct_score = (struct_a + struct_b) / 2
    return (0.30 * camelot_score + 0.25 * energy_score +
            0.25 * bpm_score + 0.20 * struct_score)
```

### Transition Strategy Selection

```python
def select_strategy(camelot_dist, bpm_delta):
    if camelot_dist <= 1:
        return "stem_swap"      # Full 8-bar stem-by-stem swap
    elif camelot_dist <= 3:
        return "rhythm_bridge"  # Drums+bass only in overlap zone
    elif camelot_dist <= 5:
        return "pitch_shift"    # Shift smaller-delta song to match
    else:
        return "hard_cut"       # Clean cut on downbeat
    # beat_loop_repeat available as universal fallback
```

---

## Research Findings

**ISMIR 2020 cue point study**: 23.6% of DJ cue point selections are identical
across different DJs. 73.6% within 8 measures. Cue points cluster at 32-beat
(8-bar) phrase boundaries. This validates algorithmic cue point selection.

**allin1**: Returns segments with labels (intro/verse/chorus/drop/outro), beats,
downbeats, BPM. Single call: `allin1.analyze(path)`. MIT license. Free. Local.
PyPI installable. No API key needed.

**Cooper-Foote self-similarity**: Zero-ML fallback for finding the most
representative section (chorus detection) via self-similarity matrix on chroma
features. Use if allin1 segment labels are unreliable.

**Beat-loop repeat**: Loop last 1-2 bars of Song A while fading in Song B.
Zero stem separation needed. Reliable across all genres. Underrated technique
that professional DJs use frequently. Good universal fallback.

**No existing open-source project does the full pipeline.** The building blocks
exist (Demucs, allin1, librosa, etc.) but the integration layer that connects
analysis, section selection, transition planning, and rendering is the novel
contribution.

---

## Build Phases

### Phase 0: Spike (CURRENT)

Validate that the transition quality is good enough before building any UI.

**Goal**: Take 2 audio files, run the full pipeline programmatically, output
a mixed file, listen to it, judge quality.

**Success criteria**: Transition sounds intentional, not random. A listener
would think a human DJ made the transition.

**Deliverables**:
1. `backend/app/services/mix_planner.py` - The "DJ brain": section scoring,
   cue point selection, transition strategy. Pure Python logic.
2. `backend/app/services/audio_analyzer.py` - Wrapper around allin1 + librosa
   + Essentia. Returns structured analysis per track.
3. `backend/app/services/transition_engine.py` - Executes the chosen strategy
   (stem swap, rhythm bridge, etc.) using Demucs + audio processing.
4. `backend/tests/test_mix_planner.py` - Unit tests with mock analysis data.
5. `backend/spike_mix.py` - CLI script: `python spike_mix.py song1.mp3 song2.mp3 -o output.wav`

### Phase 1: API

Wrap the spike in FastAPI endpoints. Upload 2 files, get back mixed audio.

**Endpoints**:
- `POST /api/v1/mix` - Upload 2 files, returns job ID
- `GET /api/v1/mix/{job_id}/status` - Poll processing status
- `GET /api/v1/mix/{job_id}/download` - Download result

### Phase 2: Web UI

Simple upload interface. Drag-and-drop 2 songs. See analysis results.
Preview transition. Download mixed output.

### Phase 3: Polish

Section selection UI (let users pick which parts to use). Transition
preview before rendering. Multiple output formats. Queue system for
concurrent requests.

---

## Project Structure

```
personal-dj/
├── claude.md                 # This file
├── CLAUDE.md                 # Auto-generated (don't edit manually)
├── src/                      # v1.0 Next.js frontend (shipped)
├── public/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app (Phase 1)
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── audio_analyzer.py    # allin1 + librosa + Essentia wrapper
│   │   │   ├── mix_planner.py       # Section scoring, cue points, strategy
│   │   │   └── transition_engine.py # Demucs + stem swap + rendering
│   │   └── models/
│   │       ├── __init__.py
│   │       └── schemas.py           # Pydantic models for track analysis
│   ├── assets/
│   │   └── fx/                      # Curated CC-licensed transition FX
│   │       ├── risers/
│   │       ├── impacts/
│   │       ├── sweeps/
│   │       └── textures/
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_mix_planner.py
│   │   └── test_audio_analyzer.py
│   ├── spike_mix.py                 # CLI spike script
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .gitignore
├── package.json
└── next.config.js
```

---

## v1.0 Reference

The shipped v1.0 client-side mixer has these strengths to preserve or exceed:
- Splice point detection: 64-120 candidates scored multi-dimensionally
- Beat alignment: Sample-perfect using Essentia.js
- Effects: 9 "vibes" (crossfade styles)
- Limitation: Browser-only, 2 tracks max, no stem separation

v2.0 should produce transitions that sound at least as good as v1.0's best
crossfade, while adding stem-aware mixing that v1.0 can't do.

---

## Git Workflow

- Feature branches only. Never commit to main.
- Branch naming: `feat/`, `fix/`, `docs/`, `spike/`
- PRs for anything touching main.
- Conventional commit messages.

---

Last Updated: 2026-03-03
