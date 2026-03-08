/**
 * Prompt Chain utilities - YAML parsing, serialization, types
 */

export interface ChainNode {
  id: string;
  type: 'prompt';
  data: {
    promptFile: string;
    label: string;
    model?: string;
    description?: string;
  };
  position: { x: number; y: number };
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
  const metadata = parseYamlFrontmatter(frontmatter);
  
  return {
    metadata: { type: 'chain', ...metadata } as ChainMetadata,
    content: markdownContent.trim()
  };
}

/**
 * Simple YAML parser for frontmatter (handles our specific structure)
 */
function parseYamlFrontmatter(yaml: string): Partial<ChainMetadata> {
  const lines = yaml.split('\n');
  const result: any = {};
  let currentKey: string | null = null;
  let currentArray: any[] | null = null;
  let currentObject: any = null;
  let inArray = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Key: value or Key: (for nested)
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch && !line.startsWith(' ')) {
      const [, key, value] = keyMatch;
      currentKey = key;
      
      if (value) {
        // Simple value
        result[key] = value.replace(/^["']|["']$/g, '');
      } else {
        // Array or object follows
        currentArray = [];
        result[key] = currentArray;
        inArray = true;
      }
      continue;
    }
    
    // Array item: - value or - key: value
    if (trimmed.startsWith('-') && inArray && currentArray) {
      const itemContent = trimmed.substring(1).trim();
      const itemKeyMatch = itemContent.match(/^(\w+):\s*(.*)$/);
      
      if (itemKeyMatch) {
        // Object in array
        const [, itemKey, itemValue] = itemKeyMatch;
        currentObject = {};
        currentObject[itemKey] = parseValue(itemValue);
        currentArray.push(currentObject);
      } else {
        // Simple value in array
        currentArray.push(parseValue(itemContent));
        currentObject = null;
      }
      continue;
    }
    
    // Nested property in object
    const nestedMatch = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (nestedMatch && currentObject) {
      const [, nestedKey, nestedValue] = nestedMatch;
      currentObject[nestedKey] = parseValue(nestedValue);
    }
  }
  
  return result;
}

function parseValue(value: string): any {
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  
  // Try to parse as number
  if (/^-?\d+\.?\d*$/.test(trimmed)) {
    return parseFloat(trimmed);
  }
  
  // Try to parse as boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  
  // Try to parse as object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  
  return trimmed;
}

/**
 * Serialize chain metadata to YAML frontmatter + markdown
 */
export function serializePromptChain(metadata: ChainMetadata, content: string): string {
  const yaml = serializeYaml(metadata);
  return `---\n${yaml}---\n${content}`;
}

function serializeYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    
    if (Array.isArray(value)) {
      result += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          const itemYaml = serializeYaml(item, indent + 1);
          const lines = itemYaml.split('\n').filter(l => l.trim());
          if (lines.length > 0) {
            result += `${spaces}  - ${lines[0].trim()}\n`;
            for (let i = 1; i < lines.length; i++) {
              result += `${spaces}    ${lines[i].trim()}\n`;
            }
          }
        } else {
          result += `${spaces}  - ${item}\n`;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      result += `${spaces}${key}:\n`;
      result += serializeYaml(value, indent + 1);
    } else if (typeof value === 'string') {
      result += `${spaces}${key}: "${value}"\n`;
    } else {
      result += `${spaces}${key}: ${value}\n`;
    }
  }
  
  return result;
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
    if (node.data.promptFile && !prompts.has(node.data.promptFile)) {
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
