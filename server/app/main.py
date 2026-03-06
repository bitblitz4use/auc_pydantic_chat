from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Optional
from contextlib import asynccontextmanager
import httpx
import logging
import sys
import json
from pathlib import Path
from minio.error import S3Error
from io import BytesIO

# Add parent directory to path to ensure imports work
parent_dir = Path(__file__).parent.parent
if str(parent_dir) not in sys.path:
    sys.path.insert(0, str(parent_dir))

from app.config import config, HOCUSPOCUS_URL, HTTP_TIMEOUT
from app.models import DocumentContext
from app.agent import document_agent, create_agent_from_model_id
from app.providers import get_available_models, parse_model_id
from app.storage import get_minio_client, ensure_bucket_exists, list_objects
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Lifespan event handler for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure bucket exists
    try:
        ensure_bucket_exists()
    except Exception as e:
        logger.error(f"❌ Failed to initialize MinIO bucket: {e}")
    yield
    # Shutdown: Add cleanup code here if needed in the future

app = FastAPI(title="Pydantic AI Chat API", lifespan=lifespan)

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}


# Pydantic models for API responses
class ModelInfo(BaseModel):
    """Model information for frontend"""
    id: str
    name: str
    chef: str  # Provider display name
    chefSlug: str  # Provider slug for logo
    providers: List[str]


class ProvidersResponse(BaseModel):
    """Response format for providers endpoint"""
    models: List[ModelInfo]


class RenameRequest(BaseModel):
    """Request format for rename endpoint"""
    new_path: str


@app.get("/api/providers", response_model=ProvidersResponse)
async def get_providers():
    """
    Discovery endpoint returning available models grouped by provider.
    Returns models in format expected by the frontend model selector.
    """
    logger.info("📋 Providers discovery request received")
    
    models = []
    
    # Map provider slugs to display names
    provider_names: Dict[str, str] = {
        "ollama": "Ollama",
        "openai": "OpenAI"
    }
    
    available_models = get_available_models()
    
    for provider_slug, model_list in available_models.items():
        provider_name = provider_names.get(provider_slug, provider_slug.title())
        
        for model_id in model_list:
            # Format model name for display (e.g., "gpt-oss:20b" -> "Gpt Oss 20b")
            model_display = model_id.replace(":", " ").replace("-", " ").title()
            
            # Create full model ID in format "provider:model_name"
            full_model_id = f"{provider_slug}:{model_id}"
            
            models.append(ModelInfo(
                id=full_model_id,
                name=model_display,
                chef=provider_name,
                chefSlug=provider_slug,
                providers=[provider_slug]
            ))
    
    logger.info(f"✅ Returning {len(models)} models from {len(available_models)} providers")
    return ProvidersResponse(models=models)


@app.post("/api/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint that handles Vercel AI Data Stream Protocol requests.
    Supports dynamic model selection via X-Model-ID header or request body.
    Model format: "provider:model_name" (e.g., "openai:gpt-4o")
    """
    logger.info("💬 Chat request received")
    
    # Try to get model from header first (preferred method)
    model_id = request.headers.get("X-Model-ID")
    
    # If not in header, try to read from body
    # We need to read the body stream and then recreate it for VercelAIAdapter
    if not model_id:
        try:
            # Read body to extract model
            body_bytes = await request.body()
            if body_bytes:
                try:
                    body = json.loads(body_bytes)
                    # Vercel AI SDK may send model in body.body
                    model_id = body.get("body", {}).get("model") or body.get("model")
                except json.JSONDecodeError:
                    # Body might not be JSON (could be streaming)
                    model_id = None
                
                # Recreate the request body stream for VercelAIAdapter
                # This is necessary because request.body() consumes the stream
                async def receive():
                    return {"type": "http.request", "body": body_bytes}
                
                # Replace the receive function to allow VercelAIAdapter to read the body
                request._receive = receive
        except Exception as e:
            logger.warning(f"⚠️ Could not parse request body for model selection: {e}")
            model_id = None
    
    # Determine which agent to use
    agent = document_agent  # Default
    provider = config.default_provider
    model_name = config.default_model
    
    if model_id:
        try:
            provider, model_name = parse_model_id(model_id)
            logger.info(f"🎯 Using model: {provider}:{model_name}")
            agent = create_agent_from_model_id(model_id)
        except ValueError as e:
            logger.warning(f"⚠️ Invalid model ID '{model_id}': {e}. Using default model.")
        except Exception as e:
            logger.error(f"❌ Error creating agent for '{model_id}': {e}. Using default model.")
    else:
        logger.info("ℹ️ No model specified, using default model")
    
    # Create HTTP client that will stay alive during the entire request
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT)
    deps = DocumentContext(
        http_client=http_client,
        hocuspocus_url=HOCUSPOCUS_URL,
        model_name=f"{provider}:{model_name}"
    )
    
    logger.info(f"🌐 Created HTTP client for Hocuspocus: {deps.hocuspocus_url}")
    
    # Schedule cleanup after response completes
    background.add_task(http_client.aclose)
    
    logger.info("🚀 Dispatching to VercelAIAdapter")
    return await VercelAIAdapter.dispatch_request(
        request,
        agent=agent,
        deps=deps,
        sdk_version=6
    )


# Storage CRUD endpoints
@app.post("/api/storage/{object_path:path}")
async def upload_file(object_path: str, file: UploadFile = File(...)):
    """A
    Upload a file to MinIO S3 storage.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
        file: File to upload
    
    Returns:
        Success message with object path
    """
    logger.info(f"📤 Upload request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload to MinIO
        client.put_object(
            bucket_name,
            object_path,
            BytesIO(file_content),
            length=file_size,
            content_type=file.content_type or "application/octet-stream"
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


@app.put("/api/storage/{object_path:path}")
async def update_file(object_path: str, file: UploadFile = File(...)):
    """
    Update/replace a file in MinIO S3 storage.
    Uses the same logic as upload (PUT overwrites existing objects).
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
        file: File to upload (replaces existing)
    
    Returns:
        Success message with object path
    """
    logger.info(f"🔄 Update request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Upload to MinIO (overwrites if exists)
        client.put_object(
            bucket_name,
            object_path,
            BytesIO(file_content),
            length=file_size,
            content_type=file.content_type or "application/octet-stream"
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


@app.patch("/api/storage/{object_path:path}")
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


@app.delete("/api/storage/{object_path:path}")
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


# Storage discovery endpoints
@app.get("/api/storage")
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


@app.get("/api/storage/{object_path:path}/content")
async def get_file_content(object_path: str):
    """
    Download/get file content from MinIO S3 storage.
    Uses S3 GetObject API.
    
    Args:
        object_path: Path/name of the object in the bucket (route parameter)
    
    Returns:
        File content as response
    """
    logger.info(f"📥 Download request for: {object_path}")
    
    try:
        client = get_minio_client()
        bucket_name = config.minio_bucket
        
        # Get object from MinIO
        response = client.get_object(bucket_name, object_path)
        
        # Read content
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
                "Content-Disposition": f'inline; filename="{object_path.split("/")[-1]}"'
            }
        )
    except S3Error as e:
        logger.error(f"❌ MinIO error downloading {object_path}: {e}")
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")
    except Exception as e:
        logger.error(f"❌ Error downloading {object_path}: {e}")
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@app.get("/api/storage/{path:path}")
async def list_files_in_path(path: str, recursive: bool = True):
    """
    List files within a specific path in MinIO S3 storage.
    
    Args:
        path: Path prefix to filter objects (route parameter)
        recursive: If True, list recursively; if False, list only direct children (query parameter)
    
    Returns:
        List of objects with metadata
    """
    logger.info(f"📋 List request for path: {path}, recursive: {recursive}")
    
    try:
        # Ensure path ends with / if it's meant to be a directory prefix
        prefix = path if path.endswith('/') else f"{path}/"
        objects = list_objects(prefix=prefix, recursive=recursive)
        
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
