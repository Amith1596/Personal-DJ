"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/dist/plugins/regions.js";

interface SongTrackProps {
  index: number;
  file: File;
  startTime: number;
  endTime: number;
  onTimesChange: (index: number, start: number, end: number) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SongTrack({
  index,
  file,
  startTime,
  endTime,
  onTimesChange,
  onRemove,
  canRemove,
}: SongTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<Region | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startInput, setStartInput] = useState(formatTime(startTime));
  const [endInput, setEndInput] = useState(formatTime(endTime));

  // Parse MM:SS to seconds
  const parseTime = (val: string): number | null => {
    const parts = val.split(":");
    if (parts.length !== 2) return null;
    const m = parseInt(parts[0], 10);
    const s = parseInt(parts[1], 10);
    if (isNaN(m) || isNaN(s) || s >= 60 || m < 0 || s < 0) return null;
    return m * 60 + s;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#6366F1",
      progressColor: "#4F46E5",
      cursorColor: "#EC4899",
      height: 80,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      plugins: [regions],
    });

    ws.loadBlob(file);

    ws.on("ready", () => {
      const dur = ws.getDuration();
      setDuration(dur);

      const start = startTime || 0;
      const end = endTime || dur;

      const region = regions.addRegion({
        start,
        end: Math.min(end, dur),
        color: "rgba(99, 102, 241, 0.2)",
        drag: true,
        resize: true,
      });
      regionRef.current = region;
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    regions.on("region-updated", (region: Region) => {
      const s = Math.max(0, region.start);
      const e = Math.min(region.end, ws.getDuration());
      setStartInput(formatTime(s));
      setEndInput(formatTime(e));
      onTimesChange(index, s, e);
    });

    wsRef.current = ws;

    return () => {
      ws.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const handlePlay = useCallback(() => {
    const ws = wsRef.current;
    const region = regionRef.current;
    if (!ws) return;

    if (isPlaying) {
      ws.pause();
    } else if (region) {
      region.play();
    } else {
      ws.play();
    }
  }, [isPlaying]);

  const handleStartBlur = () => {
    const sec = parseTime(startInput);
    if (sec !== null && sec < endTime && sec >= 0) {
      onTimesChange(index, sec, endTime);
      if (regionRef.current) {
        regionRef.current.setOptions({ start: sec });
      }
    } else {
      setStartInput(formatTime(startTime));
    }
  };

  const handleEndBlur = () => {
    const sec = parseTime(endInput);
    if (sec !== null && sec > startTime && sec <= duration) {
      onTimesChange(index, startTime, sec);
      if (regionRef.current) {
        regionRef.current.setOptions({ end: sec });
      }
    } else {
      setEndInput(formatTime(endTime));
    }
  };

  // Sync inputs when props change externally
  useEffect(() => {
    setStartInput(formatTime(startTime));
  }, [startTime]);

  useEffect(() => {
    setEndInput(formatTime(endTime));
  }, [endTime]);

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-mono px-2 py-1 rounded"
            style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
          >
            {index + 1}
          </span>
          <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
          {duration > 0 && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatTime(duration)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlay}
            className="text-xs px-3 py-1 rounded"
            style={{ background: "var(--primary)", color: "white" }}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          {canRemove && (
            <button
              onClick={() => onRemove(index)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "var(--error)", color: "white" }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="mb-2" />

      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
          Start:
          <input
            type="text"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={handleStartBlur}
            className="w-16 px-2 py-1 rounded text-center font-mono"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <label className="flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
          End:
          <input
            type="text"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={handleEndBlur}
            className="w-16 px-2 py-1 rounded text-center font-mono"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <span style={{ color: "var(--text-muted)" }}>
          Selection: {formatTime(endTime - startTime)}
        </span>
      </div>
    </div>
  );
}
