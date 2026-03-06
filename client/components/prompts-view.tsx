"use client";

import { useEffect, useState, useRef } from "react";
import { Wand2, Upload, FileText, Trash2, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listStorageObjects,
  uploadFile,
  deleteFile,
  getFileContent,
  updateFileContent,
  renameFile,
  getFileTags,
  updateFileTags,
  formatFileSize,
  formatDate,
  type StorageObject,
} from "@/lib/storage";
import { TagSelector } from "@/components/ui/tag-selector";
import { cn } from "@/lib/utils";

export function PromptsView() {
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageObject | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState("new-prompt.md");
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const files = await listStorageObjects("prompts", false, true);
      setObjects(files);
      
      // Extract available tags from loaded objects (client-side)
      const tagSet = new Set<string>();
      files.forEach((obj) => {
        if (obj.tags && Array.isArray(obj.tags)) {
          obj.tags.forEach((tag) => tagSet.add(tag));
        }
      });
      setAvailableTags(Array.from(tagSet).sort());
    } catch (error) {
      console.error("Error fetching prompts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleNew = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    setSelectedFile(null);
    setFileContent("");
    setOriginalContent("");
    setNewFileName(`new-prompt-${timestamp}.md`);
    setOriginalFileName("");
    setFileTags([]);
    setOriginalTags([]);
    setIsNewFile(true);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // Reset state when dialog closes
      setIsNewFile(false);
      setNewFileName("new-prompt.md");
      setOriginalFileName("");
      setFileContent("");
      setOriginalContent("");
      setFileTags([]);
      setOriginalTags([]);
      setSelectedFile(null);
    }
    setDialogOpen(open);
  };

  const handleCardClick = async (obj: StorageObject) => {
    try {
      setSelectedFile(obj);
      setIsNewFile(false);
      setDialogOpen(true);
      setLoadingContent(true);
      
      // Use tags from list object if available, otherwise fetch
      const content = await getFileContent(obj.name);
      const tags = obj.tags && obj.tags.length > 0 ? obj.tags : await getFileTags(obj.name);
      
      setFileContent(content);
      setOriginalContent(content);
      setFileTags(tags);
      setOriginalTags(tags);
      
      // Extract and set the original filename
      const fileName = obj.name.replace("prompts/", "");
      setNewFileName(fileName);
      setOriginalFileName(fileName);
    } catch (error) {
      console.error("Error loading file content:", error);
      alert("Failed to load file content");
      setDialogOpen(false);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSave = async () => {
    if (isNewFile) {
      // Create new file
      if (!newFileName.trim()) {
        alert("Please enter a filename");
        return;
      }
      const fileName = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
      const filePath = `prompts/${fileName}`;
      
      try {
        setSaving(true);
        await updateFileContent(filePath, fileContent, fileTags);
        setIsNewFile(false);
        setOriginalTags(fileTags);
        await fetchPrompts();
        setDialogOpen(false);
      } catch (error) {
        console.error("Error creating file:", error);
        alert("Failed to create file");
      } finally {
        setSaving(false);
      }
    } else {
      // Update existing file
      if (!selectedFile) return;

      try {
        setSaving(true);
        
        // Check if filename changed
        const fileName = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`;
        const newFilePath = `prompts/${fileName}`;
        const fileNameChanged = fileName !== originalFileName;
        const tagsChanged = JSON.stringify([...fileTags].sort()) !== JSON.stringify([...originalTags].sort());
        
        if (fileNameChanged) {
          // Rename the file first (tags are preserved automatically)
          await renameFile(selectedFile.name, newFilePath);
        }
        
        // Update content (use new path if renamed, otherwise use original)
        const finalPath = fileNameChanged ? newFilePath : selectedFile.name;
        await updateFileContent(finalPath, fileContent, fileTags);
        
        // Update tags separately if they changed (in case content didn't change)
        if (tagsChanged) {
          await updateFileTags(finalPath, fileTags);
        }
        
        setOriginalContent(fileContent);
        setOriginalTags(fileTags);
        if (fileNameChanged) {
          setOriginalFileName(fileName);
        }
        await fetchPrompts();
        setDialogOpen(false);
      } catch (error) {
        console.error("Error saving file:", error);
        alert("Failed to save file");
      } finally {
        setSaving(false);
      }
    }
  };

  const hasChanges = isNewFile 
    ? fileContent.trim() !== "" || fileTags.length > 0
    : fileContent !== originalContent || 
      newFileName !== originalFileName ||
      JSON.stringify([...fileTags].sort()) !== JSON.stringify([...originalTags].sort());

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(`prompts/${file.name}`, file);
      await fetchPrompts();
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (objectName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!confirm(`Delete ${objectName.replace("prompts/", "")}?`)) return;

    try {
      await deleteFile(objectName);
      await fetchPrompts();
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file");
    }
  };

  // Filter objects based on selected tags
  const filteredObjects = selectedFilterTags.length === 0
    ? objects
    : objects.filter((obj) => 
        obj.tags && 
        selectedFilterTags.every((filterTag) => obj.tags!.includes(filterTag))
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

  if (objects.length === 0) {
    return (
      <>
        <div className="h-full overflow-hidden px-4 pt-4 pb-4">
          <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border">
            <div className="max-w-md space-y-4 text-center px-8">
              <Wand2 className="mx-auto h-12 w-12 text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">Prompts Library</h2>
              <p className="text-sm text-muted-foreground">
                No prompts found. Create a new prompt or upload an existing file to get started.
              </p>
              <div className="pt-2 flex gap-2 justify-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <Button
                  onClick={handleNew}
                  variant="outline"
                >
                  <Plus className="mr-2 size-4" />
                  New Prompt
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  variant="outline"
                >
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
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent className="min-w-[800px] h-[600px] max-w-6xl flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {isNewFile ? "New Prompt" : selectedFile?.name.replace("prompts/", "") || "File Content"}
              </DialogTitle>
              <DialogDescription>
                {isNewFile ? "Create a new prompt" : "Edit the prompt content"}
              </DialogDescription>
              <div className="pt-2">
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="filename.md"
                  className="font-mono"
                  disabled={loadingContent}
                />
              </div>
              {!loadingContent && (
                <div className="pt-2">
                  <TagSelector
                    tags={fileTags}
                    availableTags={availableTags}
                    onChange={setFileTags}
                  />
                </div>
              )}
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              {loadingContent ? (
                <div className="flex items-center justify-center h-full">
                  <Spinner className="size-6" />
                </div>
              ) : (
                <Textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full min-h-full font-mono text-sm resize-none"
                  style={{ fontFamily: "monospace" }}
                  placeholder={isNewFile ? "Enter your prompt content here..." : ""}
                />
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setIsNewFile(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges || loadingContent}
              >
                {saving ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Saving...
                  </>
                ) : (
                  isNewFile ? "Create" : "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="h-full overflow-hidden px-4 pt-4 pb-4">
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Prompts Library</h2>
              <p className="text-sm text-muted-foreground">
                {filteredObjects.length} of {objects.length} {objects.length === 1 ? "prompt" : "prompts"}
                {selectedFilterTags.length > 0 && ` (filtered by ${selectedFilterTags.length} tag${selectedFilterTags.length > 1 ? 's' : ''})`}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              <Button
                onClick={handleNew}
                variant="outline"
                size="sm"
              >
                <Plus className="mr-2 size-4" />
                New
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                variant="outline"
                size="sm"
              >
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

          {/* Tag Filter Section */}
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
            <div className="space-y-2">
              {filteredObjects.map((obj) => {
                const fileName = obj.name.replace("prompts/", "");
                return (
                  <div
                    key={obj.name}
                    onClick={() => handleCardClick(obj)}
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
                        <span>{formatFileSize(obj.size)}</span>
                        <span>•</span>
                        <span>{formatDate(obj.last_modified)}</span>
                      </div>
                    </div>
                    {obj.tags && obj.tags.length > 0 && (
                      <div className="flex items-center justify-center gap-1 flex-wrap shrink-0">
                        {obj.tags.map((tag) => (
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
                      onClick={(e) => handleDelete(obj.name, e)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="min-w-[800px] h-[600px] max-w-6xl flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {isNewFile ? "New Prompt" : selectedFile?.name.replace("prompts/", "") || "File Content"}
            </DialogTitle>
            <DialogDescription>
              {isNewFile ? "Create a new prompt" : "Edit the prompt content"}
            </DialogDescription>
            <div className="pt-2">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="filename.md"
                className="font-mono"
                disabled={loadingContent}
              />
            </div>
            {!loadingContent && (
              <div className="pt-2">
                <TagSelector
                  tags={fileTags}
                  availableTags={availableTags}
                  onChange={setFileTags}
                />
              </div>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {loadingContent ? (
              <div className="flex items-center justify-center h-full">
                <Spinner className="size-6" />
              </div>
            ) : (
              <Textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full min-h-full font-mono text-sm resize-none"
                style={{ fontFamily: "monospace" }}
                placeholder={isNewFile ? "Enter your prompt content here..." : ""}
              />
            )}
          </div>
          <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !hasChanges || loadingContent}
            >
              {saving ? (
                <>
                  <Spinner className="mr-2 size-4" />
                  Saving...
                </>
              ) : (
                isNewFile ? "Create" : "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
