import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { FileBrowser } from "@/features/arquivos/FileBrowser";

const arquivosSearchSchema = z.object({
  turma: z.string().uuid().optional(),
  pessoa: z.string().uuid().optional(),
});

export const Route = createFileRoute("/arquivos")({
  validateSearch: (search: Record<string, unknown>) => arquivosSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Arquivos · SIGA" },
      {
        name: "description",
        content:
          "Biblioteca de PDF, Word, Excel e imagens da escola, com áreas da secretaria e pessoais.",
      },
    ],
  }),
  component: ArquivosPage,
});

function ArquivosPage() {
  const { turma, pessoa } = Route.useSearch();
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Aplicativos"
          title="Arquivos"
          description="Biblioteca no estilo Google Drive & Moodle: gestão de documentos pedagógicos, carregamento sem burocracia, pastas por turma, miniaturas em tempo real e auditoria institucional."
        />
        <InstalledModuleTools module="arquivos" />
        <FileBrowser
          {...(turma ? { initialClassGroupId: turma } : {})}
          {...(pessoa ? { initialRelatedPersonId: pessoa } : {})}
        />
      </div>
    </AppShell>
  );
}
