import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DocHelpButton, SqlDocHelpButton } from "@/components/ui/doc-help-button";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { FileBrowser } from "@/features/arquivos/FileBrowser";
import { listFolderTrail } from "@/features/arquivos/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";

const arquivosSearchSchema = z.object({
  turma: z.string().guid().optional(),
  pessoa: z.string().guid().optional(),
  /** A pasta aberta: deep link e contexto «Pasta» na sidebar. */
  pasta: z.string().guid().optional().catch(undefined),
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
  const { turma, pessoa, pasta } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const account = useCurrentAccount();
  // A mesma chave do FileBrowser: um só pedido para o caminho da pasta.
  const trailQuery = useQuery({
    queryKey: ["arquivos", "trail", account.schoolId, account.id, account.role, pasta ?? "root"],
    queryFn: () => listFolderTrail({ data: { folderId: pasta ?? null } }),
    enabled: Boolean(pasta),
    staleTime: 30_000,
  });
  // A pasta só entra no menu depois de o servidor a devolver (escola e visibilidade).
  const focus = useMemo(() => {
    const data = trailQuery.data;
    const folder = data?.trail.at(-1);
    if (!pasta || !data || !folder || folder.id !== pasta) return null;
    const parent = data.trail.at(-2);
    return {
      type: "folder" as const,
      id: folder.id,
      label: folder.name,
      schoolId: data.schoolId,
      data: null,
      ...(parent ? { relations: { folder: parent.id } } : {}),
    };
  }, [pasta, trailQuery.data]);
  useDeclareEntityFocus(focus);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title="Arquivos"
          description="Biblioteca no estilo Google Drive & Moodle: gestão de documentos pedagógicos, carregamento sem burocracia, pastas por turma, miniaturas em tempo real e auditoria institucional."
          actions={
            <>
              <SqlDocHelpButton />
              <DocHelpButton title="Navegação — Arquivos e permissões" />
            </>
          }
        />
        <InstalledModuleTools module="arquivos" />
        <FileBrowser
          {...(turma ? { initialClassGroupId: turma } : {})}
          {...(pessoa ? { initialRelatedPersonId: pessoa } : {})}
          folderId={pasta ?? null}
          onFolderChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, pasta: next ?? undefined }) })
          }
        />
      </div>
    </AppShell>
  );
}
