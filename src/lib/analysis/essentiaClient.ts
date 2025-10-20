/**
 * Essentia.js WASM client with lazy loading
 * Provides audio analysis capabilities: BPM, beats, key, chroma, onsets, RMS
 */

import { get, set } from 'idb-keyval';

// Types for Essentia analysis results
export interface EssentiaAnalysisResult {
  bpm: number;
  beats: number[];
  key: {
    tonic: string;
    scale: string;
    confidence: number;
  };
  chromaFrames: Float32Array;
  onsets: number[];
  rms: Float32Array;
  sampleRate: number;
}

// Singleton instance
let essentiaInstance: unknown = null;
let isLoading = false;
let loadPromise: Promise<unknown> | null = null;

/**
 * Lazy-load Essentia.js WASM module
 * Uses IndexedDB cache to avoid re-downloading WASM files
 */
async function loadEssentia(): Promise<unknown> {
  if (essentiaInstance) {
    return essentiaInstance;
  }

  if (isLoading && loadPromise) {
    return loadPromise;
  }

  isLoading = true;
  loadPromise = (async () => {
    try {
      // Check cache first
      const cached = await get('essentia-wasm-cache');
      if (cached && cached.timestamp > Date.now() - 24 * 60 * 60 * 1000) { // 24h cache
        console.log('📦 Using cached Essentia.js WASM');
        return cached.essentia;
      }

      console.log('🔄 Loading Essentia.js WASM...');
      
      // Dynamic import with lazy loading
      const EssentiaWASM = await import('essentia.js') as { Essentia: unknown; EssentiaWASM: unknown };
      
      // Initialize Essentia with WASM
      const EssentiaClass = EssentiaWASM.Essentia as new (wasm: unknown, debug?: boolean) => unknown;
      const essentia = new EssentiaClass(EssentiaWASM.EssentiaWASM, false);
      
      // Cache the instance
      await set('essentia-wasm-cache', {
        essentia,
        timestamp: Date.now()
      });
      
      console.log('✅ Essentia.js WASM loaded successfully');
      return essentia;
    } catch (error: unknown) {
      console.error('❌ Failed to load Essentia.js:', error);
      throw new Error(`Essentia.js loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      isLoading = false;
    }
  })();

  essentiaInstance = await loadPromise;
  return essentiaInstance;
}

/**
 * Analyze an AudioBuffer using Essentia.js
 * Returns comprehensive analysis including BPM, beats, key, chroma, onsets, RMS
 */
export async function analyzeBuffer(audioBuffer: AudioBuffer): Promise<EssentiaAnalysisResult> {
  const essentia = await loadEssentia();
  
  // Convert to mono for analysis
  const monoData = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < channelData.length; i++) {
      monoData[i] += channelData[i] / audioBuffer.numberOfChannels;
    }
  }

  const sampleRate = audioBuffer.sampleRate;
  
  try {
    // Cast essentia to any for method calls (we know the interface from our type declaration)
    const essentiaAny = essentia as Record<string, (data: Float32Array, sampleRate: number) => Record<string, unknown>>;
    
    // 1. BPM Detection using RhythmExtractor
    const rhythmResult = essentiaAny.RhythmExtractor(monoData, sampleRate);
    const bpm = Math.round((rhythmResult.bpm as number) || 120);
    
    // 2. Beat tracking
    const beatTrackerResult = essentiaAny.BeatTrackerMultiFeature(monoData, sampleRate);
    const beats = Array.from((beatTrackerResult.ticks as number[]) || []);
    
    // 3. Key detection using KeyExtractor (if available) or HPCP + heuristic
    let keyResult: { tonic: string; scale: string; confidence: number };
    try {
      const keyExtractorResult = essentiaAny.KeyExtractor(monoData, sampleRate);
      keyResult = {
        tonic: (keyExtractorResult.key as string) || 'C',
        scale: (keyExtractorResult.scale as string) || 'major',
        confidence: (keyExtractorResult.strength as number) || 0.5
      };
    } catch {
      // Fallback: Use HPCP + simple heuristic
      console.warn('KeyExtractor not available, using HPCP fallback');
      const hpcpResult = essentiaAny.HPCP(monoData, sampleRate);
      keyResult = estimateKeyFromHPCP(hpcpResult.hpcp as Float32Array);
    }
    
    // 4. Chroma features (HPCP)
    const hpcpResult = essentiaAny.HPCP(monoData, sampleRate);
    const chromaFrames = new Float32Array(hpcpResult.hpcp as Float32Array);
    
    // 5. Onset detection
    const onsetResult = essentiaAny.OnsetRate(monoData, sampleRate);
    const onsets = Array.from((onsetResult.onsets as number[]) || []);
    
    // 6. RMS energy
    const rmsResult = essentiaAny.RMS(monoData, sampleRate);
    const rms = new Float32Array(rmsResult.rms as Float32Array);
    
    return {
      bpm,
      beats,
      key: keyResult,
      chromaFrames,
      onsets,
      rms,
      sampleRate
    };
    
  } catch (error: unknown) {
    console.error('Essentia analysis failed:', error);
    throw new Error(`Audio analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Simple key estimation from HPCP using circle of fifths
 * This is a fallback when KeyExtractor is not available
 */
function estimateKeyFromHPCP(hpcp: Float32Array): { tonic: string; scale: string; confidence: number } {
  // Simple heuristic: find the strongest HPCP bin
  let maxBin = 0;
  let maxValue = 0;
  
  for (let i = 0; i < hpcp.length; i++) {
    if (hpcp[i] > maxValue) {
      maxValue = hpcp[i];
      maxBin = i;
    }
  }
  
  // Map HPCP bin to key (simplified)
  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const tonic = keys[maxBin % 12];
  
  // TODO: Implement proper scale detection from HPCP
  // For now, default to major
  return {
    tonic,
    scale: 'major',
    confidence: Math.min(maxValue, 1.0)
  };
}

/**
 * Get loading status for UI feedback
 */
export function getEssentiaLoadingStatus(): { isLoading: boolean; isLoaded: boolean } {
  return {
    isLoading,
    isLoaded: !!essentiaInstance
  };
}

/**
 * Clear Essentia cache (useful for development)
 */
export async function clearEssentiaCache(): Promise<void> {
  await set('essentia-wasm-cache', null);
  essentiaInstance = null;
  isLoading = false;
  loadPromise = null;
}
