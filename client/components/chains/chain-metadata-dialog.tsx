"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagSelector } from "@/components/ui/tag-selector";
import { Network } from "lucide-react";
import { LoadingButton } from "@/components/common/loading-button";
import { Button } from "@/components/ui/button";
import type { ChainMetadata } from "@/lib/prompt-chains";

interface ChainMetadataDialogProps {
  open: boolean;
  onClose: () => void;
  metadata: ChainMetadata | null;
  fileName: string;
  onMetadataChange: (metadata: ChainMetadata) => void;
  onFileNameChange: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  isNew: boolean;
}

export function ChainMetadataDialog({
  open,
  onClose,
  metadata,
  fileName,
  onMetadataChange,
  onFileNameChange,
  onSave,
  saving,
  isNew,
}: ChainMetadataDialogProps) {
  if (!metadata) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Network className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl">
                {isNew ? 'Create New Chain' : 'Edit Chain Metadata'}
              </DialogTitle>
              <DialogDescription>
                Configure chain settings and documentation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="filename">File Name</Label>
            <div className="flex gap-2">
              <Input
                id="filename"
                value={fileName}
                onChange={(e) => onFileNameChange(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))}
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
              value={metadata.name}
              onChange={(e) => onMetadataChange({ ...metadata, name: e.target.value })}
              placeholder="My Prompt Chain"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={metadata.description || ''}
              onChange={(e) => onMetadataChange({ ...metadata, description: e.target.value })}
              placeholder="Brief description of this chain"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <TagSelector
              tags={metadata.tags || []}
              availableTags={[]}
              onChange={(tags) => onMetadataChange({ ...metadata, tags })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <LoadingButton 
            loading={saving} 
            loadingText="Saving..." 
            onClick={onSave}
          >
            {isNew ? 'Create Chain' : 'Save Changes'}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
