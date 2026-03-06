# Quick Start - Document Editing Agent

## What Changed?

The Pydantic AI agent can now **read and write documents** by calling your existing Hocuspocus endpoints as tools.

## Implementation Summary

### ✅ Architecture: Level 1 (Single Agent with Tools)
- Simple, robust, scalable
- Two tools: `get_document_content` and `update_document_content`
- Integration with existing endpoints via HTTP
- Full document editing workflow

### ✅ New Components in `server/app/main.py`

1. **DocumentContext** - Dependency injection for shared HTTP client
2. **get_document_content** - Tool to read documents (calls `/api/ai/export/:documentName`)
3. **update_document_content** - Tool to write documents (calls `/api/ai/import/:documentName`)
4. **document_agent** - Enhanced agent with document editing capabilities

## Testing the Implementation

### 1. Start All Servers

```bash
# Terminal 1: Hocuspocus (Node.js) - Port 3001 & WebSocket 1234
cd server/hocuspocus
pnpm dev

# Terminal 2: Python AI API - Port 8000
cd server/app
uvicorn main:app --reload --port 8000

# Terminal 3: Frontend - Port 3000
cd client
pnpm dev
```

### 2. Test Document Editing

Open http://localhost:3000 in browser:

1. **Create/Open a document** in the editor (e.g., "test-doc")

2. **In the chat, try these commands:**

```
"Add a new section about API security to test-doc"
```

**Expected Flow:**
- Agent calls `get_document_content("test-doc")`
- Agent reads current content
- Agent modifies markdown (adds security section)
- Agent calls `update_document_content("test-doc", new_content, "Added API security section")`
- ✅ Change appears in editor immediately
- Accept/Reject buttons appear in UI

3. **Try web search + document update:**

```
"Search for Python best practices 2026 and add them to test-doc"
```

**Expected Flow:**
- Agent calls `duckduckgo_search("Python best practices 2026")`
- Agent gets search results
- Agent calls `get_document_content("test-doc")`
- Agent synthesizes content
- Agent calls `update_document_content("test-doc", updated_content, "Added Python 2026 best practices")`
- ✅ Change appears in editor

### 3. Verify the Integration

**Check Node.js logs** (Terminal 1):
```
🤖 AI Export requested for: test-doc
✅ Document loaded from memory
✅ Exported 1234 chars from memory

🤖 AI Import: test-doc
🤖 AI connecting as collaborator...
✅ Applied: ai-change-a1b2c3d4 (AI disconnected)
```

**Check Python logs** (Terminal 2):
```
INFO: Calling tool: get_document_content
INFO: Calling tool: update_document_content
```

**Check Browser** (Frontend):
- Document updates in real-time
- Accept/Reject UI appears
- Change tracked in `aiChangeHistory`

## Example User Queries

### Document Editing
```
✅ "Add a table of contents to PROJECT_NOTES"
✅ "Fix the formatting in section 3 of REPORT"
✅ "Add code examples to the API_DOCS"
✅ "Create a summary section at the top of MEETING_NOTES"
```

### Research + Edit
```
✅ "Search for the latest React 19 features and add them to TECH_STACK"
✅ "Find OAuth 2.1 best practices and update SECURITY_GUIDE"
✅ "Look up FastAPI async patterns and add examples to BACKEND_GUIDE"
```

### Multi-step Tasks
```
✅ "Review TODO_LIST, mark completed items, and add new tasks"
✅ "Read CHANGELOG, then add a new version entry for today"
```

## Troubleshooting

### "Document not found" error
**Problem**: Document doesn't exist  
**Solution**: Open the document in the editor first (creates it in Yjs/S3)

### Agent doesn't call tools
**Problem**: Agent not recognizing when to use tools  
**Solution**: Be specific: "Add X to document-name" or "Update document-name with Y"

### Changes not appearing in editor
**Problem**: Hocuspocus server not running or document not open  
**Solution**: 
1. Check Terminal 1 - is Hocuspocus running?
2. Is the document open in the editor?
3. Check browser console for WebSocket connection

### HTTP connection errors
**Problem**: Python can't reach Node.js server  
**Solution**: Verify `hocuspocus_url` in DocumentContext (line 34) matches your Node.js port (default: http://localhost:3001)

## API Endpoints Used

### Export (Read)
```http
GET http://localhost:3001/api/ai/export/{documentName}
Response: Raw markdown (text/markdown)
```

### Import (Write)
```http
POST http://localhost:3001/api/ai/import/{documentName}
Content-Type: text/markdown
X-AI-Model: gpt-oss:20b
X-AI-Prompt: Change description
X-AI-Change-Id: ai-change-{uuid}

Body: Complete markdown document
```

## Key Files Modified

- ✅ `server/app/main.py` - Main implementation
- ✅ `server/app/DOCUMENT_AGENT_GUIDE.md` - Comprehensive guide
- ✅ `server/app/QUICK_START.md` - This file

## Next Steps

### Immediate
1. Test the basic flow (add content to document)
2. Test web search integration
3. Verify accept/reject works in UI

### Future Enhancements
1. Add `preview_changes` tool (show diff before applying)
2. Add `search_within_document` tool (semantic search in docs)
3. Add multi-document operations
4. Upgrade to Level 2 (agent delegation) if needed
5. Add Logfire observability

## Architecture Decision

We chose **Level 1 - Single Agent with Tools** because:

✅ Simple workflow (read → modify → write)  
✅ No need for specialized sub-agents  
✅ Easy to test and debug  
✅ Scalable to higher levels later  
✅ Follows Pydantic AI best practices  
✅ Minimal complexity for maximum value  

Reference: https://ai.pydantic.dev/multi-agent-applications/#agent-delegation

---

**Status**: ✅ Ready to Test  
**Implementation Date**: 2026-03-05  
**Pattern**: Level 1 - Single Agent with Tools
