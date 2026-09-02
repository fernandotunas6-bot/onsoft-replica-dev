import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, FileCheck2, FileDown, FilePlus2, Award, FileStack, X } from "lucide-react";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
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
import {
  createDocumentRequest,
  listDocumentWorkspace,
  listPrintTemplates,
  updateDocumentRequestStatus,
} from "@/features/documents/server";
import { kwanza } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { officialDeclarationBody } from "@/features/documents/schemas";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { PrintTemplateStudio } from "@/features/documents/PrintTemplateStudio";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { exportCsv } from "@/lib/export-csv";
import {
  exportOfficialDeclarationPdf,
  exportOfficialPautaPdf,
  exportPdfTable,
} from "@/lib/export-pdf-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { dateInRange, usePersistedListFilters } from "@/lib/list-filters";

const documentosFilterDefaults = {
  q: "",
  estado: "todos",
  de: "",
  ate: "",
};

type DocumentRequestExportRow = {
  tipo: string;
  aluno: string;
  processo: string;
  pedidoEm: string;
  responsavel: string;
  estado: "Emitido" | "Em processamento" | "Pendente de pagamento" | "Recusado" | "Cancelado";
};

type DocumentWorkspaceView = {
  students: Array<{ id: string; full_name: string; registration_number: string }>;
  templates: Array<{ id: string; name: string; fee_amount: number; turnaround_days: number }>;
  requests: Array<{
    id: string;
    template_name: string;
    student_name: string;
    registration_number: string;
    class_name: string | null;
    requested_at: string;
    assigned_to: string | null;
    status: string;
    next_status: string | null;
  }>;
};

export const Route = createFileRoute("/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos e Declarações · SIGA" },
      {
        name: "description",
        content:
          "Emissão e acompanhamento de declarações, certificados, boletins e pedidos de transferência dos alunos.",
      },
      { property: "og:title", content: "Documentos e Declarações · SIGA" },
      {
        property: "og:description",
        content: "Acompanhe pedidos de documentos, prazos e taxas de emissão da secretaria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocumentosPage,
});

const estadoTone = {
  Emitido: toneClass.success,
  "Em processamento": toneClass.info,
  "Pendente de pagamento": toneClass.warning,
  Recusado: toneClass.danger,
  Cancelado: toneClass.danger,
} as const;

const statusLabels: Record<string, keyof typeof estadoTone> = {
  pending_payment: "Pendente de pagamento",
  queued: "Em processamento",
  processing: "Em processamento",
  ready: "Emitido",
  delivered: "Emitido",
  rejected: "Recusado",
  cancelled: "Cancelado",
};

const advanceActionLabel: Record<string, string> = {
  in_review: "Rever",
  approved: "Emitir",
};

function DocumentosPage() {
  const installed = useInstalledIntegrations();
  const resendOn = installed.hasCapability("resend.documents");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const queryClient = useQueryClient();
  const { school, selectedYearLabel } = useSchoolSettings();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "documentos",
    documentosFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const de = filters.de;
  const ate = filters.ate;
  const workspaceQuery = useQuery({
    queryKey: ["documents", "workspace"],
    queryFn: () =>
      listDocumentWorkspace({ data: { limit: 250 } }) as unknown as Promise<DocumentWorkspaceView>,
  });
  const printCatalogQuery = useQuery({
    queryKey: ["documents", "print-templates"],
    queryFn: () => listPrintTemplates(),
  });
  const activeTemplate = useMemo(() => {
    const issue = printCatalogQuery.data?.issue;
    if (!issue) return null;
    return printCatalogQuery.data?.items.find((item) => item.key === issue) ?? null;
  }, [printCatalogQuery.data]);

  useEffect(() => {
    const scrollToModelos = () => {
      if (window.location.hash !== "#modelos") return;
      document.getElementById("modelos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    scrollToModelos();
    window.addEventListener("hashchange", scrollToModelos);
    return () => window.removeEventListener("hashchange", scrollToModelos);
  }, []);

  // Realtime — atualiza a lista de pedidos quando há novidades
  useEffect(() => {
    const channel = supabase
      .channel("documentos_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "siga_document_requests" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["documents", "workspace"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const students = workspaceQuery.data?.students ?? [];
  const templates = workspaceQuery.data?.templates ?? [];
  const studentOptions = students.map(
    (student) => `${student.registration_number} · ${student.full_name}`,
  );
  const templateOptions = templates.map((template) => template.name);
  const documentos = useMemo(
    () =>
      (workspaceQuery.data?.requests ?? []).map((request) => ({
        id: request.id,
        tipo: request.template_name,
        aluno: request.student_name,
        processo: request.registration_number,
        turma: request.class_name ?? null,
        pedidoEm: request.requested_at,
        responsavel: request.assigned_to ? "Secretaria" : "Por atribuir",
        estado: statusLabels[request.status] ?? "Em processamento",
        nextStatus: request.next_status as string | null,
      })),
    [workspaceQuery.data],
  );

  const academicYear =
    selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year || "";

  const downloadDeclaration = async (documento: {
    id: string;
    tipo: string;
    aluno: string;
    processo: string;
    turma: string | null;
  }) => {
    const validationCode = documentValidationCode([
      documento.id,
      documento.processo,
      documento.tipo,
    ]);
    const fallback = () =>
      exportOfficialDeclarationPdf(`declaracao-${documento.processo}`, documento.tipo, {
        schoolName: school?.name ?? "Escola",
        academicYear,
        className: documento.turma ?? undefined,
        directorName: school?.director_name ?? undefined,
        issuedOn: new Date().toLocaleDateString("pt-AO"),
        validationCode,
        studentName: documento.aluno,
        registrationNumber: documento.processo,
        body: officialDeclarationBody({
          schoolName: school?.name ?? "Escola",
          studentName: documento.aluno,
          registrationNumber: documento.processo,
          className: documento.turma,
          academicYear,
        }),
      });

    await issuePrintDocument({
      tipo: documento.tipo,
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear,
      },
      student: {
        fullName: documento.aluno,
        academicNumber: documento.processo,
        className: documento.turma,
        documentTitle: documento.tipo,
        validationCode,
      },
      fallback,
    });
  };

  const advanceRequest = async (
    documento: {
      id: string;
      tipo: string;
      aluno: string;
      processo: string;
      turma: string | null;
      nextStatus: string | null;
    },
    nextStatus: string,
  ) => {
    setAdvancingId(documento.id);
    try {
      await updateDocumentRequestStatus({
        data: {
          requestId: documento.id,
          status: nextStatus as "submitted" | "in_review" | "approved" | "rejected" | "cancelled",
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents", "workspace"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
      ]);
      toast.success("Estado do documento actualizado.");
      if (nextStatus === "approved") await downloadDeclaration(documento);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível actualizar o pedido.");
    } finally {
      setAdvancingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documentos.filter(
      (d) =>
        (estado === "todos" || d.estado === estado) &&
        dateInRange(d.pedidoEm, de, ate) &&
        (!q ||
          d.aluno.toLowerCase().includes(q) ||
          d.tipo.toLowerCase().includes(q) ||
          d.processo.toLowerCase().includes(q) ||
          d.responsavel.toLowerCase().includes(q)),
    );
  }, [ate, de, documentos, query, estado]);

  const emitidos = documentos.filter((d) => d.estado === "Emitido");
  const emProcessamento = documentos.filter((d) => d.estado === "Em processamento");
  const pendentesPagamento = documentos.filter((d) => d.estado === "Pendente de pagamento");
  const taxaMedia = templates.length
    ? Math.round(
        templates.reduce((sum, template) => sum + Number(template.fee_amount), 0) /
          templates.length,
      )
    : 0;
  const docColumns = [
    { label: "Documento", value: (row: DocumentRequestExportRow) => row.tipo },
    { label: "Aluno", value: (row: DocumentRequestExportRow) => row.aluno },
    { label: "Processo", value: (row: DocumentRequestExportRow) => row.processo },
    { label: "Pedido em", value: (row: DocumentRequestExportRow) => row.pedidoEm },
    { label: "Responsável", value: (row: DocumentRequestExportRow) => row.responsavel },
    { label: "Estado", value: (row: DocumentRequestExportRow) => row.estado },
  ];
  const exportRows: DocumentRequestExportRow[] = filtered.map((documento) => ({
    tipo: documento.tipo,
    aluno: documento.aluno,
    processo: documento.processo,
    pedidoEm: documento.pedidoEm,
    responsavel: documento.responsavel,
    estado: documento.estado,
  }));
  const exportarDocumentosCsv = () => exportCsv("documentos-filtrados", docColumns, exportRows);
  const exportarDocumentosPdf = () =>
    exportPdfTable(
      "documentos-filtrados",
      "Documentos e declarações",
      docColumns,
      exportRows,
      `Filtros activos: ${activeCount || "nenhum"}`,
    );
  const exportarDocumentosOficial = () => {
    void issuePrintDocument({
      tipo: "Pedidos de documento",
      school: {
        name: school?.name ?? "Escola",
        nif: school?.nif,
        phone: school?.phone,
        email: school?.email,
        address: school?.address,
        directorName: school?.director_name,
        academicYear,
      },
      overlay: overlayServico({
        name: "Pedidos de documento",
        areaLabel: "Secretaria",
        reference: `DOC-${exportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Pedidos",
            rows: exportRows.map((row) => ({
              label: `${row.aluno} · ${row.tipo}`,
              value: String(row.estado),
              note: `${row.processo} · ${row.pedidoEm}`,
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "documentos-oficial",
          "Pedidos de documento",
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
          docColumns,
          exportRows,
        ),
    });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Secretaria"
          title="Documentos"
          description="Pedidos de declarações e certificados, com estado de emissão e taxas associadas."
          actions={
            <>
              <DocHelpButton title="Navegação — Documentos e permissões" />
              <Button variant="outline" className="gap-2" asChild>
                <a href="#modelos">
                  <FileStack className="size-4" /> Modelos
                </a>
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarDocumentosCsv}>
                <Download className="size-4" /> CSV
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarDocumentosPdf}>
                <FileDown className="size-4" /> PDF
              </Button>
              <Button variant="outline" className="gap-2" onClick={exportarDocumentosOficial}>
                <Award className="size-4" /> Oficial
              </Button>
              <PickFileButton
                area="secretaria"
                onPick={(file) =>
                  toast.success(file.name, { description: "Ficheiro da secretaria seleccionado." })
                }
              />
              <QuickFormModal
                title="Novo pedido de documento"
                eyebrow="Secretaria"
                description="Registe o pedido, o tipo de documento e a taxa associada."
                icon={<FilePlus2 className="size-5" />}
                submitLabel="Registar pedido"
                fields={[
                  {
                    name: "aluno",
                    label: "Aluno",
                    type: "select",
                    options: studentOptions,
                    full: true,
                  },
                  {
                    name: "modelo",
                    label: "Modelo de documento",
                    type: "select",
                    options: templateOptions,
                  },
                  { name: "numero", label: "Número do pedido", placeholder: "DOC 2025/0001" },
                  {
                    name: "prazo",
                    label: "Prazo de entrega",
                    type: "date",
                    required: false,
                  },
                  {
                    name: "urgencia",
                    label: "Urgência",
                    type: "select",
                    options: ["Normal", "Urgente"],
                  },
                  { name: "notas", label: "Notas internas", type: "textarea", full: true },
                ]}
                onSubmit={async (values) => {
                  const student = students[studentOptions.indexOf(values["aluno"] ?? "")];
                  const template = templates[templateOptions.indexOf(values["modelo"] ?? "")];
                  if (!student || !template) throw new Error("Selecione aluno e modelo válidos.");
                  await createDocumentRequest({
                    data: {
                      studentId: student.id,
                      templateId: template.id,
                      requestNumber: values["numero"],
                      priority: values["urgencia"] === "Urgente" ? "urgent" : "normal",
                      dueOn: values["prazo"] || undefined,
                      notes: values["notas"] || undefined,
                    },
                  });
                  await queryClient.invalidateQueries({ queryKey: ["documents", "workspace"] });
                }}
                trigger={(open) => (
                  <Button
                    className="gap-2"
                    onClick={open}
                    disabled={!students.length || !templates.length}
                  >
                    <FilePlus2 className="size-4" /> Novo pedido
                  </Button>
                )}
              />
            </>
          }
        />

        {printCatalogQuery.data ? (
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {activeTemplate ? (
              <>
                Modelo activo na emissão:{" "}
                <span className="font-semibold text-foreground">{activeTemplate.title}</span>{" "}
                <code className="rounded bg-background px-1.5 py-0.5 text-[11px]">
                  {activeTemplate.key}
                </code>
                <a href="#modelos" className="ml-2 font-semibold text-primary hover:underline">
                  Alterar
                </a>
              </>
            ) : (
              <>
                Nenhum modelo global escolhido — a emissão reconhece o tipo automaticamente.{" "}
                <a href="#modelos" className="font-semibold text-primary hover:underline">
                  Escolher modelo
                </a>
              </>
            )}
          </div>
        ) : null}

        <InstalledModuleTools module="documentos" />

        <StatGrid
          collapsible
          storageKey="documentos-1"
          items={[
            {
              label: "Pedidos registados",
              value: String(documentos.length),
              hint: "Lote documental do ano lectivo",
            },
            {
              label: "Emitidos",
              value: String(emitidos.length),
              hint: "Prontos para entrega",
            },
            {
              label: "Em processamento",
              value: String(emProcessamento.length),
              hint: "Dentro do prazo",
            },
            {
              label: "Aguardam pagamento",
              value: String(pendentesPagamento.length),
              hint: "Tesouraria",
            },
          ]}
        />

        <StatGrid
          collapsible
          storageKey="documentos-2"
          items={[
            {
              label: "Taxa média",
              value: kwanza(taxaMedia),
              hint: "Média dos modelos disponíveis",
            },
            {
              label: "Cobertura de alunos",
              value: `${students.length ? Math.round((new Set(documentos.map((d) => d.aluno)).size / students.length) * 100) : 0}%`,
              hint: "Alunos com algum pedido no período",
            },
            {
              label: "Modelos activos",
              value: String(templates.length),
              hint: "Tipologias prontas para emissão",
            },
            {
              label: "Fluxo pendente",
              value: String(emProcessamento.length + pendentesPagamento.length),
              hint: "Pedidos ainda não concluídos",
            },
          ]}
        />

        <Panel
          title="Pedidos de documentos"
          description="Todos os pedidos registados na secretaria"
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
                  placeholder: "Pesquisar por aluno, tipo ou processo…",
                  "aria-label": "Pesquisar documento",
                },
                {
                  name: "estado",
                  type: "select",
                  label: "Estado",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos os estados" },
                    { value: "Emitido", label: "Emitidos" },
                    { value: "Em processamento", label: "Em processamento" },
                    { value: "Pendente de pagamento", label: "Pendentes de pagamento" },
                    { value: "Recusado", label: "Recusados" },
                    { value: "Cancelado", label: "Cancelados" },
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
                  <TableHead>Documento</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead>Processo</TableHead>
                  <TableHead>Pedido em</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acção</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-semibold">
                      <span className="flex items-center gap-2">
                        <FileCheck2 className="size-4 text-primary" />
                        {d.tipo}
                      </span>
                    </TableCell>
                    <TableCell>{d.aluno}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {d.processo}
                    </TableCell>
                    <TableCell>{new Date(d.pedidoEm).toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.responsavel}</TableCell>
                    <TableCell>
                      <span className={cn(badgeBase, estadoTone[d.estado])}>{d.estado}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {d.nextStatus ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={advancingId === d.id}
                            onClick={() => void advanceRequest(d, d.nextStatus!)}
                          >
                            {advancingId === d.id
                              ? "A actualizar…"
                              : (advanceActionLabel[d.nextStatus] ?? "Avançar")}
                          </Button>
                        ) : null}
                        {d.nextStatus ? (
                          <>
                            <ConfirmActionModal
                              title="Recusar pedido"
                              description={`Recusa o pedido de ${d.tipo} de ${d.aluno}. O aluno pode voltar a pedir.`}
                              confirmLabel="Recusar"
                              onConfirm={async () => {
                                await updateDocumentRequestStatus({
                                  data: { requestId: d.id, status: "rejected" },
                                });
                                await Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: ["documents", "workspace"],
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
                                  disabled={advancingId === d.id}
                                  onClick={open}
                                >
                                  Recusar
                                </Button>
                              )}
                            />
                            <ConfirmActionModal
                              title="Cancelar pedido"
                              description={`Cancela o pedido de ${d.tipo} de ${d.aluno}.`}
                              confirmLabel="Cancelar pedido"
                              onConfirm={async () => {
                                await updateDocumentRequestStatus({
                                  data: { requestId: d.id, status: "cancelled" },
                                });
                                await Promise.all([
                                  queryClient.invalidateQueries({
                                    queryKey: ["documents", "workspace"],
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
                                  disabled={advancingId === d.id}
                                  onClick={open}
                                >
                                  <X className="size-3.5" /> Cancelar
                                </Button>
                              )}
                            />
                          </>
                        ) : null}
                        {d.nextStatus && (resendOn || whatsappOn) ? (
                          <>
                            {resendOn ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(
                                    `Pedido de ${d.tipo} de ${d.aluno} (${d.processo}) está ${d.estado.toLowerCase()} no SIGA.`,
                                  );
                                  toast.success("Texto do pedido copiado para e-mail Resend");
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
                                    `Pedido de ${d.tipo} de ${d.aluno} está ${d.estado.toLowerCase()}.`,
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  WhatsApp
                                </a>
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {d.estado === "Emitido" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void downloadDeclaration(d)}
                            >
                              <Download className="size-3.5" /> PDF
                            </Button>
                            {resendOn ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  await navigator.clipboard.writeText(
                                    `${d.tipo} de ${d.aluno} (${d.processo}) emitido no SIGA.`,
                                  );
                                  toast.success("Texto do documento copiado para e-mail Resend");
                                }}
                              >
                                E-mail
                              </Button>
                            ) : null}
                            {whatsappOn ? (
                              <Button size="sm" variant="outline" asChild>
                                <a
                                  href={whatsappHref(
                                    "",
                                    `${d.tipo} de ${d.aluno} está pronto para levantamento.`,
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  WhatsApp
                                </a>
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {!d.nextStatus && d.estado !== "Emitido" ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {workspaceQuery.isError ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-destructive">
                      Não foi possível carregar os pedidos de documentos.
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Nenhum pedido encontrado para os filtros aplicados.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel title="Modelos disponíveis" description="Taxas e prazos de emissão">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl border border-border p-4">
                <p className="font-semibold">{template.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Prazo: {template.turnaround_days} dia(s)
                </p>
                <p className="mt-3 font-display text-xl font-extrabold text-primary">
                  {kwanza(Number(template.fee_amount))}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <PrintTemplateStudio />
      </div>
    </AppShell>
  );
}
