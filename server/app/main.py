from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.background import BackgroundTasks
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider
from pydantic_ai import Agent, RunContext
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
from dataclasses import dataclass
from typing import Optional
import httpx
import uuid
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Pydantic AI Chat API")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DEPENDENCIES - Shared HTTP client and document context
# ============================================================================

@dataclass
class DocumentContext:
    """Context for document editing operations"""
    http_client: httpx.AsyncClient
    hocuspocus_url: str = "http://localhost:3001"  # Node.js server
    current_document: Optional[str] = None  # Track current document name
    model_name: str = "gpt-oss:20b"  # For metadata


# ============================================================================
# DOCUMENT TOOLS - Read and write documents via existing endpoints
# ============================================================================

async def get_document_content(
    ctx: RunContext[DocumentContext], 
    document_name: str
) -> str:
    """
    Fetch the current content of a document as markdown.
    
    Args:
        document_name: The name/ID of the document to retrieve
        
    Returns:
        The document content as markdown text
    """
    url = f"{ctx.deps.hocuspocus_url}/api/ai/export/{document_name}"
    
    logger.info(f"🔍 Tool called: get_document_content('{document_name}')")
    logger.info(f"📡 Requesting: {url}")
    logger.info(f"🌐 Hocuspocus URL: {ctx.deps.hocuspocus_url}")
    
    try:
        response = await ctx.deps.http_client.get(url)
        logger.info(f"✅ Response status: {response.status_code}")
        response.raise_for_status()
        
        # Store current document in context for metadata
        ctx.deps.current_document = document_name
        
        markdown = response.text
        logger.info(f"✅ Received {len(markdown)} characters of markdown")
        return f"Document '{document_name}' content:\n\n{markdown}"
        
    except httpx.ConnectError as e:
        error_msg = f"❌ Connection error: Cannot connect to {ctx.deps.hocuspocus_url}. Is the Hocuspocus server running?"
        logger.error(error_msg, exc_info=True)
        logger.error(f"Connection error details: {str(e)}")
        return f"Error: {error_msg}\n\nDetails: {str(e)}\n\nPlease ensure the Hocuspocus server is running on {ctx.deps.hocuspocus_url}"
    except httpx.TimeoutException as e:
        error_msg = f"❌ Timeout: Request to {url} timed out after 30 seconds"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nDetails: {str(e)}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            logger.warning(f"⚠️  Document '{document_name}' not found (404)")
            return f"Error: Document '{document_name}' not found. Make sure it's open in the editor first."
        error_msg = f"❌ HTTP error {e.response.status_code}: {e.response.text}"
        logger.error(error_msg)
        return f"Error: HTTP {e.response.status_code} - {error_msg}"
    except Exception as e:
        error_msg = f"❌ Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return f"Error: {error_msg}\n\nType: {type(e).__name__}"


async def update_document_content(
    ctx: RunContext[DocumentContext],
    document_name: str,
    markdown_content: str,
    change_description: Optional[str] = None
) -> str:
    """
    Update a document with new markdown content.
    
    Args:
        document_name: The name/ID of the document to update
        markdown_content: The new markdown content (complete document)
        change_description: Optional description of what changed
        
    Returns:
        Confirmation message with change ID
    """
    url = f"{ctx.deps.hocuspocus_url}/api/ai/import/{document_name}"
    
    logger.info(f"🔍 Tool called: update_document_content('{document_name}')")
    logger.info(f"📡 Requesting: {url}")
    logger.info(f"📝 Content length: {len(markdown_content)} characters")
    logger.info(f"🌐 Hocuspocus URL: {ctx.deps.hocuspocus_url}")
    
    # Generate unique change ID
    change_id = f"ai-change-{uuid.uuid4().hex[:8]}"
    logger.info(f"🆔 Generated change ID: {change_id}")
    
    # Prepare headers with metadata
    headers = {
        "Content-Type": "text/markdown",
        "X-AI-Model": ctx.deps.model_name,
        "X-AI-Prompt": change_description or "AI-assisted edit",
        "X-AI-Change-Id": change_id
    }
    logger.info(f"📋 Headers: {headers}")
    
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
            f"✅ Document '{document_name}' updated successfully!\n"
            f"Change ID: {result['changeId']}\n"
            f"The change is now visible in the editor and can be accepted or rejected by the user."
        )
        
    except httpx.ConnectError as e:
        error_msg = f"❌ Connection error: Cannot connect to {ctx.deps.hocuspocus_url}. Is the Hocuspocus server running?"
        logger.error(error_msg, exc_info=True)
        logger.error(f"Connection error details: {str(e)}")
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


# ============================================================================
# AGENT CONFIGURATION
# ============================================================================

# Ollama model configuration
ollama_model = OpenAIChatModel(
    model_name='gpt-oss:20b',
    provider=OllamaProvider(base_url='http://192.168.178.83:11434/v1'),  
)

# Create document editor agent with tools
document_agent = Agent(
    ollama_model,
    deps_type=DocumentContext,
    tools=[
        get_document_content,
        update_document_content,
        duckduckgo_search_tool(),
    ],
    system_prompt="""You are a helpful document editing assistant with the following capabilities:

1. **Document Access**: You can read and write documents using the get_document_content and update_document_content tools.

2. **Editing Workflow**:
   - First, ALWAYS fetch the current document content using get_document_content
   - Analyze the user's request carefully
   - Modify the markdown content as requested
   - Write back the COMPLETE document using update_document_content
   
3. **Important Rules**:
   - ALWAYS work with the full document content - never just send partial updates
   - Preserve all existing content that shouldn't change
   - Maintain proper markdown formatting
   - When updating, provide a clear change_description
   
4. **Web Search**: You can also search the web using DuckDuckGo when users need current information.

Be concise and helpful. After making changes, let the user know they can accept or reject the changes in their editor.
""",
)


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Pydantic AI Chat API"}


@app.post("/api/chat")
async def chat(request: Request, background: BackgroundTasks) -> Response:
    """
    Chat endpoint that handles Vercel AI Data Stream Protocol requests.
    Maintains a shared HTTP client for all document operations within a conversation.
    """
    logger.info("💬 Chat request received")
    
    # Create HTTP client that will stay alive during the entire request
    # We use BackgroundTasks to clean it up after the streaming response completes
    http_client = httpx.AsyncClient(timeout=30.0)
    deps = DocumentContext(http_client=http_client)
    
    logger.info(f"🌐 Created HTTP client for Hocuspocus: {deps.hocuspocus_url}")
    
    # Schedule cleanup after response completes
    # This ensures the client stays alive during tool calls in the streaming response
    background.add_task(http_client.aclose)
    
    logger.info("🚀 Dispatching to VercelAIAdapter")
    return await VercelAIAdapter.dispatch_request(
        request,
        agent=document_agent,
        deps=deps,
        sdk_version=6
    )