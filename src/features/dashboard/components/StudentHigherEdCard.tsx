import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { finalClassification } from "@/features/higher-ed/engine";
import { SEASON_LABEL, STATUS_LABEL } from "@/features/higher-ed/labels";
import { getMyHigherEd } from "@/features/higher-ed/server";
import { cn } from "@/lib/utils";

const STATE_LABEL = {
  concluida: "Aprovada",
  creditada: "Creditada",
  em_curso: "Em curso",
  por_fazer: "Por fazer",
} as const;

/**
 * Percurso no Ensino Superior do estudante (ou do educando): créditos, média e
 * cadeiras por semestre. Não aparece para quem não tem curso superior.
 */
export function StudentHigherEdCard({ studentId }: { studentId?: string | null }) {
  const query = useQuery({
    queryKey: ["dashboard", "student-higher-ed", studentId ?? "self"],
    queryFn: () => getMyHigherEd({ data: studentId ? { studentId } : {} }),
    staleTime: 5 * 60 * 1000,
  });
  // Quase todos os alunos não têm curso superior: nada a mostrar enquanto carrega.
  const programs = query.data?.programs ?? [];
  if (!programs.length) return null;

  return (
    <>
      {programs.map(({ program, progress, lines }) => {
        const semesters = [...new Set(lines.map((line) => line.semester))].sort((a, b) => a - b);
        return (
          <section key={program.id} className="surface-card w-full min-w-0 space-y-4 p-5">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <GraduationCap className="size-4 text-muted-foreground" aria-hidden />
              {program.name}
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Créditos</dt>
                <dd className="font-semibold tabular-nums">
                  {progress.creditsEarned}/{progress.creditsTotal}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {progress.completed ? "Classificação final" : "Média"}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {(() => {
                    const final = progress.completed ? finalClassification(progress.average) : null;
                    return final ? `${final.value} · ${final.mention}` : (progress.average ?? "—");
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Situação</dt>
                <dd className="font-semibold">
                  {progress.completed
                    ? "Concluiu"
                    : progress.finalist
                      ? "Finalista"
                      : `${progress.curricularYear}.º ano`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Em falta</dt>
                <dd className="font-semibold tabular-nums">{progress.pendingUnits} cadeira(s)</dd>
              </div>
            </dl>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              aria-label="Créditos obtidos"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            {semesters.map((semester) => (
              <div key={semester} className="space-y-1">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  {semester}.º semestre
                </h3>
                <ul className="divide-y rounded-md border">
                  {lines
                    .filter((line) => line.semester === semester)
                    .map((line) => (
                      <li
                        key={line.unitId}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          {line.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {line.credits} créditos
                          </span>
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            line.state === "concluida" || line.state === "creditada"
                              ? "text-success-strong"
                              : "text-muted-foreground",
                          )}
                        >
                          {line.state === "em_curso" && line.lastStatus
                            ? STATUS_LABEL[line.lastStatus]
                            : STATE_LABEL[line.state]}
                          {line.grade !== null ? ` · ${line.grade}` : ""}
                          {line.state === "concluida" && line.season
                            ? ` · ${SEASON_LABEL[line.season]}`
                            : ""}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
