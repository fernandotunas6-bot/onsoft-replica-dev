import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { listClassTasks } from "@/features/academic/timetable-lessons";
import { TASK_KIND_LABELS } from "@/features/academic/lesson-messages";
import type { ClassTaskItem } from "@/features/academic/class-tasks";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { moduleIcons } from "@/lib/app-icons";
import { publicErrorMessage } from "@/lib/public-error";

/**
 * Trabalhos da turma, da disciplina ou do professor (SIGA Context Engine): as
 * tarefas que os professores publicam no detalhe de cada aula. A turma e a
 * disciplina (`?turma=&disciplina=`) ou o professor (`?professor=`, sem turma) vêm
 * da URL, como em `/planos-aula`, e o servidor só devolve as que a conta pode ver.
 */
const trabalhosSearchSchema = z.object({
  turma: z.string().guid().optional().catch(undefined),
  disciplina: z.string().guid().optional().catch(undefined),
  /** Os trabalhos de um professor (menu do professor), quando não há turma. */
  professor: z.string().guid().optional().catch(undefined),
});

export const Route = createFileRoute("/pedagogica_/trabalhos")({
  validateSearch: (search) => trabalhosSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Trabalhos · SIGA" }] }),
  component: TrabalhosPage,
});

/** Como a ficha da turma: só a equipa que gere turmas. */
const STAFF_ROLES = new Set(["Administrador", "Secretaria", "Professor"]);

function formatDue(iso: string | null) {
  if (!iso) return "Sem prazo";
  const [y, m, d] = iso.split("-");
  return `Entrega até ${d}/${m}/${y}`;
}

function TrabalhosPage() {
  const { turma, disciplina, professor: professorSearch } = Route.useSearch();
  const account = useCurrentAccount();
  const staff = STAFF_ROLES.has(account.role);
  // A turma manda sobre o professor, como no horário.
  const professor = turma ? undefined : professorSearch;

  const tasksQuery = useQuery({
    queryKey: [
      "academic",
      "class-tasks",
      turma ?? "-",
      disciplina ?? "todas",
      professor ?? "todos",
    ],
    queryFn: () =>
      listClassTasks({
        data: turma
          ? { classGroupId: turma, ...(disciplina ? { subjectId: disciplina } : {}) }
          : { teacherId: professor! },
      }),
    enabled: staff && Boolean(turma || professor),
    retry: false,
  });

  const header = (
    <PageHeader
      group="Académico"
      title="Trabalhos"
      icon={moduleIcons.classTasks}
      description="TPC, trabalhos e projectos que os professores publicam no detalhe de cada aula."
    />
  );

  // As aulas (e os trabalhos de cada uma) abrem-se no horário da turma ou do professor.
  const scheduleSearch = turma
    ? { tab: "horarios" as const, turma }
    : { tab: "horarios" as const, professor };
  const scheduleLabel = turma ? "horário da turma" : "horário do professor";

  let body: ReactNode;
  if (!staff) {
    body = (
      <EmptyState
        title="Sem acesso aos trabalhos da turma"
        description="Os trabalhos de cada aluno aparecem no horário do portal."
      />
    );
  } else if (!turma && !professor) {
    body = (
      <EmptyState
        title="Escolha uma turma"
        description="Os trabalhos são de cada turma. Abra uma turma e escolha «Trabalhos» no menu."
        action={
          <Button asChild size="sm">
            <Link to="/pedagogica" search={{ tab: "turmas" }}>
              Ver turmas
            </Link>
          </Button>
        }
      />
    );
  } else if (tasksQuery.isLoading) {
    body = <p className="text-sm text-muted-foreground">A carregar os trabalhos…</p>;
  } else if (tasksQuery.isError) {
    body = (
      <EmptyState
        title="Não foi possível abrir os trabalhos"
        description={publicErrorMessage(tasksQuery.error, "Tente de novo daqui a pouco.")}
      />
    );
  } else if (tasksQuery.data?.available === false) {
    body = (
      <EmptyState
        title="Os trabalhos ainda não estão activos"
        description="Falta aplicar a migração das tarefas da aula nesta base de dados."
      />
    );
  } else {
    const open = tasksQuery.data?.open ?? [];
    const closed = tasksQuery.data?.closed ?? [];
    body =
      open.length + closed.length === 0 ? (
        <EmptyState
          firstUse
          icon={moduleIcons.classTasks}
          title={
            disciplina
              ? "Ainda não há trabalhos nesta disciplina"
              : "Ainda não há trabalhos nesta turma"
          }
          description={`O professor cria um trabalho no detalhe da aula, a partir do ${scheduleLabel}.`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to="/pedagogica" search={scheduleSearch}>
                {`Abrir o ${scheduleLabel}`}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <TaskSection title="Em curso" items={open} showSubject={!disciplina} />
          <TaskSection title="Prazo terminado" items={closed} showSubject={!disciplina} />
          <p className="text-xs text-muted-foreground">
            Para criar ou arquivar um trabalho, abra a aula no{" "}
            <Link
              to="/pedagogica"
              search={scheduleSearch}
              className="font-semibold text-primary hover:underline"
            >
              {scheduleLabel}
            </Link>
            .
          </p>
        </div>
      );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {header}
        {body}
      </div>
    </AppShell>
  );
}

function TaskSection({
  title,
  items,
  showSubject,
}: {
  title: string;
  items: ClassTaskItem[];
  showSubject: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {title} <span className="font-normal">· {items.length}</span>
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-soft">
        {items.map((task) => (
          <li key={task.id} className="flex min-w-0 flex-col gap-1 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              {TASK_KIND_LABELS[task.kind] ?? "Tarefa"}
              {task.className ? ` · ${task.className}` : ""}
              {showSubject ? ` · ${task.subjectName}` : ""}
            </p>
            <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
              {task.title}
            </p>
            {task.description ? (
              <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                {task.description}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{formatDue(task.dueOn)}</p>
            {/* As entregas da turma, com devolver e nota; o servidor só as mostra à
                direcção, à secretaria e ao professor da disciplina. */}
            <Link
              to="/pedagogica/tarefas/$taskId"
              params={{ taskId: task.id }}
              aria-label={`Ver entregas de ${task.title}`}
              className="mt-1 inline-flex min-h-11 items-center self-start text-xs font-semibold text-primary hover:underline sm:min-h-0"
            >
              Ver entregas
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
