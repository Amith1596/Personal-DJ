declare module "music-tempo" {
  export default class MusicTempo {
    tempo: number;
    beatInterval: number;
    beats: number[];

    constructor(samples: number[] | { peaks: number[]; sampleRate: number });
  }
}
