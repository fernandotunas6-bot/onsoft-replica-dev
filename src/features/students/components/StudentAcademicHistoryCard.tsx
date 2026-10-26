import { History } from "lucide-react";

import { IconChip } from "@/components/ui/icon-chip";
import type { StudentAcademicHistoryYear } from "@/features/academic/server-legacy";
import { angolaGradeScale, formatScore } from "@/lib/angola-academic";

/**
 * Secção «Histórico» da ficha do aluno: um bloco por ano lectivo (matrícula), com a
 * média e a situação, e as médias por disciplina. Os números vêm do mesmo motor da
 * Pauta Final (`getStudentAcademicHistory`); o resultado oficial, quando a secretaria
 * o registou, manda sobre o cálculo, que sai marcado como provisório.
 */
export function StudentAcademicHistoryCard({
  years,
  loading,
  failed,
}: {
  years: readonly StudentAcademicHistoryYear[];
  loading: boolean;
  failed: boolean;
}) {
  // O ano mais recente primeiro: é o que se procura quase sempre.
  const ordered = [...years].reverse();

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-soft">
      <div className="flex items-center gap-2.5">
        <IconChip icon={History} size="sm" label="Histórico académico" />
        <h2 className="font-display text-base font-bold">Histórico académico</h2>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">A carregar o histórico…</p>
      ) : failed ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Não foi possível carregar o histórico académico.
        </p>
      ) : ordered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ainda não há matrículas com histórico para este aluno.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {ordered.map((year, index) => (
            <HistoryYear key={year.academicYearId ?? `ano-${index}`} year={year} />
          ))}
        </ol>
      )}
    </section>
  );
}

function HistoryYear({ year }: { year: StudentAcademicHistoryYear }) {
  const average = year.official?.finalAverage ?? year.overallMfd;
  const outcome = year.official?.outcome ?? year.status ?? "";
  const passing = year.passingValue ?? angolaGradeScale.passing;
  const place = [
    year.gradeName ? `${year.gradeName} Classe` : null,
    year.classGroupName ? `Turma ${year.classGroupName}` : null,
    year.courseName || null,
  ].filter(Boolean);

  return (
    <li className="rounded-lg border border-border">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{year.academicYearName}</h3>
          {place.length > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{place.join(" · ")}</p>
          ) : null}
        </div>
        <dl className="flex gap-6 sm:text-right">
          <div>
            <dt className="text-[11px] font-semibold text-muted-foreground">Média final</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatScore(average)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-muted-foreground">Situação</dt>
            <dd className="mt-0.5 text-sm font-medium">
              {outcome || "Pendente"}
              {year.official ? null : (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(provisório)</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {year.subjects.length > 0 ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            Disciplinas ({year.subjects.length})
          </summary>
          {/* No telemóvel ficam a disciplina e a média; os trimestres a partir de 640 px. */}
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">
                    Disciplina
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell"
                  >
                    1.º T
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell"
                  >
                    2.º T
                  </th>
                  <th
                    scope="col"
                    className="hidden px-2 py-1.5 text-right font-semibold sm:table-cell"
                  >
                    3.º T
                  </th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-semibold">
                    Média
                  </th>
                </tr>
              </thead>
              <tbody>
                {year.subjects.map((subject) => (
                  <tr key={subject.subjectId} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {subject.subjectName}
                    </th>
                    <td className="hidden px-2 py-1.5 text-right sm:table-cell">
                      {formatScore(subject.mt1)}
                    </td>
                    <td className="hidden px-2 py-1.5 text-right sm:table-cell">
                      {formatScore(subject.mt2)}
                    </td>
                    <td className="hidden px-2 py-1.5 text-right sm:table-cell">
                      {formatScore(subject.mt3)}
                    </td>
                    <td
                      className={
                        subject.mfd != null && subject.mfd < passing
                          ? "py-1.5 pl-2 text-right font-semibold text-destructive"
                          : "py-1.5 pl-2 text-right font-semibold"
                      }
                    >
                      {formatScore(subject.mfd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </li>
  );
}
