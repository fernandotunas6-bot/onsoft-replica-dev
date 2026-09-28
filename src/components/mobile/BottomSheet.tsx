import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A folha inferior é o elemento central do SIGA no telemóvel (§25): filtros,
 * acções, selecções, pequenas edições e a troca de escola passam todos por
 * aqui, em vez de um modal desktop encolhido.
 *
 * Três detalhes que não são estéticos:
 *
 * - **Áreas seguras.** O conteúdo termina acima da barra de gestos do iOS, ou
 *   o último botão fica por baixo dela e não se consegue tocar.
 * - **Altura máxima.** `max-h-[92dvh]` com `dvh` (e não `vh`): no Safari a
 *   barra de endereço muda de altura durante o scroll e com `vh` a folha
 *   ficava cortada por baixo.
 * - **Foco.** Ao abrir, o foco vai para o primeiro campo relevante (§29); ao
 *   fechar, o vaul devolve-o ao elemento que a abriu.
 */
export function BottomSheet({
  open,
  onOpenChange,
  children,
  /** `medium` abre a meia altura; `full` usa a altura máxima. */
  size = "auto",
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  size?: "auto" | "medium" | "full";
  dismissible?: boolean;
}) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[55] flex flex-col rounded-t-2xl border-t border-border bg-card outline-none",
            "max-h-[92dvh]",
            size === "medium" && "h-[60dvh]",
            size === "full" && "h-[92dvh]",
          )}
        >
          {/* Alça: dá o affordance de arrastar e serve de zona de toque larga
              para fechar sem acertar no X. */}
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border" aria-hidden />
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

export function BottomSheetHeader({
  title,
  description,
  onClose,
  action,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-3">
      <div className="min-w-0 flex-1">
        <DrawerPrimitive.Title className="truncate text-base font-medium text-foreground">
          {title}
        </DrawerPrimitive.Title>
        {description ? (
          <DrawerPrimitive.Description className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </DrawerPrimitive.Description>
        ) : null}
      </div>
      {action}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="touch-target -mr-1.5 -mt-1.5 inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      ) : null}
    </div>
  );
}

/** Corpo com scroll próprio: a folha não cresce, o conteúdo rola dentro dela. */
export function BottomSheetBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2", className)}>
      {children}
    </div>
  );
}

/** Rodapé fixo com as acções. Respeita a área segura — ver nota no topo. */
export function BottomSheetFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-card px-4 pt-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export const BottomSheetClose = DrawerPrimitive.Close;
