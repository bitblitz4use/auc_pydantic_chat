"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FileText } from "lucide-react";

export interface ResourceItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface ResourceSelectorDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  items: T[];
  loading: boolean;
  onSelect: (item: T) => void;
  renderItem: (item: T) => ResourceItem;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
  groupHeading?: string;
}

export function ResourceSelectorDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  items,
  loading,
  onSelect,
  renderItem,
  searchPlaceholder = "Search...",
  emptyText = "No items found.",
  loadingText = "Loading...",
  groupHeading,
}: ResourceSelectorDialogProps<T>) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <CommandInput placeholder={searchPlaceholder} />
      <CommandList>
        <CommandEmpty>
          {loading ? loadingText : emptyText}
        </CommandEmpty>
        {!loading && items.length > 0 && (
          <CommandGroup heading={groupHeading}>
            {items.map((item) => {
              const { key, label, icon } = renderItem(item);
              return (
                <CommandItem
                  key={key}
                  onSelect={() => onSelect(item)}
                >
                  {icon || <FileText className="size-4" />}
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
