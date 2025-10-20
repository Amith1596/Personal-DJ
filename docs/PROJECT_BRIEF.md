# Personal DJ — Product Brief

## One-liner
Zero-cost, browser-only PWA that lets anyone create pro-feeling DJ mixes from local songs using *vibes* as input.

## Core loop (MVP)
User uploads 2+ local MP3/M4A → App analyzes tempo/key/onsets/energy → User selects segments or just vibes → App finds optimal splice pair (tA*, tB*) with beat/key alignment → Applies transition recipe → Preview ±2 bars → Export WAV/MP3. No cloud.

## “Why it will feel magical”
- Transitions sound intentional (downbeats + key-aware).
- Simple natural-language “vibe” to pick recipes (dreamy, stutter, echo tag, backspin, etc.).
- Stems-aware FX (optional) for “clean” vocal/instrumental moves — fully on-device.
- Learns user taste over time (keeps/edits influence future suggestions).

## Non-goals (for MVP)
- No streaming services integration.
- No server-side compute or paid APIs.
- No copyright-encumbered datasets; all analysis happens locally on user files.

## Stretch (later)
- Section detection (intro/verse/chorus/drop/outro) for block-level editing.
- Generative bridges/risers (tiny synths first; ML later).
- Lyrics/trend-aware transitions (align to detected lyric cues; later: user-provided trend metadata).
