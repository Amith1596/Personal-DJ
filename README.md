# 🎧 Personal DJ

> Zero-cost PWA that creates professional DJ transitions and intelligent multi-track mashups using AI-powered music analysis

![Status](https://img.shields.io/badge/status-live%20%26%20working-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Python](https://img.shields.io/badge/Python-3.11-blue)

**🚀 Live App:** [https://personal-dj-nine.vercel.app](https://personal-dj-nine.vercel.app)

**🚀 This is an active development project**

## Vision & End Goal

**Current Version (v1.0):** 2-track DJ mixer with intelligent transitions - **WORKING**
**Next Version (v2.0):** 3-4 track intelligent mashup creator - **IN DEVELOPMENT**
**Ultimate Goal:** Software that takes **3-4 songs** and creates a seamless, musically coherent mash-up that actually sounds good

The current implementation is the foundation - proving that algorithmic music analysis can create professional-quality transitions. The next phase expands this to multi-track sequences, where the algorithm decides not just *how* to transition, but *when* and *which song* to bring in next based on:
- Musical compatibility (key, tempo, energy flow)
- Structural coherence (phrase boundaries, drops, builds)
- Narrative arc (building and releasing tension across the full mix)

**Think:** Spotify playlist → Intelligent DJ set

---

## What It Does

### v1.0: 2-Track DJ Mixer (Client-Side) ✅

Upload two audio files → Personal DJ analyzes them → Select a "vibe" → Get a seamless DJ-style mix with professional transitions

**Key Features:**
- 🎵 Intelligent splice point detection (analyzes BPM, key, energy, beats)
- 🎨 9 transition effects ("vibes"): Dreamy Sweep, Echo Tag, Beat Drop, Tape Stop, etc.
- 🎚️ Pro-quality audio: 3-band EQ blending, beatmatching, harmonic awareness
- 💾 100% client-side - no servers, no cost, works offline
- 📱 Progressive Web App - install on any device

### v2.0: Multi-Track Mashup Creator (Hybrid Architecture) 🚧

Upload 3-4 songs → Backend processes with advanced algorithms → Download seamless mashup

**Planned Features:**
- 🎼 Sequential chaining with context awareness
- 🤖 AI-powered stem separation (vocals, drums, bass, instruments)
- 🎹 Harmonic mixing (key-compatible transitions)
- 📊 Energy arc optimization across full mix
- ⚡ Dual mode: Quick (2-track client) vs. Pro (multi-track backend)

---

## Architecture Evolution

### v1.0: Client-Side Only (Current)

```
Browser
  └── Next.js + React
      ├── Essentia.js (WASM) → Music analysis
      ├── Web Audio API → Mixing & effects
      └── WaveSurfer.js → Visualization
```

**Pros:** Fast, free, offline-capable, privacy-preserving
**Cons:** Limited to 2 tracks, can't use heavy Python audio libraries

### v2.0: Hybrid Architecture (Building)

```
┌─────────────────────────────────────────┐
│  Frontend (Vercel - Existing)          │
│  Next.js + React + TypeScript           │
│  - Upload interface (2-4 files)        │
│  - Mode selection (Quick/Pro)          │
│  - Progress tracking                    │
│  - Download results                     │
└──────────────┬──────────────────────────┘
               │ HTTPS API
               ▼
┌─────────────────────────────────────────┐
│  Backend (Railway - New)               │
│  Python FastAPI                         │
│  - librosa: BPM, beat tracking         │
│  - madmom: Advanced rhythm analysis    │
│  - pyrubberband: Tempo matching        │
│  - Demucs (optional): AI stem sep      │
│  - Intelligent multi-track sequencing  │
└─────────────────────────────────────────┘
```

**Pros:** Can use powerful Python libraries, handle 3-4 tracks, AI processing
**Cons:** Requires backend (still free tier), slower than client-side

---

## Quick Start

### v1.0 (Current - 2-Track Client-Side)

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Open http://localhost:3000
```

Upload Track A and Track B, select a vibe, download your mix!

### v2.0 (In Development - Multi-Track Backend)

```bash
# Frontend (existing)
pnpm dev

# Backend (new - see claude.md for setup)
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

---

## How It Works

### v1.0: Smart Transition Algorithm

1. **Analyzes both tracks** using Essentia.js (BPM, key, beats, energy valleys, onsets)
2. **Generates 64-120 splice point candidates** based on musical structure
3. **Scores candidates** on 7 dimensions:
   - Downbeat alignment
   - Energy matching (valley → rise)
   - Tempo compatibility
   - Harmonic similarity
   - Section boundaries (intro/verse/chorus)
   - Onset clash avoidance
   - Edge penalties
4. **Applies selected vibe** (effects + blend curve)
5. **Renders mix** with beatmatching and 3-band EQ

### v2.0: Multi-Track Sequencing Algorithm (Planned)

1. **Analyze all tracks** (librosa: BPM, key, energy, beats, structure)
2. **Determine optimal order** (maximize harmonic flow, energy arc)
3. **For each transition:**
   - Find best splice points (beat-aligned, downbeats)
   - Calculate tempo shift strategy (gradual BPM changes)
   - Apply intelligent crossfade (beat correlation)
4. **Optional AI mode:**
   - Separate stems with Demucs
   - Mix vocals from one track, instruments from another
   - Progressive stem crossfades
5. **Master output** (normalization, compression, limiting)

---

## Tech Stack

### Frontend (v1.0 + v2.0)
- **Next.js 15** + React 19 + TypeScript
- **Essentia.js** (WASM) - Music analysis
- **Web Audio API** - Audio rendering
- **WaveSurfer.js** - Waveform visualization
- **Tonal.js** - Music theory
- **next-pwa** - PWA support

### Backend (v2.0 - New)
- **Python 3.11** + FastAPI
- **librosa** - Audio analysis, BPM detection
- **madmom** - Advanced beat tracking
- **pyrubberband** - Time stretching (preserves pitch)
- **soundfile** - Audio I/O
- **numpy** / **scipy** - Signal processing
- **Demucs** (optional) - AI stem separation

---

## Development Roadmap

### ✅ Phase 1: v1.0 - 2-Track Client Mixer (DONE)
- Client-side 2-track transitions
- 9 vibe effects
- QA testing panel
- PWA deployment

### 🚧 Phase 2: v2.0 Backend Foundation (In Progress)
**Goal:** Python backend that can process 2-3 tracks
**Deliverables:**
- FastAPI backend deployed to Railway
- Basic algorithmic mixing (librosa + pydub)
- Upload → Process → Download flow
- Quality matches/exceeds v1.0

**Sessions:**
1. Backend setup & deployment
2. Core mixing algorithm implementation
3. Quality testing & comparison with v1.0
4. Frontend integration

### 📋 Phase 3: v2.1 Enhanced Multi-Track (Planned)
**Goal:** Intelligent 3-4 track sequencing
**Deliverables:**
- Automatic track ordering
- Gradual tempo matching (pyrubberband)
- Beat-correlated crossfades
- Energy arc optimization

**Sessions:**
1. Track ordering algorithm
2. Advanced tempo matching
3. Multi-track testing (3 songs)
4. Full 4-track support

### 📋 Phase 4: v2.2 AI Enhancement (Planned)
**Goal:** Pro-quality with stem separation
**Deliverables:**
- Demucs integration
- Smart stem mixing strategies
- Harmonic key detection
- Progressive stem crossfades

**Sessions:**
1. Demucs setup & testing
2. Stem mixing strategies
3. Quality comparison: Algorithmic vs AI
4. Performance optimization

### 📋 Phase 5: v3.0 Polish & UX (Planned)
**Goal:** Dual-mode production app
**Deliverables:**
- Unified UI: Quick (client) vs Pro (backend)
- Real-time progress tracking
- Audio preview before download
- Preset configurations
- User testing & refinement

---

## Transition Vibes (v1.0)

- **Dreamy Sweep**: Low-pass filter sweep with smooth EQ blend
- **Chaotic Stutter**: 1/4-beat repetitions before transition
- **Echo Tag**: Tight feedback delay on outgoing track
- **Tape Stop**: Vinyl brake effect (exponential slowdown)
- **Beat Roll**: Progressive beat repetitions (1/2 → 1/4 → 1/8)
- **Riser Noise**: Filtered white noise build-up
- **Sidechain Pump**: Beat-synced ducking
- **Stereo Widener**: Stereo expansion on incoming track
- **Beat Drop**: Aligns Track B's drop to splice point

---

## Quality Testing Framework

### Success Criteria for Each Phase

**Phase 2 (Backend Foundation):**
- ✅ No audio artifacts (clicks, pops)
- ✅ BPM detection accurate (±2 BPM)
- ✅ Transitions sound musical (no jarring changes)
- ✅ Output quality ≥ v1.0 client-side

**Phase 3 (Multi-Track):**
- ✅ 3-song mashup flows naturally
- ✅ Energy arc makes sense (build → peak → release)
- ✅ Tempo transitions smooth (gradual shifts)
- ✅ All transitions beat-aligned

**Phase 4 (AI):**
- ✅ Stems separation clean (no artifacts)
- ✅ Vocals clear and intelligible
- ✅ Instruments balanced (no muddy mix)
- ✅ AI mode noticeably better than algorithmic

### Testing Methodology

1. **Reference Tracks:** Use same 3-4 test songs across phases
2. **Blind A/B Testing:** Compare outputs without knowing which is which
3. **Metrics:** BPM accuracy, transition smoothness, overall quality (1-10)
4. **Real-world Test:** Share with DJ friends for feedback

---

## Current Project Structure

```
personal-dj/
├── src/                          # v1.0 Frontend (existing)
│   ├── app/
│   │   ├── page.tsx              # Main 2-track UI
│   │   └── qa/page.tsx           # QA testing panel
│   ├── components/
│   │   └── TwoTrackUploader.tsx  # v1.0 UI
│   └── lib/
│       ├── analysis/             # Client-side analysis
│       ├── mix/                  # Transition effects
│       └── audio/                # Web Audio rendering
├── backend/                      # v2.0 Backend (new)
│   ├── app.py                    # FastAPI main
│   ├── processors/
│   │   ├── mashup.py             # Algorithmic mixing
│   │   └── ai_mashup.py          # AI-based mixing
│   ├── utils/                    # Helpers
│   └── requirements.txt
├── docs/
│   ├── music-mashup-app-guide.md      # Algorithm reference
│   └── hybrid-architecture-guide.md    # Backend setup guide
├── README.md                     # This file
└── claude.md                     # AI assistant instructions
```

---

## Advanced Features

### QA Testing Panel (`/qa`)
Developer interface with:
- Manual splice point override
- Candidate inspection (view all 64-120 options with scores)
- Beatmatching toggle
- Pro EQ blend control
- Detailed metrics (peak dB, alignment, durations)

### Audio Engineering (v1.0)
- Sample-accurate beat grid alignment
- Zero-crossing nudge for click prevention
- 3-band frequency splitting (low/mid/high)
- Dynamic time warping for harmonic matching
- Peak limiting to -0.3 dBFS

---

## Deployment

**v1.0 Frontend:**
- Platform: Vercel
- Live URL: [https://personal-dj-nine.vercel.app](https://personal-dj-nine.vercel.app)
- GitHub: [https://github.com/Amith1596/Personal-DJ](https://github.com/Amith1596/Personal-DJ)

**v2.0 Backend:** Railway.app free tier (500 hrs/month) - *Not deployed yet*

**Cost:** $0/month for MVP (both tiers free)

---

## Contributing

This is a personal portfolio project demonstrating:
- Audio engineering (DSP, music theory)
- Algorithm design (optimization, scoring)
- Full-stack development (Next.js + Python)
- Product thinking (UX, architecture decisions)

Feedback and suggestions welcome!

---

## License

MIT

---

## Next Session Instructions

**To continue development, see `claude.md` for:**
- Current phase status
- Step-by-step build instructions
- Quality testing procedures
- Session-by-session task breakdown

**Quick start next session:**
```
"Start building Phase 2, Session 1" → I'll know exactly what to do
```
