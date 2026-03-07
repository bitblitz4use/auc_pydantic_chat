"""Storage API routes"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from starlette.responses import Response
from typing import Optional
from minio.error import S3Error
from io import BytesIO
import json
import logging

from app.config import config
from app.api.schemas import RenameRequest, TagsRequest
from app.storage.client import (
    get_minio_client,
    list_objects,
    create_metadata_from_tags,
    get_user_tags_from_metadata,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/storage/{object_path:path}")
async def upload_file(
    object_path: str,
    file: UploadFile = File(...),
    tags: Optional[str] = None
):
    """
    Upload a file to MinIO S3 storage with optional tags.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
        file: File to upload
        tags: Optional JSON string of tags (form data field)
    
    Returns:
        Success message with object path
    """
    logger.info(f"📤 Upload request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Parse tags from form data
        user_tags = []
        if tags:
            try:
                parsed = json.loads(tags)
                # Handle both array and object formats for backward compatibility
                if isinstance(parsed, list):
                    user_tags = parsed
                elif isinstance(parsed, dict):
                    user_tags = list(parsed.keys())
            except json.JSONDecodeError:
                logger.warning(f"⚠️ Invalid tags JSON: {tags}")
        
        # Convert tags to metadata
        metadata = {}
        if user_tags:
            metadata = create_metadata_from_tags(user_tags)
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload to MinIO with metadata
        client.put_object(
            bucket_name,
            object_path,
            BytesIO(file_content),
            length=file_size,
            content_type=file.content_type or "application/octet-stream",
            metadata=metadata
        )
        
        logger.info(f"✅ Successfully uploaded {object_path} ({file_size} bytes)")
        return {
            "status": "success",
            "message": "File uploaded successfully",
            "object_path": object_path,
            "size": file_size
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error uploading {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error uploading {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.put("/storage/{object_path:path}")
async def update_file(
    object_path: str,
    file: UploadFile = File(...),
    tags: Optional[str] = None
):
    """
    Update/replace a file in MinIO S3 storage with optional tags.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
        file: File to upload (replaces existing)
        tags: Optional JSON string of tags (form data field)
    
    Returns:
        Success message with object path
    """
    logger.info(f"🔄 Update request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Parse tags from form data
        user_tags = {}
        if tags:
            try:
                user_tags = json.loads(tags)
            except json.JSONDecodeError:
                logger.warning(f"⚠️ Invalid tags JSON: {tags}")
        
        # Convert tags to metadata
        metadata = {}
        if user_tags:
            metadata = create_metadata_from_tags(user_tags)
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload to MinIO with metadata (overwrites if exists)
        client.put_object(
            bucket_name,
            object_path,
            BytesIO(file_content),
            length=file_size,
            content_type=file.content_type or "application/octet-stream",
            metadata=metadata
        )
        
        logger.info(f"✅ Successfully updated {object_path} ({file_size} bytes)")
        return {
            "status": "success",
            "message": "File updated successfully",
            "object_path": object_path,
            "size": file_size
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error updating {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error updating {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")


@router.patch("/storage/{object_path:path}/tags")
async def update_file_tags(object_path: str, request: TagsRequest = Body(...)):
    """
    Update tags (metadata) for an existing file.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
        request: Request body containing 'tags' dict
    
    Returns:
        Success message with updated tags
    """
    logger.info(f"🏷️ Update tags request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Get existing metadata
        stat = client.stat_object(bucket_name, object_path)
        existing_metadata = stat.metadata.copy()
        
        # Remove all existing tag keys (x-amz-meta-*)
        existing_metadata = {
            k: v for k, v in existing_metadata.items()
            if not k.startswith("x-amz-meta-")
        }
        
        # Add new tags
        new_metadata = create_metadata_from_tags(request.tags)
        existing_metadata.update(new_metadata)
        
        # Update metadata by copying object to itself
        from minio.commonconfig import CopySource
        copy_source = CopySource(bucket_name, object_path)
        client.copy_object(
            bucket_name,
            object_path,
            copy_source,
            metadata=existing_metadata,
            metadata_directive="REPLACE"
        )
        
        logger.info(f"✅ Successfully updated tags for {object_path}")
        return {
            "status": "success",
            "message": "Tags updated successfully",
            "tags": request.tags
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error updating tags: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error updating tags: {e}")
        raise HTTPException(status_code=500, detail=f"Update tags failed: {str(e)}")


@router.patch("/storage/{object_path:path}")
async def rename_file(object_path: str, request: RenameRequest):
    """
    Rename/move a file in MinIO S3 storage.
    Uses copy_object + remove_object to simulate rename.
    
    Args:
        object_path: Current path/name of the object in the bucket (route parameter)
        request: Request body containing 'new_path' field
    
    Returns:
        Success message with new object path
    """
    new_path = request.new_path
    
    logger.info(f"🔄 Rename request: {object_path} -> {new_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Copy object to new path
        from minio.commonconfig import CopySource
        copy_source = CopySource(bucket_name, object_path)
        client.copy_object(
            bucket_name,
            new_path,
            copy_source
        )
        logger.info(f"✅ Copied {object_path} to {new_path}")
        
        # Delete original object - ensure this happens
        try:
            client.remove_object(bucket_name, object_path)
            logger.info(f"✅ Deleted original {object_path}")
        except Exception as delete_error:
            # If deletion fails, try to clean up the copied file
            logger.error(f"❌ Failed to delete original {object_path}: {delete_error}")
            try:
                client.remove_object(bucket_name, new_path)
                logger.warning(f"🧹 Cleaned up copied file {new_path} due to deletion failure")
            except Exception as cleanup_error:
                logger.error(f"❌ Failed to cleanup {new_path}: {cleanup_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Rename failed: could not delete original file. {str(delete_error)}"
            )
        
        logger.info(f"✅ Successfully renamed {object_path} to {new_path}")
        return {
            "status": "success",
            "message": "File renamed successfully",
            "old_path": object_path,
            "new_path": new_path
        }
    except HTTPException:
        raise
    except S3Error as e:
        logger.error(f"❌ MinIO error renaming {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error renaming {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Rename failed: {str(e)}")


@router.delete("/storage/{object_path:path}")
async def delete_file(object_path: str):
    """
    Delete a file from MinIO S3 storage.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
    
    Returns:
        Success message
    """
    logger.info(f"🗑️ Delete request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Delete from MinIO
        client.remove_object(bucket_name, object_path)
        
        logger.info(f"✅ Successfully deleted {object_path}")
        return {
            "status": "success",
            "message": "File deleted successfully",
            "object_path": object_path
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error deleting {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error deleting {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@router.get("/storage")
async def list_all_files(prefix: Optional[str] = None, recursive: bool = True):
    """
    List all files in MinIO S3 storage.
    
    Args:
        prefix: Optional path prefix to filter objects (query parameter)
        recursive: If True, list recursively; if False, list only direct children (query parameter)
    
    Returns:
        List of objects with metadata
    """
    logger.info(f"📋 List request with prefix: {prefix or 'root'}, recursive: {recursive}")
    
    try:
        objects = list_objects(prefix=prefix or "", recursive=recursive)
        
        logger.info(f"✅ Found {len(objects)} objects")
        return {
            "status": "success",
            "prefix": prefix or "",
            "recursive": recursive,
            "count": len(objects),
            "objects": objects
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error listing objects: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error listing objects: {e}")
        raise HTTPException(status_code=500, detail=f"List failed: {str(e)}")


@router.get("/storage/{object_path:path}/content")
async def get_file_content(object_path: str):
    """
    Download/get file content from MinIO S3 storage with tags.
    Uses S3 GetObject API.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
    
    Returns:
        File content as response with tags in X-Object-Tags header
    """
    logger.info(f"📥 Download request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Get object stat for metadata
        stat = client.stat_object(bucket_name, object_path)
        
        # Extract tags from metadata
        tags = get_user_tags_from_metadata(stat.metadata)
        
        # Get object content
        response = client.get_object(bucket_name, object_path)
        content = response.read()
        response.close()
        response.release_conn()
        
        # Determine content type
        content_type = "text/plain"
        if object_path.endswith(('.md', '.markdown')):
            content_type = "text/markdown"
        elif object_path.endswith('.json'):
            content_type = "application/json"
        elif object_path.endswith('.txt'):
            content_type = "text/plain"
        
        logger.info(f"✅ Successfully downloaded {object_path} ({len(content)} bytes)")
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="{object_path.split("/")[-1]}"',
                "X-Object-Tags": json.dumps(tags)
            }
        )
    except S3Error as e:
        logger.error(f"❌ MinIO error downloading {object_path}: {e}")
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error downloading {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.get("/storage/{path:path}")
async def list_files_in_path(path: str, recursive: bool = True, include_tags: bool = False):
    """
    List files within a specific path in MinIO S3 storage.
    
    Args:
        path: Path prefix to filter objects (route parameter)
        recursive: If True, list recursively; if False, list only direct children (query parameter)
        include_tags: If True, include tags in response (query parameter)
    
    Returns:
        List of objects with optional tags
    """
    logger.info(f"📋 List request for path: {path}, recursive: {recursive}, include_tags: {include_tags}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Ensure path ends with / if it's meant to be a directory prefix
        prefix = path if path.endswith('/') else f"{path}/"
        objects = list_objects(prefix=prefix, recursive=recursive)
        
        # Optionally add tags to each object
        if include_tags:
            for obj in objects:
                try:
                    stat = client.stat_object(bucket_name, obj["name"])
                    obj["tags"] = get_user_tags_from_metadata(stat.metadata)
                except:
                    obj["tags"] = []
        
        logger.info(f"✅ Found {len(objects)} objects in path: {path}")
        return {
            "status": "success",
            "path": path,
            "prefix": prefix,
            "recursive": recursive,
            "count": len(objects),
            "objects": objects
        }
    except S3Error as e:
        logger.error(f"❌ MinIO error listing objects in path '{path}': {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error listing objects in path '{path}': {e}")
        raise HTTPException(status_code=500, detail=f"List failed: {str(e)}")
