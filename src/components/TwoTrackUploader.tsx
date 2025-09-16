'use client';
import { useEffect, useState, useRef } from 'react';

export default function TwoTrackUploader() {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [urlA, setUrlA] = useState<string | null>(null);
  const [urlB, setUrlB] = useState<string | null>(null);

  // Refs for file inputs
  const inputARef = useRef<HTMLInputElement | null>(null);
  const inputBRef = useRef<HTMLInputElement | null>(null);

  // Create object URL for file A
  useEffect(() => {
    if (!fileA) return setUrlA(null);
    const u = URL.createObjectURL(fileA);
    setUrlA(u);
    return () => URL.revokeObjectURL(u);
  }, [fileA]);

  // Create object URL for file B
  useEffect(() => {
    if (!fileB) return setUrlB(null);
    const u = URL.createObjectURL(fileB);
    setUrlB(u);
    return () => URL.revokeObjectURL(u);
  }, [fileB]);

  return (
    <div className="space-y-6">
      {/* Track A */}
      <div className="p-4 border rounded-xl bg-white/5 hover:bg-white/10 transition">
        <label className="block text-sm font-semibold mb-2">🎵 Track A</label>
        <input
          ref={inputARef}
          type="file"
          accept="audio/*"
          onChange={(e) => setFileA(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-300 
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-lg file:border-0
                     file:text-sm file:font-semibold
                     file:bg-indigo-600 file:text-white
                     hover:file:bg-indigo-700"
        />
        {fileA && urlA && (
          <>
            <p className="text-sm mt-2 text-gray-400">Selected: {fileA.name}</p>
            {urlA && <audio src={urlA} controls className="w-full mt-2 rounded-lg" />}
            <button
              onClick={() => {
                setFileA(null);
                if (inputARef.current) inputARef.current.value = '';
              }}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              Clear Track A
            </button>
          </>
        )}
      </div>

      {/* Track B */}
      <div className="p-4 border rounded-xl bg-white/5 hover:bg-white/10 transition">
        <label className="block text-sm font-semibold mb-2">🎵 Track B</label>
        <input
          ref={inputBRef}
          type="file"
          accept="audio/*"
          onChange={(e) => setFileB(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-300 
                     file:mr-4 file:py-2 file:px-4
                     file:rounded-lg file:border-0
                     file:text-sm file:font-semibold
                     file:bg-pink-600 file:text-white
                     hover:file:bg-pink-700"
        />
        {fileB && urlB &&(
          <>
            <p className="text-sm mt-2 text-gray-400">Selected: {fileB.name}</p>
            {urlB && <audio src={urlB} controls className="w-full mt-2 rounded-lg" />}
            <button
              onClick={() => {
                setFileB(null);
                if (inputBRef.current) inputBRef.current.value = '';
              }}
              className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
            >
              Clear Track B
            </button>
          </>
        )}
      </div>
    </div>
  );
}
