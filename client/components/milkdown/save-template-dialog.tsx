"use client";

import { useState } from "react";
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
import { TagSelector } from "@/components/ui/tag-selector";
import { updateFileContent } from "@/lib/storage";
import { ensureMdExtension } from "@/lib/utils";
import { useAppDialog } from "@/components/app-dialog-provider";

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdown: string;
  availableTags: string[];
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  markdown,
  availableTags,
}: SaveTemplateDialogProps) {
  const { alert } = useAppDialog();
  const [fileName, setFileName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fileName.trim()) {
      await alert("Please enter a filename");
      return;
    }

    const name = ensureMdExtension(fileName);
    const filePath = `templates/${name}`;

    try {
      setSaving(true);
      await updateFileContent(filePath, markdown, tags);
      
      // Reset and close
      setFileName("");
      setTags([]);
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving template:", error);
      await alert("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setFileName("");
      setTags([]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-[800px] h-[600px] max-w-6xl flex flex-col">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Save the current editor content as a reusable template
          </DialogDescription>
          <div className="pt-2">
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="template-name.md"
              className="font-mono"
              disabled={saving}
              autoFocus
            />
          </div>
          <div className="pt-2">
            <TagSelector
              tags={tags}
              availableTags={availableTags}
              onChange={setTags}
            />
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <Textarea
            value={markdown}
            readOnly
            className="w-full min-h-full font-mono text-sm resize-none bg-muted"
            style={{ fontFamily: "monospace" }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !fileName.trim()}
          >
            {saving ? (
              <>
                <Spinner className="mr-2 size-4" />
                Saving...
              </>
            ) : (
              "Save Template"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
