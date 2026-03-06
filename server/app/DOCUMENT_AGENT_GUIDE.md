# Document Editing Agent - Implementation Guide

## Overview

The Pydantic AI agent has been enhanced with document editing capabilities, allowing it to read and write documents through the existing Hocuspocus endpoints.

## Architecture

### Level 1 - Single Agent with Tools ✅

Following the [Pydantic AI multi-agent documentation](https://ai.pydantic.dev/multi-agent-applications/), we've implemented a **Level 1** architecture (single agent with tools), which is perfect for this use case.

**Why Level 1?**
- Simple, straightforward workflow
- Single agent manages document operations
- Two focused tools: read and write
- Easily extensible to higher levels if needed later

## Components

### 1. Dependencies (`DocumentContext`)

```python
@dataclass
class DocumentContext:
    http_client: httpx.AsyncClient      # Shared HTTP client
    hocuspocus_url: str                 # Node.js server URL (default: http://localhost:3001)
    current_document: Optional[str]     # Tracks current document
    model_name: str                     # AI model name for metadata
```

**Purpose**: Provides shared state and resources across tool calls within a conversation.

### 2. Tools

#### `get_document_content(ctx, document_name) -> str`

**What it does**: Fetches document content as markdown from the Hocuspocus server

**Flow**:
1. Makes GET request to `/api/ai/export/{documentName}`
2. Returns markdown content with document name context
3. Stores document name in context for metadata tracking

**Example**:
```python
# Agent calls this internally when user asks to view/edit a document
content = await get_document_content(ctx, "API_DOCS")
# Returns: "Document 'API_DOCS' content:\n\n# API Documentation\n..."
```

#### `update_document_content(ctx, document_name, markdown_content, change_description) -> str`

**What it does**: Writes updated markdown back to the document

**Flow**:
1. Generates unique change ID (e.g., `ai-change-a1b2c3d4`)
2. Sends POST to `/api/ai/import/{documentName}` with:
   - Full markdown content in body
   - Metadata headers: `X-AI-Model`, `X-AI-Prompt`, `X-AI-Change-Id`
3. Returns success confirmation with change ID

**Example**:
```python
# Agent calls this after modifying the content
result = await update_document_content(
    ctx, 
    "API_DOCS", 
    updated_markdown,
    "Added security best practices section"
)
# Returns: "✅ Document 'API_DOCS' updated successfully!\nChange ID: ai-change-a1b2c3d4\n..."
```

### 3. Agent Configuration

The `document_agent` is configured with:
- **Model**: Ollama (gpt-oss:20b)
- **Dependencies**: `DocumentContext`
- **Tools**: 
  - `get_document_content`
  - `update_document_content`
  - `duckduckgo_search_tool()` (for web search)
- **System Prompt**: Instructs the agent on proper document editing workflow

## Usage Flow

### Example 1: Add Content to Document

**User Input**: "Add a new section about authentication to the API_DOCS document"

**Agent Workflow**:

1. **Fetch Current Content**
   ```
   Tool Call: get_document_content("API_DOCS")
   → Returns full markdown content
   ```

2. **Analyze & Modify**
   - Agent reads the current content
   - Identifies where to insert the new section
   - Creates the complete updated markdown (preserving existing content)

3. **Write Back**
   ```
   Tool Call: update_document_content(
       "API_DOCS",
       complete_updated_markdown,
       "Added authentication section"
   )
   → Change applied and broadcasted to editor
   ```

4. **User Feedback**
   - Agent confirms the change
   - Change appears in editor with accept/reject UI
   - Change ID tracked for potential undo

### Example 2: Research and Update

**User Input**: "Search for the latest OAuth 2.1 best practices and add them to SECURITY_GUIDE"

**Agent Workflow**:

1. **Web Search**
   ```
   Tool Call: duckduckgo_search("OAuth 2.1 best practices 2026")
   → Returns current information
   ```

2. **Fetch Document**
   ```
   Tool Call: get_document_content("SECURITY_GUIDE")
   ```

3. **Synthesize & Update**
   - Combines search results with document content
   - Creates updated markdown
   
4. **Write Back**
   ```
   Tool Call: update_document_content(
       "SECURITY_GUIDE",
       updated_content,
       "Added OAuth 2.1 best practices based on 2026 standards"
   )
   ```

## Integration Points

### With Hocuspocus Server (Node.js)

**Export Endpoint**: `GET /api/ai/export/:documentName`
- Returns: Raw markdown (Content-Type: text/markdown)
- Source: Live Yjs document or S3 fallback

**Import Endpoint**: `POST /api/ai/import/:documentName`
- Body: Raw markdown
- Headers: 
  - `Content-Type: text/markdown`
  - `X-AI-Model`: Model identifier
  - `X-AI-Prompt`: Change description
  - `X-AI-Change-Id`: Unique change identifier
- Result: Change applied and broadcasted to all connected clients

### With Frontend (React/Next.js)

- Changes appear in real-time via Yjs CRDT synchronization
- Accept/Reject UI already implemented (out of scope)
- Change tracking via `aiChangeHistory` Yjs Map

## Key Design Decisions

### ✅ Full Document Pattern

**Decision**: Agent works with complete markdown documents, not diffs

**Rationale**:
- Simpler for AI to reason about
- Aligns with existing import/export design
- Node.js layer handles CRDT complexity
- Reduces risk of partial update corruption

### ✅ Metadata via Headers

**Decision**: Pass metadata (model, prompt, change ID) via HTTP headers

**Rationale**:
- Keeps markdown body clean
- Matches existing API design
- Enables proper change tracking
- Supports accept/reject workflow

### ✅ Dependency Injection Pattern

**Decision**: Use `DocumentContext` with shared `httpx.AsyncClient`

**Rationale**:
- Efficient connection reuse
- Clean separation of concerns
- Testable tool functions
- Follows Pydantic AI best practices

### ✅ Single Agent (Level 1)

**Decision**: Start with simple single-agent architecture

**Rationale**:
- Workflow is straightforward (read → modify → write)
- No need for specialized sub-agents yet
- Easy to upgrade to Level 2-4 later if needed
- Keeps complexity minimal

## Error Handling

### Document Not Found
```
Error: Document 'XYZ' not found. Make sure it's open in the editor first.
```
**Cause**: Document doesn't exist in memory or S3
**Solution**: User needs to open document in editor first

### Network Errors
Tools return descriptive error messages that the agent can communicate to users naturally.

### HTTP Errors
- 404: Document not found
- 400: Invalid markdown format
- 500: Server-side errors
All handled gracefully with user-friendly messages.

## Testing

### Manual Testing

1. **Start Servers**
   ```bash
   # Terminal 1: Hocuspocus server
   cd server/hocuspocus
   pnpm dev
   
   # Terminal 2: Python API
   cd server/app
   uvicorn main:app --reload --port 8000
   
   # Terminal 3: Frontend
   cd client
   pnpm dev
   ```

2. **Test Document Editing**
   - Open a document in the editor
   - In chat: "Add a section about testing to this document"
   - Verify change appears in editor
   - Test accept/reject functionality

3. **Test Web Search Integration**
   - "Search for Python best practices and add them to NOTES"
   - Verify agent searches, then updates document

### Programmatic Testing

```python
import httpx
from main import DocumentContext, get_document_content, update_document_content

async def test_tools():
    async with httpx.AsyncClient() as client:
        ctx_mock = type('ctx', (), {
            'deps': DocumentContext(http_client=client)
        })()
        
        # Test read
        content = await get_document_content(ctx_mock, "test-doc")
        print(content)
        
        # Test write
        result = await update_document_content(
            ctx_mock,
            "test-doc",
            "# Updated Content\n\nNew paragraph",
            "Test update"
        )
        print(result)
```

## Future Enhancements

When ready to scale, consider:

1. **Level 2 - Agent Delegation**
   - Specialized agents for different document types
   - E.g., `technical_writer_agent` → `code_formatter_agent`

2. **Additional Tools**
   - `preview_changes()`: Show diff before applying
   - `search_within_document()`: Semantic search in documents
   - `manage_change_history()`: Undo/redo operations
   - `multi_document_operation()`: Work across multiple docs

3. **Level 3 - Programmatic Hand-off**
   - Sequential workflows: research → draft → review → publish

4. **Observability**
   - Integrate Logfire for debugging multi-tool workflows
   - Track token usage per document operation
   - Monitor tool call patterns

## Troubleshooting

### Agent doesn't call tools

**Check**: System prompt clarity
**Solution**: Ensure agent instructions clearly state when to use each tool

### Changes not appearing in editor

**Check**: 
1. Document is open in editor
2. Hocuspocus server is running (ws://127.0.0.1:1234)
3. Network connectivity between Python and Node.js servers

**Solution**: Check server logs for broadcast confirmation

### Markdown formatting issues

**Check**: Agent is sending complete, valid markdown
**Solution**: Verify `update_document_content` receives full document, not fragments

## Configuration

### Environment Variables

Create `.env` in `server/app/`:

```env
HOCUSPOCUS_URL=http://localhost:3001
OLLAMA_BASE_URL=http://192.168.178.83:11434/v1
OLLAMA_MODEL=gpt-oss:20b
```

Update `main.py` to use these:

```python
import os
from dotenv import load_dotenv

load_dotenv()

# Then use:
hocuspocus_url: str = os.getenv("HOCUSPOCUS_URL", "http://localhost:3001")
```

## References

- [Pydantic AI Multi-Agent Applications](https://ai.pydantic.dev/multi-agent-applications/)
- [Pydantic AI Tools Documentation](https://ai.pydantic.dev/tools/)
- [Pydantic AI Dependencies](https://ai.pydantic.dev/dependencies/)
- [Vercel AI SDK Integration](https://ai.pydantic.dev/ui/vercel-ai/)

---

**Implementation Date**: 2026-03-05  
**Architecture Level**: Level 1 - Single Agent with Tools  
**Status**: Production Ready ✅
