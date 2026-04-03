# Personal DJ — Road to Publishable

Branch `feat/v2-backend-spike` has full v2 backend + manual mode + UI. PR into main pending.

## P0: Must-have before showing anyone

- [ ] **BPM matching / time-stretching** — No tempo alignment currently. 120 BPM song transitions into 85 BPM with no adjustment. Use pyrubberband time-stretch to align incoming track's BPM to outgoing. Apply in render_transition_audio() before crossfade.
- [ ] **Beat-aligned transitions** — Transitions should snap to nearest downbeat, not arbitrary timestamps. Analysis already provides beat/downbeat arrays. Quantize transition cue points to nearest downbeat in create_mix_plan_manual().
- [ ] **Render speed: stem caching** — Demucs takes ~10 min per song. Cache separated stems to disk keyed by file hash. Add `--fast` CLI flag that skips stems entirely (crossfade-only mode).
- [ ] **Frontend upload flow** — Upload endpoint exists but needs deployed backend. For local dev: verify full upload → analyze → render → download flow works end-to-end in the UI.

## P1: Quality improvements

- [ ] **Equal-power crossfade** — Replace linear crossfades with sqrt curves. Linear dips ~3dB in the middle. Equal-power maintains perceived loudness through the transition.
- [ ] **Transition FX (risers/impacts)** — `backend/assets/fx/` dirs exist but are empty. Source CC-licensed riser + impact samples. Layer at transition splice points for polished feel.
- [ ] **Analysis caching** — Re-analyzing the same song every time takes 20-30s. Cache TrackAnalysis to disk keyed by file content hash. Skip re-analysis on cache hit.
- [ ] **UI error handling** — Upload failures, backend not running, invalid formats all need user-facing error states. Currently fails silently.

## P2: Feature completeness

- [ ] **Wire auto mode UI to v2 backend** — TwoTrackUploader still uses v1 client-side analysis. Connect to v2 backend POST /api/v1/mix endpoint.
- [ ] **MP3 export** — Currently WAV only. Add pydub MP3 export option with bitrate selection.
- [ ] **Waveform zoom/scroll** — Long songs need horizontal scrolling to set precise markers in the waveform UI.
- [ ] **Deploy backend** — Dockerize and deploy (Railway or Fly.io). Dockerfile exists, not tested.

## P3: Polish for portfolio

- [ ] **Landing page** — Route `/` should explain the app and link to both auto and manual modes. Currently shows v1 uploader.
- [ ] **Mobile responsive** — Manual mixer assumes desktop width.
- [ ] **Shareable mix config** — Save/load mix configuration (songs, timestamps, strategies) as JSON for reproducibility.

---

*Moved from neural-vault/backlog.md on 2026-04-02*
