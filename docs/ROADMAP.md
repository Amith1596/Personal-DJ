# Roadmap (Agent-friendly)

1) Analysis foundation (Essentia.js WASM): auto BPM/key/onsets/energy; beat grids.
2) Candidate & scoring: implement ALGORITHM_CORE with pluggable weights; QA /qa.
3) Recipes: dreamy sweep, echo tag, chaotic stutter, backspin; stems-aware toggle.
4) Natural-language mapping: "vibe → recipe params" (simple rules + few-shot).
5) Sectioning: novelty curves + HMM for intro/verse/chorus/outro.
6) Learning loop: log user keeps/edits; tiny on-device policy improving weights.
7) (Later) Lyrics/trends: local ASR (whisper.cpp WebGPU) to detect phrase onsets; trend metadata via user-provided tags.
