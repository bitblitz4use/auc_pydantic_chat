import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type * as Y from 'yjs';

export const aiDecorationsKey = new PluginKey('aiDecorations');

export interface AIChangeRange {
  from: number;
  to: number;
  type: string;
  changeId: string;
}

interface AIDecorationsPluginState {
  decorations: DecorationSet;
  activeRanges: AIChangeRange[];
}

/**
 * ProseMirror plugin that visualizes AI changes with decorations
 * This plugin works in conjunction with useAIDecorations hook
 */
export function createAIDecorationsPlugin() {
  return new Plugin<AIDecorationsPluginState>({
    key: aiDecorationsKey,
    
    state: {
      init(_, state) {
        return {
          decorations: DecorationSet.empty,
          activeRanges: []
        };
      },
      
      apply(tr, pluginState, oldState, newState) {
        // Map existing decorations through document changes
        let decorations = pluginState.decorations.map(tr.mapping, tr.doc);
        let activeRanges = pluginState.activeRanges;
        
        // Check if we have new AI decoration ranges from our custom hook
        const newRanges = tr.getMeta(aiDecorationsKey) as AIChangeRange[] | undefined;
        
        if (newRanges) {
          console.log('🎨 Applying AI decorations:', newRanges.length, 'ranges');
          console.log('📏 Document size:', newState.doc.content.size, 'positions');
          
          // Create decorations for each range
          const decos: Decoration[] = [];
          
          for (const range of newRanges) {
            // Better validation with detailed logging
            if (range.from < 1) {
              console.warn('⚠️ Range from < 1:', range);
              continue;
            }
            
            if (range.to > newState.doc.content.size) {
              console.warn('⚠️ Range to > doc size:', range, 'doc size:', newState.doc.content.size);
              continue;
            }
            
            if (range.from >= range.to) {
              console.warn('⚠️ Invalid range (from >= to):', range);
              continue;
            }
            
            // Get text at this position for debugging
            try {
              const textAtRange = newState.doc.textBetween(range.from, range.to);
              console.log(`📍 Range [${range.from}-${range.to}] (${range.to - range.from} chars): "${textAtRange.substring(0, 50)}${textAtRange.length > 50 ? '...' : ''}"`);
              
              const decoration = Decoration.inline(
                range.from, 
                range.to, 
                {
                  class: 'ai-change-highlight',
                  'data-change-id': range.changeId,
                  'data-change-type': range.type
                },
                {
                  // Decoration spec for identification
                  changeId: range.changeId,
                  type: 'ai-change'
                }
              );
              decos.push(decoration);
            } catch (error) {
              console.error('❌ Error creating decoration for range:', range, error);
            }
          }
          
          decorations = DecorationSet.create(newState.doc, decos);
          activeRanges = newRanges;
          
          console.log('✅ Created', decos.length, 'AI decorations out of', newRanges.length, 'ranges');
          
          if (decos.length < newRanges.length) {
            console.warn('⚠️ Some ranges were invalid and skipped');
          }
        }
        
        // Check if we should clear decorations (when all changes are undone)
        const shouldClear = tr.getMeta('clearAIDecorations');
        if (shouldClear) {
          console.log('🧹 Clearing AI decorations');
          decorations = DecorationSet.empty;
          activeRanges = [];
        }
        
        return {
          decorations,
          activeRanges
        };
      }
    },
    
    props: {
      decorations(state) {
        const pluginState = this.getState(state);
        return pluginState?.decorations;
      }
    }
  });
}

/**
 * Helper to get current AI decoration state
 */
export function getAIDecorationsState(state: any): AIDecorationsPluginState | undefined {
  return aiDecorationsKey.getState(state);
}
