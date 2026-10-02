import { Button } from "@/components/ui/button";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";
import type { ConsistencyCheckReport } from "@/features/academic/consistency-check";
import { formatScore } from "@/lib/angola-academic";

/** Vistas do Centro de Avaliação que só mostram dados: avaliações, recursos, exames e fecho. */

type StudentRef = { id: string; student_name: string };

export function AssessmentItemsList({
  available,
  items,
}: {
  available: boolean;
  items: ReadonlyArray<{
    id: unknown;
    name: unknown;
    kind: unknown;
    component: unknown;
    counts_toward_pauta?: unknown;
  }>;
}) {
  return (
    <div className="space-y-2">
      {!available ? (
        <p className="text-sm text-muted-foreground">
          Aplique <code>APPLY_ENROLLMENT_AND_PREMIUM.sql</code> para criar avaliações detalhadas.{" "}
          <SqlChecklistLink />
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ainda não há avaliações neste contexto. Use + Avaliação.
        </p>
      ) : (
        items.map((item) => (
          <div key={String(item.id)} className="rounded-xl border px-3 py-2">
            <p className="font-semibold">{String(item.name)}</p>
            <p className="text-xs text-muted-foreground">
              {String(item.kind)} · {String(item.component)} · conta para a pauta:{" "}
              {item.counts_toward_pauta ? "sim" : "não"}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

export function AssessmentRecoveryTable({
  rows,
  subjectName,
  afterRecovery,
}: {
  rows: ReadonlyArray<{ student: StudentRef; average: number | null; recurso: number | null }>;
  subjectName: string;
  afterRecovery: (original: number | null, recovery: number | null) => number | null;
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="px-3 py-2 text-left">Aluno</th>
            <th className="px-3 py-2 text-left">Disciplina</th>
            <th className="px-3 py-2 text-right">Média anterior</th>
            <th className="px-3 py-2 text-right">Recurso</th>
            <th className="px-3 py-2 text-right">Nova nota</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.student.id} className="border-t">
              <td className="px-3 py-2 font-semibold">{row.student.student_name}</td>
              <td className="px-3 py-2">{subjectName}</td>
              <td className="px-3 py-2 text-right">{formatScore(row.average)}</td>
              <td className="px-3 py-2 text-right">{formatScore(row.recurso)}</td>
              <td className="px-3 py-2 text-right font-bold">
                {formatScore(afterRecovery(row.average, row.recurso))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssessmentExamTable({
  rows,
  subjectName,
  passingGrade,
}: {
  rows: ReadonlyArray<{ student: StudentRef; exame: number | null }>;
  subjectName: string;
  passingGrade: number;
}) {
  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/70">
          <tr>
            <th className="px-3 py-2 text-left">Aluno</th>
            <th className="px-3 py-2 text-left">Disciplina</th>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-right">Nota</th>
            <th className="px-3 py-2 text-right">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.student.id} className="border-t">
              <td className="px-3 py-2 font-semibold">{row.student.student_name}</td>
              <td className="px-3 py-2">{subjectName}</td>
              <td className="px-3 py-2">Exame</td>
              <td className="px-3 py-2 text-right">{formatScore(row.exame)}</td>
              <td className="px-3 py-2 text-right">
                {row.exame == null
                  ? "Pendente"
                  : row.exame >= passingGrade
                    ? "Aprovado"
                    : "Reprovado"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssessmentTermClosePanel({
  termClosed,
  checklist,
  readiness,
  canLockTerm,
  onToggleLock,
}: {
  termClosed: boolean;
  checklist: { ready: boolean; items: ReadonlyArray<{ id: string; label: string; ok: boolean }> };
  readiness: { allReady: boolean; notReady: ReadonlyArray<ConsistencyCheckReport> };
  canLockTerm: boolean;
  onToggleLock: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {termClosed
          ? "Este trimestre está fechado. As células da pauta estão bloqueadas."
          : "Só feche quando a pauta estiver completa e guardada."}
      </p>
      <ul className="space-y-2">
        {checklist.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
          >
            <span>{item.label}</span>
            <span
              className={item.ok ? "font-semibold text-primary" : "font-semibold text-destructive"}
            >
              {item.ok ? "Pronto" : "Bloqueia"}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
          <span>Todas as turmas com docentes atribuídos e sem notas pendentes</span>
          <span
            className={
              readiness.allReady ? "font-semibold text-primary" : "font-semibold text-destructive"
            }
          >
            {readiness.allReady ? "Pronto" : `Bloqueia (${readiness.notReady.length} turma(s))`}
          </span>
        </li>
      </ul>
      {!readiness.allReady && readiness.notReady.length > 0 ? (
        <ul className="space-y-1 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          {readiness.notReady.slice(0, 6).map((report) => (
            <li key={report.classGroupId}>
              <b className="text-foreground">{report.classGroupName}:</b>{" "}
              {report.summary.unassignedSubjectsCount > 0
                ? `${report.summary.unassignedSubjectsCount} disciplina(s) sem docente. `
                : ""}
              {report.summary.pendingGradesCount > 0
                ? `${report.summary.pendingGradesCount} nota(s) pendente(s). `
                : ""}
              {report.issues.some((issue) => issue.code === "MULTIPLE_TEACHERS_MONODOCENTE")
                ? "Turma monodocente com mais do que um professor atribuído."
                : ""}
            </li>
          ))}
          {readiness.notReady.length > 6 ? (
            <li className="italic">+ {readiness.notReady.length - 6} outra(s) turma(s).</li>
          ) : null}
        </ul>
      ) : null}
      {canLockTerm ? (
        <Button
          disabled={!termClosed && (!checklist.ready || !readiness.allReady)}
          onClick={onToggleLock}
        >
          {termClosed ? "Reabrir trimestre" : "Fechar trimestre"}
        </Button>
      ) : null}
    </div>
  );
}
