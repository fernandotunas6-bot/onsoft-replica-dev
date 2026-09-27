import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import {
  ACADEMIC_MODULES,
  ACADEMIC_PIPELINE,
  STAGE_LABELS,
  STATUS_LABELS,
  moduleSnapshot,
  type AcademicModule,
  type AcademicStructureCounts,
  type ModuleStage,
  type ModuleStatus,
} from "./academic-architecture";
import { getAcademicStructureStatus } from "./academic-structure";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<ModuleStatus, string> = {
  ready: "bg-success/70",
  partial: "bg-warning/80",
  missing: "bg-destructive/70",
  planned: "bg-muted-foreground/30",
  automatic: "bg-primary/50",
};

const TALLY_LABELS: Record<ModuleStatus, string> = {
  ready: "configurados",
  partial: "em curso",
  missing: "em falta",
  planned: "por activar",
  automatic: "automáticos",
};

const STAGES: ModuleStage[] = ["estrutura", "pessoas", "avaliacao", "resultado"];

/**
 * Estrutura académica do ano: Escola → Ano lectivo → 16 módulos, cada um com
 * o estado real e, ao abrir, onde nasce, quem altera, entidade, uso,
 * validação e destino.
 */
export function AcademicStructureTab({
  schoolName,
  yearId,
  yearLabel,
  onOpenTab,
}: {
  schoolName: string | null;
  yearId: string | null;
  yearLabel: string;
  onOpenTab: (tab: string) => void;
}) {
  const query = useQuery({
    queryKey: ["academic", "structure-status", yearId],
    queryFn: () =>
      getAcademicStructureStatus({
        data: yearId ? { academicYearId: yearId } : {},
      }) as Promise<AcademicStructureCounts>,
    staleTime: 60_000,
  });
  const counts = query.data;
  const snapshots = counts
    ? new Map(ACADEMIC_MODULES.map((m) => [m.id, moduleSnapshot(m, counts)]))
    : null;
  const tally = snapshots
    ? [...snapshots.values()].reduce<Record<ModuleStatus, number>>(
        (acc, s) => ({ ...acc, [s.status]: acc[s.status] + 1 }),
        { ready: 0, partial: 0, missing: 0, planned: 0, automatic: 0 },
      )
    : null;

  return (
    <div className="space-y-5">
      <section className="surface-card space-y-3 p-5">
        <h2 className="text-sm font-medium">Percurso da informação</h2>
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-muted-foreground">
          {ACADEMIC_PIPELINE.map((step, index) => (
            <li key={step} className="flex items-center gap-1.5">
              <span className="rounded-full border border-border px-2.5 py-1 text-foreground">
                {step}
              </span>
              {index < ACADEMIC_PIPELINE.length - 1 ? (
                <ChevronRight className="size-3.5" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">
          Cada informação nasce no seu módulo. Nenhum limiar de aprovação fica no código: vem da
          regra de avaliação da escola (Decreto Executivo n.º 424/25 por omissão).
        </p>
      </section>

      <section className="surface-card space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Escola</p>
            <h2 className="text-base font-medium">{schoolName ?? "Escola"}</h2>
          </div>
          {tally ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {(Object.keys(tally) as ModuleStatus[])
                .filter((s) => tally[s] > 0)
                .map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", STATUS_DOT[s])} aria-hidden />
                    {tally[s]} {TALLY_LABELS[s]}
                  </span>
                ))}
            </p>
          ) : null}
        </div>

        <div className="border-l border-border pl-4 sm:ml-2">
          <p className="relative text-sm">
            <span className="absolute -left-4 top-1/2 h-px w-3 bg-border" aria-hidden />
            <span className="text-muted-foreground">Ano lectivo</span>{" "}
            <span className="font-medium">{counts?.yearName ?? yearLabel}</span>
          </p>

          {query.isLoading ? (
            <div className="py-6">
              <InlineLoading label="A verificar a estrutura do ano…" />
            </div>
          ) : query.isError ? (
            <p className="py-6 text-xs text-muted-foreground">
              Não foi possível verificar a estrutura do ano.
            </p>
          ) : (
            <div className="mt-3 space-y-5 border-l border-border pl-4 sm:ml-2">
              {STAGES.map((stage) => (
                <div key={stage} className="space-y-1">
                  <p className="relative text-xs uppercase tracking-wide text-muted-foreground">
                    <span className="absolute -left-4 top-1/2 h-px w-3 bg-border" aria-hidden />
                    {STAGE_LABELS[stage]}
                  </p>
                  <ul className="divide-y divide-border">
                    {ACADEMIC_MODULES.filter((m) => m.stage === stage).map((module) => (
                      <ModuleRow
                        key={module.id}
                        module={module}
                        snapshot={snapshots?.get(module.id) ?? null}
                        onOpenTab={onOpenTab}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ModuleRow({
  module,
  snapshot,
  onOpenTab,
}: {
  module: AcademicModule;
  snapshot: { status: ModuleStatus; metric: string } | null;
  onOpenTab: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = snapshot?.status ?? "partial";
  const detailsId = `modulo-${module.id}`;
  return (
    <li className={cn(module.planned && "opacity-70")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-1"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums text-muted-foreground">
          {module.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{module.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{snapshot?.metric}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
          {STATUS_LABELS[status]}
        </span>
        <span
          className={cn("size-1.5 shrink-0 rounded-full sm:hidden", STATUS_DOT[status])}
          aria-label={STATUS_LABELS[status]}
        />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div id={detailsId} className="mb-3 ml-9 space-y-3 rounded-lg bg-muted/40 p-3">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Field label="Onde nasce">
              {module.planned ? (
                <span className="text-muted-foreground">{module.createdIn.label}</span>
              ) : module.createdIn.kind === "tab" ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => onOpenTab((module.createdIn as { tab: string }).tab)}
                >
                  {module.createdIn.label}
                </button>
              ) : (
                <Link to={module.createdIn.to as never} className="text-primary hover:underline">
                  {module.createdIn.label}
                </Link>
              )}
            </Field>
            <Field label="Quem altera">{module.owners}</Field>
            <Field label="Entidade">
              <span className="font-mono text-xs">{module.entity}</span>
            </Field>
            <Field label="Como é usada">{module.usedBy}</Field>
            <Field label="Validação">{module.validation}</Field>
            <Field label="Segue para">{module.destination}</Field>
          </dl>
        </div>
      ) : null}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
