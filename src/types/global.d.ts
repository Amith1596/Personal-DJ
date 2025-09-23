// Allows window.webkitAudioContext without using `any`
declare global {
  interface Window {
    webkitAudioContext?: { new (): AudioContext };
  }
}
export {};
