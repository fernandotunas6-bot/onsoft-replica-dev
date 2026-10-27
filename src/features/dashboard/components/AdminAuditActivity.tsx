import { Activity, CircleCheck } from "lucide-react";

export type AuditActivityItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
};

/** Actividade real da auditoria da escola; não confundir com métricas simuladas. */
export function AdminAuditActivity({
  items,
  loading,
  unavailable,
}: {
  items: AuditActivityItem[];
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <section aria-labelledby="dashboard-audit-heading" className="surface-card p-5">
      <div className="flex items-center gap-2.5">
        <Activity className="size-4 text-primary" aria-hidden="true" />
        <div>
          <h2 id="dashboard-audit-heading" className="text-base font-semibold">
            Actividade registada
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Últimas operações registadas para esta escola
          </p>
        </div>
      </div>

      {loading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          A consultar registos…
        </p>
      ) : unavailable ? (
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          Não foi possível consultar a auditoria neste momento.
        </p>
      ) : items.length ? (
        <ol className="mt-4 divide-y divide-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0">
              <span
                aria-hidden="true"
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{item.time}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          Nenhum registo de auditoria disponível.
        </p>
      )}
    </section>
  );
}
