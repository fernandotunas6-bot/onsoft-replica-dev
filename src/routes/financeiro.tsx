import { useMemo, lazy, Suspense, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Banknote,
  Download,
  FileDown,
  Plus,
  Undo2,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { whatsappHref } from "@/features/integrations/actions";
import { archiveFinanceDocument } from "@/features/arquivos/server";
import { stableDocumentCode } from "@/features/arquivos/document-code";
import { warmFinanceCharts } from "@/lib/warm-charts";

const FinanceiroCashChart = lazy(() =>
  import("@/features/finance/FinanceiroCashChart").then((module) => ({
    default: module.FinanceiroCashChart,
  })),
);
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { documentValidationCode } from "@/features/academic/assessment-views";
import {
  getFinanceReporting,
  getFinanceSchemaStatus,
  cancelPaymentPlan,
  createPaymentPlan,
  listCashEntries,
  listInvoices,
  listPaymentPlans,
  recordInvoicePayment,
  reverseCashEntry,
} from "@/features/finance/server";
import { kwanza } from "@/lib/currency";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { buildFinancePrintSchool } from "@/lib/finance-print";
import { officialReceiptBody } from "@/features/finance/schemas";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { dateInRange, usePersistedListFilters } from "@/lib/list-filters";
import { cn } from "@/lib/utils";

const financeiroFilterDefaults = {
  q: "",
  tipo: "todos",
  metodo: "todos",
  categoria: "todas",
  de: "",
  ate: "",
};

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Caixa e Pagamentos · SIGA" },
      {
        name: "description",
        content:
          "Movimentos de caixa, entradas de mensalidades, despesas e cobrança mensal da escola em kwanzas.",
      },
      { property: "og:title", content: "Caixa e Pagamentos · SIGA" },
      {
        property: "og:description",
        content: "Controle entradas, saídas e saldo do caixa escolar em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FinanceiroPage,
});

function FinanceiroPage() {
  useEffect(() => {
    warmFinanceCharts();
  }, []);
  const installed = useInstalledIntegrations();
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendInvoices = installed.hasCapability("resend.invoices");
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "financeiro",
    financeiroFilterDefaults,
  );
  const query = filters.q;
  const tipo = filters.tipo;
  const metodo = filters.metodo;
  const categoria = filters.categoria;
  const de = filters.de;
  const ate = filters.ate;
  const cashQuery = useQuery({
    queryKey: ["finance", "cash-entries"],
    queryFn: () => listCashEntries({ data: { limit: 250 } }),
  });
  const invoicesQuery = useQuery({
    queryKey: ["finance", "invoices"],
    queryFn: () => listInvoices({ data: { limit: 250 } }),
  });
  const reportingQuery = useQuery({
    queryKey: ["finance", "reporting"],
    queryFn: () => getFinanceReporting(),
  });
  const schemaQuery = useQuery({
    queryKey: ["finance", "schema-status"],
    queryFn: () => getFinanceSchemaStatus(),
    staleTime: 60_000,
  });
  const plansQuery = useQuery({
    queryKey: ["finance", "payment-plans"],
    queryFn: () => listPaymentPlans(),
    retry: false,
  });
  const missingPenalty = Boolean(schemaQuery.data?.missingPenaltyAmount);
  const missingPrefs = Boolean(schemaQuery.data?.missingNotificationPreferences);
  const schemaBlocked = missingPenalty || missingPrefs;
  const movimentos = useMemo(
    () =>
      (cashQuery.data ?? []).map((entry) => ({
        id: entry.id,
        documento: entry.document_number,
        data: entry.occurred_at,
        descricao: entry.description,
        categoria: entry.category,
        metodo: entry.method,
        status: entry.status,
        tipo: entry.direction === "in" ? ("Entrada" as const) : ("Saída" as const),
        valor: Number(entry.amount),
      })),
    [cashQuery.data],
  );
  const faturas = invoicesQuery.data ?? [];
  const summary = reportingQuery.data?.summary;
  const entradas = Number(summary?.cash_in ?? 0);
  const saidas = Number(summary?.cash_out ?? 0);
  const saldo = Number(summary?.cash_balance ?? 0);
  const lista = useMemo(() => {
    const q = query.trim().toLowerCase();
    return movimentos.filter(
      (movimento) =>
        (tipo === "todos" || movimento.tipo === tipo) &&
        (metodo === "todos" ||
          String(movimento.metodo ?? "").toLowerCase() === metodo.toLowerCase()) &&
        (categoria === "todas" || String(movimento.categoria ?? "") === categoria) &&
        dateInRange(String(movimento.data ?? ""), de, ate) &&
        (!q ||
          String(movimento.descricao ?? "")
            .toLowerCase()
            .includes(q) ||
          String(movimento.documento ?? "")
            .toLowerCase()
            .includes(q) ||
          String(movimento.categoria ?? "")
            .toLowerCase()
            .includes(q)),
    );
  }, [ate, categoria, de, metodo, movimentos, query, tipo]);
  const cobrado = Number(summary?.billed ?? 0);
  const recebido = Number(summary?.received ?? 0);
  const taxaCobranca = cobrado ? Math.round((recebido / cobrado) * 100) : 0;
  const emAberto = Number(summary?.outstanding ?? 0);
  const mensalidadesPorMes = (reportingQuery.data?.monthly ?? []).map((month) => ({
    mes: new Date(`${month.month_start}T00:00:00`).toLocaleDateString("pt-PT", {
      month: "short",
    }),
    cobrado: Number(month.billed),
    recebido: Number(month.received),
  }));
  const financeSchool = buildFinancePrintSchool(
    school,
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "",
  );
  const schoolBanking = school?.banking;

  const printCashMovement = async (movimento: {
    documento?: string | null;
    descricao: string;
    categoria: string;
    metodo: string;
    tipo: string;
    valor: number;
    data: string;
    status?: string | null;
  }) => {
    await issuePrintDocument({
      tipo: "Recibo de caixa",
      school: financeSchool,
      overlay: overlayServico({
        name: movimento.tipo === "Entrada" ? "Recibo de caixa" : "Comprovativo de saída",
        reference: movimento.documento || "CAIXA",
        status: movimento.status === "reversed" ? "Anulado" : "Lançado",
        parties: [
          { label: "Escola", value: school?.name ?? "Escola" },
          { label: "Tesouraria", value: school?.director_name || "Caixa" },
        ],
        sections: [
          {
            title: "Movimento",
            rows: [
              { label: "Descrição", value: movimento.descricao },
              { label: "Categoria", value: movimento.categoria },
              { label: "Método", value: movimento.metodo },
              { label: "Tipo", value: movimento.tipo },
              { label: "Valor", value: kwanza(movimento.valor) },
              {
                label: "Data",
                value: movimento.data ? new Date(movimento.data).toLocaleDateString("pt-AO") : "—",
              },
            ],
          },
        ],
        banking: schoolBanking,
      }),
    });
  };

  const printPaymentPlan = async (plan: {
    id: string;
    channel: string;
    installments: number;
    reference?: string | null;
    status: string;
    notes?: string | null;
  }) => {
    const channelLabel = String(plan.channel).replaceAll("_", " ");
    let libraryCode: string | null = null;
    try {
      const archived = await archiveFinanceDocument({
        data: {
          category: "talao",
          title: `Talão ${channelLabel}`,
          description: `Talão impresso do plano de pagamento (${channelLabel}, ${plan.installments} prestação(ões)). Referência ${plan.reference || plan.id}. Arquivado na biblioteca para pesquisa rápida.`,
          sourceLabel: plan.reference || String(plan.id),
          documentCode: stableDocumentCode("talao", String(plan.id)),
        },
      });
      libraryCode = archived.documentCode;
      void queryClient.invalidateQueries({ queryKey: ["arquivos"] });
    } catch {
      /* arquivo opcional se SQL ainda não aplicado */
    }
    await issuePrintDocument({
      tipo: "Plano de pagamento",
      school: financeSchool,
      overlay: overlayServico({
        name: "Plano de pagamento",
        reference: libraryCode || plan.reference || String(plan.id).slice(0, 8),
        status:
          plan.status === "pending_gateway"
            ? "Pendente"
            : plan.status === "cancelled"
              ? "Cancelado"
              : plan.status === "settled"
                ? "Liquidado"
                : String(plan.status),
        parties: [{ label: "Canal", value: channelLabel }],
        sections: [
          {
            title: "Condições",
            rows: [
              { label: "Prestações", value: String(plan.installments) },
              { label: "Referência", value: plan.reference || "—" },
              { label: "ID biblioteca", value: libraryCode || "—" },
              { label: "Notas", value: plan.notes || "—" },
            ],
          },
        ],
        banking: schoolBanking,
      }),
    });
    if (libraryCode) {
      toast.success(`Talão arquivado · ${libraryCode}`);
    }
  };

  const payableInvoices = faturas.filter(
    (invoice) => invoice.status === "issued" || invoice.status === "partial",
  );
  const invoiceOptions = payableInvoices.map(
    (invoice) =>
      `${invoice.number} · ${invoice.student_name} · ${Number(invoice.total_amount).toLocaleString("pt-PT")} Kz`,
  );
  // SGA finance_receipts.payment_method only accepts `cash` (confirmed in live smoke).
  const paymentMethods = {
    Numerário: "cash",
  } as const;
  const reversibleEntries = movimentos.filter(
    (movimento) => movimento.status === "posted" || movimento.status === "issued",
  );
  const cashEntryOptions = reversibleEntries.map(
    (movimento) => `${movimento.documento} · ${movimento.descricao}`,
  );
  const methodOptions = [
    ...new Set(
      movimentos.map((movimento) => String(movimento.metodo ?? "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt"));
  const categoryOptions = [
    ...new Set(
      movimentos.map((movimento) => String(movimento.categoria ?? "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt"));
  const cashColumns = [
    { label: "Data", value: (row: Record<string, unknown>) => row.data },
    { label: "Documento", value: (row: Record<string, unknown>) => row.documento },
    { label: "Descrição", value: (row: Record<string, unknown>) => row.descricao },
    { label: "Categoria", value: (row: Record<string, unknown>) => row.categoria },
    { label: "Método", value: (row: Record<string, unknown>) => row.metodo },
    { label: "Tipo", value: (row: Record<string, unknown>) => row.tipo },
    { label: "Valor (Kz)", value: (row: Record<string, unknown>) => row.valor },
    { label: "Estado", value: (row: Record<string, unknown>) => row.status },
  ];
  const exportRows = lista.map((movimento) => ({
    data: new Date(movimento.data).toLocaleDateString("pt-PT"),
    documento: movimento.documento,
    descricao: movimento.descricao,
    categoria: movimento.categoria,
    metodo: movimento.metodo,
    tipo: movimento.tipo,
    valor: movimento.valor,
    status: movimento.status,
  }));
  const exportarCaixaCsv = () => exportCsv("caixa-filtrado", cashColumns, exportRows);
  const exportarCaixaPdf = () =>
    exportPdfTable(
      "caixa-filtrado",
      "Movimentos de caixa",
      cashColumns,
      exportRows,
      `Filtros activos: ${activeCount || "nenhum"}`,
    );
  const exportarCaixaOficial = () => {
    void issuePrintDocument({
      tipo: "Movimentos de caixa",
      school: financeSchool,
      overlay: overlayServico({
        name: "Movimentos de caixa",
        areaLabel: "Tesouraria",
        reference: `CAIXA-${exportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Lançamentos",
            rows: exportRows.map((row) => ({
              label: `${row.data} · ${row.descricao}`,
              value: `${row.tipo} · ${row.valor} Kz`,
              note: `${row.categoria} · ${row.metodo}`,
            })),
          },
        ],
        banking: schoolBanking,
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "caixa-oficial",
          "Movimentos de caixa",
          {
            schoolName: school?.name ?? "Escola",
            academicYear: financeSchool.academicYear || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              financeSchool.academicYear,
              String(exportRows.length),
            ]),
          },
          cashColumns,
          exportRows,
        ),
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Financeiro"
          title="Caixa e Pagamentos"
          description="Registo diário de entradas e saídas, métodos de pagamento e evolução da cobrança."
          actions={
            <>
              <Button variant="outline" className="gap-2" onClick={exportarCaixaCsv}>
                <Download className="size-4" /> CSV
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarCaixaPdf}>
                <FileDown className="size-4" /> PDF
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarCaixaOficial}>
                <Award className="size-4" /> Oficial
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/relatorios/financeiros">
                  <Banknote className="size-4" /> Resumo do caixa
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/faturas">
                  <Banknote className="size-4" /> Emitir fatura
                </Link>
              </Button>
              <QuickFormModal
                eyebrow="Tesouraria"
                title="Pagamento avançado"
                description="Plano com prestações e canal Multicaixa Express ou Unitel Money. Fica pendente até confirmação do gateway."
                icon={<Wallet className="size-5" />}
                submitLabel="Criar plano"
                onSubmit={async (values) => {
                  const invoice = payableInvoices.find((item) =>
                    `${item.number} · ${item.student_name} · ${Number(item.total_amount).toLocaleString("pt-PT")} Kz`.includes(
                      values.fatura ?? "",
                    ),
                  );
                  const channelMap = {
                    "Multicaixa Express": "multicaixa_express",
                    "Unitel Money": "unitel_money",
                    Transferência: "transfer",
                    Numerário: "cash",
                  } as const;
                  await createPaymentPlan({
                    data: {
                      invoiceId: invoice?.id,
                      channel:
                        channelMap[(values.canal as keyof typeof channelMap) ?? "Numerário"] ??
                        "cash",
                      installments: Number(values.prestacoes || 1),
                      reference: values.referencia || undefined,
                      notes: values.notas || undefined,
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["finance"] });
                  await queryClient.invalidateQueries({ queryKey: ["finance", "payment-plans"] });
                  await printPaymentPlan({
                    id: values.referencia || "plano",
                    channel:
                      channelMap[(values.canal as keyof typeof channelMap) ?? "Numerário"] ?? "cash",
                    installments: Number(values.prestacoes || 1),
                    reference: values.referencia || null,
                    status: "pending_gateway",
                    notes: values.notas || null,
                  });
                }}
                fields={[
                  {
                    name: "fatura",
                    label: "Fatura",
                    type: "select",
                    options: invoiceOptions,
                    full: true,
                    required: false,
                  },
                  {
                    name: "canal",
                    label: "Canal",
                    type: "select",
                    options: [
                      ...(installed.isInstalled("multicaixa_express")
                        ? ["Multicaixa Express"]
                        : []),
                      ...(installed.isInstalled("unitel_money") ? ["Unitel Money"] : []),
                      "Transferência",
                      "Numerário",
                    ],
                  },
                  {
                    name: "prestacoes",
                    label: "Prestações",
                    type: "number",
                    defaultValue: 1,
                  },
                  {
                    name: "referencia",
                    label: "Referência",
                    required: false,
                  },
                  {
                    name: "notas",
                    label: "Notas",
                    type: "textarea",
                    required: false,
                    full: true,
                  },
                ]}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <Wallet className="size-4" /> Pagamento avançado
                  </Button>
                )}
              />
              <QuickFormModal
                eyebrow="Financeiro"
                title="Registar pagamento"
                description="Liquide uma fatura e lance a entrada no caixa numa única operação."
                icon={<Plus className="size-5" />}
                submitLabel="Confirmar pagamento"
                fields={[
                  {
                    name: "fatura",
                    label: "Fatura",
                    type: "select",
                    options: invoiceOptions,
                    full: true,
                  },
                  { name: "valor", label: "Valor (Kz)", type: "number", placeholder: "45000" },
                  {
                    name: "metodo",
                    label: "Método",
                    type: "select",
                    options: Object.keys(paymentMethods),
                  },
                  {
                    name: "recibo",
                    label: "Referência interna (opcional)",
                    placeholder: "RC 2025/0001",
                    required: false,
                  },
                  { name: "data", label: "Data do pagamento", type: "date" },
                  {
                    name: "referencia",
                    label: "Referência",
                    placeholder: "Comprovativo ou operação",
                    full: true,
                    required: false,
                  },
                ]}
                onSubmit={async (values) => {
                  const invoiceIndex = invoiceOptions.indexOf(values.fatura ?? "");
                  const invoice = payableInvoices[invoiceIndex];
                  const method = paymentMethods[values.metodo as keyof typeof paymentMethods];
                  if (!invoice || !method)
                    throw new Error("Selecione uma fatura e um método válidos.");
                  const paid = await recordInvoicePayment({
                    data: {
                      invoiceId: invoice.id,
                      receiptNumber: values.recibo,
                      amount: Number(values.valor),
                      method,
                      reference: values.referencia || undefined,
                      paidAt: values.data
                        ? new Date(`${values.data}T12:00:00Z`).toISOString()
                        : undefined,
                    },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] }),
                    queryClient.invalidateQueries({ queryKey: ["finance", "cash-entries"] }),
                    queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] }),
                  ]);
                  // Número oficial vem do servidor (gerado atomicamente) — nunca do
                  // valor digitado, para o PDF impresso bater sempre com a base de dados.
                  await issuePrintDocument({
                    tipo: "Recibo de pagamento",
                    school: financeSchool,
                    student: {
                      fullName: invoice.student_name,
                      academicNumber: invoice.number,
                    },
                    overlay: overlayServico({
                      name: "Recibo de pagamento",
                      reference: paid.receipt_number,
                      status: "Pago",
                      parties: [{ label: "Aluno", value: invoice.student_name }],
                      sections: [
                        {
                          title: "Quitação",
                          rows: [
                            { label: "Fatura", value: invoice.number },
                            { label: "Valor", value: kwanza(Number(values.valor)) },
                            { label: "Método", value: values.metodo },
                          ],
                        },
                      ],
                      term: officialReceiptBody({
                        schoolName: school?.name ?? "Escola",
                        studentName: invoice.student_name,
                        invoiceNumber: invoice.number,
                        receiptNumber: paid.receipt_number,
                        amountLabel: kwanza(Number(values.valor)),
                      }),
                      banking: schoolBanking,
                    }),
                  });
                }}
                trigger={(open) => (
                  <Button className="gap-2" onClick={open} disabled={!payableInvoices.length}>
                    <Plus className="size-4" /> Registar pagamento
                  </Button>
                )}
              />
              <QuickFormModal
                eyebrow="Financeiro"
                title="Anular lançamento"
                description="Mantenha o histórico e reverta o efeito no caixa e na fatura."
                icon={<Undo2 className="size-5" />}
                submitLabel="Confirmar anulação"
                fields={[
                  {
                    name: "lancamento",
                    label: "Lançamento",
                    type: "select",
                    options: cashEntryOptions,
                    full: true,
                  },
                  {
                    name: "motivo",
                    label: "Motivo da anulação",
                    type: "textarea",
                    full: true,
                  },
                ]}
                onSubmit={async (values) => {
                  const entry =
                    reversibleEntries[cashEntryOptions.indexOf(values.lancamento ?? "")];
                  if (!entry) throw new Error("Selecione um lançamento válido.");
                  await reverseCashEntry({
                    data: { cashEntryId: entry.id, reason: values.motivo },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] }),
                    queryClient.invalidateQueries({ queryKey: ["finance", "cash-entries"] }),
                    queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] }),
                  ]);
                }}
                trigger={(open) => (
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={open}
                    disabled={!reversibleEntries.length}
                  >
                    <Undo2 className="size-4" /> Anular lançamento
                  </Button>
                )}
              />
              <Button
                variant="outline"
                className="gap-2"
                disabled
                title="Despesas de caixa ainda não têm tabela nativa no SGA"
              >
                <ArrowDownRight className="size-4" /> Despesas (indisponível no SGA)
              </Button>
            </>
          }
        />

        <InstalledModuleTools module="financeiro" />
        <InstalledModuleTools module="faturas" />

        {schemaBlocked ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Emissão de faturas bloqueada</AlertTitle>
            <AlertDescription>
              Execute <code>supabase/APPLY_IN_SQL_EDITOR.sql</code> no SQL Editor do projecto{" "}
              <strong>xodgfmxiaunpamctfeea</strong>
              {missingPenalty ? (
                <>
                  {" "}
                  (<code>penalty_amount</code>)
                </>
              ) : null}
              {missingPrefs ? (
                <>
                  {" "}
                  (colunas em <code>notification_preferences</code>, ex. <code>in_app_enabled</code>
                  )
                </>
              ) : null}
              . Até lá só consegue consultar caixa existente.
            </AlertDescription>
          </Alert>
        ) : null}

        <StatGrid
          items={[
            { label: "Saldo actual", value: kwanza(saldo), hint: "Caixa + banco" },
            {
              label: "Entradas do período",
              value: kwanza(entradas),
              hint: `${movimentos.filter((m) => m.tipo === "Entrada").length} lançamentos`,
            },
            {
              label: "Saídas do período",
              value: kwanza(saidas),
              hint: "Despesas e salários",
            },
            {
              label: "Taxa de cobrança",
              value: `${taxaCobranca}%`,
              hint: `${kwanza(emAberto)} em aberto`,
            },
          ]}
        />

        <Panel title="Cobrado vs. recebido" description="Mensalidades ao longo do ano lectivo">
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-xl bg-muted/40" />}>
            <FinanceiroCashChart data={mensalidadesPorMes} />
          </Suspense>
        </Panel>

        <Panel title="Movimentos de caixa" description="Últimos lançamentos registados">
          <ListFilterBar
            className="mb-4"
            values={filters}
            activeCount={activeCount}
            onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
            onReset={resetFilters}
            fields={[
              {
                name: "q",
                placeholder: "Pesquisar documento, descrição ou categoria…",
                "aria-label": "Pesquisar movimento",
              },
              {
                name: "tipo",
                type: "select",
                label: "Tipo",
                emptyValue: "todos",
                options: [
                  { value: "todos", label: "Todos os movimentos" },
                  { value: "Entrada", label: "Apenas entradas" },
                  { value: "Saída", label: "Apenas saídas" },
                ],
              },
              {
                name: "metodo",
                type: "select",
                label: "Método",
                emptyValue: "todos",
                options: [
                  { value: "todos", label: "Todos os métodos" },
                  ...methodOptions.map((option) => ({ value: option, label: option })),
                ],
              },
              {
                name: "categoria",
                type: "select",
                label: "Categoria",
                emptyValue: "todas",
                options: [
                  { value: "todas", label: "Todas as categorias" },
                  ...categoryOptions.map((option) => ({ value: option, label: option })),
                ],
              },
              { name: "de", type: "date", label: "De" },
              { name: "ate", type: "date", label: "Até" },
            ]}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Acção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(m.data).toLocaleDateString("pt-PT")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "font-semibold",
                            m.status === "reversed" && "line-through opacity-60",
                          )}
                        >
                          {m.descricao}
                        </p>
                        {m.status === "reversed" ? (
                          <span className={cn(badgeBase, toneClass.muted)}>Anulado</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.categoria}</TableCell>
                    <TableCell>
                      <span className={cn(badgeBase, toneClass.muted)}>{m.metodo}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          badgeBase,
                          "gap-1",
                          m.tipo === "Entrada" ? toneClass.success : toneClass.danger,
                        )}
                      >
                        {m.tipo === "Entrada" ? (
                          <ArrowUpRight className="size-3" />
                        ) : (
                          <ArrowDownRight className="size-3" />
                        )}
                        {m.tipo}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-bold",
                        m.tipo === "Entrada" ? "text-success" : "text-destructive",
                      )}
                    >
                      {m.tipo === "Entrada" ? "+" : "−"} {kwanza(m.valor)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void printCashMovement(m)}
                        >
                          Recibo
                        </Button>
                        {resendInvoices ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                `${m.tipo} · ${kwanza(m.valor)} · ${m.descricao ?? m.categoria ?? "caixa"}`,
                              );
                              toast.success("Texto do recibo copiado para e-mail Resend");
                            }}
                          >
                            E-mail
                          </Button>
                        ) : null}
                        {whatsappOn ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a
                              href={whatsappHref(
                                "",
                                `Recibo SIGA: ${m.tipo} ${kwanza(m.valor)}`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {cashQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                      Não foi possível carregar os movimentos de caixa.
                    </TableCell>
                  </TableRow>
                ) : lista.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum movimento encontrado para o filtro aplicado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel
          title="Planos de pagamento"
          description="Prestações Multicaixa Express, Unitel Money, transferência ou numerário"
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Prestações</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="text-right">Acção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(plansQuery.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      Ainda sem planos. Use «Pagamento avançado» para criar um.
                    </TableCell>
                  </TableRow>
                ) : (
                  (plansQuery.data ?? []).map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-semibold capitalize">
                        {String(plan.channel).replaceAll("_", " ")}
                      </TableCell>
                      <TableCell>{plan.installments}</TableCell>
                      <TableCell className="font-mono text-xs">{plan.reference ?? "—"}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            badgeBase,
                            plan.status === "settled"
                              ? toneClass.success
                              : plan.status === "cancelled"
                                ? toneClass.muted
                                : toneClass.warning,
                          )}
                        >
                          {plan.status === "pending_gateway"
                            ? "Pendente"
                            : plan.status === "cancelled"
                              ? "Cancelado"
                              : plan.status === "settled"
                                ? "Liquidado"
                                : String(plan.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {plan.created_at
                          ? new Date(plan.created_at).toLocaleString("pt-PT")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void printPaymentPlan(plan)}
                          >
                            Talão
                          </Button>
                          {resendInvoices && plan.reference ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  `Plano ${plan.channel} · ref. ${plan.reference}`,
                                );
                                toast.success("Referência copiada para e-mail Resend");
                              }}
                            >
                              E-mail
                            </Button>
                          ) : null}
                          {whatsappOn && plan.reference ? (
                            <Button size="sm" variant="ghost" asChild>
                              <a
                                href={whatsappHref(
                                  "",
                                  `Pagamento SIGA (${String(plan.channel).replaceAll("_", " ")}): ${plan.reference}`,
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                WhatsApp
                              </a>
                            </Button>
                          ) : null}
                        {plan.status === "pending_gateway" || plan.status === "scheduled" ? (
                          <ConfirmActionModal
                            title="Cancelar plano"
                            description="O plano deixa de ficar à espera do gateway. Não gera recibo."
                            confirmLabel="Cancelar plano"
                            onConfirm={async () => {
                              await cancelPaymentPlan({ data: { planId: String(plan.id) } });
                              await queryClient.invalidateQueries({
                                queryKey: ["finance", "payment-plans"],
                              });
                            }}
                            trigger={(open) => (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={open}
                              >
                                Cancelar
                              </Button>
                            )}
                          />
                        ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-primary-soft/40 p-5">
          <Wallet className="size-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Saldo calculado pelos lançamentos confirmados:{" "}
            <strong className="text-foreground">{kwanza(saldo)}</strong>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
