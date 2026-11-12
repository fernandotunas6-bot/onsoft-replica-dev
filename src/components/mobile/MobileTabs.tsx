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
  const selectedIndex = tabs.findIndex((tab) => tab.id === activeId);

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!tabs.length) return;
    let next = index;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const destination = tabs[next];
    if (!destination) return;
    onSelect(destination.id);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  // O separador activo pode estar fora do ecrã quando se chega por link
  // directo; trazê-lo para a vista evita a impressão de que não há nada activo.
  React.useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Separadores da página"
      className={cn(
        "no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4",
        "border-b border-border",
        className,
      )}
    >
      {tabs.map((tab, index) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={selectedIndex < 0 ? (index === 0 ? 0 : -1) : active ? 0 : -1}
            data-active={active}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            className={cn(
              "relative min-h-[44px] shrink-0 whitespace-nowrap rounded-t-lg px-3 py-3 text-[13px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active ? "font-medium text-primary-strong" : "text-muted-foreground",
            )}
          >
            {tab.label}
            {tab.badge ? (
              <span className="tnum ml-1.5 inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-secondary px-1.5 text-[11px] text-secondary-foreground">
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
