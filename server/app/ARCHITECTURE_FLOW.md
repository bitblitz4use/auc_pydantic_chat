# Document Editing Agent - Architecture & Flow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                                   │
│  ┌──────────────────────┐              ┌─────────────────────────────┐  │
│  │   React Editor       │              │    Chat Interface           │  │
│  │   (Milkdown)         │◄────────────►│    (Vercel AI SDK)          │  │
│  │   - Live editing     │   Yjs CRDT   │    - Stream responses       │  │
│  │   - Accept/Reject UI │   Sync       │    - Tool call visualization│  │
│  └──────────────────────┘              └─────────────────────────────┘  │
│           │                                         │                    │
│           │ WebSocket                               │ HTTP POST          │
│           │ (ws://localhost:1234)                   │ (/api/chat)        │
└───────────┼─────────────────────────────────────────┼────────────────────┘
            │                                         │
            ▼                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        BACKEND SERVERS                                     │
├─────────────────────────────────────┬─────────────────────────────────────┤
│   Hocuspocus Server (Node.js)       │   Pydantic AI Server (Python)       │
│   Port: 3001 / WebSocket: 1234      │   Port: 8000                        │
├─────────────────────────────────────┼─────────────────────────────────────┤
│                                     │                                     │
│  ┌───────────────────────────────┐  │  ┌──────────────────────────────┐  │
│  │  Yjs Document Store           │  │  │  FastAPI Application         │  │
│  │  - In-memory live docs        │  │  │  - CORS middleware           │  │
│  │  - S3 persistence            │  │  │  - /api/chat endpoint        │  │
│  │  - CRDT operations           │  │  └──────────────────────────────┘  │
│  └───────────────────────────────┘  │               │                    │
│                │                     │               ▼                    │
│                │                     │  ┌──────────────────────────────┐  │
│  ┌────────────▼──────────────────┐  │  │  VercelAIAdapter             │  │
│  │  AI Routes (Express)          │  │  │  - Stream protocol handler   │  │
│  │  /api/ai/export/:docName      │◄─┼──│  - SSE streaming             │  │
│  │  /api/ai/import/:docName      │  │  └──────────────────────────────┘  │
│  │  /api/ai/changes/:docName     │  │               │                    │
│  │  /api/ai/accept/:docName/:id  │  │               ▼                    │
│  │  /api/ai/reject/:docName/:id  │  │  ┌──────────────────────────────┐  │
│  └───────────────────────────────┘  │  │  Document Agent              │  │
│                ▲                     │  │  (Pydantic AI)               │  │
│                │ HTTP                │  │                              │  │
│                │ GET/POST            │  │  Model: Ollama (gpt-oss:20b) │  │
│                │                     │  │  Deps: DocumentContext       │  │
│                │                     │  │                              │  │
│                │                     │  │  Tools:                      │  │
│                └─────────────────────┼──│  • get_document_content      │  │
│                                     │  │  • update_document_content   │  │
│                                     │  │  • duckduckgo_search_tool    │  │
│                                     │  └──────────────────────────────┘  │
│                                     │               │                    │
└─────────────────────────────────────┴───────────────┼────────────────────┘
                                                      │
                                                      ▼
                                          ┌────────────────────────┐
                                          │  Ollama Server         │
                                          │  192.168.178.83:11434  │
                                          │  Model: gpt-oss:20b    │
                                          └────────────────────────┘
```

## Data Flow: User Edits Document via AI

### Example: "Add a security section to API_DOCS"

```
Step 1: User Message
───────────────────────────────────────────────────────────────────
Browser Chat → POST /api/chat
{
  "messages": [
    {"role": "user", "content": "Add a security section to API_DOCS"}
  ]
}

Step 2: Agent Reasoning
───────────────────────────────────────────────────────────────────
Pydantic AI Agent analyzes:
- User wants to modify document "API_DOCS"
- Need to read current content first
- Decision: Call get_document_content tool

Step 3: Read Document (Tool Call #1)
───────────────────────────────────────────────────────────────────
Python (Agent) → HTTP GET → Node.js
URL: http://localhost:3001/api/ai/export/API_DOCS

Node.js (ai.js):
├─ Check live documents in memory
├─ If not found, load from S3
├─ Convert Yjs → Markdown (yjsToMarkdown)
└─ Return: "# API Documentation\n\nExisting content..."

Python ← Markdown response
Tool returns to Agent: "Document 'API_DOCS' content:\n\n# API Documentation..."

Step 4: Agent Processes Content
───────────────────────────────────────────────────────────────────
Agent (Ollama):
├─ Reads current markdown
├─ Analyzes structure
├─ Composes new section about security
├─ Creates COMPLETE updated document
└─ Decision: Call update_document_content tool

Step 5: Write Document (Tool Call #2)
───────────────────────────────────────────────────────────────────
Python (Agent) → HTTP POST → Node.js
URL: http://localhost:3001/api/ai/import/API_DOCS

Headers:
  Content-Type: text/markdown
  X-AI-Model: gpt-oss:20b
  X-AI-Prompt: Added security best practices section
  X-AI-Change-Id: ai-change-a1b2c3d4

Body: (Complete updated markdown)
# API Documentation

Existing content...

## Security Best Practices

1. Always use HTTPS
2. Implement rate limiting
...

Node.js (ai.js):
├─ Parse markdown → ProseMirror document
├─ Connect as AI collaborator (applyAIChangesAsCollaborator)
├─ Apply to Yjs document (triggers CRDT sync)
├─ Store change metadata in aiChangeHistory Map
├─ Broadcast to all connected clients
└─ Return: {success: true, changeId: "ai-change-a1b2c3d4"}

Python ← JSON response
Tool returns to Agent: "✅ Document 'API_DOCS' updated successfully!..."

Step 6: Stream Response to User
───────────────────────────────────────────────────────────────────
Python (VercelAIAdapter) → SSE Stream → Browser

data: 0:"I've added a security section to API_DOCS..."
data: 0:"The change is now visible and you can accept or reject it."

Step 7: Real-time Editor Update
───────────────────────────────────────────────────────────────────
Browser Editor (React):
├─ Receives Yjs update via WebSocket
├─ CRDT automatically merges changes
├─ Editor content updates in real-time
├─ Accept/Reject UI appears
└─ Change highlighted in editor
```

## Component Interactions

### Python Side (`server/app/main.py`)

```python
# 1. HTTP Request arrives
@app.post("/api/chat")
async def chat(request: Request):
    # 2. Create shared HTTP client for this conversation
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        deps = DocumentContext(http_client=http_client)
        
        # 3. Dispatch to agent via Vercel AI adapter
        return await VercelAIAdapter.dispatch_request(
            request,
            agent=document_agent,
            deps=deps
        )

# 4. Agent receives message and decides to call tools

# 5. Tool: Read document
async def get_document_content(ctx, document_name):
    url = f"{ctx.deps.hocuspocus_url}/api/ai/export/{document_name}"
    response = await ctx.deps.http_client.get(url)
    return response.text

# 6. Agent processes, decides to write

# 7. Tool: Write document
async def update_document_content(ctx, document_name, markdown_content, change_description):
    url = f"{ctx.deps.hocuspocus_url}/api/ai/import/{document_name}"
    headers = {
        "Content-Type": "text/markdown",
        "X-AI-Model": ctx.deps.model_name,
        "X-AI-Prompt": change_description,
        "X-AI-Change-Id": f"ai-change-{uuid.uuid4().hex[:8]}"
    }
    response = await ctx.deps.http_client.post(url, content=markdown_content, headers=headers)
    return f"✅ Document updated! Change ID: {response.json()['changeId']}"
```

### Node.js Side (`server/hocuspocus/routes/ai.js`)

```javascript
// Export: Convert Yjs document to markdown
router.get('/export/:documentName', async (req, res) => {
    const liveDoc = getLiveDocument(documentName);
    const yjsBinary = Y.encodeStateAsUpdate(liveDoc);
    const markdown = yjsToMarkdown(yjsBinary);
    res.send(markdown);
});

// Import: Apply markdown changes to Yjs document
router.post('/import/:documentName', async (req, res) => {
    const markdown = req.body;
    const metadata = {
        model: req.headers['x-ai-model'],
        prompt: req.headers['x-ai-prompt'],
        changeId: req.headers['x-ai-change-id']
    };
    
    // Apply as AI collaborator (triggers all Hocuspocus hooks)
    const result = await applyAIChangesAsCollaborator(documentName, markdown, metadata);
    
    res.json({
        success: true,
        changeId: result.changeId,
        broadcast: 'as-collaborator'
    });
});
```

## Key Design Patterns

### 1. Dependency Injection (DocumentContext)

```python
@dataclass
class DocumentContext:
    http_client: httpx.AsyncClient  # ✅ Reused across tools
    hocuspocus_url: str              # ✅ Configurable endpoint
    current_document: Optional[str]  # ✅ Tracks state
    model_name: str                  # ✅ Metadata for tracking
```

**Benefits:**
- Single HTTP client per conversation (connection pooling)
- Easy to test (mock the context)
- Clean separation of concerns
- Follows Pydantic AI best practices

### 2. Tool Functions (RunContext pattern)

```python
async def get_document_content(
    ctx: RunContext[DocumentContext],  # ✅ Access to dependencies
    document_name: str                 # ✅ Agent provides parameter
) -> str:                              # ✅ Returns user-friendly message
    # Tool implementation
    pass
```

**Benefits:**
- Agent automatically calls with correct parameters
- Return values guide agent reasoning
- Error handling produces natural language messages
- Testable in isolation

### 3. Full Document Pattern

```
Agent doesn't work with diffs, it works with COMPLETE documents:

❌ Wrong: Send only the new section
✅ Correct: Send entire document with new section inserted

Why?
- Simpler for AI to reason about context
- Prevents partial update corruption
- Node.js layer handles CRDT complexity
- Matches your existing import/export design
```

### 4. Metadata via Headers

```python
headers = {
    "X-AI-Model": "gpt-oss:20b",           # Track which model
    "X-AI-Prompt": "Added security",       # Track intent
    "X-AI-Change-Id": "ai-change-xyz"      # Unique identifier
}
```

**Benefits:**
- Clean markdown body
- Enables change tracking
- Supports accept/reject workflow
- Maintains audit trail

## Scalability Path

### Current: Level 1 (Single Agent)
```
User → Agent → [get_doc, update_doc, search] → Response
```

### Future: Level 2 (Agent Delegation)
```
User → Primary Agent → Technical Writer Agent → [get_doc, update_doc]
                    → Research Agent → [search, get_doc]
                    → Code Reviewer Agent → [get_doc, lint_check]
```

### Future: Level 3 (Programmatic Hand-off)
```
User → Research Phase (Agent 1) → Draft Phase (Agent 2) → Review Phase (Agent 3) → Publish
```

### Future: Level 4 (Graph-based)
```
State machine with conditional branching, loops, parallel execution
```

## Error Handling Strategy

### Tool Level (Python)
```python
try:
    response = await http_client.get(url)
    response.raise_for_status()
except httpx.HTTPStatusError as e:
    if e.response.status_code == 404:
        return "Error: Document not found. Open it in the editor first."
    raise
except Exception as e:
    return f"Error: {str(e)}"
```

**Result:** Agent receives descriptive error, communicates naturally to user

### API Level (Node.js)
```javascript
try {
    // ... operation
} catch (error) {
    res.status(500).json({ 
        error: 'Failed to import',
        message: error.message 
    });
}
```

**Result:** Python tool receives structured error, formats for agent

## Performance Considerations

### HTTP Client Reuse
```python
# ✅ Single client per conversation (connection pooling)
async with httpx.AsyncClient(timeout=30.0) as http_client:
    deps = DocumentContext(http_client=http_client)
    # Used across multiple tool calls
```

### Timeouts
```python
httpx.AsyncClient(timeout=30.0)  # 30 second timeout for large documents
```

### CRDT Efficiency
- Node.js maintains live documents in memory
- Only S3 fallback when document not active
- Yjs handles efficient binary encoding
- WebSocket broadcasts only deltas

## Security Considerations

1. **CORS**: Restricted to localhost:3000 (frontend)
2. **Input Validation**: Markdown validated before parsing
3. **Change Tracking**: All changes have unique IDs and metadata
4. **Accept/Reject**: User has final approval on all AI changes
5. **Audit Trail**: Change history stored in Yjs Map

## Observability (Future)

With Logfire:
```python
import logfire
logfire.configure()
logfire.instrument_pydantic_ai()

# Automatically traces:
# - Which tools were called
# - Token usage per tool
# - Latency breakdown
# - Errors and retries
```

---

**Architecture Level**: Level 1 - Single Agent with Tools  
**Status**: Production Ready ✅  
**Last Updated**: 2026-03-05
