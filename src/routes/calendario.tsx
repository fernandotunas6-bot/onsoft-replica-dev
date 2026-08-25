import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarDays,
  Download,
  FileDown,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
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
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  type CalendarEventSummary,
  updateCalendarEvent,
} from "@/features/calendar/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { documentValidationCode } from "@/features/academic/assessment-views";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { cn } from "@/lib/utils";

const calendarioFilterDefaults = {
  q: "",
  categoria: "todas",
};

type CalendarExportRow = {
  titulo: string;
  categoria: string;
  inicio: string;
  fim: string;
  descricao: string;
};

export const Route = createFileRoute("/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário Lectivo · SIGA" },
      {
        name: "description",
        content: "Marcos e eventos do ano lectivo visíveis a toda a escola.",
      },
    ],
  }),
  component: CalendarioPage,
});

const categoryLabels: Record<string, string> = {
  academic: "Académico",
  meeting: "Reunião",
  deadline: "Prazo",
  holiday: "Feriado",
  general: "Geral",
};

function CalendarioPage() {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { selectedYearId, selectedYearLabel, school } = useSchoolSettings();
  const canManage = account.role === "Administrador" || account.role === "Secretaria";
  const installed = useInstalledIntegrations();
  const gcalOn = installed.hasCapability("gcal.subscribe");
  const appleOn = installed.hasCapability("apple.ics");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");

  const copyCalendarFeed = async (kind: "plain" | "google" | "apple") => {
    const feed = await getOrCreateCalendarFeedToken();
    const url = `${window.location.origin}/calendario/ics?token=${feed.token}`;
    await navigator.clipboard.writeText(url);
    toast.success(
      kind === "google"
        ? "Feed ICS copiado. Abra o Google Calendar e adicione por URL."
        : kind === "apple"
          ? "Feed ICS copiado. No iPhone: Definições → Calendário → Conta subscrita."
          : "Link ICS copiado. Cole no calendário do telemóvel ou do email.",
    );
    if (kind === "google") {
      window.open(
        "https://calendar.google.com/calendar/u/0/r/settings/addbyurl",
        "_blank",
        "noopener,noreferrer",
      );
    }
  };
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "calendario",
    calendarioFilterDefaults,
  );
  const query = filters.q;
  const categoria = filters.categoria;

  const eventsQuery = useQuery({
    queryKey: ["calendar", "events"],
    queryFn: () => listCalendarEvents({ data: { limit: 50 } }) as Promise<CalendarEventSummary[]>,
    retry: false,
  });

  const events = eventsQuery.data ?? [];

  const refreshCalendar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
    ]);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(
      (event) =>
        (categoria === "todas" || event.category === categoria) &&
        (!q ||
          String(event.title ?? "")
            .toLowerCase()
            .includes(q) ||
          String(event.description ?? "")
            .toLowerCase()
            .includes(q)),
    );
  }, [categoria, events, query]);

  const columns = [
    { label: "Evento", value: (row: CalendarExportRow) => row.titulo },
    { label: "Categoria", value: (row: CalendarExportRow) => row.categoria },
    { label: "Início", value: (row: CalendarExportRow) => row.inicio },
    { label: "Fim", value: (row: CalendarExportRow) => row.fim },
    { label: "Descrição", value: (row: CalendarExportRow) => row.descricao },
  ];
  const exportRows: CalendarExportRow[] = filtered.map((event) => ({
    titulo: event.title,
    categoria: categoryLabels[event.category] ?? event.category,
    inicio: event.event_date,
    fim: event.ends_on ?? "",
    descricao: event.description ?? "",
  }));
  const exportarCsv = () => exportCsv("calendario-filtrado", columns, exportRows);
  const exportarPdf = () =>
    exportPdfTable(
      "calendario-filtrado",
      "Calendário lectivo",
      columns,
      exportRows,
      `Filtros activos: ${activeCount || "nenhum"}`,
    );
  const printSchool = {
    name: school?.name ?? "Escola",
    nif: school?.nif,
    phone: school?.phone,
    email: school?.email,
    address: school?.address,
    directorName: school?.director_name,
    academicYear: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
  };

  const exportarOficial = () => {
    void issuePrintDocument({
      tipo: "Calendário lectivo",
      school: printSchool,
      overlay: overlayServico({
        name: "Calendário lectivo",
        areaLabel: "Secretaria",
        reference: `CAL-${exportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Períodos",
            rows: exportRows.map((row) => ({
              label: String(row.titulo),
              value: `${row.inicio}${row.fim ? ` → ${row.fim}` : ""}`,
              note: String(row.categoria ?? ""),
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "calendario-oficial",
          "Calendário lectivo",
          {
            schoolName: school?.name ?? "Escola",
            academicYear: printSchool.academicYear || "",
            directorName: school?.director_name ?? undefined,
            issuedOn: new Date().toLocaleDateString("pt-AO"),
            validationCode: documentValidationCode([
              school?.name,
              selectedYearLabel,
              String(exportRows.length),
            ]),
          },
          columns,
          exportRows,
        ),
    });
  };

  const printPeriod = (event: (typeof events)[number]) => {
    const inicio = new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT");
    const fim = event.ends_on
      ? new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT")
      : "—";
    void issuePrintDocument({
      tipo: "Calendário lectivo",
      school: printSchool,
      overlay: overlayServico({
        name: event.title,
        areaLabel: "Secretaria",
        reference: String(event.id),
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Período",
            rows: [
              { label: "Início", value: inicio },
              { label: "Fim", value: fim },
              {
                label: "Categoria",
                value: categoryLabels[event.category] ?? event.category,
              },
            ],
            text: event.description || "",
          },
        ],
        permissions: ["Secretaria", "Direcção"],
        term: "Período lectivo emitido a partir do calendário SIGA.",
      }),
    }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível imprimir o período."),
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Académico"
          title="Calendário Lectivo"
          description="Eventos futuros da escola — os mesmos marcos que aparecem no dashboard."
          actions={
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarCsv}
                disabled={!filtered.length}
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarPdf}
                disabled={!filtered.length}
              >
                <FileDown className="size-4" /> PDF
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarOficial}
                disabled={!filtered.length}
              >
                <Award className="size-4" /> Oficial
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() =>
                  void copyCalendarFeed("plain").catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Não foi possível criar o feed.",
                    ),
                  )
                }
              >
                <Smartphone className="size-4" /> Subscrever ICS
              </Button>
              {gcalOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    void copyCalendarFeed("google").catch((error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Não foi possível criar o feed.",
                      ),
                    )
                  }
                >
                  Google
                </Button>
              ) : null}
              {appleOn ? (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() =>
                    void copyCalendarFeed("apple").catch((error) =>
                      toast.error(
                        error instanceof Error ? error.message : "Não foi possível criar o feed.",
                      ),
                    )
                  }
                >
                  Apple
                </Button>
              ) : null}
              {canManage ? (
                <QuickFormModal
                  title="Novo período lectivo"
                  description="No SGA o calendário são períodos (terms), não eventos livres."
                  icon={<Plus className="size-5" />}
                  submitLabel="Criar período"
                  successDescription="Período lectivo criado no SGA."
                  onSubmit={async (values) => {
                    await createCalendarEvent({
                      data: {
                        title: values["nome"] ?? "",
                        eventDate: values["inicio"] ?? "",
                        endsOn: values["fim"] ?? "",
                        academicYearId: selectedYearId ?? undefined,
                        category: "academic",
                      },
                    });
                    await refreshCalendar();
                  }}
                  fields={[
                    { name: "nome", label: "Nome", placeholder: "1º Trimestre", full: true },
                    { name: "inicio", label: "Início", type: "date" },
                    { name: "fim", label: "Fim", type: "date" },
                  ]}
                  trigger={(open) => (
                    <Button className="gap-2" onClick={open}>
                      <Plus className="size-4" /> Novo período
                    </Button>
                  )}
                />
              ) : null}
            </>
          }
        />

        <InstalledModuleTools module="calendario" />

        <StatGrid collapsible storageKey="calendario"
          items={[
            {
              label: "Períodos futuros",
              value: String(events.length),
              hint: "A partir de hoje (terms)",
            },
            {
              label: "Académicos",
              value: String(events.filter((event) => event.category === "academic").length),
              hint: "Trimestres / períodos",
            },
            {
              label: "Visíveis",
              value: String(filtered.length),
              hint: activeCount ? "Com filtro activo" : "Sem filtro",
            },
            {
              label: "Gestão",
              value: canManage ? "Escrita" : "Leitura",
              hint: canManage ? "Cria períodos na tabela terms" : "Somente consulta",
            },
          ]}
        />

        <Panel
          title="Períodos lectivos"
          description="Fonte SGA: tabela terms (não eventos livres)"
          action={
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-4" /> Calendário da escola
            </span>
          }
        >
          <ListFilterBar
            className="mb-4"
            values={filters}
            activeCount={activeCount}
            onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
            onReset={resetFilters}
            fields={[
              {
                name: "q",
                placeholder: "Pesquisar período…",
                "aria-label": "Pesquisar período",
              },
              {
                name: "categoria",
                type: "select",
                label: "Categoria",
                emptyValue: "todas",
                options: [
                  { value: "todas", label: "Todas as categorias" },
                  ...Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
                ],
              },
            ]}
          />
          {eventsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar calendário…</p>
          ) : eventsQuery.isError ? (
            <p className="text-sm text-destructive">
              {eventsQuery.error instanceof Error
                ? eventsQuery.error.message
                : "Não foi possível carregar o calendário."}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem períodos futuros em <code className="font-mono">terms</code>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum período corresponde à pesquisa.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <p className="font-semibold">{event.title}</p>
                        {event.description ? (
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <span className={cn(badgeBase, toneClass.primary)}>
                          {categoryLabels[event.category] ?? event.category}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT")}
                      </TableCell>
                      <TableCell>
                        {event.ends_on
                          ? new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {whatsappOn ? (
                            <Button size="sm" variant="ghost" asChild>
                              <a
                                href={whatsappHref(
                                  "",
                                  `${event.title}: ${new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT")}${event.ends_on ? ` a ${new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT")}` : ""}`,
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
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await navigator.clipboard.writeText(
                                  `${event.title} · ${event.event_date}${event.ends_on ? ` a ${event.ends_on}` : ""}`,
                                );
                                toast.success("Período copiado para e-mail Resend");
                              }}
                            >
                              E-mail
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1.5"
                            onClick={() => printPeriod(event)}
                          >
                            <FileDown className="size-3.5" /> Imprimir
                          </Button>
                          {canManage ? (
                            <>
                              <QuickFormModal
                                title="Editar período"
                                description="Actualiza o nome e as datas deste período lectivo."
                                icon={<Pencil className="size-5" />}
                                submitLabel="Guardar"
                                successDescription="Período actualizado."
                                onSubmit={async (values) => {
                                  await updateCalendarEvent({
                                    data: {
                                      id: String(event.id),
                                      title: values["nome"] ?? "",
                                      eventDate: values["inicio"] ?? "",
                                      endsOn: values["fim"] ?? "",
                                    },
                                  });
                                  await refreshCalendar();
                                }}
                                fields={[
                                  {
                                    name: "nome",
                                    label: "Nome",
                                    defaultValue: event.title,
                                    full: true,
                                  },
                                  {
                                    name: "inicio",
                                    label: "Início",
                                    type: "date",
                                    defaultValue: String(event.event_date ?? ""),
                                  },
                                  {
                                    name: "fim",
                                    label: "Fim",
                                    type: "date",
                                    defaultValue: String(event.ends_on ?? ""),
                                  },
                                ]}
                                trigger={(open) => (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1.5"
                                    onClick={open}
                                  >
                                    <Pencil className="size-3.5" /> Editar
                                  </Button>
                                )}
                              />
                              <ConfirmActionModal
                                title="Apagar período"
                                description={`O período «${event.title}» será removido do calendário. Notas ligadas a este período impedem a operação.`}
                                confirmLabel="Apagar"
                                onConfirm={async () => {
                                  await deleteCalendarEvent({ data: { id: String(event.id) } });
                                  await refreshCalendar();
                                }}
                                trigger={(open) => (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1.5 text-destructive"
                                    onClick={open}
                                  >
                                    <Trash2 className="size-3.5" /> Apagar
                                  </Button>
                                )}
                              />
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
