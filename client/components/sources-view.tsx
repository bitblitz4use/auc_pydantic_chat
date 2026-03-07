"use client";

import { useEffect, useState, useRef } from "react";
import { Upload, FileText, Trash2, Tag, X, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  uploadSourceWithProgress,
  listSources,
  getSourceMarkdown,
  deleteSource,
  formatFileSize,
  formatDate,
  type Source,
  type ConversionProgress,
} from "@/lib/storage";
import { TagSelector } from "@/components/ui/tag-selector";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, extractTags } from "@/lib/utils";
import { ConversionProgressCard } from "@/components/ui/conversion-progress";
import { wsManager } from "@/lib/websocket-manager";
import { conversionStateManager } from "@/lib/conversion-state-manager";

export function SourcesView() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [convertingFiles, setConvertingFiles] = useState(() => conversionStateManager.getAllStates());

  const fetchSources = async () => {
    try {
      setLoading(true);
      const fetchedSources = await listSources(true);
      setSources(fetchedSources);
      setAvailableTags(extractTags(fetchedSources));
    } catch (error) {
      console.error("Error fetching sources:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();

    // Subscribe to state changes from conversion state manager
    const unsubscribe = conversionStateManager.subscribe((states) => {
      setConvertingFiles(states);
    });

    // Reconnect to any active conversions
    const activeConversions = wsManager.getActiveConversions();
    activeConversions.forEach(sourceId => {
      const filename = wsManager.getFilename(sourceId);
      if (filename) {
        // Subscribe to existing WebSocket connection
        wsManager.connect(sourceId, filename, (progress) => {
          // Update state manager (which will notify this component)
          conversionStateManager.updateState(sourceId, filename, progress);

          // Handle completion
          if (progress.stage === 'complete') {
            setTimeout(() => {
              conversionStateManager.removeState(sourceId);
              fetchSources();
            }, 1500);
          } else if (progress.stage === 'error') {
            setTimeout(() => {
              conversionStateManager.removeState(sourceId);
            }, 3000);
          }
        });
      }
    });

    // Cleanup: unsubscribe from state manager when component unmounts
    return () => {
      unsubscribe();
    };
  }, []);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Generate temporary ID for upload progress
    const tempId = `temp-${Date.now()}`;

    try {
      setUploading(true);

      // Upload file and get source_id
      const { source_id, filename } = await uploadSourceWithProgress(
        file,
        (progress) => {
          // Show initial upload progress with temp ID via state manager
          conversionStateManager.updateState(tempId, file.name, progress);
        }
      );

      // Remove temp ID from state manager
      conversionStateManager.removeState(tempId);

      // Connect to WebSocket via manager for conversion progress
      wsManager.connect(source_id, filename, (progress) => {
        // Update state manager (which will notify all subscribed components)
        conversionStateManager.updateState(source_id, filename, progress);

        // Handle completion
        if (progress.stage === 'complete') {
          setTimeout(() => {
            conversionStateManager.removeState(source_id);
            fetchSources();
          }, 1500);
        } else if (progress.stage === 'error') {
          setTimeout(() => {
            conversionStateManager.removeState(source_id);
          }, 3000);
        }
      });

    } catch (error) {
      console.error("Upload error:", error);
      
      // Show error with temp ID via state manager
      conversionStateManager.updateState(tempId, file.name, {
        stage: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: true,
      });

      setTimeout(() => {
        conversionStateManager.removeState(tempId);
      }, 3000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSourceClick = async (source: Source) => {
    try {
      setSelectedSource(source);
      setDialogOpen(true);
      setLoadingContent(true);
      
      if (source.markdown_path) {
        const content = await getSourceMarkdown(source.source_id);
        setMarkdownContent(content);
      } else {
        setMarkdownContent("Markdown not available for this source.");
      }
    } catch (error) {
      console.error("Error loading source markdown:", error);
      alert("Failed to load source markdown");
      setDialogOpen(false);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleDelete = async (sourceId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(`Delete this source? This will delete both the original file and the converted markdown.`)) return;

    try {
      await deleteSource(sourceId);
      await fetchSources();
      if (selectedSource?.source_id === sourceId) {
        setDialogOpen(false);
        setSelectedSource(null);
      }
    } catch (error) {
      console.error("Error deleting source:", error);
      alert("Failed to delete source");
    }
  };

  const filteredSources = selectedFilterTags.length === 0
    ? sources
    : sources.filter((source) => 
        source.tags && 
        selectedFilterTags.every((filterTag) => source.tags!.includes(filterTag))
      );

  // Hide sources that are actively converting (they're shown as progress cards instead)
  const sourcesToDisplay = filteredSources.filter(source => 
    !conversionStateManager.isActive(source.source_id)
  );

  const UploadButton = ({ size = "default" }: { size?: "default" | "sm" }) => (
    <Button
      onClick={() => fileInputRef.current?.click()}
      disabled={uploading}
      variant="outline"
      size={size}
    >
      {uploading ? (
        <>
          <Spinner className="mr-2 size-4" />
          Uploading & Converting...
        </>
      ) : (
        <>
          <Upload className="mr-2 size-4" />
          Upload Document
        </>
      )}
    </Button>
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
        {sources.length === 0 ? (
          <EmptyState
            icon={FileUp}
            title="Document Sources"
            description="Upload documents to convert them to markdown. Supported formats: PDF, DOCX, PPTX, HTML, images."
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  accept=".pdf,.docx,.pptx,.html,.htm,.png,.jpg,.jpeg,.gif,.bmp,.tiff"
                />
                <UploadButton />
              </>
            }
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Document Sources</h2>
                <p className="text-sm text-muted-foreground">
                  {sourcesToDisplay.length} of {sources.length} source{sources.length === 1 ? "" : "s"}
                  {selectedFilterTags.length > 0 && ` (filtered by ${selectedFilterTags.length} tag${selectedFilterTags.length > 1 ? 's' : ''})`}
                  {convertingFiles.size > 0 && ` · ${convertingFiles.size} converting`}
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  accept=".pdf,.docx,.pptx,.html,.htm,.png,.jpg,.jpeg,.gif,.bmp,.tiff"
                />
                <UploadButton size="sm" />
              </div>
            </div>

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

            <div className="flex-1 overflow-y-auto">
              {/* Show converting files at top */}
              {convertingFiles.size > 0 && (
                <div className="mb-4 space-y-2">
                  {Array.from(convertingFiles.values()).map((state) => (
                    <ConversionProgressCard
                      key={state.sourceId}
                      progress={state}
                      filename={state.filename}
                    />
                  ))}
                </div>
              )}

              {/* Existing sources list */}
              <div className="space-y-2">
                {sourcesToDisplay.map((source) => {
                  const fileName = source.original_filename || `Source ${source.source_id.slice(0, 8)}`;
                  return (
                    <div
                      key={source.source_id}
                      onClick={() => handleSourceClick(source)}
                      className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex shrink-0 items-center justify-center rounded-md bg-muted p-2">
                        <FileText className="size-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {fileName}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatFileSize(source.file_size)}</span>
                          <span>•</span>
                          <span>Markdown: {formatFileSize(source.markdown_size)}</span>
                          <span>•</span>
                          <span>{formatDate(source.last_modified)}</span>
                        </div>
                      </div>
                      {source.tags && source.tags.length > 0 && (
                        <div className="flex items-center justify-center gap-1 flex-wrap shrink-0">
                          {source.tags.map((tag) => (
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
                        onClick={(e) => handleDelete(source.source_id, e)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="min-w-[800px] h-[600px] max-w-6xl flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {selectedSource?.original_filename || "Source Markdown"}
            </DialogTitle>
            <DialogDescription>
              Converted markdown content from the source document
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {loadingContent ? (
              <div className="flex items-center justify-center h-full">
                <Spinner className="size-6" />
              </div>
            ) : (
              <Textarea
                value={markdownContent}
                readOnly
                className="w-full min-h-full font-mono text-sm resize-none"
                style={{ fontFamily: "monospace" }}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
