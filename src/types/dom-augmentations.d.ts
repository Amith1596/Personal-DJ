// src/types/dom-augmentations.d.ts
export {};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;

    // Essentia slots — typed as unknown so we don't use `any`
    Essentia?: unknown;
    EssentiaWASM?: unknown;
  }
}
