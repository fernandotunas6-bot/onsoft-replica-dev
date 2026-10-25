import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { listTaskSubmissions } from "@/features/academic/task-submissions-server";
import { TaskSubmissionsPanel } from "@/features/academic/components/TaskSubmissions";

/**
 * Entregas de uma tarefa: a turma inteira, com devolver e nota. Página, não
 * modal (contrato visual 2026); o aluno entrega no detalhe da aula.
 */
export const Route = createFileRoute("/pedagogica_/tarefas/$taskId")({
  head: () => ({ meta: [{ title: "Entregas · SIGA" }] }),
  component: TaskSubmissionsPage,
});

function TaskSubmissionsPage() {
  const { taskId } = Route.useParams();
  // A mesma chave do painel: um só pedido para o cabeçalho e a lista.
  const query = useQuery({
    queryKey: ["task-submissions", taskId],
    queryFn: () => listTaskSubmissions({ data: { taskId } }),
    retry: false,
  });
  const task = query.data;
  const due = task?.dueOn
    ? `Entrega até ${new Date(`${task.dueOn}T12:00:00`).toLocaleDateString("pt-AO")}${
        task.acceptsLate ? "" : ", sem entregas atrasadas"
      }.`
    : "Sem prazo.";

  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/pedagogica">
            <ArrowLeft className="size-4" /> Pedagógica
          </Link>
        </Button>
        <PageHeader
          group="Académico"
          title={task?.title ? `Entregas · ${task.title}` : "Entregas"}
          description={task ? due : "A carregar…"}
        />
        <TaskSubmissionsPanel taskId={taskId} />
      </div>
    </AppShell>
  );
}
