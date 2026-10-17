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
        "touch-feedback inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground",
        activeCount > 0 && "border-primary/40 bg-primary-soft/50 text-primary-strong",
      )}
    >
      <ListFilter className="size-4 opacity-70" aria-hidden />
      {label}
      {activeCount > 0 ? (
        <span className="tnum inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
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
      <BottomSheetFooter className="flex gap-2">
        {onClear ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            onClick={() => {
              onClear();
            }}
          >
            Limpar
          </Button>
        ) : null}
        <Button
          type="button"
          className="h-11 flex-1"
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
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">{label}</legend>
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
        "touch-feedback inline-flex min-h-9 items-center rounded-lg border px-3 text-xs font-medium transition-colors",
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
          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary/25 bg-primary-soft/60 pl-2.5 pr-1.5 text-[11px] font-medium text-primary-strong"
        >
          {chip.label}
          <X className="size-3.5 opacity-70" aria-hidden />
          <span className="sr-only">Remover filtro</span>
        </button>
      ))}
      {chips.length > 1 && onClearAll ? (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-0.5 min-h-7 px-1.5 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          Limpar tudo
        </button>
      ) : null}
    </div>
  );
}
