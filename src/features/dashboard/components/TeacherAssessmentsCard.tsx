import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { InlineLoading } from "@/components/ui/inline-loading";
import {
  getMyTeacherAssessmentBoard,
  type TeacherAssessmentBoard,
} from "@/features/academic/teacher-assessments";
import {
  PAUTA_COMPONENTS,
  componentLabel,
  componentState,
  deadlineLabel,
} from "@/features/academic/teacher-assessment-board";
import { teacherGradesSearch } from "@/features/hr/teacher-classroom-links";
import { cn } from "@/lib/utils";

const STATE_TONE = {
  done: "text-muted-foreground",
  partial: "text-foreground",
  none: "text-destructive/85",
  "no-students": "text-muted-foreground",
} as const;

function shortDate(iso: string | null) {
  if (!iso) return "sem data";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Avaliações do professor no trimestre: pauta por turma, provas marcadas e prazo. */
export function TeacherAssessmentsCard() {
  const query = useQuery({
    queryKey: ["dashboard", "teacher-assessments"],
    queryFn: () => getMyTeacherAssessmentBoard() as Promise<TeacherAssessmentBoard>,
    staleTime: 2 * 60 * 1000,
  });
  const board = query.data;
  const deadline = deadlineLabel(board?.term?.daysLeft ?? null);
  const urgent = board?.term != null && board.term.daysLeft >= 0 && board.term.daysLeft <= 7;
  const pendingTotal = board?.rows.reduce((sum, row) => sum + row.pendingComponents, 0) ?? 0;

  return (
    <section className="surface-card w-full min-w-0 space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
          Avaliações
          {board?.term ? <span className="text-muted-foreground">· {board.term.name}</span> : null}
        </h2>
        {deadline ? (
          <span
            className={cn(
              "text-xs",
              urgent && pendingTotal > 0 ? "text-destructive/85" : "text-muted-foreground",
            )}
          >
            {deadline}
            {pendingTotal > 0 ? ` · ${pendingTotal} por lançar` : " · tudo lançado"}
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="flex justify-center py-4">
          <InlineLoading label="A carregar avaliações…" />
        </div>
      ) : query.isError ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Não foi possível carregar as avaliações.
        </p>
      ) : !board || board.rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Ainda não tem turmas atribuídas neste ano lectivo.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {board.rows.map((row) => (
            <li
              key={row.classSubjectId}
              className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm">
                  {row.className}
                  <span className="text-muted-foreground"> · {row.subjectName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {row.enrolled} {row.enrolled === 1 ? "aluno" : "alunos"}
                  </span>
                </p>
                {row.enrolled === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem alunos matriculados.</p>
                ) : (
                  <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {PAUTA_COMPONENTS.map((code) => {
                      const state = componentState(row.components[code], row.enrolled);
                      return (
                        <span key={code} className={STATE_TONE[state]}>
                          {state === "done" ? "✓ " : ""}
                          {componentLabel(code, row.components[code], row.enrolled)}
                        </span>
                      );
                    })}
                  </p>
                )}
                {row.assessments.length ? (
                  <p className="text-xs text-muted-foreground">
                    {row.assessments
                      .slice(0, 4)
                      .map(
                        (a) =>
                          `${a.name} (${shortDate(a.date)}${
                            a.scored ? ` · ${a.scored}/${row.enrolled}` : ""
                          })`,
                      )
                      .join(" · ")}
                    {row.assessments.length > 4 ? ` · +${row.assessments.length - 4}` : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Sem provas marcadas neste período.
                  </p>
                )}
              </div>
              <Link
                to="/pedagogica"
                search={teacherGradesSearch(row.classGroupId, row.subjectId)}
                className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                Lançar notas
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
