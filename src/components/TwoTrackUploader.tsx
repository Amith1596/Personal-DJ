'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { analyzeTrack } from '@/lib/analysis/analyzeTrack';
import { mixTracks } from '@/lib/mixTracks';
import { getBpm } from '@/lib/analysis/getBpm';

type Vibe =
  | 'dreamy'
  | 'chaotic'
  | 'echoTag'
  | 'tapeStop'
  | 'beatRoll'
  | 'riser'
  | 'pump'
  | 'widen'
  | 'beatDrop'; // ✅ new

type Blend = 'equalPower' | 'sCurve' | 'log' | 'cut' | 'ducked';

const VIBES: { value: Vibe; label: string; hint: string }[] = [
  { value: 'dreamy',   label: 'Dreamy Sweep',    hint: 'LP filter wash' },
  { value: 'chaotic',  label: 'Chaotic Stutter', hint: '¼-beat repeats' },
  { value: 'echoTag',  label: 'Echo Tag',        hint: 'tight feedback delay' },
  { value: 'tapeStop', label: 'Tape Stop',       hint: 'vinyl brake into cut' },
  { value: 'beatRoll', label: 'Beat Roll',       hint: '½ → ¼ → ⅛ roll' },
  { value: 'riser',    label: 'Riser Noise',     hint: 'filtered noise build' },
  { value: 'pump',     label: 'Sidechain Pump',  hint: 'duck A on beats' },
  { value: 'widen',    label: 'Stereo Widener',  hint: 'B widens on entry' },
  { value: 'beatDrop', label: 'Beat Drop',       hint: 'Outro of A → Drop of B (Epic45)' },
];

const BLENDS: { value: Blend; label: string }[] = [
  { value: 'equalPower', label: 'Equal Power' },
  { value: 'sCurve',     label: 'S-Curve' },
  { value: 'log',        label: 'Log' },
  { value: 'ducked',     label: 'Ducked' },
  { value: 'cut',        label: 'Cut' },
];

export default function TwoTrackUploader() {
  // Files
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);

  // Detected BPMs
  const [bpmA, setBpmA] = useState<number | null>(null);
  const [bpmB, setBpmB] = useState<number | null>(null);

  // Mixer settings
  const [vibe, setVibe] = useState<Vibe>('dreamy');
  const [blend, setBlend] = useState<Blend>('equalPower');
  const [crossfade, setCrossfade] = useState<number>(8);

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview player
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // WaveSurfer DOM refs & instances
  const waveARef = useRef<HTMLDivElement | null>(null);
  const waveBRef = useRef<HTMLDivElement | null>(null);
  const waveSurferA = useRef<WaveSurfer | null>(null);
  const waveSurferB = useRef<WaveSurfer | null>(null);

  const canMix = useMemo(() => !!fileA && !!fileB && !isProcessing, [fileA, fileB, isProcessing]);

  // ---------- WaveSurfer setups ----------
  useEffect(() => {
    if (!fileA || !waveARef.current) return;

    const url = URL.createObjectURL(fileA);
    waveSurferA.current?.destroy();
    waveSurferA.current = WaveSurfer.create({
      container: waveARef.current,
      waveColor: '#4f46e5',
      progressColor: '#6366f1',
      cursorColor: '#0f172a',
      barWidth: 2,
      height: 96,
      normalize: true,
    });
    waveSurferA.current.load(url);

    return () => {
      waveSurferA.current?.destroy();
      URL.revokeObjectURL(url);
    };
  }, [fileA]);

  useEffect(() => {
    if (!fileB || !waveBRef.current) return;

    const url = URL.createObjectURL(fileB);
    waveSurferB.current?.destroy();
    waveSurferB.current = WaveSurfer.create({
      container: waveBRef.current,
      waveColor: '#db2777',
      progressColor: '#ec4899',
      cursorColor: '#0f172a',
      barWidth: 2,
      height: 96,
      normalize: true,
    });
    waveSurferB.current.load(url);

    return () => {
      waveSurferB.current?.destroy();
      URL.revokeObjectURL(url);
    };
  }, [fileB]);

  // ---------- Analysis + BPM ----------
  useEffect(() => { if (fileA) analyzeTrack(fileA).then((f) => console.log('Track A features:', f)); }, [fileA]);
  useEffect(() => { if (fileB) analyzeTrack(fileB).then((f) => console.log('Track B features:', f)); }, [fileB]);

  useEffect(() => {
    if (!fileA) return;
    const ctx = new AudioContext();
    fileA.arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .then((audioBuffer) => getBpm(audioBuffer))
      .then(setBpmA)
      .finally(() => ctx.close());
  }, [fileA]);

  useEffect(() => {
    if (!fileB) return;
    const ctx = new AudioContext();
    fileB.arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .then((audioBuffer) => getBpm(audioBuffer))
      .then(setBpmB)
      .finally(() => ctx.close());
  }, [fileB]);

  // ---------- Handlers ----------
  async function handlePreview() {
    if (!fileA || !fileB) return;
    setError(null);
    setIsProcessing(true);
    try {
      const blob = await mixTracks(fileA, fileB, crossfade, vibe, true, blend);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.currentTime = 0;
        await audioRef.current.play().catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleMixAndDownload() {
    if (!fileA || !fileB) return;
    setError(null);
    setIsProcessing(true);
    try {
      const blob = await mixTracks(fileA, fileB, crossfade, vibe, false, blend);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-dj-mix-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Mix failed');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">🎧 Personal DJ</h2>
          <p className="text-sm text-gray-500">
            Upload two songs, pick a vibe + blend, and preview an <strong>Epic 45s</strong> transition.
          </p>
        </div>
        <div className="flex gap-2">
          {bpmA !== null && (
            <span className="rounded-full border px-2 py-1 text-xs bg-indigo-50 text-indigo-700">
              A BPM: <strong>{bpmA}</strong>
            </span>
          )}
          {bpmB !== null && (
            <span className="rounded-full border px-2 py-1 text-xs bg-pink-50 text-pink-700">
              B BPM: <strong>{bpmB}</strong>
            </span>
          )}
        </div>
      </header>

      {/* Track Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Track A */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-black">🎵 Track A (outgoing)</span>
            {fileA && (
              <button onClick={() => setFileA(null)} className="text-xs text-red-600 hover:underline">
                Reset
              </button>
            )}
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:rounded-lg file:border file:bg-gray-50 hover:file:bg-gray-100"
          />
          {fileA && <div className="truncate text-xs text-gray-500">{fileA.name}</div>}
          <div ref={waveARef} className="mt-2 rounded-lg bg-gray-50 p-2" />
          {fileA && (
            <button
              onClick={() => waveSurferA.current?.playPause()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
            >
              Play / Pause A
            </button>
          )}
        </div>

        {/* Track B */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-black">🎵 Track B (incoming)</span>
            {fileB && (
              <button onClick={() => setFileB(null)} className="text-xs text-red-600 hover:underline">
                Reset
              </button>
            )}
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:rounded-lg file:border file:bg-gray-50 hover:file:bg-gray-100"
          />
          {fileB && <div className="truncate text-xs text-gray-500">{fileB.name}</div>}
          <div ref={waveBRef} className="mt-2 rounded-lg bg-gray-50 p-2" />
          {fileB && (
            <button
              onClick={() => waveSurferB.current?.playPause()}
              className="rounded-lg bg-pink-600 px-3 py-1.5 text-sm text-white hover:bg-pink-700"
            >
              Play / Pause B
            </button>
          )}
        </div>
      </div>

      {/* Mixer Controls */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-6">
        {/* Vibe + Blend */}
        <div>
          <div className="mb-2 text-sm font-medium">Transition vibe</div>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVibe(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  vibe === opt.value
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Blend curve</div>
          <div className="flex flex-wrap gap-2">
            {BLENDS.map((b) => (
              <button
                key={b.value}
                onClick={() => setBlend(b.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  blend === b.value
                    ? 'border-pink-600 bg-pink-600 text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Crossfade */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Crossfade (sec)</span>
            <span className="text-xs text-gray-500">{crossfade}s</span>
          </div>
          <input
            type="range"
            min={6}
            max={24}
            step={1}
            value={crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={!canMix}
            className={`rounded-lg px-4 py-2 text-white ${
              canMix ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400'
            }`}
          >
            {isProcessing ? 'Rendering…' : 'Preview Transition'}
          </button>

          <button
            onClick={handleMixAndDownload}
            disabled={!canMix}
            className={`rounded-lg px-4 py-2 ${
              canMix ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'bg-gray-200 text-gray-400'
            }`}
          >
            🎧 Mix & Download
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        {/* Preview Player */}
        <div className="rounded-xl border bg-gray-50 p-3">
          <div className="text-xs mb-1 text-gray-600">
            Preview ({vibe === 'beatDrop' ? 'Epic 45s' : '45s'})
          </div>
          <audio ref={audioRef} controls className="w-full" src={previewUrl ?? undefined} />
          {!previewUrl && (
            <p className="mt-2 text-xs text-gray-500">Click “Preview Transition” to render a 45s snippet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
