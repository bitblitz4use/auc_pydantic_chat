/**
 * Prompt Chain utilities - YAML parsing, serialization, types
 */

import yaml from 'js-yaml';

export type ChainNode = PromptChainNode | AnnotationChainNode;

export interface PromptChainNode {
  id: string;
  type: 'prompt';
  data: {
    promptFile: string;
    label: string;
    model?: string;
    description?: string;
    onUpdate?: (nodeId: string, newData: any) => void;
    onDelete?: (nodeId: string) => void;
  };
  position: { x: number; y: number };
  style?: any;
}

export interface AnnotationChainNode {
  id: string;
  type: 'annotation';
  data: {
    title: string;
    comment: string;
    onUpdate?: (nodeId: string, newData: any) => void;
    onDelete?: (nodeId: string) => void;
  };
  position: { x: number; y: number };
  style?: any;
}

export interface ChainEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  label?: string;
}

export interface ChainMetadata {
  type: 'chain';
  name: string;
  description?: string;
  canvas: {
    nodes: ChainNode[];
    edges: ChainEdge[];
  };
  tags?: string[];
}

export interface ParsedChain {
  metadata: ChainMetadata;
  content: string;
}

/**
 * Parse YAML frontmatter from markdown content
 */
export function parsePromptChain(content: string): ParsedChain {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    // No frontmatter, return default chain structure
    return {
      metadata: {
        type: 'chain',
        name: 'Untitled Chain',
        canvas: { nodes: [], edges: [] },
        tags: [],
      },
      content: content.trim()
    };
  }
  
  const [, frontmatter, markdownContent] = match;
  
  try {
    // Use js-yaml to parse the frontmatter
    const metadata = yaml.load(frontmatter) as Partial<ChainMetadata>;
    
    // Ensure canvas structure exists
    if (!metadata.canvas) {
      metadata.canvas = { nodes: [], edges: [] };
    }
    
    return {
      metadata: { type: 'chain', ...metadata } as ChainMetadata,
      content: markdownContent.trim()
    };
  } catch (error) {
    console.error('YAML parse error:', error);
    return {
      metadata: {
        type: 'chain',
        name: 'Parse Error',
        canvas: { nodes: [], edges: [] },
        tags: [],
      },
      content: markdownContent.trim()
    };
  }
}

/**
 * Clean metadata before serialization - remove functions and non-serializable data
 */
function cleanMetadataForSerialization(metadata: ChainMetadata): any {
  // Deep clone and clean the metadata
  const cleaned = JSON.parse(JSON.stringify(metadata, (key, value) => {
    // Filter out functions and undefined values
    if (typeof value === 'function' || value === undefined) {
      return undefined;
    }
    return value;
  }));
  
  // Clean up node data - remove callback functions
  if (cleaned.canvas?.nodes) {
    cleaned.canvas.nodes = cleaned.canvas.nodes.map((node: any) => {
      const baseNode = {
        id: node.id,
        type: node.type,
        position: node.position,
        ...(node.style && { style: node.style }),
      };
      
      if (node.type === 'prompt') {
        return {
          ...baseNode,
          data: {
            promptFile: node.data.promptFile,
            label: node.data.label,
            model: node.data.model,
            description: node.data.description,
          },
        };
      } else if (node.type === 'annotation') {
        return {
          ...baseNode,
          data: {
            title: node.data.title,
            comment: node.data.comment,
          },
        };
      }
      
      return baseNode;
    });
  }
  
  return cleaned;
}

/**
 * Serialize chain metadata to YAML frontmatter + markdown
 */
export function serializePromptChain(metadata: ChainMetadata, content: string): string {
  try {
    // Clean metadata before serialization
    const cleanedMetadata = cleanMetadataForSerialization(metadata);
    
    // Use js-yaml to serialize
    const yamlStr = yaml.dump(cleanedMetadata, {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
      noRefs: true,  // Don't use references
      sortKeys: false, // Keep original key order
    });
    return `---\n${yamlStr}---\n${content}`;
  } catch (error) {
    console.error('YAML serialization error:', error);
    throw error;
  }
}

/**
 * Load chain and resolve referenced prompt files
 */
export async function loadPromptChain(chainPath: string): Promise<{
  chain: ParsedChain;
  prompts: Map<string, string>;
}> {
  const { getFileContent } = await import('./storage');
  
  const chainContent = await getFileContent(chainPath);
  const chain = parsePromptChain(chainContent);
  
  // Load all referenced prompt files
  const prompts = new Map<string, string>();
  
  for (const node of chain.metadata.canvas.nodes) {
    if (node.type === 'prompt' && node.data.promptFile && !prompts.has(node.data.promptFile)) {
      try {
        const content = await getFileContent(`prompts/${node.data.promptFile}`);
        prompts.set(node.data.promptFile, content);
      } catch (e) {
        console.warn(`Could not load prompt: ${node.data.promptFile}`);
      }
    }
  }
  
  return { chain, prompts };
}
