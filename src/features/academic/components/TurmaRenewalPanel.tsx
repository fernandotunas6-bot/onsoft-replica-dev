import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { applyRenewal, getRenewalPlan } from "@/features/academic/year-rollover-server";
import { nextYearGuess } from "@/features/academic/year-rollover";

const fieldClass = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

type YearOption = { id: string; name: string };

/**
 * Renovação de matrícula de uma turma para o ano seguinte, a partir do resultado
 * final gravado: quem transitou vai para a classe seguinte, quem não transitou
 * repete, os restantes ficam de fora com o motivo à vista.
 */
export function TurmaRenewalPanel({
  classGroupId,
  currentYearId,
  currentYearName,
  academicYears,
  onRenewed,
}: {
  classGroupId: string;
  currentYearId: string | null;
  currentYearName: string;
  academicYears: readonly YearOption[];
  onRenewed: () => Promise<void>;
}) {
  const otherYears = useMemo(
    () => academicYears.filter((year) => year.id !== currentYearId),
    [academicYears, currentYearId],
  );
  const [targetYearId, setTargetYearId] = useState(() =>
    nextYearGuess(otherYears, currentYearName),
  );
  const [passId, setPassId] = useState("");
  const [repeatId, setRepeatId] = useState("");
  // Desmarcados pela secretaria; por omissão, todos os que o plano matricula.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const planQuery = useQuery({
    queryKey: ["academic", "renewal-plan", classGroupId, targetYearId, passId, repeatId],
    queryFn: () =>
      getRenewalPlan({
        data: {
          sourceClassGroupId: classGroupId,
          targetAcademicYearId: targetYearId,
          ...(passId ? { passClassGroupId: passId } : {}),
          ...(repeatId ? { repeatClassGroupId: repeatId } : {}),
        },
      }),
    enabled: Boolean(targetYearId),
    retry: false,
  });
  const plan = planQuery.data;
  const toEnroll = (plan?.lines ?? []).filter(
    (line) => line.action === "enroll" && !unchecked.has(line.studentId),
  );
  const count = (predicate: (line: NonNullable<typeof plan>["lines"][number]) => boolean) =>
    (plan?.lines ?? []).filter(predicate).length;

  const submit = async () => {
    if (!plan || !toEnroll.length) return;
    setSaving(true);
    try {
      const result = await applyRenewal({
        data: {
          sourceClassGroupId: classGroupId,
          targetAcademicYearId: targetYearId,
          ...(plan.passClassGroupId ? { passClassGroupId: plan.passClassGroupId } : {}),
          ...(plan.repeatClassGroupId ? { repeatClassGroupId: plan.repeatClassGroupId } : {}),
          studentIds: toEnroll.map((line) => line.studentId),
        },
      });
      if (result.failed.length) {
        toast.error(`${result.failed.length} aluno(s) não foram matriculados`, {
          description: result.failed.map((row) => `${row.name}: ${row.message}`).join("\n"),
        });
      }
      if (result.enrolled.length) {
        toast.success(`${result.enrolled.length} aluno(s) matriculados em ${plan.targetYear.name}`);
      }
      setUnchecked(new Set());
      await Promise.all([onRenewed(), planQuery.refetch()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível renovar.");
    } finally {
      setSaving(false);
    }
  };

  const optionLabel = (option: { name: string; free: number | null }) =>
    option.free == null ? option.name : `${option.name} · ${option.free} vaga(s)`;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-semibold text-muted-foreground">
            Ano de destino
            <select
              aria-label="Ano de destino"
              className={fieldClass}
              value={targetYearId}
              onChange={(event) => {
                setTargetYearId(event.target.value);
                setPassId("");
                setRepeatId("");
                setUnchecked(new Set());
              }}
            >
              <option value="">Escolher…</option>
              {otherYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </label>
          {plan && !plan.isLastGrade ? (
            <label className="space-y-1 text-xs font-semibold text-muted-foreground">
              Turma da classe seguinte
              <select
                aria-label="Turma da classe seguinte"
                className={fieldClass}
                value={plan.passClassGroupId ?? ""}
                onChange={(event) => setPassId(event.target.value)}
              >
                {plan.passOptions.length === 0 ? <option value="">Sem turmas</option> : null}
                {plan.passOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {optionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {plan ? (
            <label className="space-y-1 text-xs font-semibold text-muted-foreground">
              Turma para repetir a classe
              <select
                aria-label="Turma para repetir a classe"
                className={fieldClass}
                value={plan.repeatClassGroupId ?? ""}
                onChange={(event) => setRepeatId(event.target.value)}
              >
                {plan.repeatOptions.length === 0 ? <option value="">Sem turmas</option> : null}
                {plan.repeatOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {optionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {!otherYears.length ? (
          <p className="text-sm text-muted-foreground">
            Crie primeiro o ano lectivo seguinte no Calendário e as suas turmas na Pedagógica.
          </p>
        ) : planQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {planQuery.error instanceof Error ? planQuery.error.message : "Plano indisponível."}
          </p>
        ) : planQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A preparar o plano…</p>
        ) : plan ? (
          <>
            {!plan.gradeOrderKnown ? (
              <p role="alert" className="rounded-md bg-warning/10 px-3 py-2 text-xs">
                A classe desta turma não tem curso ou ordem definidos: a classe seguinte não se pode
                determinar. Defina-os na estrutura académica.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {plan.source.gradeName ?? "Turma"} {plan.source.name} · {plan.source.yearName} →{" "}
              {plan.targetYear.name}: transitam {count((l) => l.outcome === "pass")}, não transitam{" "}
              {count((l) => l.outcome === "fail")}, sem resultado {count((l) => l.outcome == null)}.
              {plan.isLastGrade ? " É a última classe do curso: quem transita conclui." : ""}
            </p>
            <ul aria-label="Alunos da turma" className="divide-y rounded-md border text-sm">
              {plan.lines.map((line) => (
                <li key={line.studentId} className="flex items-start gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Matricular ${line.name}`}
                    className="mt-1"
                    disabled={line.action !== "enroll"}
                    checked={line.action === "enroll" && !unchecked.has(line.studentId)}
                    onChange={(event) =>
                      setUnchecked((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.delete(line.studentId);
                        else next.add(line.studentId);
                        return next;
                      })
                    }
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{line.name}</p>
                    {line.studentNumber ? (
                      <p className="font-mono text-xs text-muted-foreground">
                        ID {line.studentNumber}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">{line.reason}</p>
                  </div>
                </li>
              ))}
              {!plan.lines.length ? (
                <li className="px-3 py-2 text-muted-foreground">Esta turma não tem alunos.</li>
              ) : null}
            </ul>
          </>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" disabled={saving || !toEnroll.length} onClick={() => void submit()}>
            {saving
              ? "A matricular…"
              : toEnroll.length
                ? `Matricular ${toEnroll.length} aluno(s)`
                : "Matricular"}
          </Button>
        </div>
      </div>
    </div>
  );
}
