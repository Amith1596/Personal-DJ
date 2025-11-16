// app/qa/page.tsx
"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { renderTwoBarPreview, PreviewRecipe, type RenderPreviewMetrics } from "@/lib/audio/xfadePreview";
import { analyzeBuffer, getEssentiaLoadingStatus, EssentiaAnalysisResult, loadEssentia } from "@/lib/analysis/essentiaClient";
import { generateCandidates, getDefaultRanges } from "@/lib/analysis/candidates";
import { scoreCandidates, ScoredCandidate, DEFAULT_WEIGHTS } from "@/lib/analysis/score";
import { unlockAudio } from "@/lib/audio/unlock";

export default function QAPage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [bpm, setBpm] = useState(120);
  const [bars, setBars] = useState(2);
  const [xf, setXf] = useState(90);
  const [recipe, setRecipe] = useState<PreviewRecipe>("none");

  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [metrics, setMetrics] = useState<RenderPreviewMetrics | null>(null);

  const [analysisA, setAnalysisA] = useState<EssentiaAnalysisResult | null>(null);
  const [analysisB, setAnalysisB] = useState<EssentiaAnalysisResult | null>(null);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ScoredCandidate | null>(null);
  const [autoBpm, setAutoBpm] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [essentiaStatus, setEssentiaStatus] = useState(getEssentiaLoadingStatus());
  const [audioReady, setAudioReady] = useState(false);
  const [needsUserGesture, setNeedsUserGesture] = useState(false);
  const [beatmatch, setBeatmatch] = useState(true);
  const [proEq, setProEq] = useState(true);


  useEffect(() => { void loadEssentia(); }, []);
  useEffect(() => {
    const id = setInterval(() => setEssentiaStatus(getEssentiaLoadingStatus()), 1000);
    return () => clearInterval(id);
  }, []);

  const analyzeFile = useCallback(async (file: File, track: "A" | "B") => {
    setIsAnalyzing(true);
    setStatus(`Analyzing track ${track}...`);
    try {
      const Ctor: typeof AudioContext = window.AudioContext ?? (window as Window).webkitAudioContext!;
      const ctx = new Ctor();
      const audioBuffer = await file.arrayBuffer().then(ab => ctx.decodeAudioData(ab));
      await ctx.close();

      const analysis = await analyzeBuffer(audioBuffer);
      if (track === "A") { setAnalysisA(analysis); if (autoBpm) setBpm(analysis.bpm); }
      else { setAnalysisB(analysis); }
      setStatus(`Track ${track} analyzed: ${analysis.bpm.toFixed(2)} BPM`);
    } catch (err) {
      setStatus(`Analysis failed for track ${track}: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [autoBpm]);

  useEffect(() => { if (fileA) void analyzeFile(fileA, "A"); }, [fileA, analyzeFile]);
  useEffect(() => { if (fileB) void analyzeFile(fileB, "B"); }, [fileB, analyzeFile]);

  async function computeBestSplice() {
    if (!analysisA || !analysisB) { setStatus("Please analyze both tracks first"); return; }
    setStatus("Computing best splice...");
    try {
      const { rangeA, rangeB } = getDefaultRanges(analysisA, analysisB);
      const candidateList = generateCandidates({ analysisA, analysisB, rangeA, rangeB, crossfadeMs: xf, sampleRate: analysisA.sampleRate });
      const scored = scoreCandidates(candidateList, analysisA, analysisB, DEFAULT_WEIGHTS);
      setCandidates(scored);
      setSelectedCandidate(scored[0] || null);
      setStatus(`Found ${scored.length} candidates. Best: ${scored[0]?.score.toFixed(2) ?? "n/a"}`);
    } catch (e) {
      setStatus(`Splice computation failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

  // ...imports unchanged...

// inside QAPage component:

    async function onRender() {
  if (!fileA || !fileB) return setStatus("Pick both files");
  const candidate = selectedCandidate || candidates[0];
  if (!candidate) return setStatus("Please compute best splice first");

  setStatus("Rendering…");
  try {
    const recipeToUse = proEq ? (recipe === "dreamy" ? "dreamy" : "proEqBlend") : recipe;
    const ratio = (beatmatch && analysisA && analysisB) ? (analysisA.bpm > 0 ? analysisB.bpm / analysisA.bpm : 1) : undefined;

    const { wav, metrics } = await renderTwoBarPreview(
      fileA, fileB, bpm, bars, xf, recipeToUse as any,
      candidate.tA, candidate.tB,
      ratio
    );

    setMetrics(metrics);
    const url = URL.createObjectURL(wav);
    if (audioRef.current) {
      audioRef.current.src = url;
      try { await audioRef.current.play(); } catch {}
    }
    setStatus("Preview ready");
  } catch (e: unknown) {
    setStatus("Error: " + (e instanceof Error ? e.message : "Unknown"));
  }
}


  return (
    <div style={{ maxWidth: 1200, margin: "2rem auto", padding: 16 }}>
      <h1 className="text-2xl font-semibold">QA Panel (Analysis + Inside-track Scoring)</h1>

      <div className="mt-3 text-sm">
        Essentia:{" "}
        {essentiaStatus.isLoading
          ? "🔄 Loading..."
          : essentiaStatus.isLoaded
            ? (essentiaStatus.backend === "essentia" ? "✅ Essentia WASM" : "✅ Fallback analyzer")
            : "❌ Not loaded"}
      </div>

      {!audioReady && (
        <div className="mt-3">
          <button
            onClick={async () => { await unlockAudio(); setAudioReady(true); setNeedsUserGesture(false); setStatus("Audio unlocked."); try { await audioRef.current?.play(); } catch {} }}
            className="px-4 py-2 bg-black text-white rounded"
          >
            Enable sound
          </button>
          <div className="text-xs text-gray-500 mt-1">Tap once to allow audio playback (browser policy).</div>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Track A (outgoing)</label>
            <input type="file" accept=".mp3,.m4a,.wav" onChange={(e)=>setFileA(e.target.files?.[0]||null)} className="w-full border px-3 py-2 rounded"/>
            {analysisA && <div className="mt-2 text-sm text-green-600">✅ {analysisA.bpm.toFixed(2)} BPM</div>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Track B (incoming)</label>
            <input type="file" accept=".mp3,.m4a,.wav" onChange={(e)=>setFileB(e.target.files?.[0]||null)} className="w-full border px-3 py-2 rounded"/>
            {analysisB && <div className="mt-2 text-sm text-green-600">✅ {analysisB.bpm.toFixed(2)} BPM</div>}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
        {/* existing BPM/Bars/XF/Recipe inputs ... */}
        <label className="flex items-center gap-2">
            <input type="checkbox" checked={beatmatch} onChange={e=>setBeatmatch(e.target.checked)} />
            Beatmatch (rate only)
        </label>
        <label className="flex items-center gap-2">
            <input type="checkbox" checked={proEq} onChange={e=>setProEq(e.target.checked)} />
            Pro EQ Blend
        </label>
        </div>

        {analysisA && analysisB && (
          <div className="border p-4 rounded">
            <h3 className="text-lg font-medium mb-3">Candidate Selection</h3>
            <div className="flex gap-4 items-center mb-4">
              <button onClick={computeBestSplice} disabled={isAnalyzing} className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400">Compute best splice</button>
              {candidates.length > 0 && <span className="text-sm text-gray-600">Found {candidates.length} candidates</span>}
            </div>
            {candidates.length > 0 && (
            <div className="space-y-2">
                <h4 className="font-medium">Top candidates:</h4>

                <div className="max-h-48 overflow-y-auto space-y-2">
                {candidates.slice(0, 12).map((c, idx) => {
                    const isSel = selectedCandidate === c;
                    return (
                    <div
                        key={idx}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedCandidate(c)}
                        onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedCandidate(c);
                        }}
                        className={[
                        // Base
                        "p-3 rounded-md border text-sm cursor-pointer transition-colors outline-none",
                        // Light theme base
                        "bg-white text-gray-900 border-gray-300 hover:bg-indigo-50",
                        // Dark theme base
                        "dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700",
                        // Selected state (high contrast)
                        isSel
                            ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:border-indigo-400"
                            : "",
                        // Focus ring (a11y)
                        "focus:ring-2 focus:ring-indigo-400 dark:focus:ring-indigo-300",
                        ].join(" ")}
                    >
                        <div className="flex items-center justify-between gap-3">
                        <div className="font-mono">
                            tA <span className="font-semibold">{c.tA.toFixed(2)}s</span> · tB{" "}
                            <span className="font-semibold">{c.tB.toFixed(2)}s</span>
                        </div>
                        <div
                            className={[
                            "px-2 py-0.5 rounded text-xs font-semibold",
                            isSel
                                ? "bg-white/20 text-white"
                                : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100",
                            ].join(" ")}
                            title="Overall score"
                        >
                            Score {c.score.toFixed(2)}
                        </div>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {/* Downbeat badges */}
                        <span
                            className={[
                            "px-1.5 py-0.5 rounded",
                            c.isDownbeatA
                                ? (isSel ? "bg-white/20 text-white" : "bg-green-200 text-green-900 dark:bg-green-700 dark:text-green-100")
                                : (isSel ? "bg-white/10 text-white/90" : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"),
                            ].join(" ")}
                            title="A downbeat"
                        >
                            A {c.isDownbeatA ? "↓" : "•"}
                        </span>
                        <span
                            className={[
                            "px-1.5 py-0.5 rounded",
                            c.isDownbeatB
                                ? (isSel ? "bg-white/20 text-white" : "bg-green-200 text-green-900 dark:bg-green-700 dark:text-green-100")
                                : (isSel ? "bg-white/10 text-white/90" : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"),
                            ].join(" ")}
                            title="B downbeat"
                        >
                            B {c.isDownbeatB ? "↓" : "•"}
                        </span>

                        {/* Onset badges */}
                        {c.isStrongOnsetA && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-100",
                            ].join(" ")}
                            title="Strong onset near A"
                            >
                            🎵A
                            </span>
                        )}
                        {c.isStrongOnsetB && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-yellow-200 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-100",
                            ].join(" ")}
                            title="Strong onset near B"
                            >
                            🎵B
                            </span>
                        )}

                        {/* Valley/boundary badges */}
                        {c.isValleyA && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-blue-100",
                            ].join(" ")}
                            title="Energy valley at A"
                            >
                            valley A
                            </span>
                        )}
                        {c.isValleyB && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-blue-100",
                            ].join(" ")}
                            title="Energy valley at B"
                            >
                            valley B
                            </span>
                        )}
                        {c.fromBoundaryA && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900 dark:bg-purple-700 dark:text-purple-100",
                            ].join(" ")}
                            title="Boundary near A"
                            >
                            boundary A
                            </span>
                        )}
                        {c.fromBoundaryB && (
                            <span
                            className={[
                                "px-1.5 py-0.5 rounded",
                                isSel ? "bg-white/20 text-white" : "bg-purple-200 text-purple-900 dark:bg-purple-700 dark:text-purple-100",
                            ].join(" ")}
                            title="Boundary near B"
                            >
                            boundary B
                            </span>
                        )}
                                </div>
                            </div>
                            );
                        })}
                    </div>
                </div>
            )}

          </div>
        )}

        <div className="border p-4 rounded">
          <h3 className="text-lg font-medium mb-3">Recipe & Preview</h3>
          <div className="flex flex-wrap gap-3 mb-4">
            <label>BPM <input type="number" value={bpm} onChange={(e)=>setBpm(parseFloat(e.target.value||"120"))} className="border px-2 py-1 w-24 rounded"/></label>
            <label>Bars <input type="number" value={bars} onChange={(e)=>setBars(parseInt(e.target.value||"2"))} className="border px-2 py-1 w-20 rounded"/></label>
            <label>Crossfade ms <input type="number" value={xf} onChange={(e)=>setXf(parseInt(e.target.value||"90"))} className="border px-2 py-1 w-28 rounded"/></label>
            <label>Recipe
              <select className="border px-3 py-2 rounded ml-2" value={recipe} onChange={(e)=>setRecipe(e.target.value as PreviewRecipe)}>
                <option value="none">None</option>
                <option value="dreamy">Dreamy Sweep</option>
                <option value="echoTag">Echo Tag</option>
              </select>
            </label>
          </div>
          <button onClick={onRender} disabled={!fileA || !fileB || isAnalyzing} className="px-4 py-2 bg-purple-600 text-white rounded disabled:bg-gray-400">Render 2-bar Preview</button>
          {needsUserGesture && <div className="text-sm text-amber-600 mt-2">Playback blocked. Tap ▶️ on the player or click “Enable sound”.</div>}
        </div>

        {/* Status & Metrics */}
        <div className="border p-4 rounded text-sm">
        <div>Status: {status}</div>
        {metrics && (
            <div className="mt-2 space-y-1">
            <div>Peak: {metrics.peakDb.toFixed(1)} dBFS · BPM (input): {metrics.bpm.toFixed(2)}</div>
            <div>Splice @ A: {metrics.usedTA.toFixed(2)}s / {metrics.trackADuration.toFixed(2)}s</div>
            <div>Splice @ B: {metrics.usedTB.toFixed(2)}s / {metrics.trackBDuration.toFixed(2)}s</div>
            <div>Preview length: {metrics.contextSeconds.toFixed(2)}s (overlap {metrics.overlapSeconds.toFixed(3)}s)</div>
            </div>
        )}
        </div>


        <div className="border p-4 rounded">
          <h3 className="text-lg font-medium mb-2">Preview</h3>
          <audio ref={audioRef} controls className="w-full" />
        </div>
      </div>
    </div>
  );
}
