"use client";

import { useEffect, useState, useRef } from "react";
import { Layout, Upload, FileText, Trash2 } from "lucide-react";
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
  listStorageObjects,
  uploadFile,
  deleteFile,
  getFileContent,
  updateFileContent,
  formatFileSize,
  formatDate,
  type StorageObject,
} from "@/lib/storage";

export function TemplatesView() {
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<StorageObject | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const files = await listStorageObjects("templates", false);
      setObjects(files);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCardClick = async (obj: StorageObject) => {
    try {
      setSelectedFile(obj);
      setDialogOpen(true);
      setLoadingContent(true);
      const content = await getFileContent(obj.name);
      setFileContent(content);
      setOriginalContent(content);
    } catch (error) {
      console.error("Error loading file content:", error);
      alert("Failed to load file content");
      setDialogOpen(false);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      setSaving(true);
      await updateFileContent(selectedFile.name, fileContent);
      setOriginalContent(fileContent);
      await fetchTemplates(); // Refresh list to update file metadata
      setDialogOpen(false); // Close dialog on successful save
    } catch (error) {
      console.error("Error saving file:", error);
      alert("Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = fileContent !== originalContent;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(`templates/${file.name}`, file);
      await fetchTemplates();
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
    if (!confirm(`Delete ${objectName.replace("templates/", "")}?`)) return;

    try {
      await deleteFile(objectName);
      await fetchTemplates();
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("Failed to delete file");
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

  if (objects.length === 0) {
    return (
      <div className="h-full overflow-hidden px-4 pt-4 pb-4">
        <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border">
          <div className="max-w-md space-y-4 text-center px-8">
            <Layout className="mx-auto h-12 w-12 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">Document Templates</h2>
            <p className="text-sm text-muted-foreground">
              No templates found. Upload your first template file to get started.
            </p>
            <div className="pt-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
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
                    Upload Template
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full overflow-hidden px-4 pt-4 pb-4">
        <div className="flex h-full flex-col">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Document Templates</h2>
              <p className="text-sm text-muted-foreground">
                {objects.length} {objects.length === 1 ? "template" : "templates"}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
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

          <div className="flex-1 overflow-y-auto">
            <div className="space-y-2">
              {objects.map((obj) => {
                const fileName = obj.name.replace("templates/", "");
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
              {selectedFile?.name.replace("templates/", "") || "File Content"}
            </DialogTitle>
            <DialogDescription>
              Edit the template content
            </DialogDescription>
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
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
