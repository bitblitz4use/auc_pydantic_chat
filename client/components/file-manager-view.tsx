"use client";

import { useEffect, useState, useRef } from "react";
import { Upload, FileText, Trash2, Plus, Tag, X, LucideIcon } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { cn, extractFileName, ensureMdExtension, arraysEqual, extractTags } from "@/lib/utils";

interface FileManagerViewProps {
  folder: string;
  icon: LucideIcon;
  title: string;
  defaultFileName: string;
  emptyStateTitle: string;
  emptyStateDescription: string;
}

export function FileManagerView({
  folder,
  icon: Icon,
  title,
  defaultFileName,
  emptyStateTitle,
  emptyStateDescription,
}: FileManagerViewProps) {
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageObject | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState(defaultFileName);
  const [originalFileName, setOriginalFileName] = useState<string>("");
  const [fileTags, setFileTags] = useState<string[]>([]);
  const [originalTags, setOriginalTags] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const files = await listStorageObjects(folder, false, true);
      setObjects(files);
      setAvailableTags(extractTags(files));
    } catch (error) {
      console.error(`Error fetching ${folder}:`, error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [folder]);

  const resetDialogState = () => {
    setIsNewFile(false);
    setNewFileName(defaultFileName);
    setOriginalFileName("");
    setFileContent("");
    setOriginalContent("");
    setFileTags([]);
    setOriginalTags([]);
    setSelectedFile(null);
  };

  const handleNew = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    resetDialogState();
    setNewFileName(`${defaultFileName.replace('.md', '')}-${timestamp}.md`);
    setIsNewFile(true);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetDialogState();
    }
    setDialogOpen(open);
  };

  const handleCardClick = async (obj: StorageObject) => {
    try {
      setSelectedFile(obj);
      setIsNewFile(false);
      setDialogOpen(true);
      setLoadingContent(true);
      
      const content = await getFileContent(obj.name);
      const tags = obj.tags && obj.tags.length > 0 ? obj.tags : await getFileTags(obj.name);
      
      setFileContent(content);
      setOriginalContent(content);
      setFileTags(tags);
      setOriginalTags(tags);
      
      const fileName = extractFileName(obj.name, folder);
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
      if (!newFileName.trim()) {
        alert("Please enter a filename");
        return;
      }
      const fileName = ensureMdExtension(newFileName);
      const filePath = `${folder}/${fileName}`;
      
      try {
        setSaving(true);
        await updateFileContent(filePath, fileContent, fileTags);
        setIsNewFile(false);
        setOriginalTags(fileTags);
        await fetchFiles();
        setDialogOpen(false);
      } catch (error) {
        console.error("Error creating file:", error);
        alert("Failed to create file");
      } finally {
        setSaving(false);
      }
    } else {
      if (!selectedFile) return;

      try {
        setSaving(true);
        
        const fileName = ensureMdExtension(newFileName);
        const newFilePath = `${folder}/${fileName}`;
        const fileNameChanged = fileName !== originalFileName;
        const tagsChanged = !arraysEqual(fileTags, originalTags);
        
        if (fileNameChanged) {
          await renameFile(selectedFile.name, newFilePath);
        }
        
        const finalPath = fileNameChanged ? newFilePath : selectedFile.name;
        await updateFileContent(finalPath, fileContent, fileTags);
        
        if (tagsChanged) {
          await updateFileTags(finalPath, fileTags);
        }
        
        setOriginalContent(fileContent);
        setOriginalTags(fileTags);
        if (fileNameChanged) {
          setOriginalFileName(fileName);
        }
        await fetchFiles();
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
      !arraysEqual(fileTags, originalTags);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(`${folder}/${file.name}`, file);
      await fetchFiles();
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
    const fileName = extractFileName(objectName, folder);
    if (!confirm(`Delete ${fileName}?`)) return;

    try {
      await deleteFile(objectName);
      await fetchFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file");
    }
  };

  const filteredObjects = selectedFilterTags.length === 0
    ? objects
    : objects.filter((obj) => 
        obj.tags && 
        selectedFilterTags.every((filterTag) => obj.tags!.includes(filterTag))
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
          Uploading...
        </>
      ) : (
        <>
          <Upload className="mr-2 size-4" />
          Upload
        </>
      )}
    </Button>
  );

  const NewButton = ({ size = "default" }: { size?: "default" | "sm" }) => (
    <Button onClick={handleNew} variant="outline" size={size}>
      <Plus className="mr-2 size-4" />
      {size === "sm" ? "New" : `New ${title.split(' ')[0]}`}
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
        {objects.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={title}
            description={emptyStateDescription}
            actions={
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
                <NewButton />
                <UploadButton />
              </>
            }
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredObjects.length} of {objects.length} {objects.length === 1 ? title.split(' ')[0].toLowerCase().slice(0, -1) : title.split(' ')[0].toLowerCase()}
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
                <NewButton size="sm" />
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
              <div className="space-y-2">
                {filteredObjects.map((obj) => {
                  const fileName = extractFileName(obj.name, folder);
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
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="min-w-[800px] h-[600px] max-w-6xl flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {isNewFile ? `New ${title.split(' ')[0]}` : selectedFile ? extractFileName(selectedFile.name, folder) : "File Content"}
            </DialogTitle>
            <DialogDescription>
              {isNewFile ? `Create a new ${title.split(' ')[0].toLowerCase()}` : `Edit the ${title.split(' ')[0].toLowerCase()} content`}
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
                placeholder={isNewFile ? `Enter your ${title.split(' ')[0].toLowerCase()} content here...` : ""}
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
