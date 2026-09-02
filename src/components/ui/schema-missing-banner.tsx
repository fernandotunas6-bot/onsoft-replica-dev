import { AlertTriangle } from "lucide-react";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";
import { cn } from "@/lib/utils";

/** Banner quando o schema SGA falta (catracas, presença, gateway…). */
export function SchemaMissingBanner({
  title = "Schema SGA incompleto",
  description = "Faltam tabelas neste ambiente. Aplique o patch ou a ordem canónica SQL.",
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border border-dashed border-warning/50 bg-warning/10 px-4 py-3 text-sm",
        className,
      )}
      role="status"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">
          Ficheiro rápido: <code className="text-[11px]">APPLY_MISSING_FROM_VERIFY.sql</code> ·{" "}
          <SqlChecklistLink />
        </p>
      </div>
    </div>
  );
}

/** Detecta erros tipicos de tabela em falta (PostgREST / Postgres). */
export function isSchemaMissingError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Tabela em falta|APPLY_|relation .* does not exist|schema cache|42P01|não foi possível/i.test(
    msg,
  );
}
