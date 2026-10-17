import * as React from "react";
import { ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BottomSheet, BottomSheetBody, BottomSheetFooter, BottomSheetHeader } from "./BottomSheet";

/**
 * Filtros no telemóvel (§23–§24). A toolbar desktop com 6 selects ocupa meio
 * ecrã a 360px; aqui fica um botão com a contagem, e os filtros aplicados
 * voltam como chips removíveis um a um.
 */
export function FilterTrigger({
  activeCount,
  onClick,
  label = "Filtros",
}: {
  activeCount: number;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "touch-feedback inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-[13px] font-medium leading-[20px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activeCount > 0 && "border-primary/40 bg-primary-soft/50 text-primary-strong",
      )}
    >
      <ListFilter className="size-[18px] shrink-0 opacity-70" aria-hidden />
      <span className="min-w-0 break-words">{label}</span>
      {activeCount > 0 ? (
        <span className="tnum inline-flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-medium text-primary-foreground">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  children,
  onClear,
  onApply,
  activeCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  onClear?: () => void;
  onApply?: () => void;
  activeCount?: number;
}) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} size="auto">
      <BottomSheetHeader
        title="Filtros"
        description={
          activeCount
            ? `${activeCount} filtro${activeCount === 1 ? "" : "s"} aplicado${activeCount === 1 ? "" : "s"}`
            : "Nenhum filtro aplicado"
        }
        onClose={() => onOpenChange(false)}
      />
      <BottomSheetBody className="space-y-5 pb-4">{children}</BottomSheetBody>
      <BottomSheetFooter className="flex flex-wrap gap-2">
        {onClear ? (
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-[44px] min-w-0 flex-1 whitespace-normal break-words rounded-xl px-3 py-3 text-[13px] leading-[20px] lg:min-h-[44px]"
            onClick={() => {
              onClear();
            }}
          >
            Limpar
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-auto min-h-[44px] min-w-0 flex-1 whitespace-normal break-words rounded-xl px-3 py-3 text-[13px] leading-[20px] lg:min-h-[44px]"
          onClick={() => {
            onApply?.();
            onOpenChange(false);
          }}
        >
          Ver resultados
        </Button>
      </BottomSheetFooter>
    </BottomSheet>
  );
}

/** Um grupo de opções dentro da folha: rótulo + escolhas em pastilhas. */
export function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="break-words text-[12px] font-medium leading-[20px] text-muted-foreground">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function FilterOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "touch-feedback inline-flex min-h-[44px] max-w-full items-center whitespace-normal break-words rounded-xl border px-3 py-2 text-left text-[13px] font-medium leading-[20px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/50 bg-primary-soft text-primary-strong"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export type FilterChip = { key: string; label: string; onRemove: () => void };

/** Chips do que está aplicado (§24). Cada um remove-se sozinho. */
export function FilterChips({
  chips,
  onClearAll,
  className,
}: {
  chips: FilterChip[];
  onClearAll?: () => void;
  className?: string;
}) {
  if (!chips.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-left text-[12px] font-medium leading-[20px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 break-words">{chip.label}</span>
          <X className="size-[16px] shrink-0 opacity-70" aria-hidden />
          <span className="sr-only">Remover filtro</span>
        </button>
      ))}
      {chips.length > 1 && onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-0.5 min-h-[44px] rounded-xl px-3 py-2 text-[12px] font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Limpar tudo
        </button>
      ) : null}
    </div>
  );
}
