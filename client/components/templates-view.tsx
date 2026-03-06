"use client";

import { useEffect, useState, useRef } from "react";
import { Layout, Upload, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  listStorageObjects,
  uploadFile,
  deleteFile,
  formatFileSize,
  formatDate,
  type StorageObject,
} from "@/lib/storage";

export function TemplatesView() {
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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

  const handleDelete = async (objectName: string) => {
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
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
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
                    onClick={() => handleDelete(obj.name)}
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
  );
}
