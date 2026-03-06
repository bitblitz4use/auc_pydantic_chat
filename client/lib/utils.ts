import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract filename from storage path (removes folder prefix)
 */
export function extractFileName(path: string, folderPrefix: string): string {
  return path.replace(`${folderPrefix}/`, "");
}

/**
 * Ensure filename has .md extension
 */
export function ensureMdExtension(fileName: string): string {
  return fileName.endsWith('.md') ? fileName : `${fileName}.md`;
}

/**
 * Compare two arrays for equality (order-independent)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Extract unique tags from storage objects
 */
export function extractTags(objects: Array<{ tags?: string[] }>): string[] {
  const tagSet = new Set<string>();
  objects.forEach((obj) => {
    if (obj.tags && Array.isArray(obj.tags)) {
      obj.tags.forEach((tag) => tagSet.add(tag));
    }
  });
  return Array.from(tagSet).sort();
}
