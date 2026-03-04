import { minioClient, BUCKET_NAME } from '../config/minio.js';
import * as Y from 'yjs';

/**
 * Check if a document exists in S3
 */
export async function documentExists(documentName) {
  try {
    const objectName = getDocumentKey(documentName);
    await minioClient.statObject(BUCKET_NAME, objectName);
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * List all documents in S3
 */
export async function listDocuments() {
  try {
    const objectsList = [];
    const stream = minioClient.listObjects(BUCKET_NAME, 'documents/', true);
    
    for await (const obj of stream) {
      if (obj.name && obj.name.endsWith('.bin')) {
        // Extract document name from path (e.g., "documents/my-doc.ydoc" -> "my-doc")
        const docName = obj.name
          .replace('documents/', '')
          .replace('.bin', '');
        objectsList.push({
          name: docName,
          size: obj.size,
          lastModified: obj.lastModified,
        });
      }
    }
    
    return objectsList;
  } catch (error) {
    console.error('Error listing documents:', error);
    return [];
  }
}

/**
 * Get the S3 key for a document name
 * Hocuspocus S3 extension uses this format
 */
export function getDocumentKey(documentName) {
  // Hocuspocus S3 extension typically stores as: documents/{name}.ydoc
  return `documents/${documentName}.ydoc`;
}

/**
 * Create an empty Yjs document binary
 */
export function createEmptyYjsDocument() {
  const ydoc = new Y.Doc();
  return Y.encodeStateAsUpdate(ydoc);
}
