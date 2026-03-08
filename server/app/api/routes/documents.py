"""Documents API routes for Yjs collaborative editing"""
from fastapi import APIRouter, HTTPException, Body
from typing import Optional, List
from minio.error import S3Error
from io import BytesIO
import logging

from app.config import config
from app.storage.client import get_minio_client
from app.api.schemas import RenameRequest, FolderRequest

logger = logging.getLogger(__name__)

router = APIRouter()

# Documents are stored as: documents/{name}.bin
# Folders are stored as: documents/{folder}/.keep

def get_document_key(document_name: str) -> str:
    """Get S3 key for a document"""
    return f"documents/{document_name}.bin"

def get_folder_key(folder_path: str) -> str:
    """Get S3 key for a folder marker"""
    # Ensure folder path ends with /
    normalized = folder_path if folder_path.endswith('/') else f"{folder_path}/"
    return f"documents/{normalized}.keep"


@router.get("/documents")
async def list_documents():
    """
    List all Yjs documents (*.bin files) and folders (.keep markers) in the documents/ prefix.
    
    Returns:
        List of documents and folders with name, size, lastModified, and isFolder flag
    """
    logger.info("📋 List documents request")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        items = []
        folders_seen = set()
        
        # List all objects in documents/ prefix
        objects = client.list_objects(bucket_name, prefix='documents/', recursive=True)
        
        for obj in objects:
            if not obj.object_name:
                continue
                
            # Extract relative path (remove 'documents/' prefix)
            relative_path = obj.object_name.replace('documents/', '')
            
            # Handle .bin files (actual documents)
            if relative_path.endswith('.bin'):
                doc_name = relative_path.replace('.bin', '')
                items.append({
                    "name": doc_name,
                    "size": obj.size,
                    "lastModified": obj.last_modified.isoformat() if obj.last_modified else None,
                    "isFolder": False
                })
                
            # Handle .keep files (folder markers)
            elif relative_path.endswith('.keep'):
                # Remove '.keep' and trailing '/' to get folder name
                folder_name = relative_path.replace('.keep', '').rstrip('/')
                
                # Add folder if not already seen and not empty
                if folder_name and folder_name not in folders_seen:
                    folders_seen.add(folder_name)
                    items.append({
                        "name": folder_name,
                        "size": 0,
                        "lastModified": obj.last_modified.isoformat() if obj.last_modified else None,
                        "isFolder": True
                    })
        
        doc_count = len([item for item in items if not item.get("isFolder")])
        folder_count = len([item for item in items if item.get("isFolder")])
        
        logger.info(f"✅ Found {doc_count} documents and {folder_count} folders")
        return {
            "status": "success",
            "count": len(items),
            "documents": items
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error listing documents: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=f"List failed: {str(e)}")


@router.get("/documents/{document_name:path}/exists")
async def check_document_exists(document_name: str):
    """
    Check if a document exists.
    
    Args:
        document_name: Name of the document (route parameter)
    
    Returns:
        Existence status
    """
    logger.info(f"🔍 Check existence: {document_name}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        object_key = get_document_key(document_name)
        
        # Try to stat the object
        try:
            client.stat_object(bucket_name, object_key)
            exists = True
        except S3Error as e:
            if e.code == 'NoSuchKey':
                exists = False
            else:
                raise
        
        logger.info(f"✅ Document '{document_name}' exists: {exists}")
        return {
            "exists": exists,
            "documentName": document_name
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error checking document: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error checking document: {e}")
        raise HTTPException(status_code=500, detail=f"Check failed: {str(e)}")


@router.patch("/documents/{document_name:path}")
async def rename_document(document_name: str, request: RenameRequest):
    """
    Rename/move a document or folder.
    Uses copy_object + remove_object to simulate rename.
    For folders, moves all contents recursively.
    
    Args:
        document_name: Current name of the document or folder (route parameter)
        request: Request body containing 'new_path' field (new document/folder name)
    
    Returns:
        Success message with new document/folder name
    """
    new_name = request.new_path
    
    logger.info(f"🔄 Rename request: {document_name} -> {new_name}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        renamed_count = 0
        
        # Try to rename as document (.bin file)
        old_doc_key = get_document_key(document_name)
        new_doc_key = get_document_key(new_name)
        
        try:
            # Check if document exists
            client.stat_object(bucket_name, old_doc_key)
            
            # Copy document to new path
            from minio.commonconfig import CopySource
            copy_source = CopySource(bucket_name, old_doc_key)
            client.copy_object(bucket_name, new_doc_key, copy_source)
            logger.info(f"✅ Copied document: {old_doc_key} -> {new_doc_key}")
            
            # Delete original
            client.remove_object(bucket_name, old_doc_key)
            logger.info(f"✅ Deleted original document: {old_doc_key}")
            renamed_count += 1
            
        except S3Error as e:
            if e.code != 'NoSuchKey':
                raise
        
        # Try to rename as folder (.keep file)
        old_folder_key = get_folder_key(document_name)
        new_folder_key = get_folder_key(new_name)
        
        try:
            # Check if folder marker exists
            client.stat_object(bucket_name, old_folder_key)
            
            # Copy folder marker to new path
            from minio.commonconfig import CopySource
            copy_source = CopySource(bucket_name, old_folder_key)
            client.copy_object(bucket_name, new_folder_key, copy_source)
            logger.info(f"✅ Copied folder marker: {old_folder_key} -> {new_folder_key}")
            
            # Delete original marker
            client.remove_object(bucket_name, old_folder_key)
            logger.info(f"✅ Deleted original folder marker: {old_folder_key}")
            renamed_count += 1
            
        except S3Error as e:
            if e.code != 'NoSuchKey':
                raise
        
        # Rename all contents if it's a folder (all items with this prefix)
        old_prefix = f"documents/{document_name}/"
        new_prefix = f"documents/{new_name}/"
        
        objects_to_move = client.list_objects(bucket_name, prefix=old_prefix, recursive=True)
        for obj in objects_to_move:
            # Calculate new object name
            relative_path = obj.object_name.replace(old_prefix, '')
            new_object_name = new_prefix + relative_path
            
            # Copy to new location
            from minio.commonconfig import CopySource
            copy_source = CopySource(bucket_name, obj.object_name)
            client.copy_object(bucket_name, new_object_name, copy_source)
            
            # Delete original
            client.remove_object(bucket_name, obj.object_name)
            renamed_count += 1
            logger.info(f"✅ Moved folder content: {obj.object_name} -> {new_object_name}")
        
        if renamed_count == 0:
            raise HTTPException(status_code=404, detail="Document or folder not found")
        
        logger.info(f"✅ Successfully renamed {renamed_count} item(s): {document_name} -> {new_name}")
        return {
            "status": "success",
            "message": "Renamed successfully",
            "oldName": document_name,
            "newName": new_name,
            "renamedCount": renamed_count
        }
    except HTTPException:
        raise
    except S3Error as e:
        logger.error(f"❌ MinIO error renaming: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error renaming: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {str(e)}")


@router.delete("/documents/{document_name:path}")
async def delete_document(document_name: str):
    """
    Delete a document or folder (including all contents).
    
    Args:
        document_name: Name of the document or folder (route parameter)
    
    Returns:
        Success message
    """
    logger.info(f"🗑️ Delete request for: {document_name}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        deleted_items = []
        deleted_count = 0
        
        # Try to delete as document (.bin file)
        document_key = get_document_key(document_name)
        try:
            client.remove_object(bucket_name, document_key)
            deleted_items.append("document")
            deleted_count += 1
            logger.info(f"✅ Deleted document: {document_name}")
        except S3Error as e:
            if e.code != 'NoSuchKey':
                raise
        
        # Try to delete as folder marker (.keep file)
        folder_key = get_folder_key(document_name)
        try:
            client.remove_object(bucket_name, folder_key)
            deleted_items.append("folder marker")
            deleted_count += 1
            logger.info(f"✅ Deleted folder marker: {document_name}")
        except S3Error as e:
            if e.code != 'NoSuchKey':
                raise
        
        # Delete all contents if it's a folder (all items with this prefix)
        prefix = f"documents/{document_name}/"
        objects_to_delete = client.list_objects(bucket_name, prefix=prefix, recursive=True)
        for obj in objects_to_delete:
            client.remove_object(bucket_name, obj.object_name)
            deleted_count += 1
            logger.info(f"✅ Deleted folder content: {obj.object_name}")
        
        if deleted_count == 0:
            raise HTTPException(status_code=404, detail="Document or folder not found")
        
        item_type = "folder and contents" if len(deleted_items) > 1 or deleted_count > 1 else deleted_items[0] if deleted_items else "items"
        logger.info(f"✅ Successfully deleted {deleted_count} item(s): {document_name}")
        return {
            "status": "success",
            "message": f"Deleted {item_type} successfully",
            "documentName": document_name,
            "deletedCount": deleted_count
        }
    except HTTPException:
        raise
    except S3Error as e:
        logger.error(f"❌ MinIO error deleting: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error deleting: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@router.post("/documents/folder")
async def create_folder(request: FolderRequest):
    """
    Create a folder in the documents hierarchy.
    In S3, folders are virtual - we create a .keep marker file.
    
    Args:
        request: Request body containing 'folderPath' field
    
    Returns:
        Success message
    """
    folder_path = request.folderPath
    logger.info(f"📁 Create folder: {folder_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Create .keep marker file
        marker_key = get_folder_key(folder_path)
        empty_buffer = BytesIO(b'')
        
        client.put_object(
            bucket_name,
            marker_key,
            empty_buffer,
            length=0,
            content_type='application/octet-stream'
        )
        
        logger.info(f"✅ Successfully created folder: {folder_path}")
        return {
            "status": "success",
            "message": "Folder created successfully",
            "folderPath": folder_path
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error creating folder: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error creating folder: {e}")
        raise HTTPException(status_code=500, detail=f"Create folder failed: {str(e)}")
