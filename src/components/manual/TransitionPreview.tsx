"use client";

import { useState, useRef } from "react";
import { previewTransition, type ManualSegment } from "@/lib/api";

interface TransitionPreviewProps {
  songA: ManualSegment;
  songB: ManualSegment;
  indexA: number;
  indexB: number;
}

export default function TransitionPreview({
  songA,
  songB,
  indexA,
  indexB,
}: TransitionPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handlePreview = async () => {
    setLoading(true);
    setError(null);

    // Revoke previous URL
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    try {
      const blob = await previewTransition(songA, songB);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      // Auto-play
      setTimeout(() => {
        audioRef.current?.play();
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 mx-8 rounded"
      style={{ background: "var(--bg-input)", border: "1px dashed var(--border-subtle)" }}
    >
      <div
        className="text-xs font-mono"
        style={{ color: "var(--text-muted)" }}
      >
        {indexA + 1} → {indexB + 1}
      </div>

      <button
        onClick={handlePreview}
        disabled={loading}
        className="text-xs px-3 py-1 rounded transition-colors"
        style={{
          background: loading ? "var(--disabled-bg)" : "var(--accent)",
          color: loading ? "var(--disabled-text)" : "white",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Rendering..." : "Preview Transition"}
      </button>

      {audioUrl && (
        <audio ref={audioRef} controls src={audioUrl} className="h-8 flex-1" />
      )}

      {error && (
        <span className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
