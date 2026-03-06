/**
 * Storage API utilities for MinIO integration
 */

const API_BASE = "http://localhost:8000";

export interface StorageObject {
  name: string;
  size: number;
  last_modified: string | null;
  etag: string;
  is_dir: boolean;
}

export interface StorageResponse {
  status: string;
  path?: string;
  prefix: string;
  recursive: boolean;
  count: number;
  objects: StorageObject[];
}

/**
 * List objects in a specific path
 */
export async function listStorageObjects(
  path: string,
  recursive: boolean = false
): Promise<StorageObject[]> {
  const response = await fetch(
    `${API_BASE}/api/storage/${path}?recursive=${recursive}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  const data: StorageResponse = await response.json();
  return data.objects.filter((obj) => !obj.is_dir);
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
  path: string,
  file: File
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/api/storage/${path}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/storage/${path}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Delete failed: ${response.statusText}`);
  }
}

/**
 * Format file size to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Format date string to locale date
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}
