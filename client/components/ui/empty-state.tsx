import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-border", className)}>
      <div className="max-w-md space-y-4 text-center px-8">
        <Icon className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        {actions && (
          <div className="pt-2 flex gap-2 justify-center">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
