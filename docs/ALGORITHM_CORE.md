# Smart Splice Core — Target Algorithm

We select splice points inside user ranges [a1,a2] in A and [b1,b2] in B.

## Features
- Tempo: BPM_A, BPM_B; Δtempo%.
- Beat grid: beats_A[], beats_B[]; downbeat flags if available.
- Key: (tonic, scale, confidence); semitone distance Δkey (circle of fifths aware).
- Chroma similarity: cosine over a 1–2 beat window around candidate splice.
- Energy: RMS slope, local minima "valleys".
- Onsets: spectral flux peaks; “strong” onsets marked.
- (Optional) Stems energy: vocal/instrumental ratios.

## Candidate generation
- Start with downbeats within [a1,a2] × [b1,b2].
- If sparse, include strong onsets near downbeats (±⅛–¼ beat).
- Ensure candidates are within safe window for crossfade (>= xfMs).

## Scoring function (maximize)
Score(tA,tB) =  
+ w1 * DownbeatAlign(tA,tB)              // 1 on downbeat↔downbeat, else 0/0.5 near  
+ w2 * ChromaCosine(A[tA-1b:tA], B[tB:tB+1b])  
+ w3 * EnergyMatch(RMS slopes around tA,tB)  
− w4 * TempoDiffPct(BPM_A,BPM_B)  
− w5 * KeyDistanceSemitones(Δkey)        // 0 if same/relative, small if perfect fifth  
− w6 * ClickRisk(ZC distance, onset clash)

Use weights (initial guess): w1=1.2, w2=1.0, w3=0.4, w4=0.6, w5=0.6, w6=0.8. Tune later via user feedback.

## Guards
- Equal-power crossfade 30–120 ms.
- Zero-crossing nudge for both sides (±2 ms).
- Clamp output peak < −0.3 dBFS.

## Output
- Best (tA*, tB*) + diagnostics (subscores, chosen recipe suggestions).
