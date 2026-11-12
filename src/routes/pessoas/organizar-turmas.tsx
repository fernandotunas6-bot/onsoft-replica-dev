import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ClassOrganizationView } from "@/features/academic/components/ClassOrganizationPage";

/** Pessoas → Organizar turmas: a turma A com os mais novos, por classe e turno. */
export const Route = createFileRoute("/pessoas/organizar-turmas")({
  head: () => ({ meta: [{ title: "Organizar turmas · SIGA" }] }),
  component: OrganizarTurmasPage,
});

function OrganizarTurmasPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2 print:hidden">
          <Link to="/pessoas">
            <ArrowLeft className="size-4" /> Pessoas
          </Link>
        </Button>
        <PageHeader
          group="Secretaria"
          title="Organizar turmas"
          description="Por classe e turno: a turma A recebe os alunos mais novos, a B os seguintes, até à lotação. Quem já tem notas não muda."
        />
        <ClassOrganizationView />
      </div>
    </AppShell>
  );
}
