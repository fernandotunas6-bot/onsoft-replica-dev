import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileUp, History, ShieldCheck, Download, FileSpreadsheet } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { ImportWorkflowWizard } from "@/features/import/components/ImportWorkflowWizard";
import { ImportHistoryPanel } from "@/features/import/components/ImportHistoryPanel";
import {
  OFFICIAL_TEMPLATES,
  generateOfficialCsvTemplate,
} from "@/features/import/official-templates";

const importarSearchSchema = z.object({
  tab: z.enum(["novo", "historico", "modelos"]).optional(),
});

export const Route = createFileRoute("/importar")({
  validateSearch: (search) => importarSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Importar Dados Escolares · SIGA" },
      {
        name: "description",
        content:
          "Motor central de importação e migração de dados escolares Excel/CSV do SIGA com staging, validação e auditoria.",
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
  const setActiveTab = (tab: "novo" | "historico" | "modelos") => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  const handleDownloadTemplate = (moduleKey: string) => {
    const csvContent = generateOfficialCsvTemplate(moduleKey);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Modelo_${moduleKey}_SIGA.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <PageHeader
          group="Secretaria"
          title="Importar Dados Escolares"
          description="Migre e alimente alunos, professores, turmas, notas e pagamentos a partir de ficheiros Excel/CSV com validação, staging e auditoria."
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
          title="Motor de Importação"
          description="Excel/CSV → validação → staging → confirmação → auditoria"
        >
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "novo" | "historico" | "modelos")}
          >
            <TabsList className="mb-4">
              <TabsTrigger value="novo" className="gap-1.5">
                <FileUp className="size-3.5" /> Nova Importação
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5">
                <History className="size-3.5" /> Histórico &amp; Auditoria
              </TabsTrigger>
              <TabsTrigger value="modelos" className="gap-1.5">
                <Download className="size-3.5" /> Modelos Oficiais Excel
              </TabsTrigger>
            </TabsList>

            <TabsContent value="novo">
              <ImportWorkflowWizard
                academicYearId={selectedYearId}
                onComplete={() => setActiveTab("historico")}
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
                    Descarregue modelos de exemplo pré-formatados com cabeçalhos oficiais do SIGA.
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
                            {spec.columns.length} colunas pré-definidas
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-xs"
                        onClick={() => handleDownloadTemplate(key)}
                      >
                        <Download className="size-3.5" /> Descarregar Modelo
                      </Button>
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
