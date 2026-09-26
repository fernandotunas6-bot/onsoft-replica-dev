import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Indicador pequeno enquanto se buscam dados reais: ícone discreto e uma
 * palavra, sem ocupar o ecrã. Anunciado aos leitores de ecrã (role="status").
 */
export function InlineLoading({
  label = "A carregar…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
    >
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      {label}
    </span>
  );
}
