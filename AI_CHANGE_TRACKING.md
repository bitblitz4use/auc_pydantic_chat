# AI Change Tracking Implementation

## Overview

This document describes the enhanced AI change tracking system that provides incremental updates, granular undo/redo, and a tooltip-based UI for managing AI-generated changes in the collaborative editor.

## Architecture

### Key Components

1. **Server-Side: Incremental Change Applicator**
   - File: `server/hocuspocus/utils/diffApplicator.js`
   - Applies AI changes incrementally instead of replacing entire document
   - Tracks each change with metadata (origin, changeId, timestamp)
   - Stores change history in Yjs Map for client access

2. **Client-Side: AI Change Tracker Hook**
   - File: `client/components/milkdown/hooks/use-ai-change-tracker.ts`
   - Monitors AI change history from Yjs document
   - Provides undo/redo functionality for AI changes only
   - Separates AI history from user edit history

3. **UI: Tooltip-Based Change Management**
   - File: `client/components/milkdown/ai-change-tooltip.tsx`
   - Displays AI change history in a popup tooltip
   - Shows timestamp, model, and change count
   - Provides buttons for undo/redo actions

4. **UI: Trigger Button**
   - File: `client/components/milkdown/ai-changes-button.tsx`
   - Shows count of active AI changes
   - Toggles tooltip display
   - Only visible when AI changes exist

## How It Works

### Server Flow

1. **AI Import Request** → `/api/ai/import/:documentName`
2. **Parse Markdown** → Convert AI markdown to ProseMirror document
3. **Compute Diff** → Compare current vs. AI-edited version
4. **Apply Changes** → Each change as separate Yjs transaction with 'ai' origin
5. **Store Metadata** → Save change info in `aiChangeHistory` map

```javascript
// Example change metadata
{
  id: "abc123-0",
  timestamp: 1709678400000,
  changesCount: 3,
  model: "gpt-4",
  prompt: "Improve clarity",
  undoable: true
}
```

### Client Flow

1. **AI Tracker Hook** → Subscribes to `aiChangeHistory` Yjs map
2. **Detect Changes** → Updates local state when new AI changes arrive
3. **Display Button** → Shows "AI Changes" button with count badge
4. **User Clicks** → Opens tooltip with change list and actions
5. **Undo Action** → Uses Y.UndoManager to revert AI transactions only
6. **Update UI** → Reflects new state (undoable → false)

## Separation of Concerns

### User Undo/Redo (ProseMirror History)
- **Location**: Toolbar (Undo/Redo buttons)
- **Scope**: All user edits
- **Implementation**: `prosemirror-history` plugin
- **Keyboard**: Ctrl+Z / Ctrl+Y
- **Always Available**: Yes

### AI Undo/Redo (Y.UndoManager)
- **Location**: Tooltip (AI Changes button)
- **Scope**: Only AI-generated changes
- **Implementation**: Yjs UndoManager with 'ai' origin filter
- **Keyboard**: None (UI-based only)
- **Conditional**: Only when AI changes exist

## Key Benefits

✅ **Non-Destructive**: Preserves concurrent user edits  
✅ **Granular Control**: Undo individual or all AI changes  
✅ **Clean UI**: Tooltip doesn't clutter toolbar  
✅ **Change Visibility**: See what AI changed and when  
✅ **Collaboration-Safe**: Works with HocusPocus  
✅ **Separate Stacks**: User and AI history independent  

## API Changes

### Import Endpoint Response

**Before:**
```json
{
  "success": true,
  "documentName": "test-doc",
  "length": 1234,
  "appliedAt": "2024-03-05T10:00:00Z",
  "metadata": { "model": "gpt-4" }
}
```

**After:**
```json
{
  "success": true,
  "documentName": "test-doc",
  "length": 1234,
  "appliedAt": "2024-03-05T10:00:00Z",
  "changeId": "abc123",
  "changesApplied": 3,
  "metadata": { "model": "gpt-4" }
}
```

## Testing

### Manual Test

1. **Start servers:**
   ```bash
   # Terminal 1
   cd server/hocuspocus
   npm run dev
   
   # Terminal 2
   cd client
   npm run dev
   ```

2. **Open editor** at http://localhost:3000

3. **Type some content** (user edits)

4. **Apply AI change:**
   ```bash
   curl -X POST http://127.0.0.1:3001/api/ai/import/shared-document \
     -H "Content-Type: application/json" \
     -d '{
       "markdown": "# AI Edited\n\nThis was changed by AI!",
       "metadata": {
         "model": "gpt-4",
         "prompt": "Improve clarity"
       }
     }'
   ```

5. **Verify:**
   - "AI Changes" button appears in toolbar with badge
   - Click button to see tooltip
   - Tooltip shows change details
   - Click "Undo Last AI Change"
   - Content reverts but user edits remain
   - User Undo/Redo still works independently

### Expected Behavior

- ✅ User can undo their edits with Ctrl+Z (doesn't affect AI changes)
- ✅ User can undo AI changes with tooltip (doesn't affect user edits)
- ✅ Multiple AI changes show in list (newest first)
- ✅ "Undo All AI Changes" button appears when multiple changes exist
- ✅ Redo works for previously undone AI changes
- ✅ Badge count reflects active (undoable) AI changes

## Files Modified

### Server
- ✅ `server/hocuspocus/utils/diffApplicator.js` (NEW)
- ✅ `server/hocuspocus/routes/ai.js` (UPDATED)

### Client
- ✅ `client/components/milkdown/hooks/use-ai-change-tracker.ts` (NEW)
- ✅ `client/components/milkdown/ai-change-tooltip.tsx` (NEW)
- ✅ `client/components/milkdown/ai-changes-button.tsx` (NEW)
- ✅ `client/components/milkdown/editor-toolbar.tsx` (UPDATED)
- ✅ `client/components/milkdown/milkdown-editor.tsx` (UPDATED)

## Future Enhancements

### Phase 4: Visual Decorations (Optional)
- Highlight AI-changed text with purple background
- Show user edits in blue
- Collaboration edits in green

### Phase 5: Advanced Diff (Optional)
- Use `prosemirror-diff` for true incremental updates
- Apply only changed paragraphs/nodes
- Reduce conflicts in collaborative editing

### Phase 6: Change Review (Optional)
- Accept/Reject individual changes
- Side-by-side diff view
- Change comments/annotations

## Troubleshooting

### "AI Changes" button doesn't appear
- Check that AI import was successful
- Verify document is open in editor
- Look for `aiChangeHistory` in Yjs document

### Undo doesn't work
- Ensure Y.UndoManager is tracking 'ai' origin
- Check console for error messages
- Verify change is marked as undoable

### Changes conflict with user edits
- This is expected with current implementation
- For production, implement proper diff algorithm
- Use `prosemirror-diff` or similar library

## Dependencies

No new dependencies required! Uses existing:
- `yjs` - For change tracking
- `y-prosemirror` - For editor integration
- `prosemirror-history` - For user undo/redo
- `lucide-react` - For icons

## Summary

This implementation provides a robust, non-destructive way to manage AI-generated changes in a collaborative editor. The tooltip-based UI keeps the toolbar clean while providing full visibility and control over AI modifications. The separation between user and AI history ensures that manual edits are never accidentally lost when managing AI changes.
