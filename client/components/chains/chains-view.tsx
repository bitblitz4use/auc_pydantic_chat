"use client";

import { useRef, useState } from "react";
import { Network, Edit, Trash2, ChevronDown, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { uploadFile, formatFileSize, formatDate, type StorageObject } from "@/lib/storage";
import { ChainCanvas } from "@/components/chains/chain-canvas";
import { ChainMetadataDialog } from "@/components/chains/chain-metadata-dialog";
import { TagFilter } from "@/components/common/tag-filter";
import { FileActions } from "@/components/common/file-actions";
import { useFileList } from "@/hooks/use-file-list";
import { useTagFilter } from "@/hooks/use-tag-filter";
import { useChainManager } from "@/hooks/use-chain-manager";
import { cn } from "@/lib/utils";
import { Tag } from "lucide-react";

export function ChainsView() {
  const { items: chains, loading, availableTags, refetch } = useFileList("chains");
  const { selectedTags, filteredItems, toggleTag, clearTags } = useTagFilter(
    chains,
    availableTags
  );
  const {
    expandedChainId,
    chainData,
    loadingChainId,
    saving,
    handleExpandChain,
    handleChainUpdate,
    handleSaveChain,
    handleDeleteChain,
  } = useChainManager(refetch);

  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataEditChain, setMetadataEditChain] = useState<{
    chain: StorageObject | null;
    parsed: any;
    fileName: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewChain = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    setMetadataEditChain({
      chain: null,
      parsed: {
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
      },
      fileName: `chain-${timestamp}`,
    });
    setMetadataDialogOpen(true);
  };

  const handleEditMetadata = (chain: StorageObject) => {
    const parsed = chainData.get(chain.name);
    if (parsed) {
      setMetadataEditChain({
        chain,
        parsed,
        fileName: chain.name.replace('chains/', '').replace('.md', ''),
      });
      setMetadataDialogOpen(true);
    }
  };

  const handleSaveMetadata = async () => {
    if (!metadataEditChain?.parsed) return;

    try {
      const filePath = `chains/${metadataEditChain.fileName}.md`;
      const { updateFileContent } = await import("@/lib/storage");
      const { serializePromptChain } = await import("@/lib/prompt-chains");
      
      const serialized = serializePromptChain(
        metadataEditChain.parsed.metadata,
        metadataEditChain.parsed.content
      );
      await updateFileContent(filePath, serialized, metadataEditChain.parsed.metadata.tags);
      
      // Update local data
      handleChainUpdate(filePath, metadataEditChain.parsed);
      
      await refetch();
      setMetadataDialogOpen(false);
      setMetadataEditChain(null);
    } catch (error) {
      console.error("Error saving chain metadata:", error);
      alert("Failed to save chain");
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(`chains/${file.name}`, file);
      await refetch();
    } catch (error) {
      console.error("Error uploading chain:", error);
      alert("Failed to upload chain");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full overflow-hidden px-4 pt-4 pb-4">
        <div className="flex h-full w-full items-center justify-center">
          <Spinner className="size-6" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-hidden px-4 pt-4 pb-4 flex flex-col">
        {chains.length === 0 ? (
          <EmptyState
            icon={Network}
            title="Prompt Chains"
            description="No prompt chains found. Create a new chain to build multi-step AI workflows."
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".md"
                />
                <FileActions
                  onNew={handleNewChain}
                  onUpload={() => fileInputRef.current?.click()}
                  uploading={uploading}
                  newLabel="New Chain"
                />
              </>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Prompt Chains</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredItems.length} of {chains.length} chain{chains.length === 1 ? '' : 's'}
                  {selectedTags.length > 0 && ` (filtered by ${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''})`}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".md"
                />
                <FileActions
                  onNew={handleNewChain}
                  onUpload={() => fileInputRef.current?.click()}
                  uploading={uploading}
                  newLabel="New"
                  size="sm"
                />
              </div>
            </div>

            <TagFilter
              availableTags={availableTags}
              selectedTags={selectedTags}
              onToggleTag={toggleTag}
              onClear={clearTags}
            />

            {/* Chains list with expandable canvas */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                {filteredItems.map((chain) => {
                  const fileName = chain.name.replace('chains/', '');
                  const chainId = chain.name;
                  const isExpanded = expandedChainId === chainId;
                  const isLoading = loadingChainId === chainId;
                  const parsed = chainData.get(chainId);

                  return (
                    <Collapsible
                      key={chain.name}
                      open={isExpanded}
                      onOpenChange={() => handleExpandChain(chain)}
                    >
                      <div className="rounded-lg border border-border bg-card overflow-hidden">
                        {/* Chain Header */}
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                            <div className="flex shrink-0 items-center justify-center">
                              <ChevronDown
                                className={cn(
                                  "size-5 text-muted-foreground transition-transform",
                                  isExpanded && "transform rotate-180"
                                )}
                              />
                            </div>
                            <div className="flex shrink-0 items-center justify-center rounded-md bg-primary/10 p-2">
                              <Network className="size-5 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">
                                {fileName}
                              </p>
                              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{formatFileSize(chain.size)}</span>
                                <span>•</span>
                                <span>{formatDate(chain.last_modified)}</span>
                              </div>
                            </div>
                            {chain.tags && chain.tags.length > 0 && (
                              <div className="flex items-center justify-center gap-1 flex-wrap shrink-0">
                                {chain.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs"
                                  >
                                    <Tag className="size-3 text-muted-foreground" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditMetadata(chain);
                                }}
                              >
                                <Edit className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => handleDeleteChain(chain.name, e)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CollapsibleTrigger>

                        {/* Expandable Canvas */}
                        <CollapsibleContent>
                          <div className="border-t border-border">
                            {isLoading ? (
                              <div className="flex items-center justify-center p-12">
                                <Spinner className="size-8" />
                              </div>
                            ) : parsed ? (
                              <>
                                <div className="bg-muted/30 h-[600px] relative">
                                  <ChainCanvas
                                    chain={parsed.metadata}
                                    onChainUpdate={(updated) => {
                                      handleChainUpdate(chainId, {
                                        ...parsed,
                                        metadata: updated,
                                      });
                                    }}
                                  />
                                </div>
                                <div className="p-4 border-t border-border bg-muted/10 flex items-center justify-between">
                                  <div className="text-sm text-muted-foreground">
                                    {parsed.metadata.canvas?.nodes?.length || 0} steps · {parsed.metadata.canvas?.edges?.length || 0} connections
                                  </div>
                                  <Button
                                    onClick={() => handleSaveChain(chainId)}
                                    disabled={saving}
                                    size="sm"
                                  >
                                    {saving ? (
                                      <>
                                        <Spinner className="mr-2 size-4" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Save className="mr-2 size-4" />
                                        Save Chain
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Metadata Dialog */}
      {metadataEditChain && (
        <ChainMetadataDialog
          open={metadataDialogOpen}
          onClose={() => {
            setMetadataDialogOpen(false);
            setMetadataEditChain(null);
          }}
          metadata={metadataEditChain.parsed?.metadata || null}
          fileName={metadataEditChain.fileName}
          onMetadataChange={(metadata) => {
            if (metadataEditChain.parsed) {
              setMetadataEditChain({
                ...metadataEditChain,
                parsed: {
                  ...metadataEditChain.parsed,
                  metadata,
                },
              });
            }
          }}
          onFileNameChange={(fileName) => {
            setMetadataEditChain({
              ...metadataEditChain,
              fileName,
            });
          }}
          onSave={handleSaveMetadata}
          saving={saving}
          isNew={!metadataEditChain.chain}
        />
      )}
    </>
  );
}
