import { useRef, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Acções ocasionais conservam os componentes e o estado dos seus formulários. */
export function PageActionMenu({ children }: { children: ReactNode }) {
  const summary = useRef<HTMLElement>(null);
  return (
    <details
      className="relative shrink-0"
      onKeyDown={(event) => {
        // Um diálogo em portal gere o seu próprio Escape e retorno do foco.
        if (
          event.key === "Escape" &&
          event.currentTarget.open &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          summary.current?.focus();
        }
      }}
    >
      <summary
        ref={summary}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "list-none gap-2 cursor-pointer max-lg:min-h-[44px] [&::-webkit-details-marker]:hidden",
        )}
      >
        <MoreHorizontal className="size-4" strokeWidth={1.8} aria-hidden />
        Mais opções
      </summary>
      <div
        role="group"
        aria-label="Outras acções da página"
        className="absolute left-0 top-full lg:left-auto lg:right-0 z-40 mt-2 flex max-h-[min(60dvh,28rem)] w-72 max-w-[calc(100vw-2rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-2 shadow-sm [&>button]:h-auto [&>button]:min-h-[44px] [&>button]:w-full [&>button]:justify-start [&>button]:whitespace-normal [&>a]:h-auto [&>a]:min-h-[44px] [&>a]:w-full [&>a]:justify-start [&>a]:whitespace-normal"
      >
        {children}
      </div>
    </details>
  );
}
