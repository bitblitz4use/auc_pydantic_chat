/**
 * Storage API utilities for MinIO integration
 */

import { API_CONFIG } from "./config";

const API_BASE = API_CONFIG.STORAGE_API;

export interface StorageObject {
  name: string;
  size: number;
  last_modified: string | null;
  etag: string;
  is_dir: boolean;
  tags?: string[];
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
  recursive: boolean = false,
  includeTags: boolean = false
): Promise<StorageObject[]> {
  const response = await fetch(
    `${API_BASE}/api/storage/${path}?recursive=${recursive}&include_tags=${includeTags}`
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
  file: File,
  tags?: string[]
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  if (tags && tags.length > 0) {
    formData.append("tags", JSON.stringify(tags));
  }

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
 * Get file content from storage
 */
export async function getFileContent(path: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/storage/${path}/content`);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Update file content in storage
 */
export async function updateFileContent(
  path: string,
  content: string,
  tags?: string[]
): Promise<void> {
  const blob = new Blob([content], { type: "text/plain" });
  const file = new File([blob], path.split("/").pop() || "file", {
    type: "text/plain",
  });

  const formData = new FormData();
  formData.append("file", file);
  if (tags && tags.length > 0) {
    formData.append("tags", JSON.stringify(tags));
  }

  const response = await fetch(`${API_BASE}/api/storage/${path}`, {
    method: "PUT",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Update failed: ${response.statusText}`);
  }
}

/**
 * Get tags for a file
 */
export async function getFileTags(path: string): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/storage/${path}/content`);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }
  const tagsHeader = response.headers.get("X-Object-Tags");
  if (tagsHeader) {
    try {
      const parsed = JSON.parse(tagsHeader);
      // Handle both array and object formats for backward compatibility
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (typeof parsed === "object") {
        return Object.keys(parsed);
      }
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Update tags for a file
 */
export async function updateFileTags(
  path: string,
  tags: string[]
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/storage/${path}/tags`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tags }),
  });

  if (!response.ok) {
    throw new Error(`Update tags failed: ${response.statusText}`);
  }
}

/**
 * Get all unique tag keys from files in a path
 */
export async function getAllTagKeys(path: string): Promise<string[]> {
  const response = await fetch(
    `${API_BASE}/api/storage/${path}?recursive=false&include_tags=true`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch files: ${response.statusText}`);
  }
  const data: StorageResponse = await response.json();
  const tagKeys = new Set<string>();
  data.objects.forEach((obj) => {
    if (obj.tags && Array.isArray(obj.tags)) {
      obj.tags.forEach((tag) => tagKeys.add(tag));
    }
  });
  return Array.from(tagKeys);
}

/**
 * Rename/move a file in storage
 */
export async function renameFile(
  oldPath: string,
  newPath: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/storage/${oldPath}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ new_path: newPath }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Rename failed: ${errorText || response.statusText}`);
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

/**
 * Source information from upload and conversion
 */
export interface SourceInfo {
  source_id: string;
  original_path: string;
  markdown_path: string;
  original_filename: string;
  file_size: number;
  markdown_size: number;
}

/**
 * Upload and convert a source document
 */
export async function uploadAndConvertSource(
  file: File,
  tags?: string[]
): Promise<SourceInfo> {
  const formData = new FormData();
  formData.append("file", file);
  if (tags && tags.length > 0) {
    formData.append("tags", JSON.stringify(tags));
  }

  const response = await fetch(`${API_BASE}/api/sources/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload and conversion failed: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return data;
}

/**
 * List all sources
 */
export interface Source {
  source_id: string;
  original_path: string | null;
  markdown_path: string | null;
  original_filename: string | null;
  file_size: number;
  markdown_size: number;
  last_modified: string | null;
  tags: string[];
}

export interface SourcesResponse {
  status: string;
  count: number;
  sources: Source[];
}

export async function listSources(includeTags: boolean = true): Promise<Source[]> {
  const response = await fetch(
    `${API_BASE}/api/sources?recursive=false&include_tags=${includeTags}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch sources: ${response.statusText}`);
  }
  const data: SourcesResponse = await response.json();
  return data.sources;
}

/**
 * Get markdown content for a source
 */
export async function getSourceMarkdown(sourceId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/sources/${sourceId}/markdown`);
  if (!response.ok) {
    throw new Error(`Failed to fetch markdown: ${response.statusText}`);
  }
  return await response.text();
}

/**
 * Delete a source (both original and markdown)
 */
export async function deleteSource(sourceId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/sources/${sourceId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Delete source failed: ${errorText || response.statusText}`);
  }
}