import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ListPaginationBar } from "@/components/filters/ListPaginationBar";
import {
  AlertCircle,
  Award,
  Banknote,
  ChevronDown,
  CreditCard,
  Download,
  FileDown,
  FileText,
  FileUp,
  Plus,
  QrCode,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { DocHelpButton, DocPathHelpButton } from "@/components/ui/doc-help-button";
import { DOC_PATHS, getPayflowPayerUrl } from "@/lib/ecosystem-urls";
import { PayflowAdminLaunchButton } from "@/features/finance/components/PayflowAdminLaunchButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SqlChecklistLink } from "@/components/ui/sql-checklist-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFinanceReporting,
  getFinanceSchemaStatus,
  cancelInvoice,
  issueInvoice,
  listFinanceStudents,
  listInvoices,
  recordInvoicePayment,
} from "@/features/finance/server";
import { officialReceiptBody } from "@/features/finance/schemas";
import { buildProformaInvoice } from "@/features/finance/proforma-receipts";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { paymentReference, whatsappHref } from "@/features/integrations/actions";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import { mapInvoicesToFinanceOverviewSnapshot } from "@/features/intelligence/finance/finance-overview-adapter";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { AppMark } from "@/features/integrations/app-marks";
import { kwanza } from "@/lib/currency";
import { exportOfficialDeclarationPdf, exportOfficialPautaPdf } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { buildFinancePrintSchool } from "@/lib/finance-print";
import { PaymentReferenceCard } from "@/features/finance/components/PaymentReferenceCard";
import { openSettingsPanel } from "@/lib/settings-deep-link";
import { exportCsv } from "@/lib/export-csv";
import { exportPdfTable } from "@/lib/export-pdf-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { dateInRange, usePersistedListFilters } from "@/lib/list-filters";

const faturasFilterDefaults = {
  q: "",
  estado: "todos",
  de: "",
  ate: "",
};

type InvoiceExportRow = {
  id: string;
  numero: string;
  aluno: string;
  processo: string;
  descricao: string;
  emitida: string;
  vencimento: string;
  valor: number;
  recebido: number;
  estado: "Paga" | "Pendente" | "Vencida";
};

export const Route = createFileRoute("/faturas")({
  head: () => ({
    meta: [
      { title: "Faturas · SIGA" },
      {
        name: "description",
        content:
          "Emissão e controlo de faturas de mensalidades, matrículas e serviços, com estado de pagamento e vencimentos.",
      },
      { property: "og:title", content: "Faturas · SIGA" },
      {
        property: "og:description",
        content: "Consulte faturas pagas, pendentes e vencidas de cada aluno da escola.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaturasPage,
});

const estadoTone = {
  Paga: toneClass.success,
  Pendente: toneClass.warning,
  Vencida: toneClass.danger,
} as const;

function FaturasPage() {
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const resendInvoices = installed.hasCapability("resend.invoices");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const multicaixaOn = installed.isInstalled("multicaixa_express");
  const [emisInvoice, setEmisInvoice] = useState<{
    id: string;
    numero: string;
    valor: number;
  } | null>(null);
  const receiveMethods = [
    "Numerário",
    "Transferência",
    ...(installed.isInstalled("multicaixa_express") ? ["Multicaixa Express"] : []),
    ...(installed.isInstalled("unitel_money") ? ["Unitel Money"] : []),
  ];
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "faturas",
    faturasFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const de = filters.de;
  const ate = filters.ate;

  const invoicesQuery = useQuery({
    queryKey: ["finance", "invoices"],
    queryFn: () => listInvoices({ data: { limit: 250 } }),
  });
  const financeStudentsQuery = useQuery({
    queryKey: ["finance", "students"],
    queryFn: () => listFinanceStudents({ data: { limit: 250 } }),
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
  const financeStudents = financeStudentsQuery.data ?? [];
  const missingPenalty = Boolean(schemaQuery.data?.missingPenaltyAmount);
  const missingPrefs = Boolean(schemaQuery.data?.missingNotificationPreferences);
  const missingActiveFeePlan = Boolean(schemaQuery.data?.missingActiveFeePlan);
  const schemaBlocked = missingPenalty || missingPrefs;
  const financeInvoiceBlocked = schemaBlocked || missingActiveFeePlan;
  const studentOptions = financeStudents.map(
    (student) => `${student.registration_number} · ${student.full_name}`,
  );
  const faturas = useMemo(
    () =>
      (invoicesQuery.data ?? []).map((invoice) => ({
        id: invoice.id,
        numero: invoice.number,
        aluno: invoice.student_name,
        processo: invoice.registration_number,
        descricao: invoice.description ?? "Fatura escolar",
        emitida: invoice.issued_on,
        vencimento: invoice.due_on,
        valor: Number(invoice.total_amount),
        recebido: Number(invoice.amount_paid),
        estado:
          invoice.status === "paid"
            ? ("Paga" as const)
            : invoice.due_on < new Date().toISOString().slice(0, 10)
              ? ("Vencida" as const)
              : ("Pendente" as const),
      })),
    [invoicesQuery.data],
  );

  const financeOverviewSnapshot = useMemo(
    () => mapInvoicesToFinanceOverviewSnapshot(faturas),
    [faturas],
  );
  const focusedFinanceOverviewEntity = useMemo(
    () => ({
      type: "finance-overview" as const,
      id: "overview",
      label: "Faturas",
      schoolId: school?.id ?? "",
      data: financeOverviewSnapshot,
    }),
    [financeOverviewSnapshot, school?.id],
  );
  useDeclareEntityFocus(focusedFinanceOverviewEntity);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faturas.filter(
      (f) =>
        (estado === "todos" || f.estado === estado) &&
        dateInRange(f.emitida, de, ate) &&
        (!q ||
          f.aluno.toLowerCase().includes(q) ||
          f.numero.toLowerCase().includes(q) ||
          f.descricao.toLowerCase().includes(q)),
    );
  }, [ate, de, estado, faturas, query]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setPage(1);
  }, [query, estado, de, ate]);

  // Realtime — actualiza faturas e relatório ao vivo quando há novos pagamentos ou faturas
  useEffect(() => {
    const channel = supabase
      .channel("faturas_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "invoices" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] });
          void queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payments" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] });
          void queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoices" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] });
          void queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const pagedFaturas = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const summary = reportingQuery.data?.summary;
  const total = Number(summary?.billed ?? 0);
  const pago = Number(summary?.received ?? 0);
  const totalEmAberto = Number(summary?.outstanding ?? 0);
  const invoiceCount = Number(summary?.invoice_count ?? 0);
  const ticketMedio = invoiceCount ? Math.round(total / invoiceCount) : 0;
  const faturaColumns = [
    { label: "Número", value: (row: InvoiceExportRow) => row.numero },
    { label: "Aluno", value: (row: InvoiceExportRow) => row.aluno },
    { label: "Processo", value: (row: InvoiceExportRow) => row.processo },
    { label: "Descrição", value: (row: InvoiceExportRow) => row.descricao },
    { label: "Emissão", value: (row: InvoiceExportRow) => row.emitida },
    { label: "Vencimento", value: (row: InvoiceExportRow) => row.vencimento },
    { label: "Valor (Kz)", value: (row: InvoiceExportRow) => row.valor },
    { label: "Estado", value: (row: InvoiceExportRow) => row.estado },
  ];
  const exportRows: InvoiceExportRow[] = filtered.map((fatura) => ({
    ...fatura,
    processo: fatura.processo,
  }));
  const exportarFaturasCsv = () => exportCsv("faturas-filtradas", faturaColumns, exportRows);
  const exportarFaturasPdf = () =>
    exportPdfTable(
      "faturas-filtradas",
      "Faturas",
      faturaColumns,
      exportRows,
      `Filtros activos: ${activeCount || "nenhum"}`,
    );
  const academicYear =
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";
  const financeSchool = buildFinancePrintSchool(school, academicYear);
  const schoolBanking = school?.banking;

  const exportarFaturasOficial = () => {
    void issuePrintDocument({
      tipo: "Lista de faturas",
      school: financeSchool,
      overlay: overlayServico({
        name: "Lista de faturas",
        areaLabel: "Tesouraria",
        reference: `FT-${exportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Faturas",
            rows: exportRows.map((row) => ({
              label: `${row.numero} · ${row.aluno}`,
              value: `${row.estado} · ${Number(row.valor).toLocaleString("pt-PT")} Kz`,
              note: `${row.emitida} → ${row.vencimento}`,
            })),
          },
        ],
        ...(schoolBanking ? { banking: schoolBanking } : {}),
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "faturas-oficial",
          "Lista de faturas",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              academicYear,
              String(exportRows.length),
            ]),
          },
          faturaColumns,
          exportRows,
        ),
    });
  };
  const year = new Date().getFullYear();
  const suggestedInvoiceNumber = `FT-${year}/${String(invoiceCount + 1).padStart(4, "0")}`;

  const downloadReceipt = async (
    fatura: {
      numero: string;
      aluno: string;
      processo: string;
      valor: number;
      recebido: number;
      descricao?: string;
    },
    receiptNumber: string,
    amount: number,
    kind: "recibo" | "fatura" = "recibo",
  ) => {
    const validationCode = documentValidationCode([fatura.numero, receiptNumber, fatura.processo]);
    await issuePrintDocument({
      tipo: kind === "fatura" ? "Fatura escolar" : "Recibo de pagamento",
      school: financeSchool,
      student: {
        fullName: fatura.aluno,
        academicNumber: fatura.processo,
        documentTitle: kind === "fatura" ? fatura.numero : receiptNumber,
        validationCode,
      },
      overlay: overlayServico({
        name: kind === "fatura" ? "Fatura escolar" : "Recibo de pagamento",
        reference: kind === "fatura" ? fatura.numero : receiptNumber,
        status: kind === "fatura" ? "Emitida" : "Pago",
        parties: [
          { label: "Aluno", value: fatura.aluno },
          { label: "Processo", value: fatura.processo },
          { label: "Escola", value: school?.name ?? "Escola" },
        ],
        sections: [
          {
            title: kind === "fatura" ? "Cobrança" : "Quitação",
            rows: [
              { label: "Fatura", value: fatura.numero, note: fatura.descricao || "" },
              { label: "Valor", value: kwanza(kind === "fatura" ? fatura.valor : amount) },
              { label: "Já recebido", value: kwanza(fatura.recebido) },
              { label: "Documento", value: receiptNumber },
            ],
          },
        ],
        term: officialReceiptBody({
          schoolName: school?.name ?? "Escola",
          studentName: fatura.aluno,
          invoiceNumber: fatura.numero,
          receiptNumber,
          amountLabel: kwanza(amount),
        }),
        ...(schoolBanking ? { banking: schoolBanking } : {}),
      }),
      fallback: () =>
        exportOfficialDeclarationPdf(
          `${kind}-${receiptNumber}`,
          kind === "fatura" ? "Fatura escolar" : "Recibo de pagamento",
          {
            schoolName: school?.name ?? "Escola",
            academicYear,
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode,
            studentName: fatura.aluno,
            registrationNumber: fatura.processo,
            body: officialReceiptBody({
              schoolName: school?.name ?? "Escola",
              studentName: fatura.aluno,
              invoiceNumber: fatura.numero,
              receiptNumber,
              amountLabel: kwanza(amount),
            }),
          },
        ),
    });
  };

  const handleExportSaftAo = async (fiscalYear = new Date().getFullYear()) => {
    try {
      const { exportSaftAoXml } = await import("@/features/finance/server");
      const { validateSaftAoXml } = await import("@/features/finance/saft-validator");
      const res = await exportSaftAoXml({ data: { fiscalYear } });
      if (res.success && res.xml) {
        const val = validateSaftAoXml(res.xml);
        const blob = new Blob([res.xml], { type: "application/xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = res.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(`Ficheiro ${res.filename} descarregado (${res.invoiceCount} faturas).`, {
          description: val.valid
            ? `Conformidade AGT validada (${val.version}).`
            : `Aviso: ${val.errors.length} erro(s) estruturais detectados.`,
        });
        for (const warning of [...(res.warnings ?? []), ...val.warnings.map((w) => w.message)]) {
          toast.warning(warning);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar SAFT-AO.");
    }
  };

  const handleValidateSaftAo = async (fiscalYear = new Date().getFullYear()) => {
    try {
      const { exportSaftAoXml } = await import("@/features/finance/server");
      const { validateSaftAoXml } = await import("@/features/finance/saft-validator");
      const res = await exportSaftAoXml({ data: { fiscalYear } });
      if (!res.success || !res.xml) {
        toast.error("Não foi possível carregar o XML do SAF-T.");
        return;
      }
      const val = validateSaftAoXml(res.xml);
      if (val.valid) {
        toast.success(`SAF-T AO ${fiscalYear} 100% Válido!`, {
          description: `Versão ${val.version} · NIF: ${val.taxRegistrationNumber} · ${val.totalInvoices} faturas · Total: ${val.grossTotal.toLocaleString("pt-PT")} Kz`,
        });
      } else {
        toast.error(`SAF-T AO ${fiscalYear}: ${val.errors.length} erro(s) estruturais`, {
          description: val.errors[0]?.message,
        });
      }
      for (const w of val.warnings) {
        toast.warning(w.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao validar SAFT-AO.");
    }
  };

  const saftYearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current, current - 1, current - 2];
  }, []);

  const handleIssueProforma = async (values: Record<string, string>) => {
    const studentLabel = values["aluno"] || "";
    const selectedStudent = financeStudents.find(
      (s) =>
        `${s.registration_number} · ${s.full_name}` === studentLabel ||
        s.student_id === studentLabel,
    );

    const proformaNo = `FP-${new Date().getFullYear()}/${String(invoiceCount + 1).padStart(4, "0")}`;
    const issueDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const amount = Number(values["valor"]) || 0;
    const nif = values["nif"];

    const proforma = buildProformaInvoice({
      documentNumber: proformaNo,
      issueDate,
      dueDate,
      customerName: selectedStudent?.full_name || values["cliente"] || "Consumidor Final",
      ...(nif ? { customerNif: nif } : {}),
      ...(selectedStudent?.full_name ? { studentName: selectedStudent.full_name } : {}),
      ...(selectedStudent?.registration_number
        ? { registrationNumber: selectedStudent.registration_number }
        : {}),
      items: [
        {
          description: values["descricao"] || "Propina / Serviços Escolares",
          quantity: 1,
          unitPrice: amount,
          taxRate: 0,
        },
      ],
      ...(schoolBanking ? { banking: schoolBanking } : {}),
    });

    await issuePrintDocument({
      tipo: "Fatura proforma",
      school: financeSchool,
      student: {
        fullName: proforma.customerName,
        academicNumber: proforma.registrationNumber || "—",
        documentTitle: proforma.documentNumber,
        validationCode: documentValidationCode([proforma.documentNumber, proforma.customerName]),
      },
      overlay: overlayServico({
        name: "Fatura Proforma",
        reference: proforma.documentNumber,
        status: "Proforma",
        parties: [
          { label: "Cliente", value: proforma.customerName },
          { label: "NIF", value: proforma.customerNif },
        ],
        sections: [
          {
            title: "Orçamento de Serviços",
            rows: proforma.items.map((item) => ({
              label: item.description,
              value: item.total.toLocaleString("pt-PT") + " Kz",
              note: `Qtd: ${item.quantity}`,
            })),
          },
        ],
        ...(schoolBanking ? { banking: schoolBanking } : {}),
        term: proforma.agtNotice,
      }),
    });
    toast.success(`Fatura Proforma ${proformaNo} emitida com sucesso!`);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Relatórios"
          title="Faturas"
          description="Documentos de cobrança emitidos, com vencimento, valor e estado de liquidação."
          actions={
            <>
              <DocHelpButton title="Navegação — Faturas e tesouraria" />
              <DocPathHelpButton
                path={DOC_PATHS.financePayflow}
                label="PayFlow"
                title="PayFlow — cobrança e conciliação"
              />
              <DocPathHelpButton
                path={DOC_PATHS.financeSaft}
                label="SAFT-AO"
                title="Exportação SAFT-AO / AGT"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1.5 text-xs shadow-2xs">
                    <Download className="size-3.5" /> Exportar & SAFT-AO{" "}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2 text-xs">
                      <FileText className="size-3.5 text-primary" /> Ficheiro SAFT-AO (XML)
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {saftYearOptions.map((year) => (
                        <DropdownMenuItem
                          key={year}
                          className="text-xs cursor-pointer"
                          onClick={() => void handleExportSaftAo(year)}
                        >
                          Exportar {year}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem
                        className="text-xs cursor-pointer text-primary font-medium"
                        onClick={() => void handleValidateSaftAo(new Date().getFullYear())}
                      >
                        Validar Estrutura AGT
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={exportarFaturasOficial}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Award className="size-3.5 text-primary" /> Relatório Oficial PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarFaturasPdf}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <FileDown className="size-3.5" /> Lista Simples PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={exportarFaturasCsv}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Download className="size-3.5" /> Ficheiro CSV
                  </DropdownMenuItem>
                  <div className="my-1 border-t border-border" />
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <Link to="/importar" search={{ tab: "novo", modulo: "pagamentos" }}>
                      <FileUp className="size-3.5 text-primary" /> Importar Pagamentos (Excel)
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                    <a
                      href={getPayflowPayerUrl() ?? "http://localhost:3007/aluno/pagar"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <CreditCard className="size-3.5 text-primary" /> Portal PayFlow (Pagamentos)
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-xs cursor-pointer p-0"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <PayflowAdminLaunchButton asMenuItem className="px-2 py-1.5">
                      <Banknote className="size-3.5 text-primary" /> Conciliação PayFlow
                    </PayflowAdminLaunchButton>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <QuickFormModal
                title="Emitir Fatura Proforma"
                eyebrow="Orçamento"
                description="Gere uma Fatura Proforma oficial para orçamentar propinas ou serviços escolares."
                icon={<FileText className="size-5" />}
                submitLabel="Emitir Proforma"
                fields={[
                  {
                    name: "aluno",
                    label: "Aluno (opcional)",
                    type: "select",
                    options: studentOptions,
                    full: true,
                  },
                  {
                    name: "cliente",
                    label: "Nome do Cliente / Entidade",
                    placeholder: "Ex: Empresa ou Encarregado",
                  },
                  {
                    name: "nif",
                    label: "NIF do Cliente",
                    placeholder: "Ex: 5417001234",
                  },
                  {
                    name: "descricao",
                    label: "Descrição do Serviço",
                    defaultValue: "Propina / Serviços Escolares",
                    full: true,
                  },
                  {
                    name: "valor",
                    label: "Valor Total (Kz)",
                    type: "number",
                  },
                ]}
                onSubmit={handleIssueProforma}
                trigger={(open) => (
                  <Button variant="outline" className="gap-2" onClick={open}>
                    <FileText className="size-4" /> Proforma
                  </Button>
                )}
              />
              <QuickFormModal
                title="Emitir fatura"
                eyebrow="Financeiro"
                description="Crie a fatura e o respetivo item numa única transação."
                icon={<Plus className="size-5" />}
                submitLabel="Emitir"
                fields={[
                  {
                    name: "aluno",
                    label: "Aluno",
                    type: "select",
                    options: studentOptions,
                    full: true,
                  },
                  {
                    name: "numero",
                    label: "Número",
                    placeholder: "FT 2026/0001",
                    defaultValue: suggestedInvoiceNumber,
                  },
                  {
                    name: "categoria",
                    label: "Categoria",
                    type: "select",
                    options: ["Mensalidade", "Matrícula", "Documento", "Outro"],
                  },
                  { name: "valor", label: "Valor (Kz)", type: "number", placeholder: "45000" },
                  { name: "vencimento", label: "Vencimento", type: "date" },
                  {
                    name: "descricao",
                    label: "Descrição",
                    type: "textarea",
                    full: true,
                    required: false,
                  },
                ]}
                onSubmit={async (values) => {
                  const student = financeStudents[studentOptions.indexOf(values["aluno"] ?? "")];
                  if (!student) throw new Error("Selecione um aluno válido.");
                  await issueInvoice({
                    data: {
                      studentId: student.student_id,
                      number: values["numero"] ?? "",
                      dueOn: values["vencimento"] ?? "",
                      category: values["categoria"] ?? "",
                      amount: Number(values["valor"]),
                      description: values["descricao"] || undefined,
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["finance", "invoices"] });
                  await queryClient.invalidateQueries({ queryKey: ["finance", "reporting"] });
                  await downloadReceipt(
                    {
                      numero: values["numero"] ?? "",
                      aluno: student.full_name,
                      processo: student.registration_number,
                      valor: Number(values["valor"]),
                      recebido: 0,
                      descricao: values["descricao"] || values["categoria"] || "Fatura escolar",
                    },
                    values["numero"] ?? "",
                    Number(values["valor"]),
                    "fatura",
                  );
                }}
                trigger={(open) => (
                  <Button
                    className="gap-2"
                    onClick={open}
                    disabled={!financeStudents.length || financeInvoiceBlocked}
                  >
                    <Plus className="size-4" /> Emitir fatura
                  </Button>
                )}
              />
            </>
          }
        />

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3">
            <AppMark id="agt" className="size-9 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">AGT · faturação electrónica</p>
              <p className="text-xs text-muted-foreground">
                {school?.nif
                  ? `NIF da escola ${school.nif}. Instale a AGT no lançador para activar faturação electrónica neste módulo.`
                  : "Defina o NIF da escola nas definições e instale a AGT para alinhar as faturas."}
              </p>
            </div>
          </div>
          <InstalledModuleTools module="financeiro" />
          <InstalledModuleTools module="faturas" />
        </div>

        {schemaBlocked ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Schema SGA incompleto para faturas</AlertTitle>
            <AlertDescription>
              Execute <code>supabase/APPLY_IN_SQL_EDITOR.sql</code> no SQL Editor do projecto{" "}
              <strong>xodgfmxiaunpamctfeea</strong>
              {missingPenalty ? (
                <>
                  {" "}
                  (falta <code>finance_invoices.penalty_amount</code>)
                </>
              ) : null}
              {missingPrefs ? (
                <>
                  {" "}
                  (faltam colunas em <code>notification_preferences</code>, ex.{" "}
                  <code>in_app_enabled</code>)
                </>
              ) : null}
              . <SqlChecklistLink />
            </AlertDescription>
          </Alert>
        ) : null}

        {!schemaBlocked && missingActiveFeePlan ? (
          <Alert variant="default" className="border-border bg-card">
            <AlertCircle className="size-4 text-primary" />
            <AlertTitle>Plano de propinas em falta</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                Active o plano financeiro em Definições para emitir faturas de propina e matrícula.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openSettingsPanel("financeiro")}
              >
                Configurar propinas
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <StatGrid
          collapsible
          storageKey="faturas-1"
          items={[
            { label: "Facturado", value: kwanza(total), hint: `${invoiceCount} documentos` },
            { label: "Liquidado", value: kwanza(pago), hint: "Recebido em caixa" },
            {
              label: "Em aberto",
              value: kwanza(totalEmAberto),
              hint: `${Number(summary?.open_invoice_count ?? 0)} facturas pendentes ou vencidas`,
            },
            {
              label: "Vencidas",
              value: String(Number(summary?.overdue_invoice_count ?? 0)),
              hint: `${kwanza(Number(summary?.overdue ?? 0))} em risco`,
            },
          ]}
        />

        <StatGrid
          collapsible
          storageKey="faturas-2"
          items={[
            {
              label: "Taxa de liquidação",
              value: `${total ? Math.round((pago / total) * 100) : 0}%`,
              hint: "Valor recebido sobre o total facturado",
            },
            {
              label: "Ticket médio",
              value: kwanza(ticketMedio),
              hint: "Valor médio por documento emitido",
            },
            {
              label: "Cobranças imediatas",
              value: String(Number(summary?.overdue_invoice_count ?? 0)),
              hint: "Prioridade da tesouraria",
            },
            {
              label: "Alunos com facturas",
              value: String(Number(summary?.billed_student_count ?? 0)),
              hint: "Clientes activos neste lote",
            },
          ]}
        />

        <Panel
          title="Documentos emitidos"
          description="Facturas de mensalidades e serviços"
          action={
            <ListFilterBar
              className="border-0 bg-transparent p-0 shadow-none"
              values={filters}
              activeCount={activeCount}
              onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
              onReset={resetFilters}
              fields={[
                {
                  name: "q",
                  placeholder: "Pesquisar número ou aluno…",
                  "aria-label": "Pesquisar factura",
                },
                {
                  name: "estado",
                  type: "select",
                  label: "Estado",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos os estados" },
                    { value: "Paga", label: "Pagas" },
                    { value: "Pendente", label: "Pendentes" },
                    { value: "Vencida", label: "Vencidas" },
                  ],
                },
                { name: "de", type: "date", label: "De" },
                { name: "ate", type: "date", label: "Até" },
              ]}
            />
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Emitida</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                  <TableHead className="text-right">Acção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedFaturas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 text-primary" />
                        {f.numero}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{f.aluno}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {f.processo}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.descricao}</TableCell>
                    <TableCell>{new Date(f.emitida).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell>{new Date(f.vencimento).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="text-right font-bold">{kwanza(f.valor)}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn(badgeBase, estadoTone[f.estado])}>{f.estado}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void downloadReceipt(f, f.numero, f.valor, "fatura")}
                        >
                          <FileDown className="size-3.5" /> Fatura
                        </Button>
                        {multicaixaOn && f.estado !== "Paga" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setEmisInvoice({
                                id: f.id,
                                numero: f.numero,
                                valor: Math.max(f.valor - f.recebido, 0) || f.valor,
                              })
                            }
                          >
                            <QrCode className="size-3.5" /> Referência EMIS
                          </Button>
                        ) : null}
                        {f.estado !== "Paga" ? (
                          <QuickFormModal
                            eyebrow={f.numero}
                            title={`Receber ${f.aluno}`}
                            description="Liquida esta fatura e lança o recibo no caixa."
                            icon={<Wallet className="size-5" />}
                            submitLabel="Confirmar pagamento"
                            successDescription="Pagamento registado."
                            fields={[
                              {
                                name: "valor",
                                label: "Valor (Kz)",
                                type: "number",
                                defaultValue: String(Math.max(f.valor - f.recebido, 0) || f.valor),
                              },
                              {
                                name: "recibo",
                                label: "Referência interna (opcional)",
                                defaultValue: `RC-${f.numero.replace(/^FT-?/i, "")}`,
                                required: false,
                              },
                              { name: "data", label: "Data", type: "date", required: false },
                              {
                                name: "metodo",
                                label: "Método",
                                type: "select",
                                options: receiveMethods,
                              },
                              {
                                name: "referencia",
                                label: "Referência",
                                required: false,
                                full: true,
                                placeholder: installed.isInstalled("multicaixa_express")
                                  ? "Vazio gera referência EMIS"
                                  : undefined,
                              },
                            ]}
                            onSubmit={async (values) => {
                              const amount = Number(values["valor"]);
                              const methodMap = {
                                Numerário: "cash",
                                Transferência: "transfer",
                                "Multicaixa Express": "multicaixa_express",
                                "Unitel Money": "unitel_money",
                              } as const;
                              const method =
                                methodMap[
                                  (values["metodo"] as keyof typeof methodMap) ?? "Numerário"
                                ] ?? "cash";
                              const reference =
                                values["referencia"] ||
                                (method === "multicaixa_express"
                                  ? paymentReference("EMIS")
                                  : method === "unitel_money"
                                    ? paymentReference("UML")
                                    : undefined);
                              const paid = await recordInvoicePayment({
                                data: {
                                  invoiceId: f.id,
                                  receiptNumber: values["recibo"],
                                  amount,
                                  method,
                                  reference,
                                  paidAt: values["data"]
                                    ? new Date(`${values["data"]}T12:00:00Z`).toISOString()
                                    : undefined,
                                },
                              });
                              await Promise.all([
                                queryClient.invalidateQueries({
                                  queryKey: ["finance", "invoices"],
                                }),
                                queryClient.invalidateQueries({
                                  queryKey: ["finance", "reporting"],
                                }),
                                queryClient.invalidateQueries({ queryKey: ["arquivos"] }),
                              ]);
                              // Número oficial vem do servidor (gerado atomicamente) — nunca do
                              // valor digitado, para o PDF impresso bater sempre com a base de dados.
                              await downloadReceipt(f, paid.receipt_number, amount);
                              if (paid?.library_document_code) {
                                toast.success(`Recibo arquivado · ${paid.library_document_code}`);
                              }
                            }}
                            trigger={(open) => (
                              <Button size="sm" variant="outline" onClick={open}>
                                <Wallet className="size-3.5" /> Receber
                              </Button>
                            )}
                          />
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              void downloadReceipt(
                                f,
                                `RC-${f.numero.replace(/^FT-?/i, "")}`,
                                f.recebido || f.valor,
                              )
                            }
                          >
                            <FileDown className="size-3.5" /> Recibo
                          </Button>
                        )}
                        {resendInvoices ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                `${f.numero} · ${f.aluno} · ${kwanza(f.valor)} · ${f.estado}`,
                              );
                              toast.success("Texto da fatura copiado para e-mail Resend");
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
                                `Fatura ${f.numero} de ${f.aluno}: ${kwanza(f.valor)} (${f.estado})`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          </Button>
                        ) : null}
                        {f.estado !== "Paga" && f.recebido === 0 ? (
                          <ConfirmActionModal
                            title="Cancelar fatura"
                            description={`A fatura ${f.numero} de ${f.aluno} sai da lista de cobrança. Recibos existentes impedem esta operação.`}
                            confirmLabel="Cancelar fatura"
                            onConfirm={async () => {
                              await cancelInvoice({ data: { invoiceId: f.id } });
                              await Promise.all([
                                queryClient.invalidateQueries({
                                  queryKey: ["finance", "invoices"],
                                }),
                                queryClient.invalidateQueries({
                                  queryKey: ["finance", "reporting"],
                                }),
                                queryClient.invalidateQueries({
                                  queryKey: ["dashboard", "overview"],
                                }),
                              ]);
                            }}
                            trigger={(open) => (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={open}
                              >
                                <X className="size-3.5" /> Anular
                              </Button>
                            )}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {invoicesQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-destructive">
                      Não foi possível carregar as faturas.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhuma factura encontrada para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            <ListPaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        </Panel>

        <Dialog
          open={emisInvoice !== null}
          onOpenChange={(open) => {
            if (!open) setEmisInvoice(null);
          }}
        >
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Referência Multicaixa / EMIS</DialogTitle>
              <DialogDescription>
                Partilhe a referência com o encarregado ou confirme o pagamento após ver o
                comprovativo.
              </DialogDescription>
            </DialogHeader>
            {emisInvoice ? (
              <PaymentReferenceCard
                invoiceId={emisInvoice.id}
                invoiceNumber={emisInvoice.numero}
                amount={emisInvoice.valor}
                onPaymentSuccess={() => {
                  setEmisInvoice(null);
                  void queryClient.invalidateQueries({ queryKey: ["finance"] });
                }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
