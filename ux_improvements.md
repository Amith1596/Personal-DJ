# Personal DJ App – UX & Behavior Improvements

This document describes UX and behavior changes to make the Personal DJ PWA more intuitive.  
Goal: guide users smoothly from “upload songs” → “tweak transition” → “preview” → “download”.

---

## 1. Core User Flow & Layout

### 1.1. Overall Flow

The app should follow this linear flow:

1. **Upload tracks**
2. **Choose transition settings**
3. **Preview**
4. **Download final mix**

The UI should visually reinforce this order and clearly show which step the user is on.

### 1.2. Step-Based Layout

Use a top-to-bottom, step-based layout (can be a stepper or just numbered sections):

**Step 1 – Tracks**

- Header: `1. Add your songs`
- Two upload cards:
  - `Track A · Fading out`
  - `Track B · Fading in`
- Until **both** files are uploaded:
  - Step 2 and Step 3 controls are disabled (and visibly de-emphasized).
  - Clicking “Preview” or “Download” should show an inline message (see 3.3).

**Step 2 – Transition settings**

- Header: `2. Choose your transition`
- Controls:
  - Transition vibe chips (e.g., Dreamy Sweep, Chaotic Stutter, etc.).
  - Blend curve options (Equal Power, S-Curve, etc.).
  - Crossfade length slider.
- Provide sensible defaults:
  - Default vibe selected: `Dreamy Sweep`.
  - Default blend curve: `Equal Power (Recommended)`.
  - Default crossfade length: e.g. `8s`.

**Step 3 – Preview & Export**

- Header: `3. Preview & download`
- Contains:
  - “Generate preview” / “Preview transition” button.
  - Audio player for the 45s preview.
  - “Mix & Download” button (locked until preview is generated at least once).

---

## 2. Audio Player State & Controls

Fix the play/pause/replay issues by using a simple state machine. The preview audio should have the following states:

- `idle` – no preview generated yet.
- `loading` – preview is being rendered.
- `ready` – preview is rendered, not playing.
- `playing` – audio is currently playing.
- `paused` – audio playback paused.
- `ended` – audio playback reached the end.

### 2.1. State Transitions (Conceptual)

- Clicking **Preview Transition**:
  - If both tracks are present → `idle` → `loading`.
  - On successful generation → `ready`.
  - On error → show error message; state returns to `idle`.

- Audio events:
  - `audio.play` → `playing`
  - `audio.pause` → `paused`
  - `audio.ended` → `ended` (important: explicitly set this to avoid “stuck on pause”).

### 2.2. Button Behavior by State

**Main audio control (inside the player or near it):**

- `ready` / `paused` / `ended` → **Play** label + ▶ icon.
- `playing` → **Pause** label + ⏸ icon.

**Preview action button (outside the player):**

- `idle` – Enabled label: `Preview transition`.
- `loading` – Disabled label: `Rendering preview…` + spinner.
- `ready` / `playing` / `paused` / `ended` – Enabled label: `Re-generate preview` (if settings changed).

### 2.3. Replay Behavior

When playback finishes (`ended`):

- The main control should visually revert to **Play** ▶.
- Optionally show a secondary action or hint:
  - Text: `Playback finished. Press Play to replay this transition.`

This avoids the current bug where the play button becomes pause and never visually recovers.

---

## 3. Disabled States, Errors, and Feedback

### 3.1. Disabled Controls

When something is disabled, make it *explicitly* understandable, not just low contrast.

**Examples:**

- **Preview button disabled because tracks missing**  
  - Show inline helper text under the button:
    - `Add both Track A and Track B to preview a transition.`

- **Mix & Download disabled because no preview yet**  
  - Button disabled state with caption underneath:
    - `Render a preview first to unlock download.`

### 3.2. Preview Section Before First Render

Before any preview exists:

- The audio player should either:
  - Be hidden, or
  - Be a skeleton/placeholder player with text:
    - `Render a 45s snippet to preview your transition.`

### 3.3. Error States

If the user tries to preview without valid inputs:

- Show an inline error near the relevant control, not just a console error.

Behaviors:

- Clicking **Preview Transition** with:
  - Missing Track A or B → inline message near track upload:
    - `Both tracks are required to generate a preview.`

If preview rendering fails:

- Show a clear error in the preview section:
  - `We couldn’t render this preview. Please try again.`
- Keep the user in `idle` state and keep the button enabled to retry.

---

## 4. Descriptions for Vibes and Blend Curves

Provide short, plain-language descriptions focused on **how it sounds**. These can appear as:

- Tooltip/popover on hover, **and/or**
- A single description line under the currently selected option.

### 4.1. Transition Vibe Descriptions

Use text like the following:

- **Dreamy Sweep** – “Soft filter sweep + reverb for a smooth, cinematic fade.”
- **Chaotic Stutter** – “Chopped repeats and glitches for a high-energy switch.”
- **Echo Tag** – “Outgoing track echoes into the next one.”
- **Tape Stop** – “Slows down like a record powering off, then drops into Track B.”
- **Beat Roll** – “Loops a small drum slice before dropping into the new track.”
- **Riser Noise** – “Noise riser that builds tension into the drop.”
- **Sidechain Pump** – “Pumping volume effect synced to the beat.”
- **Stereo Widener** – “Gradually widens the stereo field during the transition.”
- **Beat Drop** – “Short cut into a big impact moment in Track B.”

**UI suggestion:**  
Below the selected chip, show:  
`"Dreamy Sweep" · Soft filter sweep + reverb for a smooth, cinematic fade.`

### 4.2. Blend Curve Descriptions

These are more technical, so keep copy simple and pick a clear default.

Suggested descriptions:

- **Equal Power (Recommended)** – “Smooth crossfade that avoids volume dips.”
- **S-Curve** – “Slower start and end; more dramatic middle.”
- **Log** – “Outgoing fades gently, incoming rises faster.”
- **Ducked** – “Track B stays quiet until the drop.”
- **Cut** – “Instant switch with no crossfade.”

**UI hint text under the blend curve options:**

> `Blend curve controls how volume moves from Track A → Track B during the crossfade.`

---

## 5. Copy & Hierarchy Tweaks

Tighten the wording so new users immediately understand what the app does and what each track does.

### 5.1. Header & Tagline

- Title: `Personal DJ App 🎧🎶`
- Subtitle / tagline:
  - `Drop in two songs and we’ll build a DJ-style transition between them.`

This is clearer than the current wording about “Epic 45s transition”.

### 5.2. Track Labels

Change the track copy to make roles obvious:

- **Track A · Fading out**
  - Small helper text: `This is the song you’re transitioning from.`
- **Track B · Fading in**
  - Small helper text: `This is the song you’re transitioning into.`

### 5.3. Transition Section Title

- Section header: `2. Choose your transition`
- Small helper text:
  - `Pick a vibe and how the volumes crossfade between songs.`

### 5.4. Preview Section Copy

- Section header: `3. Preview transition (45s)`
- Subtext when preview exists:
  - `This is a 45s middle section. Your final mix will use the full songs.`

When no preview exists yet:

- Subtext:
  - `Click “Preview transition” to render a 45s snippet.`

---

## Summary of Implementation Priorities

1. **Restructure the UI into three clear steps**: Tracks → Transition → Preview & Download, with appropriate gating.
2. **Implement the audio preview state machine** so play/pause/replay behave predictably and the UI resets when playback ends.
3. **Improve disabled states and errors** with explicit explanations instead of only greying things out.
4. **Add concise descriptions** for transition vibes and blend curves, surfaced either as tooltips or as a description line for the selected option.
5. **Tighten copy and headings** to clarify what each track does and what the preview represents.

These changes should be treated as behavior + UX requirements for the next iteration of the Personal DJ PWA.
