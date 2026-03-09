"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current fullscreen element (or null). Updates when entering/leaving fullscreen.
 * Used so portaled content (Popover, Select, etc.) can render inside the fullscreen element.
 */
export function useFullscreenElement(): HTMLElement | null {
  const [element, setElement] = useState<HTMLElement | null>(
    () =>
      typeof document !== "undefined"
        ? (document.fullscreenElement as HTMLElement | null)
        : null
  );
  useEffect(() => {
    const onFullscreenChange = () =>
      setElement(document.fullscreenElement as HTMLElement | null);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  return element;
}
