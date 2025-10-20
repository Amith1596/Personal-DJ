// src/types/dom-augmentations.d.ts
export {};

declare global {
  interface Window {
    // Old Safari prefix; matches the standard constructor type.
    webkitAudioContext?: typeof AudioContext;
  }
}
