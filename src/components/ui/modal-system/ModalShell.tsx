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
  full: "max-w-[95vw] h-[92vh]",
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
      handleRequestClose();
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          onPointerDownOutside={handlePointerDownOutside}
          onEscapeKeyDown={handleEscapeKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card p-0 shadow-xl duration-200 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95 focus:outline-hidden sm:w-full",
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
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-60 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
              <div className="space-y-1.5 text-left">
                <h3 className="font-semibold text-sm text-foreground">Alterações não guardadas</h3>
                <p className="text-xs text-muted-foreground">
                  Possui alterações não guardadas no formulário. Tem a certeza que deseja sair e
                  descartar?
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  Continuar a editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    onOpenChange(false);
                  }}
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
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
