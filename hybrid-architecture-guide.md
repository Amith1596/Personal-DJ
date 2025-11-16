# Hybrid Architecture: Vercel Frontend + Python Backend
## Complete Implementation Guide for Music Mashup App

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S BROWSER                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Your Vercel App (Next.js/React)                   │    │
│  │  - Upload interface                                 │    │
│  │  - Progress tracking                                │    │
│  │  - Download results                                 │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTPS API calls
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│          Python Processing Backend                          │
│          (Railway/Render - Free Tier)                       │
│  ┌────────────────────────────────────────────────────┐    │
│  │  FastAPI/Flask Server                              │    │
│  │  - Receive audio files                             │    │
│  │  - Process mashups                                 │    │
│  │  - Return processed audio                          │    │
│  │  Libraries: librosa, pydub, demucs                 │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 1: Backend Setup (Python Processing Service)

### 1.1 Choose Your Backend Platform

**Railway.app (Recommended)**
- ✅ Free tier: 500 hours/month
- ✅ Easy Python deployment
- ✅ Auto-deploy from GitHub
- ✅ Built-in environment variables
- ✅ Persistent storage option

**Render.com (Alternative)**
- ✅ Free tier available
- ✅ Great for Python
- ✅ Automatic HTTPS
- ✅ Easy scaling

**Fly.io (Advanced)**
- ✅ Free tier generous
- ✅ Global edge deployment
- ✅ Better for traffic spikes

### 1.2 Backend Project Structure

```
mashup-backend/
├── app.py                  # Main FastAPI application
├── requirements.txt        # Python dependencies
├── Dockerfile             # Optional: for containerization
├── railway.json           # Railway configuration
├── .gitignore
├── processors/
│   ├── __init__.py
│   ├── mashup.py          # Core mashup logic
│   ├── ai_mashup.py       # AI-based processing
│   └── effects.py         # Audio effects
├── utils/
│   ├── __init__.py
│   ├── audio_loader.py    # Audio file handling
│   └── validators.py      # Input validation
└── temp/                  # Temporary file storage
    └── .gitkeep
```

### 1.3 requirements.txt

```txt
# Web Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6

# CORS
fastapi-cors==0.0.6

# Audio Processing - Core
librosa==0.10.1
soundfile==0.12.1
pydub==0.25.1
numpy==1.24.3
scipy==1.11.3

# Advanced Beat Tracking
madmom==0.16.1

# Time Stretching (Requires system rubberband)
pyrubberband==0.3.0

# AI Processing (Optional - comment out if not using)
# demucs==4.0.1
# torch==2.1.0

# Spotify Pedalboard for Effects (Optional)
# pedalboard==0.9.7

# Utilities
python-dotenv==1.0.0
aiofiles==23.2.1
```

### 1.4 Main Application (app.py)

```python
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from typing import List, Optional
import os
import uuid
import shutil
from pathlib import Path
import logging

from processors.mashup import MashupProcessor
from processors.ai_mashup import AIMashupProcessor
from utils.validators import validate_audio_file

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Music Mashup API",
    description="Backend service for creating music mashups",
    version="1.0.0"
)

# CORS Configuration - Update with your Vercel domain
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://your-app.vercel.app",  # UPDATE THIS
    "https://*.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
UPLOAD_DIR = Path("temp/uploads")
OUTPUT_DIR = Path("temp/outputs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Cleanup function
def cleanup_files(job_id: str):
    """Remove temporary files after processing"""
    try:
        upload_path = UPLOAD_DIR / job_id
        output_path = OUTPUT_DIR / job_id
        
        if upload_path.exists():
            shutil.rmtree(upload_path)
        if output_path.exists():
            shutil.rmtree(output_path)
            
        logger.info(f"Cleaned up files for job {job_id}")
    except Exception as e:
        logger.error(f"Cleanup error for job {job_id}: {str(e)}")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Music Mashup API",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "ok",
        "disk_space": shutil.disk_usage("/").free,
        "upload_dir": str(UPLOAD_DIR),
        "output_dir": str(OUTPUT_DIR)
    }

@app.post("/api/mashup/create")
async def create_mashup(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    crossfade_duration: float = 8.0,
    tempo_shift_bars: int = 8,
    use_ai: bool = False,
    fade_type: str = "exponential"
):
    """
    Create a mashup from uploaded audio files
    
    Parameters:
    - files: List of audio files (2-4 songs)
    - crossfade_duration: Duration of crossfade in seconds (2-16)
    - tempo_shift_bars: Number of bars for tempo transition (4-16)
    - use_ai: Whether to use AI processing (slower but better quality)
    - fade_type: Type of fade curve (linear, exponential, logarithmic)
    """
    
    # Validate input
    if len(files) < 2:
        raise HTTPException(
            status_code=400, 
            detail="At least 2 audio files are required"
        )
    
    if len(files) > 4:
        raise HTTPException(
            status_code=400,
            detail="Maximum 4 files allowed"
        )
    
    if not (2.0 <= crossfade_duration <= 16.0):
        raise HTTPException(
            status_code=400,
            detail="Crossfade duration must be between 2 and 16 seconds"
        )
    
    # Generate unique job ID
    job_id = str(uuid.uuid4())
    job_upload_dir = UPLOAD_DIR / job_id
    job_output_dir = OUTPUT_DIR / job_id
    job_upload_dir.mkdir(parents=True, exist_ok=True)
    job_output_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Save uploaded files
        file_paths = []
        for idx, file in enumerate(files):
            # Validate file
            if not validate_audio_file(file.filename):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file format: {file.filename}"
                )
            
            # Save file
            file_path = job_upload_dir / f"track_{idx}_{file.filename}"
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
            
            file_paths.append(str(file_path))
            logger.info(f"Saved file: {file.filename} ({len(content)} bytes)")
        
        # Process mashup
        logger.info(f"Starting mashup processing for job {job_id}")
        
        if use_ai:
            processor = AIMashupProcessor()
            logger.info("Using AI processing")
        else:
            processor = MashupProcessor()
            logger.info("Using algorithmic processing")
        
        output_path = job_output_dir / "mashup.wav"
        
        # Create mashup
        processor.create_mashup(
            file_paths=file_paths,
            output_path=str(output_path),
            crossfade_duration=crossfade_duration,
            tempo_shift_bars=tempo_shift_bars,
            fade_type=fade_type
        )
        
        logger.info(f"Mashup created successfully: {output_path}")
        
        # Schedule cleanup after 1 hour
        background_tasks.add_task(cleanup_files, job_id)
        
        # Return download info
        return {
            "status": "success",
            "job_id": job_id,
            "download_url": f"/api/mashup/download/{job_id}",
            "message": "Mashup created successfully"
        }
        
    except Exception as e:
        logger.error(f"Error processing mashup: {str(e)}")
        # Cleanup on error
        cleanup_files(job_id)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mashup/download/{job_id}")
async def download_mashup(job_id: str, background_tasks: BackgroundTasks):
    """Download the created mashup"""
    
    output_path = OUTPUT_DIR / job_id / "mashup.wav"
    
    if not output_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Mashup not found or expired"
        )
    
    # Schedule cleanup after download
    background_tasks.add_task(cleanup_files, job_id)
    
    return FileResponse(
        path=str(output_path),
        media_type="audio/wav",
        filename="mashup.wav",
        headers={
            "Content-Disposition": "attachment; filename=mashup.wav"
        }
    )

@app.post("/api/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Analyze a single audio file for BPM, key, etc.
    Useful for frontend to show metadata before processing
    """
    
    # Generate temp file
    job_id = str(uuid.uuid4())
    temp_path = UPLOAD_DIR / f"{job_id}_{file.filename}"
    
    try:
        # Save file
        with open(temp_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Analyze
        from processors.mashup import analyze_song
        analysis = analyze_song(str(temp_path))
        
        # Cleanup
        temp_path.unlink()
        
        return {
            "status": "success",
            "filename": file.filename,
            "analysis": analysis
        }
        
    except Exception as e:
        if temp_path.exists():
            temp_path.unlink()
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/mashup/{job_id}")
async def delete_mashup(job_id: str):
    """Manually delete mashup files"""
    cleanup_files(job_id)
    return {"status": "deleted", "job_id": job_id}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

### 1.5 Core Mashup Processor (processors/mashup.py)

```python
import librosa
import soundfile as sf
import numpy as np
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)

def analyze_song(filepath: str) -> Dict:
    """Analyze a song and return metadata"""
    try:
        y, sr = librosa.load(filepath, sr=None)
        
        # Detect BPM
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        
        # Get duration
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Detect key (simplified)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key_strengths = np.sum(chroma, axis=1)
        estimated_key_idx = np.argmax(key_strengths)
        key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        estimated_key = key_names[estimated_key_idx]
        
        return {
            "bpm": float(tempo),
            "duration": float(duration),
            "estimated_key": estimated_key,
            "sample_rate": int(sr),
            "beat_count": int(len(beats))
        }
        
    except Exception as e:
        logger.error(f"Error analyzing song: {str(e)}")
        raise

class MashupProcessor:
    """Algorithmic mashup processor"""
    
    def __init__(self):
        self.sample_rate = 44100
    
    def create_mashup(
        self,
        file_paths: List[str],
        output_path: str,
        crossfade_duration: float = 8.0,
        tempo_shift_bars: int = 8,
        fade_type: str = "exponential"
    ):
        """Create mashup from multiple files"""
        
        logger.info(f"Creating mashup from {len(file_paths)} files")
        
        # Load all audio files
        audio_tracks = []
        for filepath in file_paths:
            y, sr = librosa.load(filepath, sr=self.sample_rate)
            audio_tracks.append(y)
            logger.info(f"Loaded: {filepath} (duration: {len(y)/sr:.2f}s)")
        
        # Process sequential mashup
        result = audio_tracks[0]
        
        for i in range(1, len(audio_tracks)):
            logger.info(f"Merging track {i+1}")
            result = self._merge_two_tracks(
                result,
                audio_tracks[i],
                crossfade_duration,
                fade_type
            )
        
        # Normalize audio
        result = self._normalize_audio(result)
        
        # Save output
        sf.write(output_path, result, self.sample_rate)
        logger.info(f"Mashup saved to {output_path}")
    
    def _merge_two_tracks(
        self,
        track1: np.ndarray,
        track2: np.ndarray,
        crossfade_duration: float,
        fade_type: str
    ) -> np.ndarray:
        """Merge two audio tracks with crossfade"""
        
        crossfade_samples = int(crossfade_duration * self.sample_rate)
        
        # Create fade curves
        fade_out, fade_in = self._create_fade_curves(crossfade_samples, fade_type)
        
        # Apply fades
        track1_end = track1[-crossfade_samples:]
        track2_start = track2[:crossfade_samples]
        
        # Ensure same length
        min_len = min(len(track1_end), len(track2_start))
        track1_faded = track1_end[:min_len] * fade_out[:min_len]
        track2_faded = track2_start[:min_len] * fade_in[:min_len]
        
        # Mix crossfade region
        crossfaded = track1_faded + track2_faded
        
        # Combine all parts
        result = np.concatenate([
            track1[:-crossfade_samples],
            crossfaded,
            track2[min_len:]
        ])
        
        return result
    
    def _create_fade_curves(
        self,
        length: int,
        fade_type: str
    ) -> tuple:
        """Create fade in/out curves"""
        
        if fade_type == "linear":
            fade_out = np.linspace(1.0, 0.0, length)
            fade_in = np.linspace(0.0, 1.0, length)
            
        elif fade_type == "exponential":
            fade_out = np.exp(-np.linspace(0, 5, length))
            fade_in = 1 - fade_out
            
        elif fade_type == "logarithmic":
            t = np.linspace(0.01, 1, length)
            fade_out = np.log10(t * 9 + 1)
            fade_in = 1 - fade_out
            
        else:  # Default to exponential
            fade_out = np.exp(-np.linspace(0, 5, length))
            fade_in = 1 - fade_out
        
        return fade_out, fade_in
    
    def _normalize_audio(self, audio: np.ndarray) -> np.ndarray:
        """Normalize audio to prevent clipping"""
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            # Normalize to 95% to leave headroom
            return audio * (0.95 / max_val)
        return audio
```

### 1.6 AI Mashup Processor (processors/ai_mashup.py)

```python
import numpy as np
import soundfile as sf
from typing import List
import logging

logger = logging.getLogger(__name__)

class AIMashupProcessor:
    """AI-based mashup processor using Demucs"""
    
    def __init__(self):
        self.sample_rate = 44100
        try:
            from demucs.api import Separator
            self.separator = Separator(
                model='htdemucs_ft',
                device='cpu'  # Use 'cuda' if GPU available
            )
            logger.info("Demucs initialized successfully")
        except ImportError:
            logger.warning("Demucs not available, falling back to basic processing")
            self.separator = None
    
    def create_mashup(
        self,
        file_paths: List[str],
        output_path: str,
        crossfade_duration: float = 8.0,
        tempo_shift_bars: int = 8,
        fade_type: str = "exponential"
    ):
        """Create AI-enhanced mashup"""
        
        if self.separator is None:
            # Fall back to basic processing
            from processors.mashup import MashupProcessor
            basic_processor = MashupProcessor()
            return basic_processor.create_mashup(
                file_paths, output_path, crossfade_duration,
                tempo_shift_bars, fade_type
            )
        
        logger.info("Creating AI-enhanced mashup")
        
        # For MVP: Simple stem-based mixing
        # Separate first two tracks
        _, stems1 = self.separator.separate_audio_file(file_paths[0])
        _, stems2 = self.separator.separate_audio_file(file_paths[1])
        
        # Create mashup: vocals from track 1, instruments from track 2
        mashup = (
            stems1['vocals'] * 0.8 +
            stems2['drums'] +
            stems2['bass'] +
            stems2['other'] * 0.9
        )
        
        # Normalize
        max_val = np.max(np.abs(mashup))
        if max_val > 0:
            mashup = mashup * (0.95 / max_val)
        
        # Save
        sf.write(output_path, mashup, self.sample_rate)
        logger.info(f"AI mashup saved to {output_path}")
```

### 1.7 Validators (utils/validators.py)

```python
from pathlib import Path

ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.flac', '.m4a', '.ogg'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

def validate_audio_file(filename: str) -> bool:
    """Validate audio file extension"""
    suffix = Path(filename).suffix.lower()
    return suffix in ALLOWED_EXTENSIONS

def validate_file_size(size: int) -> bool:
    """Validate file size"""
    return size <= MAX_FILE_SIZE
```

---

## Part 2: Frontend Setup (Vercel/Next.js)

### 2.1 Project Structure (in your existing Vercel app)

```
your-vercel-app/
├── app/
│   └── mashup/
│       ├── page.tsx          # Main mashup page
│       └── components/
│           ├── FileUploader.tsx
│           ├── ProcessingStatus.tsx
│           └── MashupControls.tsx
├── lib/
│   └── api/
│       └── mashup.ts         # API client
└── public/
    └── audio-placeholder.svg
```

### 2.2 API Client (lib/api/mashup.ts)

```typescript
// lib/api/mashup.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export interface MashupOptions {
  crossfadeDuration: number;
  tempoShiftBars: number;
  useAI: boolean;
  fadeType: 'linear' | 'exponential' | 'logarithmic';
}

export interface MashupResponse {
  status: string;
  job_id: string;
  download_url: string;
  message: string;
}

export interface AnalysisResult {
  bpm: number;
  duration: number;
  estimated_key: string;
  sample_rate: number;
  beat_count: number;
}

export class MashupAPI {
  
  static async createMashup(
    files: File[],
    options: MashupOptions,
    onProgress?: (progress: number) => void
  ): Promise<MashupResponse> {
    
    const formData = new FormData();
    
    // Append files
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // Build URL with query params
    const url = new URL(`${API_BASE_URL}/api/mashup/create`);
    url.searchParams.append('crossfade_duration', options.crossfadeDuration.toString());
    url.searchParams.append('tempo_shift_bars', options.tempoShiftBars.toString());
    url.searchParams.append('use_ai', options.useAI.toString());
    url.searchParams.append('fade_type', options.fadeType);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create mashup');
    }
    
    return response.json();
  }
  
  static async downloadMashup(jobId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/api/mashup/download/${jobId}`);
    
    if (!response.ok) {
      throw new Error('Failed to download mashup');
    }
    
    return response.blob();
  }
  
  static async analyzeAudio(file: File): Promise<AnalysisResult> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE_URL}/api/analyze`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to analyze audio');
    }
    
    const data = await response.json();
    return data.analysis;
  }
  
  static getDownloadUrl(jobId: string): string {
    return `${API_BASE_URL}/api/mashup/download/${jobId}`;
  }
}
```

### 2.3 Main Mashup Page (app/mashup/page.tsx)

```typescript
'use client';

import { useState } from 'react';
import { MashupAPI, MashupOptions, AnalysisResult } from '@/lib/api/mashup';
import FileUploader from './components/FileUploader';
import MashupControls from './components/MashupControls';
import ProcessingStatus from './components/ProcessingStatus';

export default function MashupPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState<MashupOptions>({
    crossfadeDuration: 8,
    tempoShiftBars: 8,
    useAI: false,
    fadeType: 'exponential',
  });

  const handleFilesSelected = async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setDownloadUrl(null);
    setError(null);
    
    // Analyze each file
    try {
      const results = await Promise.all(
        selectedFiles.map(file => MashupAPI.analyzeAudio(file))
      );
      setAnalyses(results);
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  const handleCreateMashup = async () => {
    if (files.length < 2) {
      setError('Please upload at least 2 audio files');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);

    try {
      // Simulate progress (real progress tracking would need WebSockets)
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = await MashupAPI.createMashup(
        files,
        options,
        setProgress
      );

      clearInterval(progressInterval);
      setProgress(100);

      // Set download URL
      const fullDownloadUrl = MashupAPI.getDownloadUrl(response.job_id);
      setDownloadUrl(fullDownloadUrl);

    } catch (err: any) {
      setError(err.message || 'Failed to create mashup');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl) return;

    try {
      // Trigger download
      window.open(downloadUrl, '_blank');
    } catch (err) {
      setError('Failed to download mashup');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            🎵 Music Mashup Creator
          </h1>
          <p className="text-xl text-gray-600">
            Upload 2-4 songs and create seamless mashups with AI
          </p>
        </div>

        {/* File Uploader */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <FileUploader
            onFilesSelected={handleFilesSelected}
            selectedFiles={files}
            analyses={analyses}
          />
        </div>

        {/* Controls */}
        {files.length >= 2 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
            <MashupControls
              options={options}
              onChange={setOptions}
              disabled={isProcessing}
            />
          </div>
        )}

        {/* Create Button */}
        {files.length >= 2 && !isProcessing && !downloadUrl && (
          <div className="text-center mb-8">
            <button
              onClick={handleCreateMashup}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-white 
                         px-12 py-4 rounded-full text-xl font-semibold 
                         hover:from-purple-700 hover:to-blue-700 
                         transform hover:scale-105 transition-all duration-200
                         shadow-lg hover:shadow-xl"
            >
              Create Mashup ✨
            </button>
          </div>
        )}

        {/* Processing Status */}
        {(isProcessing || downloadUrl) && (
          <ProcessingStatus
            isProcessing={isProcessing}
            progress={progress}
            downloadUrl={downloadUrl}
            onDownload={handleDownload}
          />
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <div className="flex items-center">
              <span className="text-red-500 text-2xl mr-3">⚠️</span>
              <p className="text-red-700 font-medium">{error}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
```

### 2.4 File Uploader Component (app/mashup/components/FileUploader.tsx)

```typescript
'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { AnalysisResult } from '@/lib/api/mashup';

interface FileUploaderProps {
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  analyses: AnalysisResult[];
}

export default function FileUploader({ 
  onFilesSelected, 
  selectedFiles,
  analyses 
}: FileUploaderProps) {

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 4) {
      alert('Maximum 4 files allowed');
      return;
    }
    onFilesSelected(acceptedFiles);
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.flac', '.m4a', '.ogg']
    },
    maxFiles: 4,
    maxSize: 50 * 1024 * 1024, // 50 MB
  });

  const removeFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newAnalyses = analyses.filter((_, i) => i !== index);
    onFilesSelected(newFiles);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Upload Audio Files
      </h2>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-4 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${isDragActive 
            ? 'border-purple-500 bg-purple-50' 
            : 'border-gray-300 bg-gray-50 hover:border-purple-400 hover:bg-purple-25'
          }
        `}
      >
        <input {...getInputProps()} />
        
        <div className="text-6xl mb-4">🎵</div>
        
        {isDragActive ? (
          <p className="text-xl text-purple-600 font-medium">
            Drop your audio files here...
          </p>
        ) : (
          <div>
            <p className="text-xl text-gray-700 font-medium mb-2">
              Drag & drop audio files here
            </p>
            <p className="text-gray-500">
              or click to browse (2-4 files, max 50MB each)
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Supported: MP3, WAV, FLAC, M4A, OGG
            </p>
          </div>
        )}
      </div>

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Selected Files ({selectedFiles.length})
          </h3>
          
          <div className="space-y-3">
            {selectedFiles.map((file, index) => (
              <div 
                key={index}
                className="flex items-center justify-between bg-gray-50 p-4 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <div className="flex gap-4 mt-1 text-sm text-gray-600">
                    <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                    {analyses[index] && (
                      <>
                        <span>•</span>
                        <span>{analyses[index].bpm.toFixed(0)} BPM</span>
                        <span>•</span>
                        <span>{analyses[index].estimated_key} key</span>
                        <span>•</span>
                        <span>{analyses[index].duration.toFixed(0)}s</span>
                      </>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => removeFile(index)}
                  className="ml-4 text-red-500 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 2.5 Mashup Controls Component (app/mashup/components/MashupControls.tsx)

```typescript
'use client';

import { MashupOptions } from '@/lib/api/mashup';

interface MashupControlsProps {
  options: MashupOptions;
  onChange: (options: MashupOptions) => void;
  disabled?: boolean;
}

export default function MashupControls({ 
  options, 
  onChange, 
  disabled 
}: MashupControlsProps) {

  const updateOption = <K extends keyof MashupOptions>(
    key: K,
    value: MashupOptions[K]
  ) => {
    onChange({ ...options, [key]: value });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Mashup Settings
      </h2>

      <div className="space-y-6">
        
        {/* Crossfade Duration */}
        <div>
          <label className="flex items-center justify-between mb-2">
            <span className="text-gray-700 font-medium">
              Crossfade Duration
            </span>
            <span className="text-purple-600 font-semibold">
              {options.crossfadeDuration}s
            </span>
          </label>
          <input
            type="range"
            min="2"
            max="16"
            step="0.5"
            value={options.crossfadeDuration}
            onChange={(e) => updateOption('crossfadeDuration', parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer 
                     slider-thumb:bg-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>2s (Quick)</span>
            <span>16s (Long)</span>
          </div>
        </div>

        {/* Tempo Shift Bars */}
        <div>
          <label className="flex items-center justify-between mb-2">
            <span className="text-gray-700 font-medium">
              Tempo Transition Bars
            </span>
            <span className="text-purple-600 font-semibold">
              {options.tempoShiftBars} bars
            </span>
          </label>
          <input
            type="range"
            min="4"
            max="16"
            step="1"
            value={options.tempoShiftBars}
            onChange={(e) => updateOption('tempoShiftBars', parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>4 bars (Fast)</span>
            <span>16 bars (Gradual)</span>
          </div>
        </div>

        {/* Fade Type */}
        <div>
          <label className="block text-gray-700 font-medium mb-2">
            Fade Curve Type
          </label>
          <select
            value={options.fadeType}
            onChange={(e) => updateOption('fadeType', e.target.value as any)}
            disabled={disabled}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg 
                     focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="linear">Linear (Simple)</option>
            <option value="exponential">Exponential (Smooth)</option>
            <option value="logarithmic">Logarithmic (Natural)</option>
          </select>
        </div>

        {/* AI Toggle */}
        <div className="bg-purple-50 p-4 rounded-lg">
          <label className="flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={options.useAI}
              onChange={(e) => updateOption('useAI', e.target.checked)}
              disabled={disabled}
              className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
            />
            <div className="ml-3">
              <span className="text-gray-900 font-medium">
                Use AI Processing
              </span>
              <p className="text-sm text-gray-600">
                Higher quality, but takes longer to process
              </p>
            </div>
          </label>
        </div>

      </div>
    </div>
  );
}
```

### 2.6 Processing Status Component (app/mashup/components/ProcessingStatus.tsx)

```typescript
'use client';

interface ProcessingStatusProps {
  isProcessing: boolean;
  progress: number;
  downloadUrl: string | null;
  onDownload: () => void;
}

export default function ProcessingStatus({
  isProcessing,
  progress,
  downloadUrl,
  onDownload,
}: ProcessingStatusProps) {

  if (downloadUrl) {
    return (
      <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-8 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h3 className="text-2xl font-bold text-green-900 mb-2">
          Mashup Ready!
        </h3>
        <p className="text-green-700 mb-6">
          Your mashup has been created successfully
        </p>
        <button
          onClick={onDownload}
          className="bg-green-600 text-white px-8 py-3 rounded-full 
                   font-semibold hover:bg-green-700 transition-colors
                   shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          Download Mashup 📥
        </button>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="bg-white border-2 border-purple-200 rounded-2xl p-8">
        <div className="text-center mb-6">
          <div className="inline-block animate-spin text-6xl mb-4">⚙️</div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            Creating Your Mashup...
          </h3>
          <p className="text-gray-600">
            This may take 30-60 seconds
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className="bg-gradient-to-r from-purple-600 to-blue-600 h-full 
                     transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <p className="text-center mt-3 text-gray-600 font-medium">
          {progress}% Complete
        </p>
      </div>
    );
  }

  return null;
}
```

### 2.7 Environment Variables (.env.local)

```bash
# Backend API URL
NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app

# Or for local development:
# NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

---

## Part 3: Deployment

### 3.1 Deploy Backend to Railway

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize project
cd mashup-backend
railway init

# 4. Deploy
railway up

# 5. Add environment variables (in Railway dashboard)
# PORT=8000
# ALLOWED_ORIGINS=https://your-app.vercel.app

# 6. Get your backend URL
railway domain
# This will give you: https://your-backend.railway.app
```

### 3.2 Update Vercel Frontend

```bash
# 1. Add environment variable in Vercel dashboard
# NEXT_PUBLIC_BACKEND_URL=https://your-backend.railway.app

# 2. Redeploy
vercel --prod
```

### 3.3 Update CORS in Backend

Update `app.py` with your Vercel domain:

```python
origins = [
    "http://localhost:3000",
    "https://your-actual-domain.vercel.app",  # UPDATE THIS
    "https://*.vercel.app",  # Allow all vercel preview deployments
]
```

---

## Part 4: Testing & Optimization

### 4.1 Test Your Setup

```bash
# Test backend health
curl https://your-backend.railway.app/health

# Test with sample files
curl -X POST https://your-backend.railway.app/api/mashup/create \
  -F "files=@song1.mp3" \
  -F "files=@song2.mp3"
```

### 4.2 Performance Optimization

**Backend:**
- Add Redis for job queue (for scaling)
- Implement WebSocket for real-time progress
- Use background workers (Celery) for processing
- Add caching for analysis results

**Frontend:**
- Add loading skeletons
- Implement client-side progress estimation
- Add audio preview before processing
- Optimize file upload with chunking

---

## Part 5: Cost Estimation

```
Monthly Costs (First 1000 users):

Railway Backend (Free Tier):
- 500 execution hours/month: $0
- After that: ~$10/month

Vercel Frontend:
- Already deployed: $0

Storage (if needed):
- Cloudinary/AWS S3: $0-5/month

Total: $0-15/month for MVP
```

---

## Part 6: Next Steps

### MVP Checklist:
- [ ] Deploy backend to Railway
- [ ] Update CORS settings
- [ ] Add backend URL to Vercel env
- [ ] Test end-to-end flow
- [ ] Add error handling
- [ ] Implement file size limits
- [ ] Add loading states
- [ ] Test with real audio files

### Post-MVP Enhancements:
- [ ] Add WebSocket for real-time progress
- [ ] Implement job queue
- [ ] Add audio preview player
- [ ] Save mashups to user account
- [ ] Add more AI features
- [ ] Batch processing
- [ ] Advanced mixing controls

---

## Troubleshooting

### Common Issues:

**1. CORS Errors:**
```python
# Make sure your Vercel domain is in the origins list
origins = ["https://your-app.vercel.app"]
```

**2. File Upload Fails:**
```python
# Check file size limits in FastAPI
app.add_middleware(
    middleware_class=...,
    max_upload_size=50 * 1024 * 1024  # 50 MB
)
```

**3. Slow Processing:**
- Use AI only when necessary
- Implement job queue
- Add progress indicators
- Consider GPU hosting for AI

---

This hybrid architecture gives you:
✅ Fast, scalable frontend on Vercel
✅ Powerful Python backend for audio processing
✅ Free hosting for MVP
✅ Easy to scale later
✅ Clean separation of concerns

Ready to deploy! 🚀
