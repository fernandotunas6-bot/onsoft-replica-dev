import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface ModalSidebarItem {
  value: string;
  label: string;
  icon?: LucideIcon;
}

/**
 * Sidebar contextual para Management Modals (ver PROMPT MASTER §5/§6).
 * Reaproveita TabsList/TabsTrigger do Radix (deve viver dentro de um <Tabs>) —
 * herda navegação por teclado e ARIA em vez de reimplementar troca de abas.
 * Em ecrãs pequenos vira uma tira horizontal no topo (mobile); em ecrãs
 * largos fica como coluna fixa à esquerda (desktop/tablet) — só CSS, sem
 * ramo de código separado para mobile.
 */
export function ModalSidebar({
  items,
  header,
  className,
}: {
  items: ModalSidebarItem[];
  header?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-col border-border bg-secondary/10 sm:w-52 sm:border-r",
        className,
      )}
    >
      {header ? <div className="border-b border-border px-4 py-3">{header}</div> : null}
      <TabsList className="h-auto w-full flex-row justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-2 sm:flex-col sm:items-stretch sm:overflow-visible">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="w-full shrink-0 justify-start gap-2 rounded-lg px-3 py-2 text-xs font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
              <span className="truncate">{item.label}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}
