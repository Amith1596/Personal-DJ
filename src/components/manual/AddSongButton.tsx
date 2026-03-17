"use client";

import { useRef } from "react";

interface AddSongButtonProps {
  onAdd: (file: File) => void;
  disabled: boolean;
  songCount: number;
}

export default function AddSongButton({ onAdd, disabled, songCount }: AddSongButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAdd(file);
      // Reset so same file can be selected again
      e.target.value = "";
    }
  };

  return (
    <div className="flex justify-center">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        className="text-sm px-4 py-2 rounded-lg transition-colors"
        style={{
          background: disabled ? "var(--disabled-bg)" : "var(--bg-card)",
          color: disabled ? "var(--disabled-text)" : "var(--text-secondary)",
          border: `1px dashed ${disabled ? "var(--border-subtle)" : "var(--border-strong)"}`,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        + Add Song ({songCount}/5)
      </button>
    </div>
  );
}
