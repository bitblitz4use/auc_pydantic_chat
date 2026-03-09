"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFullscreenElement } from "@/hooks/use-fullscreen-element";

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type DialogState =
  | { type: "alert"; message: string; title?: string }
  | { type: "confirm"; message: string; options?: ConfirmOptions }
  | null;

interface AppDialogContextValue {
  alert: (message: string, title?: string) => Promise<void>;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

export function useAppDialog(): AppDialogContextValue {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return ctx;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const resolveRef = useRef<(value: boolean) => void>();
  const fullscreenElement = useFullscreenElement();
  const dialogContainer =
    fullscreenElement ?? (typeof document !== "undefined" ? document.body : undefined);

  const alert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      resolveRef.current = () => {
        resolve();
        resolveRef.current = undefined;
      };
      setState({ type: "alert", message, title });
    });
  }, []);

  const confirm = useCallback(
    (message: string, options?: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = (value: boolean) => {
          resolve(value);
          resolveRef.current = undefined;
        };
        setState({ type: "confirm", message, options });
      });
    },
    []
  );

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open && resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = undefined;
    }
    if (!open) setState(null);
  }, []);

  const handleAlertOk = useCallback(() => {
    resolveRef.current?.();
    setState(null);
  }, []);

  const handleConfirm = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    setState(null);
  }, []);

  const open = state !== null;
  const isAlert = state?.type === "alert";
  const isConfirm = state?.type === "confirm";

  return (
    <AppDialogContext.Provider value={{ alert, confirm }}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          container={dialogContainer}
        >
          {state && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.type === "alert" && (state.title ?? "Message")}
                  {state.type === "confirm" &&
                    (state.options?.title ?? "Confirm")}
                </DialogTitle>
                <DialogDescription className="text-foreground mt-1">
                  {state.message}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                {isAlert && (
                  <Button onClick={handleAlertOk}>OK</Button>
                )}
                {isConfirm && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleConfirm(false)}
                    >
                      {state.options?.cancelLabel ?? "Cancel"}
                    </Button>
                    <Button onClick={() => handleConfirm(true)}>
                      {state.options?.confirmLabel ?? "Confirm"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}
