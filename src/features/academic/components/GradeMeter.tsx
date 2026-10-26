import { cn } from "@/lib/utils";

const clampPct = (value: number) => Math.max(0, Math.min(100, (value / 20) * 100));

/**
 * Barra 0–20 até à nota máxima, com a marca da aprovação. Vermelha abaixo da
 * aprovação (10 por omissão), verde a partir dela. Sem nota: só o trilho.
 */
export function GradeMeter({
  value,
  passing = 10,
  size = "sm",
  label,
  className,
}: {
  value: number | null;
  passing?: number;
  size?: "sm" | "lg";
  label?: string;
  className?: string;
}) {
  const below = value != null && value < passing;
  return (
    <div
      className={cn(
        "relative w-full rounded-full bg-muted",
        size === "lg" ? "h-2.5" : "h-1.5",
        className,
      )}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={20}
      aria-valuenow={value ?? undefined}
      aria-label={
        label ??
        `${value == null ? "Sem nota" : `Nota ${value.toFixed(1)}`} de 20; aprovação a partir de ${passing}`
      }
    >
      {value != null ? (
        <div
          data-tone={below ? "below" : "pass"}
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
            below ? "bg-destructive/80" : "bg-success",
          )}
          style={{ width: `${clampPct(value)}%` }}
        />
      ) : null}
      <div
        className={cn(
          "absolute w-px bg-foreground/35",
          size === "lg" ? "-top-1 h-[18px]" : "-top-0.5 h-2.5",
        )}
        style={{ left: `${clampPct(passing)}%` }}
        aria-hidden
      />
    </div>
  );
}
