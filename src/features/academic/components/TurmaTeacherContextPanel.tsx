import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, CalendarDays, ClipboardCheck, Clock3 } from "lucide-react";
import { listClassTasks } from "@/features/academic/timetable-lessons";

/**
 * Contexto da turma para Professor. Não é uma segunda navegação global:
 * apresenta apenas dados desta turma e liga às páginas pedagógicas existentes.
 * A função listClassTasks aplica a escola e o professor autorizado no servidor.
 */
export function TurmaTeacherContextPanel({
  classGroupId,
  weeklySlots,
}: {
  classGroupId: string;
  /** Aulas semanais do horário da turma, não aulas já leccionadas. */
  weeklySlots: number;
}) {
  const tasksQuery = useQuery({
    queryKey: ["academic", "class-tasks", classGroupId, "todas", "todos"],
    queryFn: () => listClassTasks({ data: { classGroupId } }),
    retry: false,
  });

  const open = tasksQuery.data?.open ?? [];
  const closed = tasksQuery.data?.closed ?? [];
  const unavailable = tasksQuery.isError || tasksQuery.data?.available === false;
  const openCount = tasksQuery.isLoading ? "…" : unavailable ? "—" : open.length;
  const closedCount = tasksQuery.isLoading ? "…" : unavailable ? "—" : closed.length;

  return (
    <aside
      aria-label="Contexto do professor"
      className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:col-start-2 xl:row-start-1 xl:row-span-5 xl:self-start"
    >
      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <h2 className="text-sm font-semibold">Contexto do professor</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Trabalhos das disciplinas que pode consultar nesta turma.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Trabalhos em curso</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{openCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Prazo terminado</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{closedCount}</p>
          </div>
          <div className="col-span-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Aulas no horário semanal da turma</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{weeklySlots}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Até 200 trabalhos publicados. Prazo encerrado não significa correcção. Uma aula no horário
          não significa que foi leccionada.
        </p>
        {tasksQuery.isError ? (
          <p role="alert" className="mt-2 text-xs text-destructive-strong">
            Não foi possível consultar os trabalhos agora.
          </p>
        ) : null}
        {tasksQuery.data?.available === false ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Os trabalhos ainda não estão disponíveis nesta base.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <h3 className="text-sm font-semibold">Próximos trabalhos</h3>
        {tasksQuery.isLoading ? (
          <p className="mt-3 text-xs text-muted-foreground">A consultar trabalhos…</p>
        ) : open.length ? (
          <ul className="mt-3 divide-y divide-border">
            {open.slice(0, 4).map((task) => (
              <li key={task.id} className="py-2">
                <Link
                  to="/pedagogica/tarefas/$taskId"
                  params={{ taskId: task.id }}
                  className="block min-w-0 text-xs font-semibold text-primary hover:underline"
                >
                  {task.title}
                </Link>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {task.subjectName} · {task.dueOn ? `Prazo: ${task.dueOn}` : "Sem prazo"}
                </p>
              </li>
            ))}
          </ul>
        ) : !tasksQuery.isError && tasksQuery.data?.available !== false ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Não há trabalhos publicados com prazo aberto.
          </p>
        ) : null}
        <Link
          to="/pedagogica/trabalhos"
          search={{ turma: classGroupId }}
          className="mt-3 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-primary hover:underline"
        >
          <ClipboardCheck className="size-4" /> Ver trabalhos e entregas
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <h3 className="text-sm font-semibold">Aulas e acompanhamento</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Registe as aulas dadas e confirme as presenças nos módulos respectivos.
        </p>
        <nav aria-label="Acções pedagógicas da turma" className="mt-3 space-y-1">
          <Link
            to="/pedagogica"
            search={{ tab: "horarios", turma: classGroupId }}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-secondary/40"
          >
            <CalendarDays className="size-4 text-muted-foreground" /> Horário e próximas aulas
          </Link>
          <Link
            to="/planos-aula"
            search={{ turma: classGroupId }}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-secondary/40"
          >
            <BookOpenCheck className="size-4 text-muted-foreground" />
            <span>Planos e conteúdos leccionados</span>
          </Link>
          <Link
            to="/pedagogica"
            search={{ tab: "presencas", turma: classGroupId }}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-xs font-medium hover:bg-secondary/40"
          >
            <Clock3 className="size-4 text-muted-foreground" />
            <span>Presenças e aulas realizadas</span>
          </Link>
        </nav>
      </section>
    </aside>
  );
}
