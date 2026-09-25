import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import { analyzeStudentRisk, type RiskAnalysis } from "@/features/ai-assist/ai-assist.functions";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { cn } from "@/lib/utils";
import { saveRiskAnalysis } from "@/features/ai-assist/risk-followup.functions";
import { RiskFollowup, riskCasesKey } from "@/features/ai-assist/RiskFollowup";

export const Route = createFileRoute("/pedagogica_/risco")({
  head: () => ({
    meta: [
      { title: "Alunos em risco · SIGA Plus" },
      {
        name: "description",
        content:
          "Análise com IA das notas da turma para identificar alunos em risco e sugerir intervenções.",
      },
      { property: "og:title", content: "Alunos em risco · SIGA Plus" },
      {
        property: "og:description",
        content: "Identifique alunos em risco e receba sugestões de intervenção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiskPage,
});

const riskTone: Record<string, string> = {
  alto: "bg-destructive/10 text-destructive border-destructive/30",
  médio: "bg-warning/10 text-warning-foreground border-warning/40",
  baixo: "bg-muted text-muted-foreground border-border",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RiskPage() {
  const { selectedYearId } = useSchoolSettings();
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", selectedYearId],
    queryFn: () =>
      listPedagogicalWorkspace({
        data: selectedYearId ? { academicYearId: selectedYearId } : {},
      }) as Promise<PedagogicalWorkspace>,
    retry: false,
  });
  const workspace = workspaceQuery.data;
  const classGroups = workspace?.classGroups ?? [];
  const [classId, setClassId] = useState("");
  const [history, setHistory] = useState("");
  const effectiveClass = classId || classGroups[0]?.id || "";
  const analyze = useServerFn(analyzeStudentRisk);
  const saveAnalysis = useServerFn(saveRiskAnalysis);
  const queryClient = useQueryClient();

  const students = useMemo(() => {
    const map = new Map<
      string,
      {
        enrollment_id: string;
        name: string;
        grades: Array<{ subject: string; term: number; average: number }>;
      }
    >();
    for (const g of workspace?.termGrades ?? []) {
      if (g.class_group_id !== effectiveClass) continue;
      const s = map.get(g.enrollment_id) ?? {
        enrollment_id: g.enrollment_id,
        name: g.student_name,
        grades: [],
      };
      s.grades.push({ subject: g.subject_name, term: g.term, average: g.average });
      map.set(g.enrollment_id, s);
    }
    return [...map.values()].slice(0, 80);
  }, [workspace?.termGrades, effectiveClass]);

  const mutation = useMutation<RiskAnalysis, Error>({
    mutationFn: () =>
      analyze({
        data: {
          classGroupName: classGroups.find((c) => c.id === effectiveClass)?.name ?? "Turma",
          history,
          students,
        },
      }),
    onSuccess: async (result) => {
      const avgBy = new Map(
        students.map((s) => [
          s.enrollment_id,
          s.grades.length ? s.grades.reduce((a, g) => a + g.average, 0) / s.grades.length : null,
        ]),
      );
      const flagged = result.students.filter((s) => avgBy.has(s.enrollment_id));
      if (!flagged.length) return;
      await saveAnalysis({
        data: {
          classGroupId: effectiveClass,
          classGroupName: classGroups.find((c) => c.id === effectiveClass)?.name ?? "Turma",
          students: flagged.map((s) => ({
            enrollment_id: s.enrollment_id,
            name: s.name,
            risk: s.risk,
            reasons: (s.reasons ?? []).slice(0, 10),
            interventions: (s.interventions ?? []).slice(0, 10),
            average: avgBy.get(s.enrollment_id) ?? null,
          })),
        },
      }).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: riskCasesKey });
    },
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Alunos em risco"
          description="A IA analisa as notas da turma e o histórico que indicar, e sugere intervenções para cada aluno."
          icon={Sparkles}
        />
        <Panel title="Dados da análise">
          <div className="grid gap-4">
            <div className="grid gap-1.5 sm:max-w-sm">
              <Label htmlFor="risco-turma">Turma</Label>
              <select
                id="risco-turma"
                className={selectClass}
                value={effectiveClass}
                onChange={(e) => {
                  setClassId(e.target.value);
                  mutation.reset();
                }}
                disabled={workspaceQuery.isLoading}
              >
                {classGroups.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {workspaceQuery.isLoading
                  ? "A carregar notas…"
                  : `${students.length} alunos com notas lançadas.`}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="risco-historico">Histórico académico e observações (opcional)</Label>
              <Textarea
                id="risco-historico"
                rows={4}
                maxLength={4000}
                value={history}
                onChange={(e) => setHistory(e.target.value)}
                placeholder="Ex.: a turma teve mudança de professor de Matemática no 2º trimestre; dois alunos repetentes…"
              />
            </div>
            <div>
              <Button
                className="gap-2"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || students.length === 0}
              >
                <Sparkles className="size-4" />
                {mutation.isPending ? "A analisar…" : "Analisar turma"}
              </Button>
            </div>
            {mutation.error ? (
              <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <AlertTriangle className="size-4" /> {mutation.error.message}
              </p>
            ) : null}
          </div>
        </Panel>

        {mutation.data ? (
          <Panel title="Resultado" description={mutation.data.overview}>
            {mutation.data.students.length === 0 ? (
              <EmptyState
                title="Nenhum aluno em risco"
                description="A análise não encontrou alunos em risco alto ou médio."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {mutation.data.students.map((s) => (
                  <div
                    key={s.enrollment_id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-medium",
                          riskTone[s.risk] ?? riskTone["baixo"],
                        )}
                      >
                        Risco {s.risk}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">
                      Motivos
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {s.reasons?.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs font-semibold uppercase text-muted-foreground">
                      Intervenções sugeridas
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {s.interventions?.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Sugestões geradas por IA — confirme sempre com o conselho de turma. Os alunos sinalizados
              ficam guardados no acompanhamento abaixo.
            </p>
          </Panel>
        ) : null}

        <RiskFollowup />
      </div>
    </AppShell>
  );
}
