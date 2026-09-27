import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toastActionError } from "@/lib/action-error-toast";
import { saveAutomaticRiskSignals } from "@/features/ai-assist/risk-followup.functions";
import { riskCasesKey } from "@/features/ai-assist/RiskFollowup";
import { InlineLoading } from "@/components/ui/inline-loading";
import { cn } from "@/lib/utils";
import { classWarnings, type WarningStudent } from "./early-warning";
import { getClassWarningContext, type ClassWarningContext } from "./early-warning-server";
import { useActiveAssessmentRule } from "./use-passing-value";

const LEVEL_DOT = { alto: "bg-destructive/60", médio: "bg-warning/80" } as const;

/**
 * Sinais automáticos de risco de uma turma, calculados pelas regras do modelo
 * de avaliação (sem IA): não transitaria, passou a negativa, faltas.
 */
export function EarlyWarningsPanel({
  classGroupId,
  students,
}: {
  classGroupId: string;
  students: Array<Omit<WarningStudent, "absencePercentage">>;
}) {
  const rule = useActiveAssessmentRule();
  const query = useQuery({
    queryKey: ["academic", "class-warning-context", classGroupId],
    queryFn: () =>
      getClassWarningContext({ data: { classGroupId } }) as Promise<ClassWarningContext>,
    enabled: Boolean(classGroupId),
    staleTime: 5 * 60 * 1000,
  });

  const warnings = useMemo(() => {
    const ctx = query.data;
    if (!ctx) return [];
    return classWarnings(
      students.map((s) => ({ ...s, absencePercentage: ctx.absences[s.enrollmentId] ?? null })),
      {
        passing: rule.passing,
        promotionRules: rule.promotionRules,
        maximumAbsencePercentage: ctx.maximumAbsencePercentage,
        cycle: ctx.cycle,
      },
    );
  }, [query.data, students, rule.passing, rule.promotionRules]);

  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      saveAutomaticRiskSignals({
        data: {
          classGroupId,
          students: warnings.map((w) => ({
            enrollment_id: w.enrollmentId,
            risk: w.level,
            reasons: w.signals.map((s) => s.label).slice(0, 10),
            average: w.average,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.saved} aluno(s) guardados no acompanhamento.`);
      void queryClient.invalidateQueries({ queryKey: riskCasesKey });
    },
    onError: (e) => toastActionError(e, "Não foi possível guardar no acompanhamento."),
  });

  if (!classGroupId) return null;

  return (
    <section className="surface-card space-y-3 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Sinais automáticos</h2>
        <p className="text-xs text-muted-foreground">
          Calculados pelas regras do modelo de avaliação (nota de aprovação, transição do ciclo e
          limite de faltas), sem IA. Actualizam-se com cada nota e cada chamada.
        </p>
      </div>
      {query.isLoading ? (
        <InlineLoading label="A calcular sinais…" />
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Não foi possível calcular."}
        </p>
      ) : !students.length ? (
        <p className="text-sm text-muted-foreground">Ainda não há notas lançadas nesta turma.</p>
      ) : !warnings.length ? (
        <p className="text-sm text-muted-foreground">
          Nenhum aluno com sinais de risco nesta turma.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {warnings.filter((w) => w.level === "alto").length} com risco alto ·{" "}
              {warnings.filter((w) => w.level === "médio").length} com risco médio · de{" "}
              {students.length} alunos
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "A guardar…" : "Guardar no acompanhamento"}
            </Button>
          </div>
          <ul className="divide-y divide-border">
            {warnings.map((w) => (
              <li key={w.enrollmentId} className="space-y-1 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm">
                    <span className={cn("size-1.5 rounded-full", LEVEL_DOT[w.level])} aria-hidden />
                    {w.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Risco {w.level}
                    {w.average != null ? ` · média ${w.average}` : ""}
                  </span>
                </div>
                <ul className="space-y-0.5 pl-3.5 text-xs text-muted-foreground">
                  {w.signals.map((s) => (
                    <li key={s.kind}>{s.label}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
