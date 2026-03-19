/**
 * API client for the Personal DJ v2 backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ManualSegment {
  file_path: string;
  start_time: number;
  end_time: number;
}

export interface MixStatusResponse {
  job_id: string;
  status: "pending" | "analyzing" | "planning" | "rendering" | "complete" | "failed";
  progress: number | null;
  error: string | null;
}

/** Upload a file and return its server-side path. */
export async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const resp = await fetch(`${API_BASE}/api/v1/upload`, {
    method: "POST",
    body: formData,
  });
  if (!resp.ok) throw new Error(`Upload failed: ${resp.statusText}`);
  const data = await resp.json();
  return data.path;
}

/** Start a manual chain mix. */
export async function startManualMix(songs: ManualSegment[]): Promise<MixStatusResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/mix/manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ songs }),
  });
  if (!resp.ok) throw new Error(`Manual mix failed: ${resp.statusText}`);
  return resp.json();
}

/** Poll mix job status. */
export async function getMixStatus(jobId: string): Promise<MixStatusResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/mix/${jobId}/status`);
  if (!resp.ok) throw new Error(`Status check failed: ${resp.statusText}`);
  return resp.json();
}

/** Get download URL for completed mix. */
export function getDownloadUrl(jobId: string): string {
  return `${API_BASE}/api/v1/mix/${jobId}/download`;
}

/** Preview a single transition between two songs. Returns audio blob. */
export async function previewTransition(
  songA: ManualSegment,
  songB: ManualSegment
): Promise<Blob> {
  const resp = await fetch(`${API_BASE}/api/v1/transition/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_a: songA, song_b: songB }),
  });
  if (!resp.ok) throw new Error(`Preview failed: ${resp.statusText}`);
  return resp.blob();
}
