import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileUp, History, ShieldCheck, Download, FileSpreadsheet, Sparkles } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { ImportWorkflowWizard } from "@/features/import/components/ImportWorkflowWizard";
import { ImportHistoryPanel } from "@/features/import/components/ImportHistoryPanel";
import { SchoolDataExportPanel } from "@/features/import/components/SchoolDataExportPanel";
import {
  OFFICIAL_TEMPLATES,
  generateOfficialCsvTemplate,
} from "@/features/import/official-templates";
import { downloadOfficialExcelTemplateFn } from "@/features/import/server";
import type { ImportModule } from "@/features/import/schemas";

const importarSearchSchema = z.object({
  tab: z.enum(["novo", "historico", "modelos", "exportar"]).optional(),
});

export const Route = createFileRoute("/importar")({
  validateSearch: (search) => importarSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Importar & Exportar Dados Escolares · SIGA" },
      {
        name: "description",
        content:
          "Motor central de importação, migração e exportação de dados escolares Excel/CSV do SIGA com staging, validação e auditoria.",
      },
    ],
  }),
  component: ImportarDadosPage,
});

export function ImportarDadosPage() {
  const { school, activeYearLabel, selectedYearId } = useSchoolSettings();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.id });

  const activeTab = search.tab || "novo";
  const setActiveTab = (tab: "novo" | "historico" | "modelos" | "exportar") => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  const handleDownloadCsvTemplate = (moduleKey: string) => {
    const csvContent = generateOfficialCsvTemplate(moduleKey);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Modelo_${moduleKey.toUpperCase()}_SIGA.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Modelo CSV descarregado: ${moduleKey.toUpperCase()}`);
  };

  const handleDownloadXlsxTemplate = async (moduleKey: ImportModule) => {
    try {
      toast.info("A gerar modelo Excel (.xlsx) profissional de 6 abas...");
      const result = await downloadOfficialExcelTemplateFn({
        data: { module: moduleKey },
      });

      const byteCharacters = atob(result.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.mimeType });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Modelo Excel descarregado com sucesso!");
    } catch (err: any) {
      toast.error("Falha ao gerar modelo Excel", {
        description: err?.message || "Tente descarregar o formato CSV.",
      });
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          group="Secretaria"
          title="Importação & Exportação de Dados"
          description="Motor central de intercâmbio de dados do SIGA: importe ou exporte alunos, professores, turmas, notas e finanças com integridade relacional, staging e auditoria."
          actions={<DocHelpButton title="Navegação — Importar no mapa de módulos" />}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>
              Escola: <strong>{school?.name || "—"}</strong>
            </span>
          </div>
          <div>
            Ano Lectivo: <strong>{activeYearLabel}</strong>
          </div>
        </div>

        <Panel
          title="SIGA Data Import & Export Engine"
          description="Excel/CSV bidirecional → validação relacional → staging → confirmação → auditoria → exportação reimportável"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "novo" | "historico" | "modelos" | "exportar")}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="novo" className="gap-1.5">
                <FileUp className="size-3.5" /> Nova Importação
              </TabsTrigger>
              <TabsTrigger value="exportar" className="gap-1.5">
                <FileSpreadsheet className="size-3.5 text-emerald-600" /> Exportar Dados
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5">
                <History className="size-3.5" /> Histórico &amp; Auditoria
              </TabsTrigger>
              <TabsTrigger value="modelos" className="gap-1.5">
                <Download className="size-3.5" /> Modelos Oficiais
              </TabsTrigger>
            </TabsList>

            <TabsContent value="novo">
              <ImportWorkflowWizard
                academicYearId={selectedYearId}
                onComplete={() => setActiveTab("historico")}
              />
            </TabsContent>

            <TabsContent value="exportar">
              <SchoolDataExportPanel
                academicYearId={selectedYearId}
                academicYearLabel={activeYearLabel}
              />
            </TabsContent>

            <TabsContent value="historico">
              <ImportHistoryPanel />
            </TabsContent>

            <TabsContent value="modelos">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold">Modelos Oficiais de Importação</h3>
                  <p className="text-xs text-muted-foreground">
                    Descarregue modelos oficiais pré-formatados com validações de lista suspensa, exemplos e orientações.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(OFFICIAL_TEMPLATES).map(([key, spec]) => (
                    <div
                      key={key}
                      className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 space-y-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <FileSpreadsheet className="size-5 shrink-0 text-emerald-600" />
                        <div>
                          <p className="font-semibold text-xs text-foreground">{spec.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {spec.columns.length} colunas mapeadas
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full gap-1.5 text-xs font-semibold"
                          onClick={() => handleDownloadXlsxTemplate(spec.module)}
                        >
                          <Sparkles className="size-3.5" /> Modelo Excel (.xlsx)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => handleDownloadCsvTemplate(key)}
                        >
                          <Download className="size-3.5" /> Modelo CSV Simples
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
    </AppShell>
  );
}
