import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { getSchema } from "@tiptap/core";

// Build schema matching frontend (excluding Collaboration and Gapcursor - they don't affect schema)
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    bold: {},
    italic: {},
    strike: {},
    code: {},
    bulletList: {},
    orderedList: {},
    listItem: {},
    gapcursor: false, // Not needed on server, but keep consistent
  }),
  Table.configure({ 
    resizable: true,
    handleWidth: 5,
    cellMinWidth: 50,
  }),
  TableRow,
  TableHeader,
  TableCell,
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right', 'justify'],
    defaultAlignment: 'left',
  }),
  Image.configure({
    inline: false,
    allowBase64: false,
  }),
];

export const schema = getSchema(extensions);

// Helper function to create a minimal valid ProseMirror document
export function createEmptyProseMirrorDoc() {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [] }]
  };
}
