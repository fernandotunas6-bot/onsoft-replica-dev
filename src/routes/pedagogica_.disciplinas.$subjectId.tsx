import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getMySubjectWork } from "@/features/academic/subject-work-server";
import { SubjectWorkView } from "@/features/academic/components/SubjectWorkPage";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Uma disciplina do aluno (ou do educando, com `?aluno=`): notas até 20 e o
 * histórico dos trabalhos. Página, não modal (contrato visual 2026).
 */
export const Route = createFileRoute("/pedagogica_/disciplinas/$subjectId")({
  validateSearch: (search: Record<string, unknown>): { aluno?: string } => ({
    aluno:
      typeof search["aluno"] === "string" && GUID.test(search["aluno"])
        ? search["aluno"]
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Disciplina · SIGA" }] }),
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectId } = Route.useParams();
  const { aluno } = Route.useSearch();
  // A mesma chave da vista: o nome da disciplina vem do mesmo pedido.
  const work = useQuery({
    queryKey: ["subject-work", subjectId, aluno ?? "self"],
    queryFn: () =>
      getMySubjectWork({ data: { subjectId, ...(aluno ? { studentId: aluno } : {}) } }),
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
          <Link to="/pedagogica" search={{ tab: "notas" }}>
            <ArrowLeft className="size-4" /> Notas
          </Link>
        </Button>
        <PageHeader
          group="Académico"
          title={work.data?.subjectName || "Disciplina"}
          description="O caminho até 20 e todos os trabalhos, com as entregas e os comentários."
        />
        <SubjectWorkView subjectId={subjectId} studentId={aluno ?? null} />
      </div>
    </AppShell>
  );
}
