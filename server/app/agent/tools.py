"""Agent tools for document operations"""
from pydantic_ai import RunContext
from typing import Optional
import httpx
import uuid
import logging

from app.agent.schema import DocumentContext

logger = logging.getLogger(__name__)


async def get_document_content(
    ctx: RunContext[DocumentContext], 
    document_name: Optional[str] = None
) -> str:
    """Fetch the current content of a document as markdown.
    
    If document_name is not provided, uses the current_document from context.
    """
    # Use document_name from parameter, or fall back to context
    doc_name = document_name or ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document specified. Please provide a document name or ensure a document is active in write mode."
    
    url = f"{ctx.deps.hocuspocus_url}/api/ai/export/{doc_name}"
    
    logger.info(f"🔍 Tool called: get_document_content('{doc_name}')")
    logger.info(f"📡 Requesting: {url}")
    
    try:
        response = await ctx.deps.http_client.get(url)
        logger.info(f"✅ Response status: {response.status_code}")
        response.raise_for_status()
        
        ctx.deps.current_document = doc_name
        markdown = response.text
        logger.info(f"✅ Received {len(markdown)} characters of markdown")
        return f"Document '{doc_name}' content:\n\n{markdown}"
        
    except httpx.ConnectError as e:
        error_msg = f"❌ Connection error: Cannot connect to {ctx.deps.hocuspocus_url}. Is the Hocuspocus server running?"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}\n\nPlease ensure the Hocuspocus server is running on {ctx.deps.hocuspocus_url}"
    except httpx.TimeoutException as e:
        error_msg = f"❌ Timeout: Request to {url} timed out after 30 seconds"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.warning(f"⚠️  Document '{doc_name}' not found (404)")
            return f"Error: Document '{doc_name}' not found. Make sure it's open in the editor first."
        error_msg = f"❌ HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(error_msg)
        return f"Error: HTTP {e.response.status_code} - {error_msg}"
    except Exception as e:
        error_msg = f"❌ Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nType: {type(e).__name__}"


async def update_document_content(
    ctx: RunContext[DocumentContext],
    document_name: Optional[str] = None,
    markdown_content: str = "",
    change_description: Optional[str] = None
) -> str:
    """Update a document with new markdown content.
    
    If document_name is not provided, uses the current_document from context.
    """
    # Use document_name from parameter, or fall back to context
    doc_name = document_name or ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document specified. Please provide a document name or ensure a document is active in write mode."
    
    url = f"{ctx.deps.hocuspocus_url}/api/ai/import/{doc_name}"
    
    logger.info(f"🔍 Tool called: update_document_content('{doc_name}')")
    logger.info(f"📡 Requesting: {url}")
    logger.info(f"📝 Content length: {len(markdown_content)} characters")
    
    change_id = f"ai-change-{uuid.uuid4().hex[:8]}"
    logger.info(f"🆔 Generated change ID: {change_id}")
    
    headers = {
        "Content-Type": "text/markdown",
        "X-AI-Model": ctx.deps.model_name,
        "X-AI-Prompt": change_description or "AI-assisted edit",
        "X-AI-Change-Id": change_id
    }
    
    try:
        response = await ctx.deps.http_client.post(
            url, 
            content=markdown_content,
            headers=headers
        )
        logger.info(f"✅ Response status: {response.status_code}")
        response.raise_for_status()
        
        result = response.json()
        logger.info(f"✅ Change applied: {result.get('changeId', 'unknown')}")
        return (
            f"✅ Document '{doc_name}' updated successfully!\n"
            f"Change ID: {result['changeId']}\n"
            f"The change is now visible in the editor and can be accepted or rejected by the user."
        )
        
    except httpx.ConnectError as e:
        error_msg = f"❌ Connection error: Cannot connect to {ctx.deps.hocuspocus_url}. Is the Hocuspocus server running?"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}\n\nPlease ensure the Hocuspocus server is running on {ctx.deps.hocuspocus_url}"
    except httpx.TimeoutException as e:
        error_msg = f"❌ Timeout: Request to {url} timed out after 30 seconds"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}"
    except httpx.HTTPStatusError as e:
        error_msg = f"❌ HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(error_msg)
        return f"Error updating document: HTTP {e.response.status_code} - {error_msg}"
    except Exception as e:
        error_msg = f"❌ Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nType: {type(e).__name__}"


async def get_source_content(
    ctx: RunContext[DocumentContext],
    source_id: Optional[str] = None
) -> str:
    """Fetch the markdown content of a source document.
    
    Downloads the converted markdown content for the specified source.
    If source_id is not provided, uses the current_source from context.
    
    Returns the full markdown content of the source document.
    """
    # Use source_id from parameter, or fall back to context
    src_id = source_id or ctx.deps.current_source
    
    if not src_id:
        return "Error: No source specified. Please provide a source ID or ensure a source is selected in summarize mode."
    
    # Get source markdown from the sources API
    # API base URL is typically http://localhost:8000 (different from hocuspocus_url)
    api_base = "http://localhost:8000"
    url = f"{api_base}/api/sources/{src_id}/markdown"
    
    logger.info(f"🔍 Tool called: get_source_content('{src_id}')")
    logger.info(f"📡 Requesting: {url}")
    
    try:
        response = await ctx.deps.http_client.get(url)
        logger.info(f"✅ Response status: {response.status_code}")
        response.raise_for_status()
        
        markdown_content = response.text
        logger.info(f"✅ Received {len(markdown_content)} characters of markdown")
        
        # Return the content - similar to get_document_content pattern
        return f"Source document content (source_id: {src_id}):\n\n{markdown_content}"
        
    except httpx.ConnectError as e:
        error_msg = f"❌ Connection error: Cannot connect to API server."
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}"
    except httpx.TimeoutException as e:
        error_msg = f"❌ Timeout: Request to {url} timed out"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.warning(f"⚠️  Source '{src_id}' not found (404)")
            return f"Error: Source '{src_id}' not found. Make sure the source exists."
        error_msg = f"❌ HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(error_msg)
        return f"Error: HTTP {e.response.status_code} - {error_msg}"
    except Exception as e:
        error_msg = f"❌ Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nType: {type(e).__name__}"