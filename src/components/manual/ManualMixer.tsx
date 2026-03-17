"use client";

import { useState, useCallback, useRef } from "react";
import SongTrack from "./SongTrack";
import TransitionPreview from "./TransitionPreview";
import ChainTimeline from "./ChainTimeline";
import AddSongButton from "./AddSongButton";
import {
  uploadFile,
  startManualMix,
  getMixStatus,
  getDownloadUrl,
  type ManualSegment,
  type MixStatusResponse,
} from "@/lib/api";

interface SongEntry {
  file: File;
  startTime: number;
  endTime: number;
  serverPath: string | null;
  uploading: boolean;
}

export default function ManualMixer() {
  const [songs, setSongs] = useState<SongEntry[]>([]);
  const [mixStatus, setMixStatus] = useState<MixStatusResponse | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleAddSong = useCallback(async (file: File) => {
    const idx = songs.length;
    if (idx >= 5) return;

    // Add song immediately with uploading state
    setSongs((prev) => [
      ...prev,
      { file, startTime: 0, endTime: 0, serverPath: null, uploading: true },
    ]);

    // Upload to backend
    try {
      const path = await uploadFile(file);
      setSongs((prev) =>
        prev.map((s, i) =>
          i === idx ? { ...s, serverPath: path, uploading: false } : s
        )
      );
    } catch {
      setSongs((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, uploading: false } : s))
      );
      setError(`Failed to upload ${file.name}. Is the backend running on localhost:8000?`);
    }
  }, [songs.length]);

  const handleTimesChange = useCallback((index: number, start: number, end: number) => {
    setSongs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, startTime: start, endTime: end } : s))
    );
  }, []);

  const handleRemove = useCallback((index: number) => {
    setSongs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("audio/")
      );
      const remaining = 5 - songs.length;
      const toAdd = files.slice(0, remaining);

      for (const file of toAdd) {
        await handleAddSong(file);
      }
    },
    [songs.length, handleAddSong]
  );

  const allUploaded = songs.length >= 2 && songs.every((s) => s.serverPath !== null);

  const handleRenderMix = async () => {
    if (!allUploaded) return;

    setRendering(true);
    setError(null);
    setMixStatus(null);

    try {
      const segments: ManualSegment[] = songs.map((s) => ({
        file_path: s.serverPath!,
        start_time: s.startTime,
        end_time: s.endTime,
      }));

      const status = await startManualMix(segments);
      setMixStatus(status);

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const updated = await getMixStatus(status.job_id);
          setMixStatus(updated);

          if (updated.status === "complete" || updated.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setRendering(false);

            if (updated.status === "failed") {
              setError(updated.error || "Mix failed");
            }
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          setRendering(false);
          setError("Lost connection to server");
        }
      }, 2000);
    } catch (e) {
      setRendering(false);
      setError(e instanceof Error ? e.message : "Failed to start mix");
    }
  };

  const timelineEntries = songs.map((s) => ({
    name: s.file.name,
    duration: s.endTime - s.startTime,
  }));

  return (
    <div
      className="max-w-3xl mx-auto p-6 space-y-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold mb-1">Manual Mix</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Add 2-5 songs, set start/end markers, preview transitions, render.
        </p>
      </div>

      {songs.length === 0 && (
        <div
          className="rounded-lg p-12 text-center"
          style={{
            border: "2px dashed var(--border-strong)",
            background: "var(--bg-card)",
          }}
        >
          <p style={{ color: "var(--text-secondary)" }}>
            Drag and drop audio files here, or click Add Song below.
          </p>
        </div>
      )}

      {songs.map((song, i) => (
        <div key={`${song.file.name}-${i}`}>
          <SongTrack
            index={i}
            file={song.file}
            startTime={song.startTime}
            endTime={song.endTime}
            onTimesChange={handleTimesChange}
            onRemove={handleRemove}
            canRemove={true}
          />

          {song.uploading && (
            <div className="text-xs px-4 py-1" style={{ color: "var(--warning)" }}>
              Uploading...
            </div>
          )}

          {/* Transition preview between this song and the next */}
          {i < songs.length - 1 && song.serverPath && songs[i + 1].serverPath && (
            <TransitionPreview
              songA={{
                file_path: song.serverPath,
                start_time: song.startTime,
                end_time: song.endTime,
              }}
              songB={{
                file_path: songs[i + 1].serverPath!,
                start_time: songs[i + 1].startTime,
                end_time: songs[i + 1].endTime,
              }}
              indexA={i}
              indexB={i + 1}
            />
          )}
        </div>
      ))}

      <AddSongButton
        onAdd={handleAddSong}
        disabled={songs.length >= 5}
        songCount={songs.length}
      />

      {songs.length >= 2 && <ChainTimeline songs={timelineEntries} />}

      {/* Render button */}
      {songs.length >= 2 && (
        <div className="flex flex-col items-center gap-3 pt-4">
          <button
            onClick={handleRenderMix}
            disabled={rendering || !allUploaded || songs.some((s) => s.endTime <= s.startTime)}
            className="text-sm px-6 py-3 rounded-lg font-medium transition-colors"
            style={{
              background:
                rendering || !allUploaded
                  ? "var(--disabled-bg)"
                  : "linear-gradient(135deg, var(--primary), var(--accent))",
              color: rendering || !allUploaded ? "var(--disabled-text)" : "white",
              cursor: rendering || !allUploaded ? "not-allowed" : "pointer",
            }}
          >
            {rendering
              ? "Rendering..."
              : !allUploaded
              ? "Waiting for uploads..."
              : "Render Full Mix"}
          </button>

          {/* Status display */}
          {mixStatus && (
            <div className="text-sm text-center">
              <div style={{ color: "var(--text-secondary)" }}>
                Status: {mixStatus.status}
                {mixStatus.progress !== null &&
                  ` (${Math.round(mixStatus.progress * 100)}%)`}
              </div>

              {mixStatus.status === "complete" && (
                <a
                  href={getDownloadUrl(mixStatus.job_id)}
                  className="inline-block mt-2 px-4 py-2 rounded text-sm"
                  style={{ background: "var(--success)", color: "white" }}
                >
                  Download Mix
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm" style={{ color: "var(--error)" }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
