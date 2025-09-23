declare module "web-audio-beat-detector" {
  export function guess(
    audioBuffer: AudioBuffer
  ): Promise<number>;
}
