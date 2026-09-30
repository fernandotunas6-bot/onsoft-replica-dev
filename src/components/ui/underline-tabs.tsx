import type { ElementType } from "react";
import { cn } from "@/lib/utils";

export type UnderlineTab<T extends string> = {
  id: T;
  label: string;
  icon?: ElementType;
};

/**
 * Separadores sublinhados (estilo Linear/Stripe): texto cinza, o activo a preto com
 * um traço por baixo. Uma linha que desliza no telemóvel, sem quebrar.
 * A linha de base é uma sombra interior (e não `border-b`): com `overflow-x-auto`
 * o traço do activo, desenhado por cima da borda, ficava cortado.
 */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: ReadonlyArray<UnderlineTab<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Nome acessível do grupo de separadores. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-border)] md:mx-0 md:px-0",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className="relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-3 pt-1 text-sm font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent hover:text-foreground aria-selected:text-foreground aria-selected:after:bg-foreground"
        >
          {tab.icon ? <tab.icon className="size-4 opacity-70" aria-hidden /> : null}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
