"use client";

interface TimelineEntry {
  name: string;
  duration: number; // seconds
}

interface ChainTimelineProps {
  songs: TimelineEntry[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ChainTimeline({ songs }: ChainTimelineProps) {
  if (songs.length === 0) return null;

  const total = songs.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Chain Timeline
        </span>
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          Total: {formatTime(total)}
        </span>
      </div>

      <div className="flex h-6 rounded overflow-hidden gap-px">
        {songs.map((song, i) => {
          const pct = total > 0 ? (song.duration / total) * 100 : 0;
          const colors = [
            "var(--primary)",
            "var(--accent)",
            "#22C55E",
            "#FBBF24",
            "#8B5CF6",
          ];
          return (
            <div
              key={i}
              className="flex items-center justify-center text-xs font-mono truncate"
              style={{
                width: `${pct}%`,
                minWidth: "20px",
                background: colors[i % colors.length],
                color: "white",
                fontSize: "10px",
              }}
              title={`${song.name} (${formatTime(song.duration)})`}
            >
              {i + 1}
            </div>
          );
        })}
      </div>
    </div>
  );
}
