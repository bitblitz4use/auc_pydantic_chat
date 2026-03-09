"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <ToolbarButton
        icon={Moon}
        isActive={false}
        onClick={() => {}}
        title="Theme"
        className="opacity-50"
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <ToolbarButton
      icon={isDark ? Sun : Moon}
      isActive={false}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    />
  );
}
