import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineLoading } from "@/components/ui/inline-loading";
import { getMyStudentGrades, type StudentGradeReport } from "@/features/academic/student-grades";
import {
  outlookLabel,
  type PassOutlook,
  type SubjectYearReport,
} from "@/features/academic/student-grade-report";
import { cn } from "@/lib/utils";

const fmt = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(1));

/**
 * Notas do aluno (ou do educando): por trimestre e por ano lectivo, com a
 * barra de progresso até à nota de aprovação e o que falta para lá chegar.
 */
export function StudentGradesCard({ studentId }: { studentId?: string | null }) {
  const query = useQuery({
    queryKey: ["dashboard", "student-grades", studentId ?? "self"],
    queryFn: () =>
      getMyStudentGrades({ data: studentId ? { studentId } : {} }) as Promise<StudentGradeReport>,
    staleTime: 5 * 60 * 1000,
  });
  const years = query.data?.years ?? [];
  const [yearId, setYearId] = useState<string | null>(null);
  const year = years.find((y) => y.academicYearId === yearId) ?? years[0] ?? null;

  // Trimestre por omissão: o último com alguma nota; senão o 1.º.
  const latestTerm = useMemo(() => {
    if (!year) return 1;
    for (let t = year.termCount; t >= 1; t -= 1) {
      if (year.subjects.some((s) => s.terms[t - 1]?.mt != null)) return t;
    }
    return 1;
  }, [year]);
  const [term, setTerm] = useState<number | null>(null);
  const activeTerm = term ?? latestTerm;

  return (
    <section className="surface-card w-full min-w-0 space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <PieChart className="size-4 text-muted-foreground" aria-hidden />
          Notas
          {year?.className ? (
            <span className="text-muted-foreground">· {year.className}</span>
          ) : null}
        </h2>
        {years.length > 1 ? (
          <select
            aria-label="Ano lectivo"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={year?.academicYearId ?? ""}
            onChange={(event) => {
              setYearId(event.target.value);
              setTerm(null);
            }}
          >
            {years.map((y) => (
              <option key={y.academicYearId} value={y.academicYearId}>
                {y.name}
                {y.isCurrent ? " (actual)" : ""}
              </option>
            ))}
          </select>
        ) : year ? (
          <span className="text-xs text-muted-foreground">{year.name}</span>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-4">
          <InlineLoading label="A carregar notas…" />
        </div>
      ) : query.isError ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Não foi possível carregar as notas.
        </p>
      ) : !year || year.subjects.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Ainda não há disciplinas nem notas neste ano lectivo.
        </p>
      ) : (
        <Tabs defaultValue="ano" className="space-y-3">
          <TabsList className="h-8">
            <TabsTrigger value="ano" className="text-xs">
              Por ano lectivo
            </TabsTrigger>
            <TabsTrigger value="trimestre" className="text-xs">
              Por trimestre
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ano" className="space-y-3">
            <div className="w-0 min-w-full overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Disciplina</th>
                    {Array.from({ length: year.termCount }, (_, i) => (
                      <th key={i} className="py-2 px-2 text-right font-normal tabular-nums">
                        {i + 1}.º T
                      </th>
                    ))}
                    <th className="py-2 px-2 text-right font-normal">Final</th>
                    <th className="py-2 pl-3 font-normal">Até à aprovação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {year.subjects.map((subject) => (
                    <tr key={subject.subjectId}>
                      <td className="py-2.5 pr-3">{subject.subjectName}</td>
                      {subject.terms.map((t, i) => (
                        <td key={i} className="py-2.5 px-2 text-right tabular-nums">
                          <Score value={t?.mt ?? null} passing={subject.passing} />
                          {t?.provisional && t.mt != null ? (
                            <span className="sr-only"> (provisória)</span>
                          ) : null}
                        </td>
                      ))}
                      <td className="py-2.5 px-2 text-right tabular-nums font-medium">
                        <Score value={subject.finalAverage} passing={subject.passing} />
                      </td>
                      <td className="py-2.5 pl-3">
                        <PassProgress subject={subject} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Média geral:{" "}
                <span className="text-foreground tabular-nums">{fmt(year.average)}</span>
                {year.officialResult ? (
                  <>
                    {" "}
                    · Resultado oficial:{" "}
                    <span className="text-foreground">{year.officialResult.outcome}</span>
                    {year.officialResult.finalAverage != null ? (
                      <span className="tabular-nums">
                        {" "}
                        ({fmt(year.officialResult.finalAverage)})
                      </span>
                    ) : null}
                  </>
                ) : null}
              </span>
              <span>
                Aprovação a partir de {fmt(year.subjects[0]?.passing ?? 10)} valores · média final =
                média dos trimestres
              </span>
            </p>
          </TabsContent>

          <TabsContent value="trimestre" className="space-y-3">
            <div className="flex gap-1" role="group" aria-label="Trimestre">
              {Array.from({ length: year.termCount }, (_, i) => i + 1).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={t === activeTerm}
                  onClick={() => setTerm(t)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    t === activeTerm
                      ? "bg-primary-soft text-primary-strong"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t}.º trimestre
                </button>
              ))}
            </div>
            <div className="w-0 min-w-full overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-normal">Disciplina</th>
                    <th
                      className="py-2 px-2 text-right font-normal"
                      title="Média de Avaliação Contínua"
                    >
                      MAC
                    </th>
                    <th className="py-2 px-2 text-right font-normal" title="Prova do Professor">
                      NPP
                    </th>
                    <th className="py-2 px-2 text-right font-normal" title="Prova Trimestral">
                      NPT
                    </th>
                    <th className="py-2 pl-2 text-right font-normal">Média</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {year.subjects.map((subject) => {
                    const t = subject.terms[activeTerm - 1];
                    return (
                      <tr key={subject.subjectId}>
                        <td className="py-2.5 pr-3">
                          {subject.subjectName}
                          {t?.provisional && t.mt != null ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">provisória</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{fmt(t?.mac)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{fmt(t?.npp)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{fmt(t?.npt)}</td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-medium">
                          <Score value={t?.mt ?? null} passing={subject.passing} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Média do trimestre = (MAC + NPT) ÷ 2; a NPP entra na MAC (Decreto Executivo n.º
              424/25).
            </p>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}

function Score({ value, passing }: { value: number | null; passing: number }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={value < passing ? "text-destructive/85" : undefined}>{value.toFixed(1)}</span>
  );
}

const OUTLOOK_TONE: Record<PassOutlook["kind"], string> = {
  "no-data": "text-muted-foreground",
  complete: "text-muted-foreground",
  secured: "text-muted-foreground",
  needs: "text-foreground",
  unreachable: "text-destructive/85",
};

/** Barra 0–20 com a marca da aprovação; o texto diz o que falta. */
function PassProgress({ subject }: { subject: SubjectYearReport }) {
  const value = subject.finalAverage ?? 0;
  const pct = Math.max(0, Math.min(100, (value / 20) * 100));
  const passPct = Math.max(0, Math.min(100, (subject.passing / 20) * 100));
  const below = subject.finalAverage != null && subject.finalAverage < subject.passing;
  const tone =
    subject.outlook.kind === "complete" && !subject.outlook.passed
      ? "text-destructive/85"
      : OUTLOOK_TONE[subject.outlook.kind];
  return (
    <div className="min-w-[160px] space-y-1">
      <div
        className="relative h-1.5 rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={20}
        aria-valuenow={subject.finalAverage ?? undefined}
        aria-label={`Média final ${fmt(subject.finalAverage)} de 20; aprovação a partir de ${subject.passing}`}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            below ? "bg-destructive/50" : "bg-primary/60",
          )}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute -top-0.5 h-2.5 w-px bg-foreground/40"
          style={{ left: `${passPct}%` }}
          aria-hidden
        />
      </div>
      <p className={cn("text-xs leading-snug", tone)}>{outlookLabel(subject.outlook)}</p>
    </div>
  );
}
