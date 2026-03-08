"""Agent tools for document operations"""
from pydantic_ai import RunContext
from typing import Optional
import httpx
import uuid
import logging
from urllib.parse import quote

from app.agent.schema import DocumentContext, DocumentEditPlan

logger = logging.getLogger(__name__)


async def apply_document_edits(
    ctx: RunContext[DocumentContext],
    edit_plan: DocumentEditPlan
) -> str:
    """
    Apply structured edits to the document using incremental operations.
    
    NEW ARCHITECTURE (Incremental Operations):
    - Converts edit plan to position-based operations
    - Sends ONLY the changed snippets, not full document
    - Broadcasts operations to connected clients via /suggest endpoint
    - Clients apply changes incrementally using native ProseMirror operations
    - Works WITH CRDT framework, preserves cursor position
    
    Each edit specifies:
    - type: "insert", "replace", or "delete"
    - search: text to find (empty for insert at end)
    - content: new text to add/replace with
    - description: what this edit does
    
    Args:
        ctx: Runtime context
        edit_plan: Structured plan with list of edits
    
    Returns:
        Success message with details of applied edits
    """
    doc_name = ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document active. Ensure you're in write mode with an active document."
    
    logger.info(f"📝 Converting {len(edit_plan.edits)} edits to operations for '{doc_name}'")
    
    try:
        # First, get current document content to calculate positions
        current_content_result = await get_document_content(ctx, doc_name)
        
        # Extract just the content part (remove "Document 'X' content:\n\n" prefix)
        if current_content_result.startswith("Document '"):
            lines = current_content_result.split('\n', 2)
            current_markdown = lines[2] if len(lines) > 2 else ""
        else:
            logger.error("Failed to get current document content")
            return f"Error: Could not fetch current document content"
        
        logger.info(f"📖 Current document: {len(current_markdown)} chars")
        
        # Convert edit operations to position-based operations
        operations = []
        
        for edit in edit_plan.edits:
            try:
                if edit.type == 'insert':
                    if not edit.search or edit.search == '':
                        # Append to end
                        pos = len(current_markdown)
                    else:
                        # Insert after search text
                        index = current_markdown.find(edit.search)
                        if index != -1:
                            pos = index + len(edit.search)
                        else:
                            logger.warn(f"⚠️ Search text not found, appending: {edit.search[:50]}")
                            pos = len(current_markdown)
                    
                    operations.append({
                        "type": "insert",
                        "pos": pos,
                        "content": edit.content,
                        "description": edit.description
                    })
                    
                elif edit.type == 'replace':
                    index = current_markdown.find(edit.search)
                    if index != -1:
                        operations.append({
                            "type": "replace",
                            "pos": index,
                            "length": len(edit.search),
                            "content": edit.content,
                            "description": edit.description
                        })
                    else:
                        logger.warn(f"⚠️ Replace target not found: {edit.search[:50]}")
                        
                elif edit.type == 'delete':
                    index = current_markdown.find(edit.search)
                    if index != -1:
                        operations.append({
                            "type": "delete",
                            "pos": index,
                            "length": len(edit.search),
                            "description": edit.description
                        })
                    else:
                        logger.warn(f"⚠️ Delete target not found: {edit.search[:50]}")
                        
            except Exception as edit_error:
                logger.error(f"❌ Edit conversion failed: {edit.description} - {edit_error}")
        
        if not operations:
            return f"⚠️ No valid operations could be created from the edit plan"
        
        logger.info(f"📊 Created {len(operations)} operations")
        
        # Generate changeId
        change_id = f"ai-edit-{uuid.uuid4().hex[:8]}"
        
        # Send operations (NOT full document) to clients
        response = await ctx.deps.http_client.post(
            f"{ctx.deps.hocuspocus_url}/api/ai/suggest",
            json={
                "documentName": doc_name,
                "operations": operations,  # Send operations, not full markdown
                "metadata": {
                    "model": ctx.deps.model_name,
                    "summary": edit_plan.overall_summary,
                    "prompt": edit_plan.overall_summary,
                    "changeId": change_id,
                    "editCount": len(operations)
                }
            }
        )
        
        response.raise_for_status()
        result = response.json()
        
        logger.info(f"✅ Operations broadcast successfully")
        
        # Return minimal success indicator for the agent
        # The agent will craft a user-friendly message based on this
        return f"TOOL_SUCCESS: Applied {len(operations)} edit operations to '{doc_name}'. Change ID: {change_id}"
        
    except httpx.HTTPStatusError as e:
        error_msg = f"HTTP {e.response.status_code}: {e.response.text}"
        logger.error(f"❌ Failed to broadcast operations: {error_msg}")
        return f"Error broadcasting changes: {error_msg}"
    except Exception as e:
        logger.error(f"❌ Failed to apply edits: {e}")
        return f"Error applying edits: {str(e)}"


async def get_document_content(
    ctx: RunContext[DocumentContext], 
    document_name: Optional[str] = None
) -> str:
    """Fetch the current content of a document as markdown.
    
    If document_name is not provided, uses the current_document from context.
    """
    doc_name = document_name or ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document specified. Please provide a document name or ensure a document is active in write mode."
    
    # Use query parameter instead of path
    url = f"{ctx.deps.hocuspocus_url}/api/ai/export?documentName={quote(doc_name)}"
    
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
    
    NEW APPROACH (Client-Side Application):
    - Broadcasts suggestion to connected clients via /suggest endpoint
    - Clients apply changes locally using ProseMirror transactions
    - Eliminates race conditions and works WITH CRDT framework
    
    If document_name is not provided, uses the current_document from context.
    """
    doc_name = document_name or ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document specified. Please provide a document name or ensure a document is active in write mode."
    
    url = f"{ctx.deps.hocuspocus_url}/api/ai/suggest"
    
    logger.info(f"🔍 Tool called: update_document_content('{doc_name}')")
    logger.info(f"📡 Requesting: {url}")
    logger.info(f"📝 Content length: {len(markdown_content)} characters")
    
    change_id = f"ai-change-{uuid.uuid4().hex[:8]}"
    logger.info(f"🆔 Generated change ID: {change_id}")
    
    headers = {
        "Content-Type": "application/json"
    }
    
    body = {
        "documentName": doc_name,
        "markdown": markdown_content,
        "metadata": {
            "model": ctx.deps.model_name,
            "prompt": change_description or "AI-assisted edit",
            "summary": change_description or "AI-assisted edit",
            "changeId": change_id
        }
    }
    
    try:
        response = await ctx.deps.http_client.post(
            url, 
            json=body,
            headers=headers
        )
        logger.info(f"✅ Response status: {response.status_code}")
        response.raise_for_status()
        
        result = response.json()
        clients_notified = result.get('clientsNotified', 0)
        logger.info(f"✅ Suggestion broadcast to {clients_notified} client(s): {result.get('changeId', 'unknown')}")
        
        return (
            f"✅ Document '{doc_name}' changes broadcast successfully!\n"
            f"Change ID: {result['changeId']}\n"
            f"Clients notified: {clients_notified}\n"
            f"The changes are being applied by the client editor and can be accepted or rejected by the user."
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
    src_id = source_id or ctx.deps.current_source
    
    if not src_id:
        return "Error: No source specified. Please provide a source ID or ensure a source is selected in summarize mode."
    
    # Get source markdown from the sources API
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
