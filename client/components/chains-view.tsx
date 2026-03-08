"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, Upload, Network, Trash2, Tag, X, ChevronDown, Edit, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  listStorageObjects,
  uploadFile,
  deleteFile,
  getFileContent,
  updateFileContent,
  formatFileSize,
  formatDate,
  type StorageObject,
} from "@/lib/storage";
import { parsePromptChain, serializePromptChain, type ParsedChain } from "@/lib/prompt-chains";
import { PromptChainCanvas } from "@/components/prompt-chain-canvas";
import { ChainMetadataDialog } from "@/components/chain-metadata-dialog";
import { cn, extractTags } from "@/lib/utils";

export function ChainsView() {
  const [chains, setChains] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedChainId, setExpandedChainId] = useState<string | null>(null);
  const [loadingChainId, setLoadingChainId] = useState<string | null>(null);
  const [editingChain, setEditingChain] = useState<ParsedChain | null>(null);
  const [chainData, setChainData] = useState<Map<string, ParsedChain>>(new Map());
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataEditChain, setMetadataEditChain] = useState<{
    chain: StorageObject | null;
    parsed: ParsedChain | null;
    fileName: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchChains = async () => {
    try {
      setLoading(true);
      const files = await listStorageObjects("chains", false, true);
      setChains(files);
      setAvailableTags(extractTags(files));
    } catch (error) {
      console.error("Error fetching chains:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChains();
  }, []);

  const handleExpandChain = async (chain: StorageObject) => {
    const chainId = chain.name;
    
    if (expandedChainId === chainId) {
      // Collapse
      setExpandedChainId(null);
      return;
    }

    // Load chain data if not already loaded
    if (!chainData.has(chainId)) {
      try {
        setLoadingChainId(chainId);
        const content = await getFileContent(chain.name);
        const parsed = parsePromptChain(content);
        setChainData(prev => new Map(prev).set(chainId, parsed));
        setExpandedChainId(chainId);
      } catch (error) {
        console.error("Error loading chain:", error);
        alert("Failed to load chain");
      } finally {
        setLoadingChainId(null);
      }
    } else {
      setExpandedChainId(chainId);
    }
  };

  const handleChainUpdate = (chainId: string, updatedParsed: ParsedChain) => {
    setChainData(prev => new Map(prev).set(chainId, updatedParsed));
  };

  const handleSaveChain = async (chainId: string) => {
    const parsed = chainData.get(chainId);
    if (!parsed) return;

    try {
      setSaving(true);
      const serialized = serializePromptChain(parsed.metadata, parsed.content);
      await updateFileContent(chainId, serialized, parsed.metadata.tags);
      await fetchChains();
    } catch (error) {
      console.error("Error saving chain:", error);
      alert("Failed to save chain");
    } finally {
      setSaving(false);
    }
  };

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
      setSaving(true);
      const filePath = `chains/${metadataEditChain.fileName}.md`;
      const serialized = serializePromptChain(
        metadataEditChain.parsed.metadata,
        metadataEditChain.parsed.content
      );
      await updateFileContent(filePath, serialized, metadataEditChain.parsed.metadata.tags);
      
      // Update local data
      setChainData(prev => new Map(prev).set(filePath, metadataEditChain.parsed!));
      
      await fetchChains();
      setMetadataDialogOpen(false);
      setMetadataEditChain(null);
    } catch (error) {
      console.error("Error saving chain metadata:", error);
      alert("Failed to save chain");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (objectName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const fileName = objectName.replace('chains/', '');
    if (!confirm(`Delete "${fileName}"?`)) return;

    try {
      await deleteFile(objectName);
      setChainData(prev => {
        const newMap = new Map(prev);
        newMap.delete(objectName);
        return newMap;
      });
      if (expandedChainId === objectName) {
        setExpandedChainId(null);
      }
      await fetchChains();
    } catch (error) {
      console.error("Error deleting chain:", error);
      alert("Failed to delete chain");
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(`chains/${file.name}`, file);
      await fetchChains();
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

  const filteredChains = selectedFilterTags.length === 0
    ? chains
    : chains.filter((chain) => 
        chain.tags && 
        selectedFilterTags.every((filterTag) => chain.tags!.includes(filterTag))
      );

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
                <Button onClick={handleNewChain} variant="outline">
                  <Plus className="mr-2 size-4" />
                  New Chain
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" disabled={uploading}>
                  {uploading ? (
                    <>
                      <Spinner className="mr-2 size-4" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 size-4" />
                      Upload
                    </>
                  )}
                </Button>
              </>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Prompt Chains</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredChains.length} of {chains.length} chain{chains.length === 1 ? '' : 's'}
                  {selectedFilterTags.length > 0 && ` (filtered by ${selectedFilterTags.length} tag${selectedFilterTags.length > 1 ? 's' : ''})`}
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
                <Button onClick={handleNewChain} variant="outline" size="sm">
                  <Plus className="mr-2 size-4" />
                  New
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" disabled={uploading}>
                  {uploading ? (
                    <>
                      <Spinner className="mr-2 size-4" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 size-4" />
                      Upload
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Tag filters */}
            {availableTags.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 flex-shrink-0">
                {availableTags.map((tag) => {
                  const isSelected = selectedFilterTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedFilterTags(selectedFilterTags.filter((t) => t !== tag));
                        } else {
                          setSelectedFilterTags([...selectedFilterTags, tag]);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-accent"
                      )}
                    >
                      <Tag className="size-3" />
                      {tag}
                      {isSelected && <X className="size-3" />}
                    </button>
                  );
                })}
                {selectedFilterTags.length > 0 && (
                  <button
                    onClick={() => setSelectedFilterTags([])}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Chains list with expandable canvas */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                {filteredChains.map((chain) => {
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
                                onClick={(e) => handleDelete(chain.name, e)}
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
                                  <PromptChainCanvas
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
