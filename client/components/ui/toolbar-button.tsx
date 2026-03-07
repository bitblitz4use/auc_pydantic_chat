import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps {
  icon: LucideIcon;
  isActive: boolean;
  onClick: () => void;
  title: string;
  size?: number;
  className?: string;
}

export function ToolbarButton({
  icon: Icon,
  isActive,
  onClick,
  title,
  size = 20,
  className,
}: ToolbarButtonProps) {
  return (
    <button
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-md transition-all duration-200",
        isActive
          ? "bg-accent text-accent-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
        className
      )}
      title={title}
      onClick={onClick}
    >
      <Icon size={size} />
    </button>
  );
}
