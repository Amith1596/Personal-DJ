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

const VIBES: { value: Vibe; label: string; hint: string; description: string }[] = [
  { value: 'dreamy',   label: 'Dreamy Sweep',    hint: 'LP filter wash', description: 'Soft filter sweep + reverb for a smooth, cinematic fade.' },
  { value: 'chaotic',  label: 'Chaotic Stutter', hint: '¼-beat repeats', description: 'Chopped repeats and glitches for a high-energy switch.' },
  { value: 'echoTag',  label: 'Echo Tag',        hint: 'tight feedback delay', description: 'Outgoing track echoes into the next one.' },
  { value: 'tapeStop', label: 'Tape Stop',       hint: 'vinyl brake into cut', description: 'Slows down like a record powering off, then drops into Track B.' },
  { value: 'beatRoll', label: 'Beat Roll',       hint: '½ → ¼ → ⅛ roll', description: 'Loops a small drum slice before dropping into the new track.' },
  { value: 'riser',    label: 'Riser Noise',     hint: 'filtered noise build', description: 'Noise riser that builds tension into the drop.' },
  { value: 'pump',     label: 'Sidechain Pump',  hint: 'duck A on beats', description: 'Pumping volume effect synced to the beat.' },
  { value: 'widen',    label: 'Stereo Widener',  hint: 'B widens on entry', description: 'Gradually widens the stereo field during the transition.' },
  { value: 'beatDrop', label: 'Beat Drop',       hint: 'Outro of A → Drop of B (Epic45)', description: 'Short cut into a big impact moment in Track B.' },
];

const BLENDS: { value: Blend; label: string; description: string }[] = [
  { value: 'equalPower', label: 'Equal Power (Recommended)', description: 'Smooth crossfade that avoids volume dips.' },
  { value: 'sCurve',     label: 'S-Curve', description: 'Slower start and end; more dramatic middle.' },
  { value: 'log',        label: 'Log', description: 'Outgoing fades gently, incoming rises faster.' },
  { value: 'ducked',     label: 'Ducked', description: 'Track B stays quiet until the drop.' },
  { value: 'cut',        label: 'Cut', description: 'Instant switch with no crossfade.' },
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
  const [playbackState, setPlaybackState] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended'>('idle');
  const audioRef = useRef<HTMLAudioElement>(null);

  // WaveSurfer DOM refs & instances
  const waveARef = useRef<HTMLDivElement | null>(null);
  const waveBRef = useRef<HTMLDivElement | null>(null);
  const waveSurferA = useRef<WaveSurfer | null>(null);
  const waveSurferB = useRef<WaveSurfer | null>(null);

  const canPreview = useMemo(() => !!fileA && !!fileB && !isProcessing, [fileA, fileB, isProcessing]);
  const canDownload = useMemo(() => !!previewUrl && !isProcessing, [previewUrl, isProcessing]);
  const bothFilesUploaded = useMemo(() => !!fileA && !!fileB, [fileA, fileB]);

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

  // ---------- Audio Player Event Listeners ----------
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setPlaybackState('playing');
    const handlePause = () => setPlaybackState('paused');
    const handleEnded = () => setPlaybackState('ended');
    const handleLoadedData = () => {
      if (playbackState === 'loading') setPlaybackState('ready');
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadeddata', handleLoadedData);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [playbackState]);

  // ---------- Handlers ----------
  async function handlePreview() {
    if (!fileA || !fileB) return;
    setError(null);
    setIsProcessing(true);
    setPlaybackState('loading');
    try {
      const blob = await mixTracks(fileA, fileB, crossfade, vibe, true, blend);
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.currentTime = 0;
        await audioRef.current.play().catch(() => {});
      }
      setPlaybackState('ready');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preview failed');
      setPlaybackState('idle');
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
      {/* Hero Header */}
      <header className="text-center py-8 space-y-4">
        <div className="inline-block">
          <h1
            className="text-5xl font-bold mb-2 tracking-tight"
            style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              textShadow: '0 0 40px rgba(99, 102, 241, 0.3)',
            }}
          >
            🎧 Personal DJ 🎶
          </h1>
        </div>
        <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
          Drop in two songs and we&apos;ll build a <span className="text-[var(--primary)] font-medium">DJ-style transition</span> between them.
        </p>

        {/* BPM Badges */}
        {(bpmA !== null || bpmB !== null) && (
          <div className="flex gap-3 justify-center pt-2">
            {bpmA !== null && (
              <span className="rounded-full border border-[var(--primary-soft)] px-3 py-1.5 text-sm bg-[var(--primary-soft)] text-[var(--primary)] font-medium">
                Track A: <strong>{bpmA} BPM</strong>
              </span>
            )}
            {bpmB !== null && (
              <span className="rounded-full border border-[var(--accent-soft)] px-3 py-1.5 text-sm bg-[var(--accent-soft)] text-[var(--accent)] font-medium">
                Track B: <strong>{bpmB} BPM</strong>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Step 1: Track Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary)] text-white font-bold text-sm">
            1
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Add your songs</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Track A */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-[var(--text-primary)]">🎵 Track A · Fading out</span>
                <p className="text-xs text-[var(--text-muted)] mt-1">This is the song you're transitioning from.</p>
              </div>
              {fileA && (
                <button onClick={() => setFileA(null)} className="text-xs text-[var(--error)] hover:underline">
                  Reset
                </button>
              )}
            </div>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--text-secondary)] file:rounded-lg file:border file:border-[var(--border-subtle)] file:bg-[var(--bg-input)] file:text-[var(--text-secondary)] hover:file:bg-[var(--border-subtle)]"
          />
          {fileA && <div className="truncate text-xs text-[var(--text-muted)]">{fileA.name}</div>}
          <div ref={waveARef} className="mt-2 rounded-lg bg-[var(--bg-input)] p-2" />
          {fileA && (
            <button
              onClick={() => waveSurferA.current?.playPause()}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white hover:bg-[var(--primary-hover)]"
            >
              Play / Pause A
            </button>
          )}
          </div>

          {/* Track B */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-[var(--text-primary)]">🎵 Track B · Fading in</span>
                <p className="text-xs text-[var(--text-muted)] mt-1">This is the song you're transitioning into.</p>
              </div>
              {fileB && (
                <button onClick={() => setFileB(null)} className="text-xs text-[var(--error)] hover:underline">
                  Reset
                </button>
              )}
            </div>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--text-secondary)] file:rounded-lg file:border file:border-[var(--border-subtle)] file:bg-[var(--bg-input)] file:text-[var(--text-secondary)] hover:file:bg-[var(--border-subtle)]"
          />
          {fileB && <div className="truncate text-xs text-[var(--text-muted)]">{fileB.name}</div>}
          <div ref={waveBRef} className="mt-2 rounded-lg bg-[var(--bg-input)] p-2" />
          {fileB && (
            <button
              onClick={() => waveSurferB.current?.playPause()}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:bg-[var(--accent)]/90"
            >
              Play / Pause B
            </button>
          )}
          </div>
        </div>
      </div>

      {/* Step 2: Mixer Controls */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
            bothFilesUploaded ? 'bg-[var(--accent)] text-white' : 'bg-[var(--disabled-bg)] text-[var(--disabled-text)]'
          }`}>
            2
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Choose your transition</h3>
        </div>
        {!bothFilesUploaded && (
          <p className="text-xs text-[var(--text-muted)] ml-10">Upload both tracks to customize your transition.</p>
        )}
        {bothFilesUploaded && (
          <p className="text-xs text-[var(--text-secondary)] ml-10">Pick a vibe and how the volumes crossfade between songs.</p>
        )}

        <div className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm space-y-6 ${!bothFilesUploaded ? 'opacity-50 pointer-events-none' : ''}`}>
          {/* Vibe + Blend */}
          <div>
            <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">Transition vibe</div>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVibe(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    vibe === opt.value
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                      : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                  }`}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {VIBES.find(v => v.value === vibe) && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">"{VIBES.find(v => v.value === vibe)?.label}"</span> · {VIBES.find(v => v.value === vibe)?.description}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">Blend curve</div>
            <p className="mb-2 text-xs text-[var(--text-muted)]">Blend curve controls how volume moves from Track A → Track B during the crossfade.</p>
            <div className="flex flex-wrap gap-2">
              {BLENDS.map((b) => (
                <button
                  key={b.value}
                  onClick={() => setBlend(b.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    blend === b.value
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                      : 'border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {BLENDS.find(b => b.value === blend) && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">"{BLENDS.find(b => b.value === blend)?.label}"</span> · {BLENDS.find(b => b.value === blend)?.description}
              </p>
            )}
          </div>

          {/* Crossfade */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">Crossfade (sec)</span>
              <span className="text-xs text-[var(--text-secondary)]">{crossfade}s</span>
            </div>
            <input
              type="range"
              min={6}
              max={24}
              step={1}
              value={crossfade}
              onChange={(e) => setCrossfade(Number(e.target.value))}
              className="w-full accent-[var(--primary)]"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Preview & Export */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
            bothFilesUploaded ? 'bg-[var(--success)] text-white' : 'bg-[var(--disabled-bg)] text-[var(--disabled-text)]'
          }`}>
            3
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Preview & download</h3>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-sm space-y-4">
          {/* Actions */}
          <div className="space-y-3">
            <div>
              <button
                onClick={handlePreview}
                disabled={!canPreview}
                className={`rounded-lg px-4 py-2 text-white transition-colors ${
                  canPreview ? 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]' : 'bg-[var(--disabled-bg)] text-[var(--disabled-text)] cursor-not-allowed'
                }`}
              >
                {playbackState === 'loading' ? 'Rendering preview…' : previewUrl ? 'Re-generate preview' : 'Preview transition'}
              </button>
              {!canPreview && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Add both Track A and Track B to preview a transition.</p>
              )}
            </div>

            <div>
              <button
                onClick={handleMixAndDownload}
                disabled={!canDownload}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  canDownload ? 'border border-[var(--border-strong)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)]' : 'bg-[var(--disabled-bg)] text-[var(--disabled-text)] cursor-not-allowed'
                }`}
              >
                🎧 Mix & Download
              </button>
              {!canDownload && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">Render a preview first to unlock download.</p>
              )}
            </div>

            {error && <span className="text-sm text-[var(--error)]">{error}</span>}
          </div>

          {/* Preview Player */}
          <div className={`rounded-xl border p-4 transition-all ${
            previewUrl
              ? 'border-[var(--primary)] bg-[var(--primary-soft)] shadow-lg'
              : 'border-[var(--border-subtle)] bg-[var(--bg-input)]'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                {previewUrl ? '🎵 Preview Ready - Click Play Below!' : '⏳ Preview Player'}
              </div>
              {previewUrl && (
                <span className="text-xs px-2 py-1 rounded-full bg-[var(--primary)] text-white font-medium">
                  45s
                </span>
              )}
            </div>

            {previewUrl && (
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                ▶️ Press play to hear your transition • This is a 45s snippet from the middle
              </p>
            )}

            <audio ref={audioRef} controls className="w-full" src={previewUrl ?? undefined} />

            {!previewUrl && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Click "Preview transition" above to render a 45s snippet.</p>
            )}
            {playbackState === 'ended' && (
              <p className="mt-2 text-xs text-[var(--success)] font-medium">✓ Finished! Press Play to hear it again.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
