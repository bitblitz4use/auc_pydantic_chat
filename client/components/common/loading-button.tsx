"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LucideIcon } from "lucide-react";

interface LoadingButtonProps {
  loading: boolean;
  loadingText: string;
  children: React.ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

/**
 * Reusable button with loading state
 * Automatically shows spinner and custom text when loading
 */
export function LoadingButton({ 
  loading, 
  loadingText, 
  children, 
  icon: Icon,
  onClick,
  disabled,
  variant = "default",
  size = "default",
  className
}: LoadingButtonProps) {
  return (
    <Button 
      onClick={onClick} 
      disabled={loading || disabled}
      variant={variant}
      size={size}
      className={className}
    >
      {loading ? (
        <>
          <Spinner className="mr-2 size-4" />
          {loadingText}
        </>
      ) : (
        <>
          {Icon && <Icon className="mr-2 size-4" />}
          {children}
        </>
      )}
    </Button>
  );
}
