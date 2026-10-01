import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export interface ModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  hasUnsavedChanges?: boolean;
  preventOutsideClose?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<ModalShellProps["size"]>, string> = {
  xs: "max-w-sm",
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
  full: "max-w-[95vw] h-[92dvh]",
};

export function ModalShell({
  open,
  onOpenChange,
  children,
  size = "md",
  hasUnsavedChanges = false,
  preventOutsideClose = false,
  className,
}: ModalShellProps) {
  const [showUnsavedWarning, setShowUnsavedWarning] = React.useState(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  const handleRequestClose = React.useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onOpenChange(false);
    }
  }, [hasUnsavedChanges, onOpenChange]);

  const handlePointerDownOutside = (e: Event) => {
    if (preventOutsideClose || hasUnsavedChanges) {
      e.preventDefault();
      if (hasUnsavedChanges) handleRequestClose();
    }
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      handleRequestClose();
    }
  };

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : handleRequestClose())}
    >
      <DialogPrimitive.Portal>
        {/* Backdrop escuro com blur suave */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef.current?.isConnected) {
              event.preventDefault();
              returnFocusRef.current.focus({ preventScroll: true });
            }
          }}
          onPointerDownOutside={handlePointerDownOutside}
          onEscapeKeyDown={handleEscapeKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 focus:outline-hidden sm:w-full sm:max-h-[90dvh]",
            sizeClasses[size],
            className,
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>

      {/* Alerta de confirmação para descartar alterações não guardadas */}
      {showUnsavedWarning && (
        <DialogPrimitive.Root open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs" />
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-60 w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
              <div className="space-y-1.5 text-left">
                <DialogPrimitive.Title className="font-semibold text-sm text-foreground">
                  Alterações não guardadas
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  Possui alterações não guardadas no formulário. Tem a certeza que deseja sair e
                  descartar?
                </DialogPrimitive.Description>
              </div>
              <div className="flex flex-col items-stretch gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="min-h-11 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Continuar a editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    onOpenChange(false);
                  }}
                  className="min-h-11 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Descartar alterações
                </button>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </DialogPrimitive.Root>
  );
}
