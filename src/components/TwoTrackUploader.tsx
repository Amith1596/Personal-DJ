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
  | 'widen';

const VIBES: { value: Vibe; label: string; hint: string }[] = [
  { value: 'dreamy',  label: 'Dreamy Sweep',    hint: 'LP filter wash' },
  { value: 'chaotic', label: 'Chaotic Stutter', hint: '¼-beat repeats' },
  { value: 'echoTag', label: 'Echo Tag',        hint: 'tight feedback delay' },
  { value: 'tapeStop',label: 'Tape Stop',       hint: 'vinyl brake into cut' },
  { value: 'beatRoll',label: 'Beat Roll',       hint: '½ → ¼ → ⅛ roll' },
  { value: 'riser',   label: 'Riser Noise',     hint: 'filtered noise build' },
  { value: 'pump',    label: 'Sidechain Pump',  hint: 'duck A on beats' },
  { value: 'widen',   label: 'Stereo Widener',  hint: 'B widens on entry' },
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

  // ---------- WaveSurfer setups (black waveforms) ----------
  useEffect(() => {
    if (!fileA || !waveARef.current) return;

    const url = URL.createObjectURL(fileA);
    waveSurferA.current?.destroy();
    waveSurferA.current = WaveSurfer.create({
      container: waveARef.current,
      waveColor: '#000000',     // black
      progressColor: '#111111', // near-black progress
      cursorColor: '#0f172a',
      barWidth: 2,
      height: 84,
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
      waveColor: '#000000',     // black
      progressColor: '#111111', // near-black progress
      cursorColor: '#0f172a',
      barWidth: 2,
      height: 84,
      normalize: true,
    });
    waveSurferB.current.load(url);

    return () => {
      waveSurferB.current?.destroy();
      URL.revokeObjectURL(url);
    };
  }, [fileB]);

  // ---------- Feature analysis (console for now) ----------
  useEffect(() => {
    if (!fileA) return;
    analyzeTrack(fileA).then((features) => {
      console.log('Track A features:', features);
    });
  }, [fileA]);

  useEffect(() => {
    if (!fileB) return;
    analyzeTrack(fileB).then((features) => {
      console.log('Track B features:', features);
    });
  }, [fileB]);

  // ---------- BPM detection ----------
  useEffect(() => {
    if (!fileA) return;
    const ctx = new AudioContext();
    fileA.arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .then((audioBuffer) => getBpm(audioBuffer))
      .then(setBpmA)
      .catch((err) => console.error('BPM detection for Track A failed:', err))
      .finally(() => ctx.close());
  }, [fileA]);

  useEffect(() => {
    if (!fileB) return;
    const ctx = new AudioContext();
    fileB.arrayBuffer()
      .then((ab) => ctx.decodeAudioData(ab))
      .then((audioBuffer) => getBpm(audioBuffer))
      .then(setBpmB)
      .catch((err) => console.error('BPM detection for Track B failed:', err))
      .finally(() => ctx.close());
  }, [fileB]);

  // ---------- Handlers ----------
    async function handlePreview() {
    if (!fileA || !fileB) return;
    setError(null);
    setIsProcessing(true);
    try {
      const blob = await mixTracks(fileA, fileB, crossfade, vibe, true); // previewOnly
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.currentTime = 0;
        await audioRef.current.play().catch(() => {});
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Preview failed');
      }
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleMixAndDownload() {
    if (!fileA || !fileB) return;
    setError(null);
    setIsProcessing(true);
    try {
      const blob = await mixTracks(fileA, fileB, crossfade, vibe, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-dj-mix-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError('Mix failed');
      }
    } finally {
      setIsProcessing(false);
    }
  }


  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Personal DJ — Two Track Mixer</h2>
          <p className="text-sm text-gray-500">Drop in two songs, pick a vibe, preview just the transition, then export the full mix.</p>
        </div>
        <div className="flex gap-2">
          {bpmA !== null && (
            <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs text-gray-700 bg-white">
              A&nbsp;BPM: <strong className="ml-1">{bpmA}</strong>
            </span>
          )}
          {bpmB !== null && (
            <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs text-gray-700 bg-white">
              B&nbsp;BPM: <strong className="ml-1">{bpmB}</strong>
            </span>
          )}
        </div>
      </header>

      {/* Track Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Track A */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-black">🎵 Track A (outgoing)</div>
            {fileA && (
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setFileA(null)}
              >
                Clear
              </button>
            )}
          </div>

          <label className="mt-3 block">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
            />
          </label>

          {fileA && <div className="mt-2 truncate text-xs text-gray-500">{fileA.name}</div>}
          <div ref={waveARef} className="mt-4 rounded-lg bg-gray-50 p-2" />
          {fileA && (
            <div className="mt-2">
              <button
                onClick={() => waveSurferA.current?.playPause()}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700"
              >
                Play / Pause A
              </button>
            </div>
          )}
        </div>

        {/* Track B */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-black">🎵 Track B (incoming)</div>
            {fileB && (
              <button
                className="text-xs text-gray-500 hover:text-gray-700"
                onClick={() => setFileB(null)}
              >
                Clear
              </button>
            )}
          </div>

          <label className="mt-3 block">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border file:border-gray-300 file:text-sm file:font-medium file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
            />
          </label>

          {fileB && <div className="mt-2 truncate text-xs text-gray-500">{fileB.name}</div>}
          <div ref={waveBRef} className="mt-4 rounded-lg bg-gray-50 p-2" />
          {fileB && (
            <div className="mt-2">
              <button
                onClick={() => waveSurferB.current?.playPause()}
                className="rounded-lg bg-pink-600 px-3 py-1.5 text-sm text-white hover:bg-pink-700"
              >
                Play / Pause B
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mixer Controls */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          {/* Vibe Pills */}
          <div className="md:col-span-2">
            <div className="mb-2 text-sm font-medium">Transition vibe</div>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVibe(opt.value)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
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
            <div className="mt-1 text-xs text-gray-500">
              Tip: <span className="font-medium">Echo Tag + Pump</span> feels great before a drop; <span className="font-medium">Beat Roll</span> for hype cuts; <span className="font-medium">Dreamy</span> for smooth builds.
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
              min={3}
              max={20}
              step={1}
              value={crossfade}
              onChange={(e) => setCrossfade(Number(e.target.value))}
              className="w-full"
            />
            <div className="mt-2">
              <input
                type="number"
                min={3}
                max={20}
                step={1}
                value={crossfade}
                onChange={(e) =>
                  setCrossfade(Math.max(3, Math.min(20, Number(e.target.value) || 8)))
                }
                className="w-full rounded border px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handlePreview}
            disabled={!canMix}
            className={`rounded-lg px-4 py-2 text-white ${
              canMix ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400'
            }`}
            title="Render ~30s around the splice and play it"
          >
            {isProcessing ? 'Rendering…' : 'Preview Transition'}
          </button>

          {/* Replaced Export with Mix & Download using current crossfade */}
          <button
            onClick={handleMixAndDownload}
            disabled={!canMix}
            className={`rounded-lg px-4 py-2 ${
              canMix ? 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50' : 'bg-gray-200 text-gray-400'
            }`}
            title="Export full mix using current crossfade"
          >
            🎧 Mix & Download
          </button>

          {isProcessing && <span className="text-sm text-gray-500">Rendering…</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        {/* Preview Player */}
        <div className="mt-4 rounded-xl border bg-gray-50 p-3">
          <div className="text-xs mb-1 text-gray-600">Preview (30s around splice)</div>
          <audio ref={audioRef} controls className="w-full" src={previewUrl ?? undefined}>
            Your browser does not support the audio element.
          </audio>
          {!previewUrl && (
            <p className="mt-2 text-xs text-gray-500">Click “Preview Transition” to render a 30s snippet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
