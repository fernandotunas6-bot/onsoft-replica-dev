import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Explicação secundária atrás de um link: o ecrã mostra só o essencial, e
 * quem quer o detalhe toca em "Saber mais".
 */
export function MoreInfo({
  label = "Saber mais",
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("text-xs", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        {open ? "Mostrar menos" : label}
      </button>
      {open ? (
        <div id={id} className="mt-1.5 leading-5 text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}
