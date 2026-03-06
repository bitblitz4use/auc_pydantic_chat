"use client";

import { useState, useEffect } from "react";

/**
 * Hook to get the active document from the editor
 * Listens to custom events and localStorage for document changes
 */
export function useActiveDocument(): string | null {
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  
  useEffect(() => {
    // Get initial value from localStorage
    const stored = localStorage.getItem("active-document");
    if (stored) {
      setActiveDocument(stored);
    }
    
    // Listen to custom events for document changes
    const handleDocumentChange = (e: Event) => {
      const customEvent = e as CustomEvent<string | null>;
      const docName = customEvent.detail;
      setActiveDocument(docName);
      
      // Sync with localStorage
      if (docName) {
        localStorage.setItem("active-document", docName);
      } else {
        localStorage.removeItem("active-document");
      }
    };
    
    window.addEventListener("active-document-changed", handleDocumentChange);
    
    return () => {
      window.removeEventListener("active-document-changed", handleDocumentChange);
    };
  }, []);
  
  return activeDocument;
}
