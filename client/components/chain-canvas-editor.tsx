"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagSelector } from "@/components/ui/tag-selector";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFileContent, updateFileContent, type StorageObject } from "@/lib/storage";
import { parsePromptChain, serializePromptChain, type ParsedChain } from "@/lib/prompt-chains";
import { PromptChainCanvas } from "@/components/prompt-chain-canvas";
import { Network, FileText } from "lucide-react";

interface ChainCanvasEditorProps {
  chain: StorageObject | null;
  open: boolean;
  onClose: () => void;
}

export function ChainCanvasEditor({ chain, open, onClose }: ChainCanvasEditorProps) {
  const [parsedChain, setParsedChain] = useState<ParsedChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!open) {
      setParsedChain(null);
      setHasChanges(false);
      return;
    }

    if (chain) {
      // Load existing chain
      setLoading(true);
      getFileContent(chain.name)
        .then((content) => {
          const parsed = parsePromptChain(content);
          setParsedChain(parsed);
          setFileName(chain.name.replace('chains/', '').replace('.md', ''));
        })
        .catch((err) => {
          console.error("Error loading chain:", err);
          alert("Failed to load chain");
          onClose();
        })
        .finally(() => setLoading(false));
    } else {
      // New chain
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      setFileName(`chain-${timestamp}`);
      setParsedChain({
        metadata: {
          type: 'chain',
          name: 'New Chain',
          description: '',
          canvas: {
            nodes: [],
            edges: [],
          },
          tags: [],
        },
        content: '# New Chain\n\nDescribe your prompt chain workflow here.\n\n## Usage\n\nExplain when and how to use this chain.',
      });
    }
  }, [chain, open, onClose]);

  const handleSave = async () => {
    if (!parsedChain) return;

    try {
      setSaving(true);
      const filePath = `chains/${fileName}.md`;
      const serialized = serializePromptChain(parsedChain.metadata, parsedChain.content);
      await updateFileContent(filePath, serialized, parsedChain.metadata.tags);
      setHasChanges(false);
      onClose();
    } catch (error) {
      console.error("Error saving chain:", error);
      alert("Failed to save chain");
    } finally {
      setSaving(false);
    }
  };

  const handleChainUpdate = (updated: typeof parsedChain.metadata) => {
    setParsedChain(prev => prev ? { ...prev, metadata: updated } : null);
    setHasChanges(true);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[98vw] h-[95vh] flex flex-col p-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner className="size-8" />
          </div>
        ) : parsedChain ? (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Network className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-xl">
                    {chain ? 'Edit Chain' : 'New Chain'}
                  </DialogTitle>
                  <DialogDescription>
                    Design a multi-step prompt workflow
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 flex flex-col overflow-hidden">
              <Tabs defaultValue="canvas" className="flex-1 flex flex-col">
                <div className="px-6 border-b border-border">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="canvas">
                      <Network className="mr-2 size-4" />
                      Canvas
                    </TabsTrigger>
                    <TabsTrigger value="metadata">
                      <FileText className="mr-2 size-4" />
                      Metadata
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="canvas" className="flex-1 m-0 p-0">
                  <PromptChainCanvas
                    chain={parsedChain.metadata}
                    onChainUpdate={handleChainUpdate}
                  />
                </TabsContent>

                <TabsContent value="metadata" className="flex-1 m-0 p-6 overflow-y-auto space-y-4">
                  <div className="max-w-2xl space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="filename">File Name</Label>
                      <div className="flex gap-2">
                        <Input
                          id="filename"
                          value={fileName}
                          onChange={(e) => {
                            setFileName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'));
                            setHasChanges(true);
                          }}
                          placeholder="my-chain"
                          className="font-mono"
                        />
                        <div className="flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground">
                          .md
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="chain-name">Chain Name</Label>
                      <Input
                        id="chain-name"
                        value={parsedChain.metadata.name}
                        onChange={(e) => {
                          setParsedChain({
                            ...parsedChain,
                            metadata: { ...parsedChain.metadata, name: e.target.value }
                          });
                          setHasChanges(true);
                        }}
                        placeholder="My Prompt Chain"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={parsedChain.metadata.description || ''}
                        onChange={(e) => {
                          setParsedChain({
                            ...parsedChain,
                            metadata: { ...parsedChain.metadata, description: e.target.value }
                          });
                          setHasChanges(true);
                        }}
                        placeholder="Brief description of this chain"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags</Label>
                      <TagSelector
                        tags={parsedChain.metadata.tags || []}
                        availableTags={[]}
                        onChange={(tags) => {
                          setParsedChain({
                            ...parsedChain,
                            metadata: { ...parsedChain.metadata, tags }
                          });
                          setHasChanges(true);
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="content">Documentation (Markdown)</Label>
                      <Textarea
                        id="content"
                        value={parsedChain.content}
                        onChange={(e) => {
                          setParsedChain({ ...parsedChain, content: e.target.value });
                          setHasChanges(true);
                        }}
                        className="font-mono text-sm h-64 resize-none"
                        placeholder="# My Chain&#10;&#10;Documentation..."
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border flex-shrink-0">
              <div className="flex items-center justify-between w-full">
                <div className="text-sm text-muted-foreground">
                  {hasChanges && '● Unsaved changes'}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !parsedChain}>
                    {saving ? (
                      <>
                        <Spinner className="mr-2 size-4" />
                        Saving...
                      </>
                    ) : (
                      'Save Chain'
                    )}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
