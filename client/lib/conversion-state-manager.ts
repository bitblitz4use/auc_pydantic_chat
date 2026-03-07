/**
 * Conversion State Manager
 * Manages conversion progress state independently of component lifecycle
 * Works in tandem with WebSocketManager to provide persistent UI state
 */

import type { ConversionProgress } from "./storage";

export interface ConversionState extends ConversionProgress {
  filename: string;
  sourceId: string;
}

type StateChangeCallback = (states: Map<string, ConversionState>) => void;

class ConversionStateManager {
  private states: Map<string, ConversionState> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();

  /**
   * Update conversion state for a source
   */
  updateState(sourceId: string, filename: string, progress: ConversionProgress): void {
    this.states.set(sourceId, {
      ...progress,
      filename,
      sourceId,
    });
    this.notifyListeners();
  }

  /**
   * Remove conversion state (when complete or cancelled)
   */
  removeState(sourceId: string): void {
    this.states.delete(sourceId);
    this.notifyListeners();
  }

  /**
   * Get current state for a source
   */
  getState(sourceId: string): ConversionState | undefined {
    return this.states.get(sourceId);
  }

  /**
   * Get all active conversion states
   */
  getAllStates(): Map<string, ConversionState> {
    return new Map(this.states);
  }

  /**
   * Check if a conversion is active
   */
  isActive(sourceId: string): boolean {
    return this.states.has(sourceId);
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const currentStates = this.getAllStates();
    this.listeners.forEach(callback => {
      try {
        callback(currentStates);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }

  /**
   * Clear all states (for cleanup)
   */
  clearAll(): void {
    this.states.clear();
    this.notifyListeners();
  }
}

// Singleton instance
export const conversionStateManager = new ConversionStateManager();
