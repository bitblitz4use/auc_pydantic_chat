"""Tool wrappers that add automatic behaviors"""
from pydantic_ai import RunContext
from typing import Optional
import logging

from app.agent.schema import DocumentContext
from app.agent.tools import get_document_content as _get_document_content_raw

logger = logging.getLogger(__name__)


async def smart_update_document_content(
    ctx: RunContext[DocumentContext],
    markdown_content: str,
    document_name: Optional[str] = None,
    change_description: Optional[str] = None
) -> str:
    """
    Smart wrapper around update_document_content that:
    1. Automatically reads the current document content first
    2. Provides it in context
    3. Then performs the update
    
    This ensures the LLM always has access to current content before making changes.
    
    Args:
        ctx: Runtime context with DocumentContext dependencies
        markdown_content: The COMPLETE new markdown content for the document
        document_name: Optional document name (uses current_document from context if not provided)
        change_description: Description of what changed (for logging/history)
    
    Returns:
        Success or error message
    """
    doc_name = document_name or ctx.deps.current_document
    
    if not doc_name:
        return "Error: No document specified. Please provide a document name or ensure a document is active in write mode."
    
    logger.info(f"🔧 Smart update wrapper called for: '{doc_name}'")
    
    # Step 1: Automatically fetch current document content
    logger.info(f"📖 Auto-fetching current content...")
    current_content_result = await _get_document_content_raw(ctx, doc_name)
    
    # Extract just the content part (remove "Document 'X' content:\n\n" prefix)
    current_content = ""
    if current_content_result.startswith("Document '") and "' content:\n\n" in current_content_result:
        current_content = current_content_result.split("' content:\n\n", 1)[1]
    elif current_content_result.startswith("Error:"):
        # Document doesn't exist yet - that's okay, we're creating it
        logger.info(f"📄 Document doesn't exist yet - will create new")
        current_content = ""
    else:
        current_content = current_content_result
    
    # Step 2: Log what we're doing
    if current_content:
        logger.info(f"✅ Current document has {len(current_content)} characters")
        logger.info(f"📝 New content has {len(markdown_content)} characters")
        
        # Calculate a simple diff metric
        if len(markdown_content) > len(current_content):
            diff = len(markdown_content) - len(current_content)
            logger.info(f"📊 Adding ~{diff} characters")
        else:
            diff = len(current_content) - len(markdown_content)
            logger.info(f"📊 Removing ~{diff} characters")
    else:
        logger.info(f"📝 Creating new document with {len(markdown_content)} characters")
    
    # Step 3: Perform the actual update
    from app.agent.tools import update_document_content as _update_raw
    result = await _update_raw(
        ctx,
        document_name=doc_name,
        markdown_content=markdown_content,
        change_description=change_description
    )
    
    return result
