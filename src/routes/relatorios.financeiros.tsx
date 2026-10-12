import { useMemo, lazy, Suspense, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  FileBadge,
  FileDown,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { toast } from "@/lib/toast";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getFinanceReporting } from "@/features/finance/server";
import { kwanza } from "@/lib/currency";
import { exportCsv, type CsvValue } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { buildFinancePrintSchool } from "@/lib/finance-print";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { warmFinanceCharts } from "@/lib/warm-charts";
import { schoolTodayIso } from "@/lib/school-date";

const RelatoriosFinanceirosCategoryCharts = lazy(() =>
  import("@/features/finance/RelatoriosFinanceirosCategoryCharts").then((module) => ({
    default: module.RelatoriosFinanceirosCategoryCharts,
  })),
);
const RelatoriosFinanceirosMonthlyChart = lazy(() =>
  import("@/features/finance/RelatoriosFinanceirosCategoryCharts").then((module) => ({
    default: module.RelatoriosFinanceirosMonthlyChart,
  })),
);

const relatorioFinanceiroFilterDefaults = {
  sentido: "todos",
  periodo: "todos",
  q: "",
};

/** Filtra as chaves de mês (YYYY-MM) elegíveis para o período seleccionado. */
function monthKeysForPeriodo(periodo: string): Set<string> | null {
  if (periodo === "todos") return null;
  const now = new Date();
  const keys = new Set<string>();
  const monthsBack = periodo === "mes" ? 1 : periodo === "trimestre" ? 3 : 12;
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

type CollectionReportRow = {
  mes: string;
  cobrado: number;
  recebido: number;
  desvio: number;
  eficiencia: number;
};

type CategoryReportRow = {
  sentido: "Receita" | "Despesa";
  categoria: string;
  valor: number;
};

export const Route = createFileRoute("/relatorios/financeiros")({
  head: () => ({
    meta: [
      { title: "Relatórios Financeiros · SIGA" },
      {
        name: "description",
        content:
          "Receitas por categoria, despesas, margem operacional e evolução da cobrança de mensalidades da escola.",
      },
      { property: "og:title", content: "Relatórios Financeiros · SIGA" },
      {
        property: "og:description",
        content: "Analise receitas, despesas e resultado do ano lectivo com gráficos claros.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RelatoriosFinanceiros,
});

function RelatoriosFinanceiros() {
  useEffect(() => {
    warmFinanceCharts();
  }, []);
  const { selectedYearLabel, school } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const agtOn = installed.hasCapability("agt.einvoice") || installed.hasCapability("agt.nif");
  const resendOn = installed.hasCapability("resend.invoices");
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "relatorios-financeiros",
    relatorioFinanceiroFilterDefaults,
  );
  const sentido = filters.sentido;
  const periodo = filters.periodo;
  const query = filters.q.trim().toLowerCase();
  const reportingQuery = useQuery({
    queryKey: ["finance", "reporting"],
    queryFn: () => getFinanceReporting(),
  });
  const summary = reportingQuery.data?.summary;
  const receita = Number(summary?.cash_in ?? 0);
  const despesa = Number(summary?.cash_out ?? 0);
  const resultado = receita - despesa;
  const dividaAcumulada = Number(summary?.outstanding ?? 0);
  const billed = Number(summary?.billed ?? 0);
  const received = Number(summary?.received ?? 0);
  const eficienciaMedia = billed ? Math.round((received / billed) * 100) : 0;
  const periodoMonthKeys = monthKeysForPeriodo(periodo);
  const mensalidadesPorMes = (reportingQuery.data?.monthly ?? [])
    .filter((month) => !periodoMonthKeys || periodoMonthKeys.has(month.month_start.slice(0, 7)))
    .map((month) => ({
      mes: new Date(`${month.month_start}T00:00:00`).toLocaleDateString("pt-PT", {
        month: "short",
        year: "2-digit",
      }),
      cobrado: Number(month.billed),
      recebido: Number(month.received),
      despesa: Number(month.expense ?? 0),
    }));
  const receitaPorCategoria = (reportingQuery.data?.categories ?? [])
    .filter((category) => category.direction === "in")
    .map((category) => ({ categoria: category.category, valor: Number(category.amount) }));
  const despesaPorCategoria = (reportingQuery.data?.categories ?? [])
    .filter((category) => category.direction === "out")
    .map((category) => ({ categoria: category.category, valor: Number(category.amount) }));
  const cobrancaRows = useMemo<CollectionReportRow[]>(
    () =>
      mensalidadesPorMes.map((mes) => ({
        ...mes,
        desvio: mes.recebido - mes.cobrado,
        eficiencia: mes.cobrado ? Math.round((mes.recebido / mes.cobrado) * 100) : 0,
      })),
    [mensalidadesPorMes],
  );
  const categoriaRows = useMemo<CategoryReportRow[]>(() => {
    const rows = [
      ...receitaPorCategoria.map((row) => ({ ...row, sentido: "Receita" as const })),
      ...despesaPorCategoria.map((row) => ({ ...row, sentido: "Despesa" as const })),
    ];
    const bySentido =
      sentido === "receita"
        ? rows.filter((row) => row.sentido === "Receita")
        : sentido === "despesa"
          ? rows.filter((row) => row.sentido === "Despesa")
          : rows;
    if (!query) return bySentido;
    return bySentido.filter((row) => row.categoria.toLowerCase().includes(query));
  }, [despesaPorCategoria, query, receitaPorCategoria, sentido]);
  const cobrancaColumns: Array<{
    label: string;
    value: (row: CollectionReportRow) => CsvValue;
  }> = [
    { label: "Mês", value: (row) => row.mes },
    { label: "Cobrado (Kz)", value: (row) => row.cobrado },
    { label: "Recebido (Kz)", value: (row) => row.recebido },
    { label: "Desvio (Kz)", value: (row) => row.desvio },
    { label: "Eficiência (%)", value: (row) => row.eficiencia },
  ];
  const categoriaColumns: Array<{
    label: string;
    value: (row: CategoryReportRow) => CsvValue;
  }> = [
    { label: "Sentido", value: (row) => row.sentido },
    { label: "Categoria", value: (row) => row.categoria },
    { label: "Valor (Kz)", value: (row) => row.valor },
  ];
  const exportarCobrancaCsv = () =>
    exportCsv("relatorio-financeiro-cobranca", cobrancaColumns, cobrancaRows);
  const exportarCobrancaPdf = () =>
    exportPdfTable(
      "relatorio-financeiro-cobranca",
      "Cobrança mensal",
      cobrancaColumns,
      cobrancaRows,
      `Filtros activos: ${activeCount || "nenhum"}`,
    );
  const exportarCategoriasCsv = () =>
    exportCsv("relatorio-financeiro-categorias", categoriaColumns, categoriaRows);
  const exportarCategoriasPdf = () =>
    exportPdfTable(
      "relatorio-financeiro-categorias",
      "Receitas e despesas por categoria",
      categoriaColumns,
      categoriaRows,
      `Filtro sentido: ${sentido}`,
    );
  const printSchool = buildFinancePrintSchool(
    school,
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
  );
  const schoolBanking = school?.banking;
  const exportarCobrancaOficial = () => {
    void issuePrintDocument({
      tipo: "Cobrança mensal",
      school: printSchool,
      overlay: overlayServico({
        name: "Cobrança mensal",
        reference: `COB-${new Date().getFullYear()}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Cobrança mensal",
            rows: cobrancaRows.map((row) => ({
              label: String(row.mes),
              value: `${kwanza(Number(row.recebido))} / ${kwanza(Number(row.cobrado))}`,
              note: `Desvio ${kwanza(Number(row.desvio))} · ${row.eficiencia}%`,
            })),
          },
        ],
        ...(schoolBanking ? { banking: schoolBanking } : {}),
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "relatorio-financeiro-cobranca-oficial",
          "Cobrança mensal",
          {
            schoolName: printSchool.name,
            academicYear: printSchool.academicYear ?? "",
            directorName: printSchool.directorName ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            termLabel: `Filtros activos: ${activeCount || "nenhum"}`,
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              "cobranca",
              String(cobrancaRows.length),
            ]),
          },
          cobrancaColumns,
          cobrancaRows,
        ),
    });
  };
  const exportarCategoriasOficial = () => {
    void issuePrintDocument({
      tipo: "Receitas e despesas por categoria",
      school: printSchool,
      overlay: overlayServico({
        name: "Receitas e despesas por categoria",
        reference: `CAT-${new Date().getFullYear()}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Categorias",
            rows: categoriaRows.map((row) => ({
              label: `${row.sentido} · ${row.categoria}`,
              value: kwanza(Number(row.valor)),
            })),
          },
        ],
        ...(schoolBanking ? { banking: schoolBanking } : {}),
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "relatorio-financeiro-categorias-oficial",
          "Receitas e despesas por categoria",
          {
            schoolName: printSchool.name,
            academicYear: printSchool.academicYear ?? "",
            directorName: printSchool.directorName ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            termLabel: `Filtro sentido: ${sentido}`,
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              "categorias",
              String(categoriaRows.length),
            ]),
          },
          categoriaColumns,
          categoriaRows,
        ),
    });
  };
  const exportarOficial = () => {
    void issuePrintDocument({
      tipo: "Relatório financeiro",
      school: printSchool,
      overlay: overlayServico({
        name: "Relatório financeiro",
        reference: `FIN-${new Date().getFullYear()}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Resultado",
            rows: [
              { label: "Receita", value: kwanza(receita) },
              { label: "Despesa", value: kwanza(despesa) },
              { label: "Resultado", value: kwanza(resultado) },
            ],
          },
          {
            title: "Cobrança mensal",
            rows: cobrancaRows.map((row) => ({
              label: String(row.mes),
              value: `${kwanza(Number(row.recebido))} / ${kwanza(Number(row.cobrado))}`,
              note: `${row.eficiencia}%`,
            })),
          },
          {
            title: "Categorias",
            rows: categoriaRows.map((row) => ({
              label: `${row.sentido} · ${row.categoria}`,
              value: kwanza(Number(row.valor)),
            })),
          },
        ],
        ...(schoolBanking ? { banking: schoolBanking } : {}),
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "relatorio-financeiro-oficial",
          "Relatório financeiro",
          {
            schoolName: school?.name ?? "Escola",
            academicYear:
              selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            termLabel: `Receita ${kwanza(receita)} · Despesa ${kwanza(despesa)} · Resultado ${kwanza(resultado)}`,
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(receita),
              String(despesa),
              String(cobrancaRows.length),
            ]),
          },
          cobrancaColumns,
          cobrancaRows,
        ),
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {summary?.truncated ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Relatório incompleto</AlertTitle>
            <AlertDescription>
              Há mais facturas/recibos do que este relatório conseguiu somar. Os totais abaixo estão
              por baixo do valor real — contacte o suporte para paginar o histórico completo.
            </AlertDescription>
          </Alert>
        ) : null}
        <PageHeader
          group="Relatórios"
          title="Relatórios Financeiros"
          description="Resultado do ano lectivo, composição das receitas e estrutura de custos da instituição."
          actions={
            <>
              <DocHelpButton title="Navegação — Relatórios financeiros" />
              <Button variant="outline" className="gap-2" onClick={exportarCobrancaCsv}>
                <Download className="size-4" /> CSV cobrança
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarCobrancaPdf}>
                <FileDown className="size-4" /> PDF cobrança
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarCobrancaOficial}
                disabled={cobrancaRows.length === 0}
              >
                <FileBadge className="size-4" /> Oficial cobrança
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarCategoriasCsv}>
                <Download className="size-4" /> CSV categorias
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarCategoriasPdf}>
                <FileDown className="size-4" /> PDF categorias
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarCategoriasOficial}
                disabled={categoriaRows.length === 0}
              >
                <FileBadge className="size-4" /> Oficial categorias
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarOficial}
                disabled={cobrancaRows.length === 0}
              >
                <FileBadge className="size-4" /> Oficial
              </Button>
              {agtOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    const payload = `AGT;${school?.nif ?? "sem-nif"};${school?.name ?? "Escola"};${schoolTodayIso()};${kwanza(receita)}`;
                    await navigator.clipboard.writeText(payload);
                    toast.success("Linha AGT copiada");
                  }}
                >
                  AGT
                </Button>
              ) : null}
              {whatsappOn ? (
                <Button variant="outline" className="gap-2" asChild>
                  <a
                    href={whatsappHref(
                      "",
                      `Relatório financeiro ${selectedYearLabel}: receita ${kwanza(receita)} · despesa ${kwanza(despesa)}.`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp
                  </a>
                </Button>
              ) : null}
              {resendOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Relatório financeiro ${selectedYearLabel}\nReceita: ${kwanza(receita)}\nDespesa: ${kwanza(despesa)}\nResultado: ${kwanza(resultado)}\nDívida: ${kwanza(dividaAcumulada)}`,
                    );
                    toast.success("Resumo copiado para e-mail Resend");
                  }}
                >
                  E-mail
                </Button>
              ) : null}
            </>
          }
        />

        <InstalledModuleTools module="faturas" />
        <InstalledModuleTools module="financeiro" />

        <StatGrid
          collapsible
          storageKey="rel-financeiros"
          items={[
            { label: "Receita total", value: kwanza(receita), hint: "Lançamentos confirmados" },
            { label: "Despesa total", value: kwanza(despesa), hint: "Lançamentos confirmados" },
            {
              label: "Resultado",
              value: kwanza(resultado),
              hint: `Margem de ${receita ? Math.round((resultado / receita) * 100) : 0}%`,
              tone: resultado >= 0 ? "success" : "destructive",
            },
            {
              label: "Dívida acumulada",
              value: kwanza(dividaAcumulada),
              hint: `${eficienciaMedia}% de eficiência média`,
              tone: dividaAcumulada > 0 ? "warning" : "success",
            },
          ]}
        />

        <ListFilterBar
          values={filters}
          activeCount={activeCount}
          onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
          onReset={resetFilters}
          fields={[
            {
              name: "q",
              placeholder: "Pesquisar categoria…",
              "aria-label": "Pesquisar categoria",
            },
            {
              name: "sentido",
              type: "select",
              label: "Sentido",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Receitas e despesas" },
                { value: "receita", label: "Só receitas" },
                { value: "despesa", label: "Só despesas" },
              ],
            },
            {
              name: "periodo",
              type: "select",
              label: "Período",
              emptyValue: "todos",
              options: [
                { value: "todos", label: "Todo o histórico" },
                { value: "mes", label: "Último mês" },
                { value: "trimestre", label: "Último trimestre" },
                { value: "ano", label: "Último ano" },
              ],
            },
          ]}
        />

        <Suspense fallback={<div className="surface-card h-[300px] animate-pulse bg-muted/40" />}>
          <RelatoriosFinanceirosMonthlyChart
            monthly={mensalidadesPorMes.map((m) => ({
              mes: m.mes,
              receita: m.recebido,
              despesa: m.despesa,
            }))}
          />
        </Suspense>

        <Suspense
          fallback={
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="surface-card h-[280px] animate-pulse bg-muted/40" />
              <div className="surface-card h-[280px] animate-pulse bg-muted/40" />
            </div>
          }
        >
          <RelatoriosFinanceirosCategoryCharts
            sentido={sentido}
            receitaPorCategoria={receitaPorCategoria}
            despesaPorCategoria={despesaPorCategoria}
          />
        </Suspense>

        <Panel title="Cobrança mensal" description="Cobrado, recebido e desvio por mês">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Cobrado</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Desvio</TableHead>
                  <TableHead className="text-right">Eficiência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mensalidadesPorMes.map((m) => {
                  const desvio = m.recebido - m.cobrado;
                  const eficiencia = m.cobrado ? Math.round((m.recebido / m.cobrado) * 100) : 0;
                  return (
                    <TableRow key={m.mes}>
                      <TableCell className="font-semibold">{m.mes}</TableCell>
                      <TableCell className="text-right">{kwanza(m.cobrado)}</TableCell>
                      <TableCell className="text-right">{kwanza(m.recebido)}</TableCell>
                      <TableCell
                        className={
                          desvio < 0 ? "text-right text-destructive" : "text-right text-success"
                        }
                      >
                        {kwanza(desvio)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {eficiencia >= 90 ? (
                            <TrendingUp className="size-4 text-success" />
                          ) : (
                            <TrendingDown className="size-4 text-destructive" />
                          )}
                          {eficiencia}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
