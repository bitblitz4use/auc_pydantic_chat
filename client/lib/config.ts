/**
 * Centralized API configuration
 */

export const API_CONFIG = {
  STORAGE_API: process.env.NEXT_PUBLIC_STORAGE_API || "http://localhost:8000",
  CHAT_API: process.env.NEXT_PUBLIC_CHAT_API || "http://localhost:8000",
  EDITOR_API: process.env.NEXT_PUBLIC_EDITOR_API || "http://127.0.0.1:3001",
} as const;

// Convenience functions for building API URLs
export const apiUrl = {
  storage: (path: string = "") => `${API_CONFIG.STORAGE_API}/api/storage/${path}`,
  chat: () => `${API_CONFIG.CHAT_API}/api/chat`,
  providers: () => `${API_CONFIG.CHAT_API}/api/providers`,
  sources: (path: string = "") => `${API_CONFIG.STORAGE_API}/api/sources${path ? `/${path}` : ""}`,
  documents: () => `${API_CONFIG.EDITOR_API}/api/documents`,
  editorWs: () => {
    // Extract host and port from EDITOR_API and construct WebSocket URL
    // Default to ws://127.0.0.1:1234 if EDITOR_API is the default
    const defaultEditorApi = "http://127.0.0.1:3001";
    if (API_CONFIG.EDITOR_API === defaultEditorApi) {
      return "ws://127.0.0.1:1234";
    }
    return `ws://${API_CONFIG.EDITOR_API.replace(/^https?:\/\//, "")}`;
  },
};
