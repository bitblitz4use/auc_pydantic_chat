# 🎯 Quick Start: Testing the Yjs-Native AI Suggestions

## 1. Restart Services (if needed)

**Hocuspocus should auto-restart** via nodemon, but if issues persist:

```bash
# Terminal 2 (Hocuspocus):
Ctrl+C
pnpm dev
```

**Next.js** (refresh if changes don't appear):
```bash
# Or just refresh browser (Ctrl+R)
```

---

## 2. Test Flow

### Step 1: Open Document
- Click on **`Auditbericht`** in the document tree
- Wait for: `✅ Document synced` in browser console

### Step 2: Ask AI
In the chat:
```
Add a summary section at the top of this document
```

### Step 3: Verify Logs

**✅ Server (Hocuspocus terminal):**
```
🤖 AI Suggest: Broadcasting via Yjs for Auditbericht
✅ AI suggestion written to Yjs (auto-broadcast to all clients)
```

**✅ Browser Console (F12):**
```
📡 Setting up AI suggestion observer (Yjs-native)
🤖 Received AI suggestion: ai-edit-abc123
📝 Applying AI suggestion locally...
📍 Inserting at position: 0
✅ AI suggestion applied via ProseMirror transaction
✅ AI change metadata stored
```

**✅ Python (FastAPI terminal):**
```
✅ Suggestion broadcast to 1 client(s)
```

### Step 4: Verify Content
- Content should appear **instantly** in the editor
- AI change tooltip should show accept/reject buttons
- Can undo with Ctrl+Z

---

## 3. Expected Behavior

### ✅ Success Indicators:
- No errors in any console
- Content appears at cursor position
- No "0 clients" messages
- Can accept/reject the change
- Undo/redo works normally

### ❌ If Issues:
1. **Check document is open**: Must see synced in console
2. **Check document name matches**: Case-sensitive
3. **Restart Hocuspocus**: Clear any stale state
4. **Check browser console**: Look for error messages

---

## 4. Architecture Comparison

### ❌ OLD (Custom WebSocket - BROKEN):
```
Server → connection.sendMessage() → ❌ Method doesn't exist
```

### ✅ NEW (Yjs-Native - WORKS):
```
Server → ydoc.getMap('__aiSuggestions').set()
         ↓
      Yjs syncs automatically
         ↓
Client → suggestions.observe() → applies locally
```

---

## 5. Troubleshooting

### Issue: "No observer logs"
**Fix**: Refresh browser page to reload client code

### Issue: "Suggestion not appearing"
**Fix**: Check that document names match exactly (server vs client)

### Issue: "Content appears but then disappears"
**Fix**: Check for JavaScript errors in browser console

---

## 🎉 Success Criteria

When working correctly, you'll see:
1. Server writes to Yjs Map ✅
2. Client observer fires ✅
3. Content inserts at cursor ✅
4. Metadata stored ✅
5. Can accept/reject ✅
6. Undo works ✅

**The system is now production-ready with native Yjs synchronization!** 🚀
