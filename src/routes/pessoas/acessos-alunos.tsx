import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { StudentAccountsView } from "@/features/students/components/StudentAccountsPage";

/** Pessoas → Acessos dos alunos: contas, fichas com a senha provisória, nova senha. */
export const Route = createFileRoute("/pessoas/acessos-alunos")({
  head: () => ({ meta: [{ title: "Acessos dos alunos · SIGA" }] }),
  component: AcessosAlunosPage,
});

function AcessosAlunosPage() {
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
          title="Acessos dos alunos"
          description="O aluno entra com o número de aluno (ou o BI) e a senha. Crie as contas da turma, imprima as fichas e, no primeiro acesso, cada aluno escolhe a sua senha."
        />
        <StudentAccountsView />
      </div>
    </AppShell>
  );
}
