import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { listTaskSubmissions } from "@/features/academic/task-submissions-server";
import {
  TaskSubmissionsPanel,
  type Filter,
} from "@/features/academic/components/TaskSubmissions";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { subjectOfferingId } from "@/features/intelligence/context-resolver";
import {
  TASK_SUBMISSION_STATES,
  type TaskSubmissionState,
} from "@/features/intelligence/task-context-entries";

/**
 * Entregas de uma tarefa: a turma inteira, com devolver e nota. Página, não
 * modal (contrato visual 2026); o aluno entrega no detalhe da aula.
 *
 * `?estado=` abre a lista já filtrada (o menu do trabalho na sidebar). O trabalho
 * lido do servidor declara-se como foco, com a disciplina da turma por cima: o
 * menu fica no contexto da disciplina (SIGA Context Engine, §5.2).
 */
const searchSchema = z.object({
  estado: z.enum(TASK_SUBMISSION_STATES).optional().catch(undefined),
});

const FILTER_OF_STATE: Record<TaskSubmissionState, Filter> = {
  "por-entregar": "pending",
  "por-devolver": "toReturn",
  devolvidas: "returned",
};
const STATE_OF_FILTER: Partial<Record<Filter, TaskSubmissionState>> = {
  pending: "por-entregar",
  toReturn: "por-devolver",
  returned: "devolvidas",
};

export const Route = createFileRoute("/pedagogica_/tarefas/$taskId")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({ meta: [{ title: "Entregas · SIGA" }] }),
  component: TaskSubmissionsPage,
});

function TaskSubmissionsPage() {
  const { taskId } = Route.useParams();
  const { estado } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  // A mesma chave do painel: um só pedido para o cabeçalho e a lista.
  const query = useQuery({
    queryKey: ["task-submissions", taskId],
    queryFn: () => listTaskSubmissions({ data: { taskId } }),
    retry: false,
  });
  const task = query.data;

  // O menu do trabalho só entra com o trabalho lido do servidor (que já recusa
  // quem não é professor da disciplina nem da direcção).
  const focus = useMemo(() => {
    if (!task?.schoolId || !task.classGroupId || !task.subjectId) return null;
    const offering = subjectOfferingId(task.classGroupId, task.subjectId);
    return {
      type: "task" as const,
      id: taskId,
      label: task.title || "Trabalho",
      schoolId: task.schoolId,
      data: null,
      relations: { class: task.classGroupId, "subject-offering": offering },
      parent: { type: "subject-offering" as const, id: offering },
    };
  }, [task, taskId]);
  useDeclareEntityFocus(focus);

  const due = task?.dueOn
    ? `Entrega até ${new Date(`${task.dueOn}T12:00:00`).toLocaleDateString("pt-AO")}${
        task.acceptsLate ? "" : ", sem entregas atrasadas"
      }.`
    : "Sem prazo.";
  const back = task?.classGroupId
    ? { turma: task.classGroupId, disciplina: task.subjectId || undefined }
    : {};

  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/pedagogica/trabalhos" search={back}>
            <ArrowLeft className="size-4" /> Trabalhos
          </Link>
        </Button>
        <PageHeader
          group="Académico"
          title={task?.title ? `Entregas · ${task.title}` : "Entregas"}
          description={task ? due : "A carregar…"}
        />
        <TaskSubmissionsPanel
          taskId={taskId}
          filter={estado ? FILTER_OF_STATE[estado] : "all"}
          onFilterChange={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, estado: STATE_OF_FILTER[next] }),
              replace: true,
            })
          }
        />
      </div>
    </AppShell>
  );
}
