import { createFileRoute } from "@tanstack/react-router";
import { moduleIcons } from "@/lib/app-icons";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { CatalogExplorer } from "@/features/education-catalog/CatalogExplorer";

export const Route = createFileRoute("/pedagogica_/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo global · SIGA Plus" },
      {
        name: "description",
        content:
          "Cursos, disciplinas e níveis de ensino de referência por país, com fonte e estado de verificação.",
      },
      { property: "og:title", content: "Catálogo global · SIGA Plus" },
      {
        property: "og:description",
        content:
          "Catálogo educacional de referência: ISCED, etapas por país, cursos e disciplinas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Catálogo global"
          description="Cursos, disciplinas e níveis de ensino de referência, por país. Só consulta: a estrutura da escola cria-se em Pedagógica."
          icon={moduleIcons.educationCatalog}
        />
        <CatalogExplorer />
      </div>
    </AppShell>
  );
}
