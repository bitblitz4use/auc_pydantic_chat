"use client";

import { useEffect, useState, useRef } from "react";
import { Plus, Upload, Network, Trash2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listStorageObjects,
  uploadFile,
  deleteFile,
  formatFileSize,
  formatDate,
  type StorageObject,
} from "@/lib/storage";
import { ChainCanvasEditor } from "@/components/chain-canvas-editor";
import { cn, extractTags } from "@/lib/utils";

export function ChainsView() {
  const [chains, setChains] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedChain, setSelectedChain] = useState<StorageObject | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
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

  const handleNew = () => {
    setSelectedChain(null);
    setEditorOpen(true);
  };

  const handleChainClick = (chain: StorageObject) => {
    setSelectedChain(chain);
    setEditorOpen(true);
  };

  const handleDelete = async (objectName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const fileName = objectName.replace('chains/', '');
    if (!confirm(`Delete "${fileName}"?`)) return;

    try {
      await deleteFile(objectName);
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
      <div className="h-full overflow-hidden px-4 pt-4 pb-4">
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
                <Button onClick={handleNew} variant="outline">
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
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
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
                <Button onClick={handleNew} variant="outline" size="sm">
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
              <div className="mb-4 flex flex-wrap items-center gap-2">
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

            {/* Chains list */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-2">
                {filteredChains.map((chain) => {
                  const fileName = chain.name.replace('chains/', '');
                  return (
                    <div
                      key={chain.name}
                      onClick={() => handleChainClick(chain)}
                      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                    >
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => handleDelete(chain.name, e)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chain Canvas Editor */}
      {editorOpen && (
        <ChainCanvasEditor
          chain={selectedChain}
          open={editorOpen}
          onClose={() => {
            setEditorOpen(false);
            setSelectedChain(null);
            fetchChains();
          }}
        />
      )}
    </>
  );
}
