# AI Integration Guide

This document explains how to use the AI export/import functionality with undo support.

## Overview

The system allows you to:
1. **Export** collaborative documents as Markdown for AI processing
2. **Import** AI-modified content back into the live document
3. **Undo** all AI changes with a single button click
4. **Redo** AI changes if needed

## Architecture

```
┌──────────────────┐
│  Client Editor   │  ← Users see changes in real-time
│   (Milkdown)     │  ← Undo/Redo buttons for AI changes
└────────┬─────────┘
         │ WebSocket (Yjs CRDT sync)
         ▼
┌──────────────────┐      ┌─────────────┐
│  Hocuspocus      │◄────►│  MinIO/S3   │
│  Server          │      │  (.bin)     │
└────────┬─────────┘      └─────────────┘
         │ HTTP REST API
         ▼
┌──────────────────┐
│   AI Service     │
│  (your code)     │
└──────────────────┘
```

## API Endpoints

### 1. Export Document

**GET** `/api/ai/export/:documentName`

Exports a document as Markdown for AI processing.

**Response:**
```json
{
  "documentName": "my-document",
  "markdown": "# Title\n\nContent here...",
  "source": "memory",
  "length": 1234,
  "exportedAt": "2026-03-05T10:00:00Z"
}
```

**Example:**
```bash
curl http://127.0.0.1:3001/api/ai/export/shared-document
```

### 2. Import AI Changes

**POST** `/api/ai/import/:documentName`

Applies AI-edited Markdown back to the document with 'ai' transaction origin (for undo support).

**Request Body:**
```json
{
  "markdown": "# Updated Title\n\nAI improved content...",
  "metadata": {
    "model": "gpt-4",
    "changeId": "edit-123",
    "prompt": "Improve clarity"
  }
}
```

**Response:**
```json
{
  "success": true,
  "documentName": "my-document",
  "length": 1456,
  "appliedAt": "2026-03-05T10:05:00Z",
  "metadata": { ... }
}
```

**Example:**
```bash
curl -X POST http://127.0.0.1:3001/api/ai/import/shared-document \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# AI Improved\n\nBetter content...",
    "metadata": {
      "model": "gpt-4",
      "changeId": "edit-456"
    }
  }'
```

### 3. Get AI Metadata

**GET** `/api/ai/metadata/:documentName`

Retrieves AI edit metadata for a document.

**Response:**
```json
{
  "documentName": "my-document",
  "lastEdit": {
    "timestamp": 1709636700000,
    "model": "gpt-4",
    "changeId": "edit-123"
  }
}
```

## Usage Flow

### Complete Example

```javascript
// 1. Export document for AI
const exportRes = await fetch('http://127.0.0.1:3001/api/ai/export/my-document');
const { markdown } = await exportRes.json();

// 2. Send to your AI service
const aiResponse = await yourAI.process({
  content: markdown,
  prompt: 'Improve the writing quality'
});

// 3. Import AI changes back
const importRes = await fetch('http://127.0.0.1:3001/api/ai/import/my-document', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markdown: aiResponse.improvedContent,
    metadata: {
      model: 'gpt-4',
      changeId: aiResponse.id,
      prompt: 'Improve the writing quality'
    }
  })
});

// 4. Changes appear in all connected editors instantly
// 5. Users can click "⎌ Undo AI" to revert all AI changes
```

## Client Features

### Undo/Redo Buttons

The editor includes two buttons in the status bar:

- **⎌ Undo AI** - Reverts ALL AI changes while preserving user edits
- **⟲ Redo AI** - Reapplies undone AI changes

These buttons:
- Auto-enable/disable based on undo stack state
- Only affect changes with 'ai' transaction origin
- Don't interfere with regular Ctrl+Z/Ctrl+Y (user edits)

### How It Works

1. **Y.UndoManager** tracks transactions by origin
2. AI changes use `'ai'` origin (set server-side)
3. User edits use default origin
4. Separate undo stacks = independent undo/redo

## Testing

### Run the Test Script

```bash
cd server/hocuspocus
node test-ai-flow.js [document-name]
```

This script:
1. Exports a document
2. Simulates AI changes (adds footer)
3. Imports changes back
4. Verifies metadata

### Manual Testing

1. **Start the server:**
   ```bash
   cd server/hocuspocus
   npm run dev
   ```

2. **Start the client:**
   ```bash
   cd client
   npm run dev
   ```

3. **Open editor:**
   - Navigate to http://localhost:3000
   - Create/open a document
   - Type some content

4. **Test export:**
   ```bash
   curl http://127.0.0.1:3001/api/ai/export/shared-document
   ```

5. **Test import:**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/ai/import/shared-document \
     -H "Content-Type: application/json" \
     -d '{"markdown": "# AI Changed This\n\nNew content!"}'
   ```

6. **Test undo:**
   - Click "⎌ Undo AI" in the editor
   - Content should revert to before AI changes
   - Your manual edits remain intact

## Important Notes

### Document Must Be Open

The import endpoint requires the document to be **open in an editor** (loaded in memory). This ensures:
- ✅ Real-time sync to all connected clients
- ✅ Proper undo/redo support
- ✅ Transaction origin tracking

If document is not open, you'll get:
```json
{
  "error": "Document not loaded in memory",
  "hint": "Please open the document in an editor first..."
}
```

### Transaction Origins

- **User edits:** Default origin (empty string)
- **AI edits:** `'ai'` origin
- **System edits:** Could use `'system'` origin

The `Y.UndoManager` only tracks operations with the `'ai'` origin, allowing selective undo.

### Markdown Conversion

Uses ProseMirror's default markdown parser/serializer:
- ✅ Headings (h1-h6)
- ✅ Bold, italic, code
- ✅ Lists (ordered/unordered)
- ✅ Blockquotes
- ✅ Code blocks
- ✅ Links, images

If you need custom markdown features, extend the schema and serializer.

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200** - Success
- **400** - Bad request (missing markdown)
- **404** - Document not found/loaded
- **500** - Server error

Example error response:
```json
{
  "error": "Failed to import AI changes",
  "message": "Invalid markdown syntax",
  "documentName": "my-document"
}
```

## Security Considerations

⚠️ **Current Implementation:**
- No authentication
- No rate limiting
- No input validation beyond markdown parsing

🔒 **For Production:**
- Add authentication middleware
- Implement rate limiting
- Validate markdown length/complexity
- Sanitize metadata fields
- Add user permissions

## Dependencies

### Server
```json
{
  "yjs": "^13.6.29",
  "y-prosemirror": "^1.3.7",
  "prosemirror-model": "^1.22.3",
  "prosemirror-markdown": "^1.13.1"
}
```

### Client
```json
{
  "yjs": "^13.6.29",
  "y-prosemirror": "^1.3.7"
}
```

All dependencies are already installed and configured.

## Troubleshooting

### "Document not loaded" error
**Solution:** Open the document in an editor first. The import endpoint needs an active connection.

### Changes don't appear in editor
**Solution:** Make sure the client is connected (green "Synced & Ready" indicator).

### Undo button disabled
**Solution:** This is normal if no AI changes have been made. Make an import request first.

### "Failed to parse markdown"
**Solution:** Ensure the markdown is valid. Test with simple content first.

## Next Steps

- Integrate with your AI service (OpenAI, Anthropic, etc.)
- Add authentication and authorization
- Implement rate limiting
- Add logging and monitoring
- Create a UI for AI prompts in the editor
- Add streaming support for real-time AI generation

## Support

For issues or questions:
1. Check the console logs (both client and server)
2. Run the test script: `node test-ai-flow.js`
3. Verify all dependencies are installed
4. Ensure MinIO/S3 is running
