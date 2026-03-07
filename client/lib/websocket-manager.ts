/**
 * WebSocket Manager for handling persistent conversion progress connections
 * Manages WebSocket lifecycle independently of component mounting/unmounting
 */

import { API_CONFIG } from "./config";
import type { ConversionProgress } from "./storage";

const API_BASE = API_CONFIG.STORAGE_API;

type ProgressCallback = (progress: ConversionProgress) => void;

interface ActiveConnection {
  ws: WebSocket;
  callbacks: Set<ProgressCallback>;
  filename: string;
}

class WebSocketManager {
  private connections: Map<string, ActiveConnection> = new Map();

  /**
   * Connect to a conversion progress WebSocket
   * Multiple components can subscribe to the same conversion
   */
  connect(sourceId: string, filename: string, onProgress: ProgressCallback): void {
    const existing = this.connections.get(sourceId);

    if (existing) {
      // Add callback to existing connection
      existing.callbacks.add(onProgress);
      return;
    }

    // Create new WebSocket connection
    const wsUrl = `${API_BASE.replace('http', 'ws')}/api/sources/${sourceId}/progress`;
    const ws = new WebSocket(wsUrl);

    const callbacks = new Set<ProgressCallback>();
    callbacks.add(onProgress);

    this.connections.set(sourceId, { ws, callbacks, filename });

    ws.onopen = () => {
      console.log(`WebSocket connected for ${sourceId}`);
    };

    ws.onmessage = (event) => {
      try {
        const progress: ConversionProgress = JSON.parse(event.data);
        
        // Notify all subscribers
        const connection = this.connections.get(sourceId);
        if (connection) {
          connection.callbacks.forEach(cb => cb(progress));
        }

        // Auto-cleanup on completion or error
        if (progress.stage === 'complete' || progress.stage === 'error') {
          setTimeout(() => this.disconnect(sourceId), 2000);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${sourceId}:`, error);
      this.disconnect(sourceId);
    };

    ws.onclose = () => {
      console.log(`WebSocket closed for ${sourceId}`);
      this.connections.delete(sourceId);
    };
  }

  /**
   * Unsubscribe a specific callback from a conversion
   * If no callbacks remain, closes the WebSocket
   */
  unsubscribe(sourceId: string, callback: ProgressCallback): void {
    const connection = this.connections.get(sourceId);
    if (!connection) return;

    connection.callbacks.delete(callback);

    // If no more subscribers, close connection
    if (connection.callbacks.size === 0) {
      this.disconnect(sourceId);
    }
  }

  /**
   * Disconnect and close WebSocket for a source
   */
  disconnect(sourceId: string): void {
    const connection = this.connections.get(sourceId);
    if (!connection) return;

    connection.ws.close();
    this.connections.delete(sourceId);
  }

  /**
   * Check if a conversion is currently active
   */
  isActive(sourceId: string): boolean {
    return this.connections.has(sourceId);
  }

  /**
   * Get filename for an active conversion
   */
  getFilename(sourceId: string): string | undefined {
    return this.connections.get(sourceId)?.filename;
  }

  /**
   * Get all active conversion source IDs
   */
  getActiveConversions(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Cleanup all connections (for app shutdown)
   */
  disconnectAll(): void {
    this.connections.forEach((_, sourceId) => {
      this.disconnect(sourceId);
    });
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
