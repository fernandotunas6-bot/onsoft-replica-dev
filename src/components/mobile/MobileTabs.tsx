import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Separadores mobile (§30). Rolam na horizontal dentro do próprio contentor —
 * o `overflow-x` fica aqui e não no corpo da página, que é a regra que impede
 * o ecrã inteiro de abanar na horizontal.
 */
export type MobileTab = { id: string; label: string; badge?: number };

export function MobileTabs({
  tabs,
  activeId,
  onSelect,
  className,
}: {
  tabs: MobileTab[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  // O separador activo pode estar fora do ecrã quando se chega por link
  // directo; trazê-lo para a vista evita a impressão de que não há nada activo.
  React.useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeId]);

  return (
    <div
      ref={listRef}
      role="tablist"
      className={cn(
        "no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4",
        "border-b border-border",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative shrink-0 whitespace-nowrap px-3 pb-2.5 pt-2 text-sm transition-colors",
              active ? "font-medium text-primary-strong" : "text-muted-foreground",
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="tnum ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-secondary px-1 text-[10px] text-secondary-foreground">
                {tab.badge}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
