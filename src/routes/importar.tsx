import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FileUp,
  History,
  ShieldCheck,
  Download,
  FileSpreadsheet,
  Sparkles,
  Search,
} from "lucide-react";
import { z } from "zod";
import { toast } from "@/lib/toast";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { ImportWorkflowWizard } from "@/features/import/components/ImportWorkflowWizard";
import { ImportHistoryPanel } from "@/features/import/components/ImportHistoryPanel";
import { SchoolDataExportPanel } from "@/features/import/components/SchoolDataExportPanel";
import {
  OFFICIAL_TEMPLATES,
  generateOfficialCsvTemplate,
} from "@/features/import/official-templates";
import { downloadOfficialExcelTemplateFn } from "@/features/import/server";
import { importModuleOptions, type ImportModule } from "@/features/import/schemas";

const importarSearchSchema = z.object({
  tab: z.enum(["novo", "historico", "modelos", "exportar"]).optional(),
  modulo: z.enum(importModuleOptions).optional(),
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
  const initialModule = search.modulo;

  const setActiveTab = (tab: "novo" | "historico" | "modelos" | "exportar") => {
    navigate({ search: (prev) => ({ ...prev, tab }) });
  };

  const defaultCategory = useMemo(() => {
    if (!initialModule) return "todos";
    const spec = OFFICIAL_TEMPLATES[initialModule];
    return spec ? spec.category : "todos";
  }, [initialModule]);

  const [templateCategory, setTemplateCategory] = useState<string>(defaultCategory);
  const [templateSearch, setTemplateSearch] = useState<string>("");

  const filteredTemplates = useMemo(() => {
    return Object.entries(OFFICIAL_TEMPLATES).filter(([key, spec]) => {
      const matchCategory = templateCategory === "todos" || spec.category === templateCategory;
      const matchSearch =
        !templateSearch ||
        spec.label.toLowerCase().includes(templateSearch.toLowerCase()) ||
        spec.module.toLowerCase().includes(templateSearch.toLowerCase()) ||
        spec.columns.some((c) => c.header.toLowerCase().includes(templateSearch.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [templateCategory, templateSearch]);

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
    } catch (err) {
      toast.error("Falha ao gerar modelo Excel", {
        description: err instanceof Error ? err.message : "Tente descarregar o formato CSV.",
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

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs shadow-card">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
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
            <TabsList className="no-scrollbar mb-4 max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="novo" className="gap-1.5">
                <FileUp className="size-3.5" /> Nova Importação
              </TabsTrigger>
              <TabsTrigger value="exportar" className="gap-1.5">
                <FileSpreadsheet className="size-3.5 text-primary" /> Exportar Dados
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
                initialModule={initialModule}
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">
                      Modelos Oficiais de Importação ({Object.keys(OFFICIAL_TEMPLATES).length})
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Descarregue modelos oficiais pré-formatados com validações de lista suspensa,
                      exemplos angolanos e orientações relacionais.
                    </p>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      id="search-import-templates"
                      aria-label="Buscar modelo ou coluna"
                      placeholder="Buscar modelo ou coluna..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
                  {[
                    { id: "todos", label: "Todos", count: Object.keys(OFFICIAL_TEMPLATES).length },
                    {
                      id: "pessoas",
                      label: "Identidade & Pessoas",
                      count: Object.values(OFFICIAL_TEMPLATES).filter(
                        (t) => t.category === "pessoas",
                      ).length,
                    },
                    {
                      id: "pedagogica",
                      label: "Estrutura Pedagógica",
                      count: Object.values(OFFICIAL_TEMPLATES).filter(
                        (t) => t.category === "pedagogica",
                      ).length,
                    },
                    {
                      id: "academica",
                      label: "Gestão Académica",
                      count: Object.values(OFFICIAL_TEMPLATES).filter(
                        (t) => t.category === "academica",
                      ).length,
                    },
                    {
                      id: "financeira",
                      label: "Tesouraria & Finanças",
                      count: Object.values(OFFICIAL_TEMPLATES).filter(
                        (t) => t.category === "financeira",
                      ).length,
                    },
                  ].map((cat) => (
                    <Button
                      key={cat.id}
                      variant={templateCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setTemplateCategory(cat.id)}
                    >
                      {cat.label} ({cat.count})
                    </Button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredTemplates.map(([key, spec]) => (
                    <div
                      key={key}
                      className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 space-y-3 shadow-card hover:shadow-subtle transition-all"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="flex items-start gap-2.5">
                          <FileSpreadsheet className="size-5 shrink-0 text-primary mt-0.5" />
                          <div>
                            <p className="font-semibold text-xs text-foreground">{spec.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {spec.columns.length} colunas mapeadas
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="text-[11px] capitalize shrink-0 font-normal"
                        >
                          {spec.category === "pessoas"
                            ? "Identidade"
                            : spec.category === "pedagogica"
                              ? "Estrutura"
                              : spec.category === "academica"
                                ? "Académico"
                                : "Financeiro"}
                        </Badge>
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
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-1/2 gap-1.5 text-xs"
                            onClick={() => handleDownloadCsvTemplate(key)}
                          >
                            <Download className="size-3.5" /> CSV
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-1/2 gap-1.5 text-xs font-medium"
                            onClick={() => {
                              navigate({
                                search: (prev) => ({ ...prev, tab: "novo", modulo: spec.module }),
                              });
                            }}
                          >
                            <FileUp className="size-3.5 text-primary" /> Importar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum modelo oficial encontrado para a pesquisa "{templateSearch}".
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </Panel>
      </div>
    </AppShell>
  );
}
