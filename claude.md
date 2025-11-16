# Personal DJ - AI Assistant Context & Build Instructions

## Project Overview

**Name:** Personal DJ
**Type:** Portfolio Project - Audio Engineering + AI/ML + Full-Stack
**Status:** v1.0 Complete, v2.0 In Development
**Owner:** Amith (Ex-Microsoft SWE, Wharton MBA)
**Last Updated:** 2024-11-15

## What This Project Is

A dual-mode music mashup creator:
- **v1.0 (DONE):** Client-side 2-track DJ mixer with intelligent transitions
- **v2.0 (BUILDING):** Backend-powered 3-4 track intelligent mashup generator

**Vision:** Upload 3-4 songs → AI analyzes musical compatibility → Creates seamless mashup that sounds professionally mixed

---

## IMPORTANT: How to Use This File

**At the start of each session, the user will say:**
- "Start building Phase 2, Session 1"
- "Continue Phase 2"
- "Test Phase 2 quality"

**Your job:** Read the corresponding section below and execute exactly what it says. No guessing, no deviation.

---

## Current Development Status

**COMPLETED:**
- ✅ Phase 1: v1.0 - 2-track client-side mixer (fully working)

**CURRENT PHASE:**
- 🚧 Phase 2: Backend Foundation - **NOT STARTED**
- Next Session: Phase 2, Session 1

**UPCOMING:**
- 📋 Phase 3: Enhanced Multi-Track (3-4 songs)
- 📋 Phase 4: AI Enhancement (Demucs stem separation)
- 📋 Phase 5: Polish & UX

---

# PHASE 2: Backend Foundation

**Goal:** Create Python FastAPI backend that can process 2-3 tracks with quality ≥ v1.0

**Success Criteria:**
- FastAPI running locally
- Can upload 2 audio files
- Backend processes them into a mashup
- Download result
- Quality test: Sounds as good or better than v1.0 client-side mixer

**Estimated Time:** 4 sessions (~2-3 hours total)

---

## Phase 2, Session 1: Backend Setup & Deployment

### What We're Building
Set up Python backend with FastAPI, basic file handling, and health check endpoints

### Step-by-Step Instructions

#### 1. Create Backend Directory Structure

```bash
cd /Users/amithp/Documents/ai-pm-portfolio/personal-dj
mkdir -p backend/processors backend/utils backend/temp/uploads backend/temp/outputs
touch backend/app.py
touch backend/requirements.txt
touch backend/processors/__init__.py
touch backend/processors/mashup.py
touch backend/processors/ai_mashup.py
touch backend/utils/__init__.py
touch backend/utils/validators.py
touch backend/.gitignore
```

#### 2. Write requirements.txt

File: `backend/requirements.txt`
```txt
# Web Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6

# CORS
python-cors==1.0.0

# Audio Processing - Core
librosa==0.10.1
soundfile==0.12.1
pydub==0.25.1
numpy==1.24.3
scipy==1.11.3

# Advanced Beat Tracking
madmom==0.16.1

# Time Stretching
pyrubberband==0.3.0

# Utilities
python-dotenv==1.0.0
aiofiles==23.2.1
```

#### 3. Write .gitignore

File: `backend/.gitignore`
```
# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/
ENV/

# Temp files
temp/
*.wav
*.mp3
*.flac

# IDE
.vscode/
.idea/
```

#### 4. Create FastAPI App

File: `backend/app.py`

Copy the full implementation from `hybrid-architecture-guide.md` lines 119-377 (the FastAPI app code)

#### 5. Create Validators

File: `backend/utils/validators.py`

Copy from `hybrid-architecture-guide.md` lines 605-620

#### 6. Set Up Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Mac/Linux
# venv\Scripts\activate  # On Windows

pip install --upgrade pip
pip install -r requirements.txt
```

#### 7. Install System Dependencies

**macOS:**
```bash
brew install rubberband ffmpeg libsndfile
```

**Ubuntu/Debian:**
```bash
sudo apt-get install rubberband-cli ffmpeg libsndfile1
```

#### 8. Test Backend Locally

```bash
cd backend
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

Open browser: http://localhost:8000
Should see: `{"status": "healthy", "service": "Music Mashup API", "version": "1.0.0"}`

#### 9. Create Test Script

File: `backend/test_health.sh`
```bash
#!/bin/bash
echo "Testing health endpoint..."
curl http://localhost:8000/health
```

Make executable:
```bash
chmod +x backend/test_health.sh
```

### Quality Checks
- [ ] Backend starts without errors
- [ ] `/health` endpoint returns 200 OK
- [ ] All dependencies installed successfully
- [ ] No import errors

### Expected Output
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### If Errors Occur
**Import Error for rubberband:**
- Check `brew list rubberband` or `which rubberband`
- Try `pip install pyrubberband --no-binary pyrubberband`

**Port 8000 already in use:**
- Use `--port 8001` instead

### What to Report Back
"Session 1 complete. Backend running on port 8000. Health check passing. Ready for Session 2."

---

## Phase 2, Session 2: Core Mixing Algorithm

### What We're Building
Implement the algorithmic mixing logic using librosa and numpy

### Step-by-Step Instructions

#### 1. Create Core Mashup Processor

File: `backend/processors/mashup.py`

Copy the full implementation from `hybrid-architecture-guide.md` lines 380-532

#### 2. Create AI Mashup Processor (Stub for Now)

File: `backend/processors/ai_mashup.py`

Copy from `hybrid-architecture-guide.md` lines 535-602

#### 3. Test Analysis Function

Create: `backend/test_analysis.py`
```python
from processors.mashup import analyze_song
import sys

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_analysis.py <path_to_audio_file>")
        sys.exit(1)

    filepath = sys.argv[1]
    result = analyze_song(filepath)

    print(f"\n=== Analysis Results ===")
    print(f"BPM: {result['bpm']:.1f}")
    print(f"Duration: {result['duration']:.1f}s")
    print(f"Key: {result['estimated_key']}")
    print(f"Sample Rate: {result['sample_rate']} Hz")
    print(f"Beat Count: {result['beat_count']}")
```

#### 4. Test with Sample Audio

**Find 2 test songs** (MP3 or WAV):
- Song 1: 120-130 BPM (e.g., pop/house)
- Song 2: Similar BPM (within 10 BPM)
- Both ~3 minutes long

Put in `backend/test_files/` (create directory)

```bash
mkdir backend/test_files
# Copy your test files here
```

#### 5. Run Analysis Test

```bash
cd backend
source venv/bin/activate
python test_analysis.py test_files/song1.mp3
python test_analysis.py test_files/song2.mp3
```

**Expected Output:**
```
=== Analysis Results ===
BPM: 125.0
Duration: 180.5s
Key: C
Sample Rate: 44100 Hz
Beat Count: 375
```

#### 6. Test Crossfade Function

Create: `backend/test_crossfade.py`
```python
from processors.mashup import MashupProcessor
import sys

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_crossfade.py <song1> <song2>")
        sys.exit(1)

    song1 = sys.argv[1]
    song2 = sys.argv[2]
    output = "test_files/test_mashup.wav"

    print("Creating mashup...")
    processor = MashupProcessor()
    processor.create_mashup(
        file_paths=[song1, song2],
        output_path=output,
        crossfade_duration=8.0,
        fade_type="exponential"
    )

    print(f"✅ Mashup created: {output}")
    print("Listen to it and rate quality 1-10")
```

#### 7. Create First Mashup

```bash
python test_crossfade.py test_files/song1.mp3 test_files/song2.mp3
```

#### 8. Listen & Evaluate

Open `test_files/test_mashup.wav` in your audio player

**Quality Checklist:**
- [ ] No clicks or pops at transition
- [ ] Transition sounds musical (not abrupt)
- [ ] BPMs seem matched
- [ ] Volume normalized (not clipping)
- [ ] Crossfade smooth

Rate: 1-10 _____

### Quality Checks
- [ ] Analysis returns reasonable BPM (60-180 range)
- [ ] Mashup file created successfully
- [ ] Audio plays without artifacts
- [ ] Transition point sounds natural

### If Quality is Low (<7/10)
**Problem: Jarring transition**
- Increase crossfade_duration to 12.0
- Try different fade_type ('linear', 'logarithmic')

**Problem: BPM detection wrong**
- Check if song has clear beat
- Try with different test songs

**Problem: Clicks/pops**
- This is expected (we'll fix in Session 3 with beat alignment)

### What to Report Back
"Session 2 complete. Basic mixing working. Quality rating: X/10. Ready for Session 3 or need tuning."

---

## Phase 2, Session 3: Quality Improvements & Beat Alignment

### What We're Building
Add beat-aligned transitions and gradual tempo matching

### Step-by-Step Instructions

#### 1. Implement Beat-Aligned Crossfade

Update `backend/processors/mashup.py`:

Add this method to `MashupProcessor` class:
```python
def _find_beat_aligned_splice(self, track1, track2, crossfade_duration):
    """Find optimal splice point aligned to beats"""
    import librosa

    # Get beats for both tracks
    _, beats1 = librosa.beat.beat_track(y=track1, sr=self.sample_rate)
    _, beats2 = librosa.beat.beat_track(y=track2, sr=self.sample_rate)

    # Convert to time
    beat_times1 = librosa.frames_to_time(beats1, sr=self.sample_rate)
    beat_times2 = librosa.frames_to_time(beats2, sr=self.sample_rate)

    # Find downbeats (every 4th beat, assuming 4/4 time)
    downbeats1 = beat_times1[::4]
    downbeats2 = beat_times2[::4]

    # Get splice points: last downbeat of track1, first downbeat of track2
    if len(downbeats1) > 2:
        splice_time_1 = downbeats1[-2]  # Second-to-last downbeat
    else:
        splice_time_1 = len(track1) / self.sample_rate - crossfade_duration

    if len(downbeats2) > 1:
        splice_time_2 = downbeats2[0]  # First downbeat
    else:
        splice_time_2 = 0

    splice_sample_1 = int(splice_time_1 * self.sample_rate)
    splice_sample_2 = int(splice_time_2 * self.sample_rate)

    return splice_sample_1, splice_sample_2
```

Update `_merge_two_tracks` to use this:
```python
def _merge_two_tracks(self, track1, track2, crossfade_duration, fade_type):
    """Merge two audio tracks with beat-aligned crossfade"""

    # Find beat-aligned splice points
    splice1, splice2 = self._find_beat_aligned_splice(track1, track2, crossfade_duration)

    crossfade_samples = int(crossfade_duration * self.sample_rate)

    # Create fade curves
    fade_out, fade_in = self._create_fade_curves(crossfade_samples, fade_type)

    # Extract crossfade regions from splice points
    track1_end = track1[splice1:splice1 + crossfade_samples]
    track2_start = track2[splice2:splice2 + crossfade_samples]

    # Handle length mismatches
    min_len = min(len(track1_end), len(track2_start), len(fade_out))

    track1_faded = track1_end[:min_len] * fade_out[:min_len]
    track2_faded = track2_start[:min_len] * fade_in[:min_len]

    # Mix crossfade region
    crossfaded = track1_faded + track2_faded

    # Combine all parts
    result = np.concatenate([
        track1[:splice1],               # Full beginning of track1
        crossfaded,                      # Crossfade region
        track2[splice2 + min_len:]      # Rest of track2
    ])

    return result
```

#### 2. Test Beat-Aligned Version

```bash
cd backend
source venv/bin/activate
python test_crossfade.py test_files/song1.mp3 test_files/song2.mp3
```

New output: `test_files/test_mashup.wav`

#### 3. A/B Comparison

**Compare:**
1. Old version (if you saved it)
2. New beat-aligned version

**Should notice:**
- Transition happens on a downbeat (feels natural)
- Beats don't clash during crossfade
- More "DJ-like" feel

#### 4. Quality Test with Multiple Songs

Test with 3 songs:
```bash
python test_crossfade.py test_files/song1.mp3 test_files/song2.mp3 test_files/song3.mp3
```

Update `test_crossfade.py` to accept 3+ files:
```python
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_crossfade.py <song1> <song2> [song3] [song4]")
        sys.exit(1)

    songs = sys.argv[1:]
    output = "test_files/test_mashup_multi.wav"

    print(f"Creating mashup from {len(songs)} songs...")
    processor = MashupProcessor()
    processor.create_mashup(
        file_paths=songs,
        output_path=output,
        crossfade_duration=8.0,
        fade_type="exponential"
    )

    print(f"✅ Mashup created: {output}")
    print(f"Duration: {librosa.get_duration(filename=output):.1f}s")
```

#### 5. Evaluate Quality

Listen to 3-song mashup. Rate each transition:
- Transition 1 (Song1→Song2): __/10
- Transition 2 (Song2→Song3): __/10
- Overall flow: __/10

### Quality Checks
- [ ] Transitions happen on beat/downbeat
- [ ] No rhythmic clashing
- [ ] 3-song mashup flows naturally
- [ ] Quality ≥ 7/10 for each transition

### Success Criteria
**Minimum:** 7/10 average quality across transitions
**Target:** 8/10 average

### If Quality Still Low
**Try these adjustments:**
1. Increase crossfade to 12 seconds
2. Use 'logarithmic' fade type
3. Check if test songs have clear beats
4. Try songs with similar BPM (within 5 BPM)

### What to Report Back
"Session 3 complete. Beat alignment working. Average quality: X/10. Ready for Session 4 (frontend integration) or need more tuning."

---

## Phase 2, Session 4: Frontend Integration & Testing

### What We're Building
Connect existing Next.js frontend to new backend, enable upload/download flow

### Step-by-Step Instructions

#### 1. Create API Client

File: `src/lib/api/mashup.ts`

Copy implementation from `hybrid-architecture-guide.md` lines 647-739

#### 2. Create Environment Variable

File: `.env.local` (in root `personal-dj/` directory)
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Add to `.gitignore`:
```
.env.local
```

#### 3. Create Multi-Track Upload Page

File: `src/app/mashup/page.tsx`

Copy implementation from `hybrid-architecture-guide.md` lines 742-905

#### 4. Create File Uploader Component

File: `src/app/mashup/components/FileUploader.tsx`

Copy implementation from `hybrid-architecture-guide.md` lines 910-1036

Install dependency:
```bash
pnpm add react-dropzone
```

#### 5. Create Mashup Controls Component

File: `src/app/mashup/components/MashupControls.tsx`

Copy from `hybrid-architecture-guide.md` lines 1040-1168

#### 6. Create Processing Status Component

File: `src/app/mashup/components/ProcessingStatus.tsx`

Copy from `hybrid-architecture-guide.md` lines 1173-1242

#### 7. Update CORS in Backend

Update `backend/app.py` origins list:
```python
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://your-app.vercel.app",  # Add your Vercel domain if deployed
    "https://*.vercel.app",
]
```

#### 8. Start Both Servers

Terminal 1 (Backend):
```bash
cd backend
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

Terminal 2 (Frontend):
```bash
cd /Users/amithp/Documents/ai-pm-portfolio/personal-dj
pnpm dev
```

#### 9. Test End-to-End Flow

1. Open http://localhost:3000/mashup
2. Upload 2-3 test audio files
3. Should see BPM analysis for each
4. Adjust settings (crossfade, fade type)
5. Click "Create Mashup"
6. Wait for processing (~30-60 seconds)
7. Download result

#### 10. Quality Validation

**Technical Checks:**
- [ ] Files upload successfully
- [ ] Analysis shows correct BPM
- [ ] Processing completes without errors
- [ ] Download works
- [ ] Audio file plays

**Audio Quality:**
- [ ] Mashup sounds good (≥7/10)
- [ ] Transitions smooth
- [ ] No artifacts or errors

### Quality Checks
- [ ] Full upload→process→download flow works
- [ ] No CORS errors
- [ ] Processing time reasonable (<2 min for 3 songs)
- [ ] Output quality matches CLI test (Session 3)

### Success Criteria
- Working end-to-end in browser
- Quality ≥ v1.0 (2-track client-side mixer)
- Ready for user testing

### Common Issues

**CORS Error:**
Check backend terminal for origin, update `origins` list

**Upload Fails:**
Check file size (<50MB), format (MP3/WAV/FLAC)

**Processing Hangs:**
Check backend terminal for errors, verify files are valid audio

**Download 404:**
Check `backend/temp/outputs/` directory exists and has files

### What to Report Back
"Session 4 complete. Frontend→Backend integration working. End-to-end test successful. Quality: X/10. Phase 2 COMPLETE. Ready for Phase 3."

---

# PHASE 3: Enhanced Multi-Track (Planned)

**Goal:** Intelligent 3-4 track sequencing with optimal ordering

**Sessions:**
1. Track ordering algorithm (maximize harmonic flow)
2. Advanced tempo matching with pyrubberband
3. 3-track testing
4. 4-track support

**Not started yet - will detail when Phase 2 complete**

---

# PHASE 4: AI Enhancement (Planned)

**Goal:** Add Demucs stem separation for pro-quality

**Sessions:**
1. Demucs setup & testing
2. Smart stem mixing strategies
3. Quality comparison
4. Performance optimization

**Not started yet - will detail when Phase 3 complete**

---

# QUALITY TESTING PROTOCOLS

## Every Session End: Mini Quality Check
1. Does it run without errors?
2. Does it produce output?
3. Is output reasonable?

## Phase End: Comprehensive Quality Test

### Phase 2 Quality Test (Backend Foundation)

**Test Suite:**
1. **BPM Accuracy Test**
   - Test with 5 songs of known BPM
   - Measure: Detected BPM vs. actual
   - Success: ±2 BPM accuracy

2. **Transition Quality Test**
   - Create 5 mashups with different genre pairs
   - Listen blind (don't know which is which)
   - Rate each transition 1-10
   - Success: Average ≥7/10

3. **A/B vs v1.0 Test**
   - Same 2 songs through v1.0 (client) and v2.0 (backend)
   - Compare outputs
   - Success: v2.0 ≥ v1.0 quality

4. **Multi-Track Test**
   - 3-song mashup
   - Check: Flows naturally, energy arc makes sense
   - Success: Sounds intentional, not random

### Comparison Criteria

**v1.0 Baseline (Client-Side):**
- Splice point detection: Very good (64-120 candidates)
- Beat alignment: Excellent (sample-perfect)
- Effects: 9 vibes, very creative
- Limitation: Only 2 tracks

**v2.0 Target (Backend):**
- Should match v1.0 for 2 tracks
- Should extend to 3-4 tracks smoothly
- BPM detection as good as Essentia.js
- Transitions as smooth as v1.0

**Success = v2.0 ≥ v1.0 for 2-track, plus working 3-4 track capability**

---

# COMMUNICATION PROTOCOLS

## How User Will Ask to Continue

**User says:** "Start building Phase 2, Session 1"
**You do:** Execute Phase 2, Session 1 exactly as written above

**User says:** "Continue Phase 2"
**You do:** Check which session was last completed, start next session

**User says:** "Test Phase 2 quality"
**You do:** Run Phase 2 Quality Test protocol

**User says:** "Phase 2 complete?"
**You do:** Review all 4 sessions, confirm checklist, run quality test

## What to Report

**After Each Session:**
```
✅ Session X complete
📊 Status: [What was built]
🎵 Quality: [Rating if applicable]
⏭️  Next: [What's next]
❓ Issues: [Any problems encountered]
```

**After Each Phase:**
```
✅ Phase X complete
📦 Deliverables: [List what was built]
🎯 Success Criteria: [Met? Y/N]
🎵 Quality Test Results: [Scores]
📈 vs v1.0: [Comparison]
⏭️  Ready for Phase X+1: [Y/N]
```

---

# REFERENCE DOCUMENTATION

## Key Files to Reference

**Algorithm Specs:**
- `music-mashup-app-guide.md` - Full algorithmic approach
- `hybrid-architecture-guide.md` - Backend implementation guide
- `docs/ALGORITHM_CORE.md` - v1.0 scoring algorithm

**Existing Code:**
- `src/lib/analysis/score.ts` - v1.0 candidate scoring (reference for quality)
- `src/lib/audio/xfadePreview.ts` - v1.0 3-band EQ rendering
- `src/components/TwoTrackUploader.tsx` - v1.0 UI (for comparison)

## Audio Engineering Best Practices

1. **Always beat-align transitions** (prevents rhythmic clashing)
2. **Prefer downbeat-to-downbeat** (phrase-level alignment)
3. **Normalize output** (prevent clipping)
4. **Use gradual tempo changes** (not jarring)
5. **Test with real music** (not just test tones)

## Music Theory Reference

- **BPM Range:** 60-180 (most music)
- **Harmonic Mixing:** Prefer transitions within ±2 semitones
- **Energy Arc:** Build → Peak → Release → Build
- **Downbeat:** First beat of a measure (usually every 4 beats in 4/4 time)

---

# TROUBLESHOOTING

## Backend Won't Start

**Error: Module not found**
→ Check virtual environment activated: `source venv/bin/activate`
→ Reinstall: `pip install -r requirements.txt`

**Error: Port 8000 in use**
→ Use different port: `uvicorn app:app --reload --port 8001`
→ Update `.env.local`: `NEXT_PUBLIC_BACKEND_URL=http://localhost:8001`

**Error: Cannot import pyrubberband**
→ Install system rubberband: `brew install rubberband` (Mac) or `apt-get install rubberband-cli` (Linux)

## Audio Quality Issues

**Clicks/pops at transition**
→ Not beat-aligned yet (expected in Session 1-2)
→ Implement beat alignment (Session 3)

**BPM detection wrong**
→ Check if song has clear beat
→ Try different test song
→ Verify file is valid audio

**Mashup too quiet/loud**
→ Check normalization function
→ Adjust target: `audio * (0.95 / max_val)`

## Integration Issues

**CORS error**
→ Check backend `origins` list includes `http://localhost:3000`
→ Restart backend after changing CORS settings

**Upload fails**
→ Check file size (<50MB)
→ Check format (MP3, WAV, FLAC only)
→ Check backend logs for errors

**Processing hangs**
→ Check backend terminal for errors
→ Verify librosa can load file: `librosa.load('test.mp3')`

---

# GIT WORKFLOW

## When to Commit

**After Each Session:** Commit working code
**After Each Phase:** Create git tag

```bash
# After Session
git add backend/
git commit -m "feat(backend): implement Phase 2 Session X - [what was built]"

# After Phase
git add .
git commit -m "feat: complete Phase 2 - backend foundation"
git tag -a v2.0-phase2 -m "Backend foundation complete"
```

## Commit Message Format

```
feat(scope): description

- What was added
- What was changed
- What was fixed

🎵 Quality: X/10
📦 Deliverable: [What can now be done]
```

**Do not commit without user asking**

---

# PROJECT CONTEXT

## Why This Architecture?

**v1.0 (Client-Only):**
- Fast, free, privacy-preserving
- Limited by browser capabilities
- Can't use heavy Python libraries
- Max 2 tracks realistically

**v2.0 (Hybrid):**
- Keeps v1.0 as "quick mode"
- Adds backend "pro mode"
- Unlocks Python audio ecosystem (librosa, Demucs)
- Can do 3-4 tracks intelligently

**Best of both worlds:**
- User wants quick 2-track? → v1.0 client-side (instant)
- User wants pro 4-track? → v2.0 backend (high quality)

## Portfolio Value

This project demonstrates:
1. **Audio Engineering:** DSP, music theory, beat detection
2. **Algorithm Design:** Multi-dimensional optimization
3. **Full-Stack:** Next.js + Python + FastAPI
4. **Product Thinking:** Dual-mode UX, quality vs speed trade-offs
5. **ML Integration:** Demucs AI (Phase 4)

Target audience: PM roles at Spotify, Apple Music, SoundCloud, etc.

---

## Last Updated
2024-11-15

## Current Phase
Phase 2: Backend Foundation - Session 1 pending

## Next Action
Wait for user to say: "Start building Phase 2, Session 1"
