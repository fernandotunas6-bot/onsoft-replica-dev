import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getMyStudentCompetencies,
  type StudentCompetencies,
} from "@/features/dashboard/student-competencies";

const STATE = {
  true: { dot: "bg-success/70", label: "Dominada" },
  false: { dot: "bg-warning/80", label: "A consolidar" },
  null: { dot: "bg-muted-foreground/30", label: "Por avaliar" },
} as const;

/**
 * Competências do aluno (ou do educando) por disciplina: dominadas, a
 * consolidar e por avaliar. Só aparece quando a escola definiu competências
 * para as disciplinas da turma.
 */
export function StudentCompetenciesCard({ studentId }: { studentId?: string | null }) {
  const query = useQuery({
    queryKey: ["dashboard", "student-competencies", studentId ?? "self"],
    queryFn: () =>
      getMyStudentCompetencies({
        data: studentId ? { studentId } : {},
      }) as Promise<StudentCompetencies>,
    staleTime: 5 * 60 * 1000,
  });
  const [open, setOpen] = useState<string | null>(null);
  const subjects = query.data?.subjects ?? [];
  if (!subjects.length) return null;

  return (
    <section className="surface-card w-full min-w-0 space-y-3 p-5">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Target className="size-4 text-muted-foreground" aria-hidden />
          Competências
        </h2>
        <p className="text-xs text-muted-foreground">
          Dominada quando a média das avaliações dessa competência chega a {query.data?.passing}.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {subjects.map((s) => {
          const pct = s.assessed ? Math.round((s.mastered / s.assessed) * 100) : null;
          const expanded = open === s.subjectId;
          return (
            <li key={s.subjectId} className="py-2">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : s.subjectId)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <span className="text-sm">{s.subjectName}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {s.assessed
                    ? `${s.mastered} de ${s.assessed} dominada(s)`
                    : `${s.competencies.length} por avaliar`}
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full bg-primary/50"
                      style={{ width: `${pct ?? 0}%` }}
                    />
                  </span>
                </span>
              </button>
              {expanded ? (
                <ul className="mt-2 space-y-1.5 pl-1">
                  {s.competencies.map((c) => {
                    const state = STATE[String(c.mastered) as keyof typeof STATE];
                    return (
                      <li key={c.id} className="flex items-start gap-2 text-xs">
                        <span
                          className={cn("mt-1 size-1.5 shrink-0 rounded-full", state.dot)}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-muted-foreground">{c.code}</span> · {c.description}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{state.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
