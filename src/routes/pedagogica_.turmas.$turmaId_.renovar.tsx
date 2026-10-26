import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { listPedagogicalWorkspace, type PedagogicalWorkspace } from "@/features/academic/server";
import { TurmaRenewalPanel } from "@/features/academic/components/TurmaRenewalPanel";

/**
 * Renovar as matrículas de uma turma para o próximo ano lectivo. Página, não
 * modal (contrato visual 2026): a turma inteira com selecção é um formulário
 * complexo. `$turmaId_` mantém a rota fora da página da turma.
 */
export const Route = createFileRoute("/pedagogica_/turmas/$turmaId_/renovar")({
  head: () => ({ meta: [{ title: "Renovar matrículas · SIGA" }] }),
  component: TurmaRenewalPage,
});

function TurmaRenewalPage() {
  const { turmaId } = Route.useParams();
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: ["academic", "pedagogical-workspace", null],
    queryFn: () => listPedagogicalWorkspace({ data: {} }) as Promise<PedagogicalWorkspace>,
    retry: false,
  });
  const workspace = workspaceQuery.data;
  const turma = workspace?.classGroups.find((group) => group.id === turmaId);

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
          title="Renovar matrículas para o próximo ano"
          description={
            turma
              ? `${turma.grade_name} ${turma.name} · ${turma.academic_year_name}. A partir do resultado final gravado no histórico; nada é gravado até confirmar.`
              : "A partir do resultado final gravado no histórico; nada é gravado até confirmar."
          }
        />
        {workspaceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : (
          <TurmaRenewalPanel
            classGroupId={turmaId}
            currentYearId={turma?.academic_year_id ?? null}
            currentYearName={turma?.academic_year_name ?? ""}
            academicYears={workspace?.academicYears ?? []}
            onRenewed={() =>
              queryClient.invalidateQueries({ queryKey: ["academic", "pedagogical-workspace"] })
            }
          />
        )}
      </div>
    </AppShell>
  );
}
