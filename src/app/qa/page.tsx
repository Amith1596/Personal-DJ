// app/qa/page.tsx  (or pages/qa.tsx)
"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { renderTwoBarPreview } from "@/lib/audio/xfadePreview";
import { analyzeBuffer, getEssentiaLoadingStatus, EssentiaAnalysisResult } from "@/lib/analysis/essentiaClient";
import { generateCandidates, getDefaultRanges } from "@/lib/analysis/candidates";
import { scoreCandidates, ScoredCandidate, DEFAULT_WEIGHTS } from "@/lib/analysis/score";

export default function QAPage() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [bpm, setBpm] = useState(120);
  const [bars, setBars] = useState(2);
  const [xf, setXf] = useState(90);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [metrics, setMetrics] = useState<{ bpm: number; peakDb: number } | null>(null);
  
  // Analysis state
  const [analysisA, setAnalysisA] = useState<EssentiaAnalysisResult | null>(null);
  const [analysisB, setAnalysisB] = useState<EssentiaAnalysisResult | null>(null);
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ScoredCandidate | null>(null);
  const [autoBpm, setAutoBpm] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [essentiaStatus, setEssentiaStatus] = useState(getEssentiaLoadingStatus());

  const analyzeFile = useCallback(async (file: File, track: 'A' | 'B') => {
    setIsAnalyzing(true);
    setStatus(`Analyzing track ${track}...`);
    
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();
      
      const analysis = await analyzeBuffer(audioBuffer);
      
      if (track === 'A') {
        setAnalysisA(analysis);
        if (autoBpm) setBpm(analysis.bpm);
      } else {
        setAnalysisB(analysis);
      }
      
      setStatus(`Track ${track} analyzed: ${analysis.bpm} BPM, ${analysis.key.tonic} ${analysis.key.scale}`);
    } catch (error) {
      setStatus(`Analysis failed for track ${track}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [autoBpm]);

  // Update Essentia status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setEssentiaStatus(getEssentiaLoadingStatus());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Analyze files when they change
  useEffect(() => {
    if (fileA) analyzeFile(fileA, 'A');
  }, [fileA, analyzeFile]);

  useEffect(() => {
    if (fileB) analyzeFile(fileB, 'B');
  }, [fileB, analyzeFile]);

  async function computeBestSplice() {
    if (!analysisA || !analysisB) {
      setStatus("Please analyze both tracks first");
      return;
    }
    
    setStatus("Computing best splice...");
    
    try {
      const { rangeA, rangeB } = getDefaultRanges(analysisA, analysisB);
      const candidateList = generateCandidates({
        analysisA,
        analysisB,
        rangeA,
        rangeB,
        crossfadeMs: xf,
        sampleRate: analysisA.sampleRate
      });
      
      const scoredCandidates = scoreCandidates(candidateList, analysisA, analysisB, DEFAULT_WEIGHTS);
      setCandidates(scoredCandidates);
      setSelectedCandidate(scoredCandidates[0] || null);
      
      setStatus(`Found ${scoredCandidates.length} candidates. Best: ${scoredCandidates[0]?.score.toFixed(2)}`);
    } catch (error) {
      setStatus(`Splice computation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async function onRender() {
    if (!fileA || !fileB) return setStatus("Pick both files");
    
    const candidate = selectedCandidate || candidates[0];
    if (!candidate) {
      setStatus("Please compute best splice first");
      return;
    }
    
    setStatus("Rendering…");
    try {
      const { wav, metrics } = await renderTwoBarPreview(fileA, fileB, bpm, bars, xf);
      setMetrics(metrics);
      const url = URL.createObjectURL(wav);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
      setStatus("Preview ready");
    } catch (e: unknown) {
      setStatus("Error: " + (e instanceof Error ? e.message : "Unknown"));
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "2rem auto", padding: 16 }}>
      <h1 className="text-2xl font-semibold">QA Panel (Analysis + Scorer v0)</h1>
      
      {/* Essentia Status */}
      <div className="mt-4 p-3 bg-gray-100 rounded">
        <div className="text-sm">
          Essentia.js: {essentiaStatus.isLoading ? "🔄 Loading..." : essentiaStatus.isLoaded ? "✅ Loaded" : "❌ Not loaded"}
        </div>
      </div>

      <div className="mt-4 grid gap-6">
        {/* File Upload */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Track A (outgoing)</label>
            <input 
              type="file" 
              accept=".mp3,.m4a,.wav" 
              onChange={(e)=>setFileA(e.target.files?.[0]||null)} 
              className="w-full border px-3 py-2 rounded"
            />
            {analysisA && (
              <div className="mt-2 text-sm text-green-600">
                ✅ {analysisA.bpm} BPM, {analysisA.key.tonic} {analysisA.key.scale} ({analysisA.key.confidence.toFixed(2)})
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Track B (incoming)</label>
            <input 
              type="file" 
              accept=".mp3,.m4a,.wav" 
              onChange={(e)=>setFileB(e.target.files?.[0]||null)} 
              className="w-full border px-3 py-2 rounded"
            />
            {analysisB && (
              <div className="mt-2 text-sm text-green-600">
                ✅ {analysisB.bpm} BPM, {analysisB.key.tonic} {analysisB.key.scale} ({analysisB.key.confidence.toFixed(2)})
              </div>
            )}
          </div>
        </div>

        {/* Analysis Controls */}
        <div className="border p-4 rounded">
          <h3 className="text-lg font-medium mb-3">Analysis & Detection</h3>
          <div className="flex gap-4 items-center">
            <button 
              onClick={() => { if (fileA) analyzeFile(fileA, 'A'); }} 
              disabled={!fileA || isAnalyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              Detect BPM/Key A
            </button>
            <button 
              onClick={() => { if (fileB) analyzeFile(fileB, 'B'); }} 
              disabled={!fileB || isAnalyzing}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              Detect BPM/Key B
            </button>
            <label className="flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={autoBpm} 
                onChange={(e) => setAutoBpm(e.target.checked)}
              />
              Auto BPM from analysis
            </label>
          </div>
        </div>

        {/* Candidate Generation */}
        {analysisA && analysisB && (
          <div className="border p-4 rounded">
            <h3 className="text-lg font-medium mb-3">Candidate Selection</h3>
            <div className="flex gap-4 items-center mb-4">
              <button 
                onClick={computeBestSplice}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-400"
              >
                Compute best splice
              </button>
              {candidates.length > 0 && (
                <span className="text-sm text-gray-600">
                  Found {candidates.length} candidates
                </span>
              )}
            </div>

            {/* Candidate List */}
            {candidates.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Candidates (tA*, tB*):</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {candidates.slice(0, 10).map((candidate, idx) => (
                    <div 
                      key={idx}
                      className={`p-2 rounded cursor-pointer text-sm ${
                        selectedCandidate === candidate ? 'bg-blue-100 border-blue-300' : 'bg-gray-50 hover:bg-gray-100'
                      }`}
                      onClick={() => setSelectedCandidate(candidate)}
                    >
                      <div className="flex justify-between items-center">
                        <span>
                          tA: {candidate.tA.toFixed(2)}s, tB: {candidate.tB.toFixed(2)}s
                        </span>
                        <span className="font-mono text-xs">
                          Score: {candidate.score.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {candidate.isDownbeatA ? '↓' : '•'}A {candidate.isDownbeatB ? '↓' : '•'}B
                        {candidate.isStrongOnsetA && ' 🎵A'} {candidate.isStrongOnsetB && ' 🎵B'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recipe Selection */}
        <div className="border p-4 rounded">
          <h3 className="text-lg font-medium mb-3">Recipe & Preview</h3>
          <div className="flex gap-3 mb-4">
            <label>BPM <input type="number" value={bpm} onChange={(e)=>setBpm(parseInt(e.target.value||"120"))} className="border px-2 py-1 w-24 rounded"/></label>
            <label>Bars <input type="number" value={bars} onChange={(e)=>setBars(parseInt(e.target.value||"2"))} className="border px-2 py-1 w-20 rounded"/></label>
            <label>Crossfade ms <input type="number" value={xf} onChange={(e)=>setXf(parseInt(e.target.value||"90"))} className="border px-2 py-1 w-28 rounded"/></label>
          </div>
          <div className="flex gap-2">
            <select className="border px-3 py-2 rounded">
              <option>None</option>
              <option>Dreamy Sweep</option>
              <option>Echo Tag</option>
            </select>
            <button 
              onClick={onRender} 
              disabled={!fileA || !fileB || isAnalyzing}
              className="px-4 py-2 bg-purple-600 text-white rounded disabled:bg-gray-400"
            >
              Render 2-bar Preview
            </button>
          </div>
        </div>

        {/* Status & Metrics */}
        <div className="border p-4 rounded">
          <div className="text-sm">
            <div>Status: {status}</div>
            {metrics && (
              <div>Peak: {metrics.peakDb.toFixed(1)} dBFS · BPM (input): {metrics.bpm}</div>
            )}
          </div>
        </div>

        {/* Audio Player */}
        <div className="border p-4 rounded">
          <h3 className="text-lg font-medium mb-2">Preview</h3>
          <audio ref={audioRef} controls className="w-full" />
        </div>
      </div>
      
      <p className="text-sm text-gray-500 mt-4">
        Tip: Upload two files → Detect BPM/Key → Compute best splice → Render preview
      </p>
    </div>
  );
}
