import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
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

  const handleRequestClose = React.useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onOpenChange(false);
    }
  }, [hasUnsavedChanges, onOpenChange]);

  const handlePointerDownOutside = (e: Event) => {
    if (preventOutsideClose) {
      e.preventDefault();
      return;
    }
    if (hasUnsavedChanges) {
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
        {/* Véu discreto, sem desfocar o conteúdo da página */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          onPointerDownOutside={handlePointerDownOutside}
          onEscapeKeyDown={handleEscapeKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92dvh] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-0 shadow-sm duration-150 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-reduce:transition-none focus:outline-hidden",
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
            <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50" />
            <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[80] max-h-[92dvh] overflow-y-auto w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
              <div className="space-y-1.5 text-left">
                <DialogPrimitive.Title className="font-semibold text-[16px] lg:text-sm text-foreground">
                  Alterações não guardadas
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[14px] lg:text-xs text-muted-foreground">
                  Tem alterações por guardar. Deseja sair sem guardar?
                </DialogPrimitive.Description>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal text-[14px] lg:min-h-9 lg:text-xs"
                >
                  Continuar a editar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowUnsavedWarning(false);
                    onOpenChange(false);
                  }}
                  variant="destructive"
                  className="h-auto min-h-11 whitespace-normal text-[14px] lg:min-h-9 lg:text-xs"
                >
                  Descartar alterações
                </Button>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </DialogPrimitive.Root>
  );
}
