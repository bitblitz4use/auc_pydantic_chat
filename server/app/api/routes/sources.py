"""Sources API routes for document upload and conversion"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from starlette.responses import Response
from typing import Optional
from minio.error import S3Error
from io import BytesIO
import json
import logging
import uuid
from pathlib import Path

from app.config import config
from app.storage.client import (
    get_minio_client,
    list_objects,
    create_metadata_from_tags,
    get_user_tags_from_metadata,
)
from app.docling.converter import DoclingConverter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/sources/upload")
async def upload_and_convert_source(
    file: UploadFile = File(...),
    tags: Optional[str] = None
):
    """
    Upload a source document, convert to markdown, and store both in S3.
    
    Storage structure:
    - sources/{source_id}/original.{ext}  (original file)
    - sources/{source_id}/converted.md     (markdown output)
    
    Args:
        file: File to upload and convert
        tags: Optional JSON string of tags (form data field)
    
    Returns:
        Success message with source_id and paths
    """
    logger.info(f"📤 Upload and convert request for: {file.filename}")
    
    # Generate unique source ID
    source_id = str(uuid.uuid4())
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Parse tags from form data
        user_tags = []
        if tags:
            try:
                parsed = json.loads(tags)
                if isinstance(parsed, list):
                    user_tags = parsed
                elif isinstance(parsed, dict):
                    user_tags = list(parsed.keys())
            except json.JSONDecodeError:
                logger.warning(f"⚠️ Invalid tags JSON: {tags}")
        
        # Read file content first
        file_content = await file.read()
        file_size = len(file_content)
        original_filename = file.filename or "unknown"
        file_extension = Path(original_filename).suffix
        
        # Convert tags to metadata
        metadata = {}
        if user_tags:
            metadata = create_metadata_from_tags(user_tags)
        
        # Store original filename in metadata for later retrieval
        # Use base64 encoding to handle special characters safely (S3 metadata must be ASCII)
        try:
            import base64
            encoded_filename = base64.b64encode(original_filename.encode('utf-8')).decode('ascii')
            metadata["x-amz-meta-original-filename"] = encoded_filename
        except Exception as e:
            logger.warning(f"⚠️ Could not encode filename for metadata: {e}")
            # Fallback to sanitized filename
            metadata["x-amz-meta-original-filename"] = original_filename.encode('ascii', 'ignore').decode('ascii')
        
        logger.info(f"📄 File: {original_filename}, Size: {file_size} bytes, Extension: {file_extension}")
        
        # Convert to markdown using Docling
        try:
            converter = DoclingConverter()
            markdown_content = converter.convert_to_markdown(file_content, original_filename)
            markdown_bytes = markdown_content.encode('utf-8')
            logger.info(f"✅ Conversion successful: {len(markdown_bytes)} bytes markdown")
        except Exception as conv_error:
            logger.error(f"❌ Document conversion failed: {conv_error}")
            raise HTTPException(
                status_code=500,
                detail=f"Document conversion failed: {str(conv_error)}"
            )
        
        # Store original file
        original_path = f"sources/{source_id}/original{file_extension}"
        try:
            original_stream = BytesIO(file_content)
            original_stream.seek(0)
            client.put_object(
                bucket_name,
                original_path,
                original_stream,
                length=file_size,
                content_type=file.content_type or "application/octet-stream",
                metadata=metadata
            )
            logger.info(f"✅ Stored original: {original_path}")
        except S3Error as e:
            logger.error(f"❌ Failed to store original file: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to store original file: {str(e)}")
        
        # Store markdown file
        markdown_path = f"sources/{source_id}/converted.md"
        try:
            markdown_stream = BytesIO(markdown_bytes)
            markdown_stream.seek(0)
            client.put_object(
                bucket_name,
                markdown_path,
                markdown_stream,
                length=len(markdown_bytes),
                content_type="text/markdown",
                metadata=metadata
            )
            logger.info(f"✅ Stored markdown: {markdown_path}")
        except S3Error as e:
            logger.error(f"❌ Failed to store markdown file: {e}")
            # Try to clean up original file if markdown storage fails
            try:
                client.remove_object(bucket_name, original_path)
                logger.warning(f"🧹 Cleaned up original file after markdown storage failure")
            except:
                pass
            raise HTTPException(status_code=500, detail=f"Failed to store markdown file: {str(e)}")
        
        logger.info(f"✅ Successfully uploaded and converted source: {source_id}")
        return {
            "status": "success",
            "message": "Source uploaded and converted successfully",
            "source_id": source_id,
            "original_path": original_path,
            "markdown_path": markdown_path,
            "original_filename": original_filename,
            "file_size": file_size,
            "markdown_size": len(markdown_bytes)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading and converting source: {e}")
        raise HTTPException(status_code=500, detail=f"Upload and conversion failed: {str(e)}")


@router.get("/sources")
async def list_sources(recursive: bool = True, include_tags: bool = False):
    """
    List all sources in storage.
    
    Args:
        recursive: If True, list recursively (default True to get nested files)
        include_tags: If True, include tags in response
    
    Returns:
        List of source objects with metadata
    """
    logger.info(f"📋 List sources request: recursive={recursive}, include_tags={include_tags}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # List objects in sources/ prefix (must be recursive to get nested files)
        prefix = "sources/"
        objects = list_objects(prefix=prefix, recursive=True)
        
        # Filter to only show source folders (group by source_id)
        # Each source has: sources/{source_id}/original.{ext} and sources/{source_id}/converted.md
        source_map = {}
        
        for obj in objects:
            # Skip directory entries
            if obj.get("is_dir", False):
                continue
                
            # Extract source_id from path: sources/{source_id}/filename
            path_parts = obj["name"].split("/")
            if len(path_parts) >= 3 and path_parts[0] == "sources":
                source_id = path_parts[1]
                filename = path_parts[2]
                
                if source_id not in source_map:
                    source_map[source_id] = {
                        "source_id": source_id,
                        "original_path": None,
                        "markdown_path": None,
                        "original_filename": None,
                        "file_size": 0,
                        "markdown_size": 0,
                        "last_modified": obj["last_modified"],
                        "tags": []
                    }
                
                # Identify original and markdown files
                if filename == "converted.md":
                    source_map[source_id]["markdown_path"] = obj["name"]
                    source_map[source_id]["markdown_size"] = obj["size"]
                    # Use markdown file's last_modified as it's created after original
                    if obj["last_modified"]:
                        source_map[source_id]["last_modified"] = obj["last_modified"]
                elif filename.startswith("original."):
                    source_map[source_id]["original_path"] = obj["name"]
                    source_map[source_id]["file_size"] = obj["size"]
                    # Try to get original filename from metadata
                    try:
                        stat = client.stat_object(bucket_name, obj["name"])
                        encoded_filename = stat.metadata.get("x-amz-meta-original-filename")
                        if encoded_filename:
                            # Decode base64-encoded filename
                            try:
                                import base64
                                source_map[source_id]["original_filename"] = base64.b64decode(encoded_filename.encode('ascii')).decode('utf-8')
                            except:
                                # Fallback if decoding fails (might be old format or plain text)
                                source_map[source_id]["original_filename"] = encoded_filename
                        else:
                            # Fallback: derive from extension
                            ext = Path(filename).suffix
                            source_map[source_id]["original_filename"] = f"document{ext}"
                    except:
                        # Fallback: derive from extension
                        ext = Path(filename).suffix
                        source_map[source_id]["original_filename"] = f"document{ext}"
        
        # Add tags if requested
        if include_tags:
            for source_id, source_info in source_map.items():
                # Get tags from markdown file (or original if markdown doesn't exist)
                tag_path = source_info["markdown_path"] or source_info["original_path"]
                if tag_path:
                    try:
                        stat = client.stat_object(bucket_name, tag_path)
                        source_info["tags"] = get_user_tags_from_metadata(stat.metadata)
                    except Exception as e:
                        logger.debug(f"Could not get tags for {tag_path}: {e}")
                        source_info["tags"] = []
        
        sources = list(source_map.values())
        
        logger.info(f"✅ Found {len(sources)} sources")
        return {
            "status": "success",
            "count": len(sources),
            "sources": sources
        }
        
    except S3Error as e:
        logger.error(f"❌ MinIO error listing sources: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error listing sources: {e}")
        raise HTTPException(status_code=500, detail=f"List failed: {str(e)}")


@router.get("/sources/{source_id}/markdown")
async def get_source_markdown(source_id: str):
    """
    Get the converted markdown for a source.
    
    Args:
        source_id: UUID of the source
    
    Returns:
        Markdown content as text/plain response
    """
    logger.info(f"📥 Get markdown request for source: {source_id}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        markdown_path = f"sources/{source_id}/converted.md"
        
        # Check if file exists and get content
        try:
            stat = client.stat_object(bucket_name, markdown_path)
            response = client.get_object(bucket_name, markdown_path)
            content = response.read()
            response.close()
            response.release_conn()
            
            logger.info(f"✅ Successfully retrieved markdown for {source_id} ({len(content)} bytes)")
            return Response(
                content=content,
                media_type="text/markdown",
                headers={
                    "Content-Disposition": f'inline; filename="converted.md"'
                }
            )
        except S3Error as e:
            if e.code == "NoSuchKey":
                logger.warning(f"⚠️ Markdown not found for source: {source_id}")
                raise HTTPException(status_code=404, detail=f"Markdown not found for source: {source_id}")
            raise
    
    except HTTPException:
        raise
    except S3Error as e:
        logger.error(f"❌ MinIO error getting markdown: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error getting markdown: {e}")
        raise HTTPException(status_code=500, detail=f"Get markdown failed: {str(e)}")


@router.delete("/sources/{source_id}")
async def delete_source(source_id: str):
    """
    Delete a source (both original and markdown files).
    
    Args:
        source_id: UUID of the source
    
    Returns:
        Success message
    """
    logger.info(f"🗑️ Delete source request: {source_id}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # List all objects in the source folder
        prefix = f"sources/{source_id}/"
        objects = list_objects(prefix=prefix, recursive=True)
        
        if not objects:
            logger.warning(f"⚠️ No files found for source: {source_id}")
            raise HTTPException(status_code=404, detail=f"Source not found: {source_id}")
        
        # Delete all files in the source folder
        deleted_files = []
        errors = []
        
        for obj in objects:
            try:
                client.remove_object(bucket_name, obj["name"])
                deleted_files.append(obj["name"])
                logger.debug(f"✅ Deleted: {obj['name']}")
            except S3Error as e:
                errors.append(f"{obj['name']}: {str(e)}")
                logger.error(f"❌ Failed to delete {obj['name']}: {e}")
        
        if errors:
            logger.warning(f"⚠️ Some files failed to delete: {errors}")
            # Still return success if at least one file was deleted
            if not deleted_files:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to delete source files: {', '.join(errors)}"
                )
        
        logger.info(f"✅ Successfully deleted source: {source_id} ({len(deleted_files)} files)")
        return {
            "status": "success",
            "message": "Source deleted successfully",
            "source_id": source_id,
            "deleted_files": deleted_files,
            "errors": errors if errors else None
        }
        
    except HTTPException:
        raise
    except S3Error as e:
        logger.error(f"❌ MinIO error deleting source: {e}")
        raise HTTPException(status_code=500, detail=f"Storage error: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error deleting source: {e}")
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")
