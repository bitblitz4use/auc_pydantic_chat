import { minioClient, BUCKET_NAME } from '../config/minio.js';

/**
 * Get the S3 key for a document name
 */
export function getDocumentKey(documentName) {
  return `documents/${documentName}.bin`;
}

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
 * Load Yjs document from S3
 */
export async function loadDocumentFromS3(documentName) {
  const objectName = getDocumentKey(documentName);
  const chunks = [];
  const stream = await minioClient.getObject(BUCKET_NAME, objectName);
  
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
}
