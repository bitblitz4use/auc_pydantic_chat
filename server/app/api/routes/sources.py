"""Sources API routes for document upload and conversion"""
from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks, WebSocket, WebSocketDisconnect
from starlette.responses import Response
from typing import Optional, Dict
from minio.error import S3Error
from io import BytesIO
import json
import logging
import uuid
from pathlib import Path
import asyncio

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

# Active WebSocket connections per source_id
active_connections: Dict[str, WebSocket] = {}
# Buffer for progress updates (in case WS connects after conversion starts)
conversion_progress: Dict[str, dict] = {}


async def send_progress(source_id: str, stage: str, progress: int, message: str, **extra):
    """Send progress update via WebSocket if connected, otherwise buffer it"""
    progress_data = {
        "stage": stage,
        "progress": progress,
        "message": message,
        **extra
    }
    
    # Always store the latest progress
    conversion_progress[source_id] = progress_data
    
    # Try to send if connected
    if source_id in active_connections:
        try:
            await active_connections[source_id].send_json(progress_data)
            logger.info(f"📡 {source_id[:8]}: {stage} ({progress}%) - {message}")
        except Exception as e:
            logger.debug(f"Failed to send progress for {source_id[:8]}: {e}")
            active_connections.pop(source_id, None)
    else:
        logger.debug(f"⏳ {source_id[:8]}: Progress buffered (WS not connected yet): {stage} {progress}%")


async def convert_document_background(
    source_id: str,
    file_content: bytes,
    original_filename: str,
    file_extension: str,
    file_size: int,
    tags: list
):
    """Background conversion task with WebSocket progress updates"""
    try:
        # Small delay to allow WebSocket connection to establish
        await asyncio.sleep(0.3)
        
        client = get_minio_client()
        bucket_name = config.minio_bucket
        metadata = create_metadata_from_tags(tags) if tags else {}
        
        # Store original filename in metadata
        try:
            import base64
            encoded_filename = base64.b64encode(original_filename.encode('utf-8')).decode('ascii')
            metadata["x-amz-meta-original-filename"] = encoded_filename
        except Exception as e:
            logger.warning(f"⚠️ Could not encode filename for metadata: {e}")
            metadata["x-amz-meta-original-filename"] = original_filename.encode('ascii', 'ignore').decode('ascii')
        
        # Stage 1: Converting
        await send_progress(source_id, "converting", 30, "Converting to markdown...")
        
        # Run blocking conversion in thread pool to not block event loop
        def _convert_sync():
            converter = DoclingConverter()
            return converter.convert_to_markdown(file_content, original_filename)
        
        # Run in thread pool - ensures proper event loop context
        loop = asyncio.get_event_loop()
        markdown_content = await loop.run_in_executor(None, _convert_sync)
        markdown_bytes = markdown_content.encode('utf-8')
        
        await send_progress(source_id, "converting", 70, "Conversion complete")
        
        # Stage 2: Storing markdown
        await send_progress(source_id, "storing", 80, "Storing markdown...")
        
        markdown_path = f"sources/{source_id}/converted.md"
        markdown_stream = BytesIO(markdown_bytes)
        markdown_stream.seek(0)
        
        # MinIO operations also in thread pool
        def _store_markdown_sync():
            client.put_object(
                bucket_name,
                markdown_path,
                markdown_stream,
                len(markdown_bytes),
                "text/markdown",
                metadata
            )
        
        await loop.run_in_executor(None, _store_markdown_sync)
        
        # Complete
        await send_progress(
            source_id,
            "complete",
            100,
            "Conversion complete",
            markdown_size=len(markdown_bytes),
            markdown_path=markdown_path
        )
        
        logger.info(f"✅ Conversion complete: {source_id}")
        
    except Exception as e:
        logger.error(f"❌ Conversion failed for {source_id}: {e}")
        await send_progress(source_id, "error", 0, str(e), error=True)
    finally:
        # Clean up connection after a delay
        await asyncio.sleep(2)
        active_connections.pop(source_id, None)
        # Clean up buffered progress after additional delay
        await asyncio.sleep(5)
        conversion_progress.pop(source_id, None)


@router.post("/sources/upload")
async def upload_source(
    file: UploadFile = File(...),
    tags: Optional[str] = None,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Upload source file, store original immediately, convert in background"""
    logger.info(f"📤 Upload: {file.filename}")
    
    source_id = str(uuid.uuid4())
    
    try:
        # Parse tags
        parsed_tags = []
        if tags:
            try:
                parsed = json.loads(tags)
                if isinstance(parsed, list):
                    parsed_tags = parsed
                elif isinstance(parsed, dict):
                    parsed_tags = list(parsed.keys())
            except json.JSONDecodeError:
                logger.warning(f"⚠️ Invalid tags JSON: {tags}")
        
        # Read file
        file_content = await file.read()
        file_size = len(file_content)
        original_filename = file.filename or "unknown"
        file_extension = Path(original_filename).suffix or ".bin"
        
        # Store original immediately
        client = get_minio_client()
        bucket_name = config.minio_bucket
        metadata = create_metadata_from_tags(parsed_tags) if parsed_tags else {}
        
        # Store original filename in metadata
        try:
            import base64
            encoded_filename = base64.b64encode(original_filename.encode('utf-8')).decode('ascii')
            metadata["x-amz-meta-original-filename"] = encoded_filename
        except Exception as e:
            logger.warning(f"⚠️ Could not encode filename for metadata: {e}")
            metadata["x-amz-meta-original-filename"] = original_filename.encode('ascii', 'ignore').decode('ascii')
        
        original_path = f"sources/{source_id}/original{file_extension}"
        original_stream = BytesIO(file_content)
        
        # Run MinIO upload in thread to not block event loop
        def _store_original_sync():
            client.put_object(
                bucket_name,
                original_path,
                original_stream,
                file_size,
                file.content_type or "application/octet-stream",
                metadata
            )
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _store_original_sync)
        
        logger.info(f"✅ Stored original: {original_path}")
        
        # Queue background conversion
        background_tasks.add_task(
            convert_document_background,
            source_id,
            file_content,
            original_filename,
            file_extension,
            file_size,
            parsed_tags
        )
        
        return {
            "source_id": source_id,
            "original_path": original_path,
            "original_filename": original_filename,
            "file_size": file_size,
        }
        
    except Exception as e:
        logger.error(f"❌ Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/sources/{source_id}/progress")
async def conversion_progress_websocket(websocket: WebSocket, source_id: str):
    """WebSocket endpoint for real-time conversion progress"""
    await websocket.accept()
    active_connections[source_id] = websocket
    logger.info(f"🔌 WebSocket connected: {source_id[:8]}")
    
    try:
        # Send any buffered progress immediately upon connection
        if source_id in conversion_progress:
            logger.info(f"📤 Sending buffered progress for {source_id[:8]}: {conversion_progress[source_id].get('stage')} {conversion_progress[source_id].get('progress')}%")
            await websocket.send_json(conversion_progress[source_id])
        else:
            # Send initial connection confirmation
            await websocket.send_json({
                "stage": "connected",
                "progress": 0,
                "message": "Waiting for conversion to start..."
            })
        
        # Keep connection alive until conversion is done
        while True:
            # Wait for any client messages (ping/pong)
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
                
    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket disconnected: {source_id[:8]}")
    finally:
        active_connections.pop(source_id, None)
        # Clean up progress after some time
        await asyncio.sleep(5)
        conversion_progress.pop(source_id, None)


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
