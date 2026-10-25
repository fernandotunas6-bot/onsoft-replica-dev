import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  FileText,
  Inbox,
  MessageSquareQuote,
  Star,
} from "lucide-react";
import { IconChip } from "@/components/ui/icon-chip";
import { InlineLoading } from "@/components/ui/inline-loading";
import { cn } from "@/lib/utils";
import { getMyStudentGrades, type StudentGradeReport } from "@/features/academic/student-grades";
import { outlookLabel, type SubjectYearReport } from "@/features/academic/student-grade-report";
import {
  getMySubjectWork,
  type SubjectWork,
  type SubjectWorkTask,
} from "@/features/academic/subject-work-server";
import type { TaskState } from "@/features/academic/task-submissions";
import { TASK_KIND_LABELS } from "@/features/academic/lesson-messages";
import { GradeMeter } from "./GradeMeter";
import { gradeToneClass } from "./grade-tone";
import { MyTaskSubmission } from "./TaskSubmissions";
import { StatePill } from "./task-state-ui";
import { TASK_STATE_UI } from "./task-state-meta";

const fmt = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(1));
const day = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-AO", {
        day: "2-digit",
        month: "short",
      })
    : null;

type Filter = "all" | "todo" | "submitted" | "returned";
const FILTERS: Array<{ key: Filter; label: string; states: TaskState[] }> = [
  { key: "all", label: "Todos", states: ["open", "overdue", "submitted", "returned", "missed"] },
  { key: "todo", label: "Por fazer", states: ["open", "overdue"] },
  { key: "submitted", label: "Entregues", states: ["submitted"] },
  { key: "returned", label: "Devolvidos", states: ["returned"] },
];

/** O ano em que o aluno teve esta disciplina (o actual primeiro). */
function subjectOfYear(report: StudentGradeReport | undefined, subjectId: string) {
  for (const year of report?.years ?? []) {
    const subject = year.subjects.find((s) => s.subjectId === subjectId);
    if (subject) return { year, subject };
  }
  return null;
}

/**
 * A disciplina vista pelo aluno ou pelo encarregado: o caminho até 20 (vermelho
 * abaixo da aprovação, verde a partir dela), as notas por trimestre e o histórico
 * de todos os trabalhos, com cada entrega, a nota e o comentário do professor.
 */
export function SubjectWorkView({
  subjectId,
  studentId,
}: {
  subjectId: string;
  studentId?: string | null;
}) {
  // A mesma chave do cartão de Notas: vindo de lá, as notas já estão em cache.
  const grades = useQuery({
    queryKey: ["dashboard", "student-grades", studentId ?? "self"],
    queryFn: () =>
      getMyStudentGrades({ data: studentId ? { studentId } : {} }) as Promise<StudentGradeReport>,
    staleTime: 5 * 60 * 1000,
  });
  const work = useQuery({
    queryKey: ["subject-work", subjectId, studentId ?? "self"],
    queryFn: () => getMySubjectWork({ data: { subjectId, ...(studentId ? { studentId } : {}) } }),
  });
  const found = subjectOfYear(grades.data, subjectId);

  return (
    <div className="space-y-6">
      {grades.isLoading ? (
        <InlineLoading label="A carregar as notas…" />
      ) : found ? (
        <GradeHero
          subject={found.subject}
          termCount={found.year.termCount}
          yearName={found.year.name}
        />
      ) : (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Ainda não há notas desta disciplina.
        </p>
      )}

      {work.isLoading ? (
        <InlineLoading label="A carregar os trabalhos…" />
      ) : work.isError || !work.data ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os trabalhos.
        </p>
      ) : (
        <WorkHistory work={work.data} studentId={studentId} />
      )}
    </div>
  );
}

function GradeHero({
  subject,
  termCount,
  yearName,
}: {
  subject: SubjectYearReport;
  termCount: number;
  yearName: string;
}) {
  const value = subject.finalAverage;
  return (
    <section aria-label="Média da disciplina" className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Média final · {yearName}</p>
          <p className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-4xl font-semibold tabular-nums tracking-tight",
                gradeToneClass(value, subject.passing),
              )}
            >
              {fmt(value)}
            </span>
            <span className="text-sm text-muted-foreground">/ 20</span>
          </p>
        </div>
        <p
          className={cn(
            "text-sm",
            value != null && value < subject.passing ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {outlookLabel(subject.outlook)}
        </p>
      </div>
      <div className="space-y-1.5">
        <GradeMeter value={value} passing={subject.passing} size="lg" />
        <div className="relative h-4 text-[11px] tabular-nums text-muted-foreground">
          <span className="absolute left-0">0</span>
          <span
            className="absolute -translate-x-1/2"
            style={{ left: `${(subject.passing / 20) * 100}%` }}
          >
            {subject.passing} · aprovação
          </span>
          <span className="absolute right-0">20</span>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Notas por trimestre">
        {Array.from({ length: termCount }, (_, i) => {
          const term = subject.terms[i] ?? null;
          return (
            <li key={i} className="space-y-2 rounded-xl bg-muted/40 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted-foreground">
                  {i + 1}.º trimestre
                  {term?.provisional && term.mt != null ? " · provisória" : ""}
                </span>
                <span
                  className={cn(
                    "text-lg font-semibold tabular-nums",
                    gradeToneClass(term?.mt, subject.passing),
                  )}
                >
                  {fmt(term?.mt)}
                </span>
              </div>
              <GradeMeter value={term?.mt ?? null} passing={subject.passing} />
              <p className="text-[11px] tabular-nums text-muted-foreground">
                MAC {fmt(term?.mac)} · NPP {fmt(term?.npp)} · NPT {fmt(term?.npt)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function WorkHistory({ work, studentId }: { work: SubjectWork; studentId?: string | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const active = FILTERS.find((item) => item.key === filter)!;
  const shown = work.tasks.filter((task) => active.states.includes(task.state));
  const { summary } = work;
  const tiles = [
    { icon: ClipboardList, tone: "primary" as const, label: "Trabalhos", value: summary.total },
    { icon: Inbox, tone: "info" as const, label: "Entregues", value: summary.delivered },
    { icon: CheckCheck, tone: "success" as const, label: "Devolvidos", value: summary.returned },
  ];

  return (
    <section aria-labelledby="trabalhos-disciplina" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex items-center gap-3 rounded-xl border bg-card p-3">
            <IconChip icon={tile.icon} tone={tile.tone} size="sm" />
            <div>
              <p className="text-base font-semibold tabular-nums leading-tight">{tile.value}</p>
              <p className="text-[11px] text-muted-foreground">{tile.label}</p>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <IconChip icon={Star} tone="success" size="sm" />
          <div>
            <p
              className={cn(
                "text-base font-semibold tabular-nums leading-tight",
                gradeToneClass(summary.average),
              )}
            >
              {fmt(summary.average)}
            </p>
            <p className="text-[11px] text-muted-foreground">Média dos trabalhos</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <h2 id="trabalhos-disciplina" className="text-sm font-semibold">
          Histórico de trabalhos
        </h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar trabalhos">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs transition-colors",
                filter === item.key
                  ? "bg-primary-soft text-primary-strong"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {item.label}
              <span className="ml-1 tabular-nums opacity-70">
                {work.tasks.filter((task) => item.states.includes(task.state)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul aria-label="Trabalhos da disciplina" className="space-y-2">
          {shown.map((task) => (
            <TaskItem key={task.id} task={task} canSubmit={work.canSubmit} studentId={studentId} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <IconChip icon={BookOpenCheck} tone="muted" size="md" />
          <p className="text-sm text-muted-foreground">
            {work.tasks.length
              ? "Nenhum trabalho neste filtro."
              : "O professor ainda não passou trabalhos nesta disciplina."}
          </p>
        </div>
      )}
    </section>
  );
}

function TaskItem({
  task,
  canSubmit,
  studentId,
}: {
  task: SubjectWorkTask;
  canSubmit: boolean;
  studentId?: string | null;
}) {
  const [open, setOpen] = useState(task.state === "overdue");
  const ui = TASK_STATE_UI[task.state];
  const grade = task.latest?.grade ?? null;
  const due = day(task.dueOn);
  const facts = [
    TASK_KIND_LABELS[task.kind] ?? "Tarefa",
    due ? `prazo ${due}` : "sem prazo",
    task.countsForPauta ? "conta para a pauta" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Entregar continua possível enquanto a tarefa recebe e não foi devolvida.
  const canAct = !task.archived && ["open", "overdue", "submitted"].includes(task.state);

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
      >
        <IconChip icon={ui.icon} tone={ui.tone} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{task.title}</span>
          <span className="block text-xs text-muted-foreground">{facts}</span>
        </span>
        {grade != null ? (
          <span className={cn("text-sm font-semibold tabular-nums", gradeToneClass(grade))}>
            {grade}
          </span>
        ) : null}
        <StatePill state={task.state} className="hidden sm:inline-flex" />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t px-3 py-3 text-xs">
          <StatePill state={task.state} className="sm:hidden" />
          {task.description ? (
            <p className="whitespace-pre-line text-muted-foreground">{task.description}</p>
          ) : null}
          {grade != null ? <GradeMeter value={grade} /> : null}
          {task.latest?.feedback ? (
            <p className="flex gap-2 rounded-lg bg-muted/40 p-3">
              <MessageSquareQuote
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="whitespace-pre-line">{task.latest.feedback}</span>
            </p>
          ) : null}
          {task.attempts.length ? (
            <ol aria-label={`Entregas de ${task.title}`} className="space-y-2 border-l pl-3">
              {task.attempts.map((attempt) => (
                <li key={attempt.attempt} className="space-y-0.5">
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <FileText className="size-3" aria-hidden />
                    {[
                      `${attempt.attempt}.ª entrega`,
                      day(attempt.submittedAt),
                      attempt.onPaper ? "em papel" : null,
                      attempt.isLate ? "com atraso" : null,
                      attempt.status === "returned" ? "devolvida" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {attempt.body ? <p className="whitespace-pre-line">{attempt.body}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">
              {task.state === "missed" ? "Não houve entrega." : "Ainda sem entregas."}
            </p>
          )}
          {/* O encarregado acompanha pelo histórico; só o aluno entrega. */}
          {canAct && canSubmit ? <MyTaskSubmission taskId={task.id} studentId={studentId} /> : null}
        </div>
      ) : null}
    </li>
  );
}
