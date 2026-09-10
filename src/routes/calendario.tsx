import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarDays,
  CheckSquare,
  Download,
  FileDown,
  Pencil,
  PieChart,
  Plus,
  QrCode,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { whatsappHref } from "@/features/integrations/actions";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import {
  AcademicMonthCalendar,
  initialCalendarMonth,
} from "@/features/calendar/AcademicMonthCalendar";
import { angolaHolidaysBetween, holidayOn } from "@/features/calendar/angola-holidays";
import {
  inclusiveDaysLeft,
  inclusiveRangesOverlap,
  isoInInclusiveRange,
  suggestTermEnd,
  termLifecycle,
  termLifecycleLabels,
  todayInLuanda,
  type TermLifecycle,
} from "@/features/calendar/dates";
import { getOrCreateCalendarFeedToken } from "@/features/calendar/feed";
import { calendarIcsFeedUrl, calendarWebcalFeedUrl } from "@/features/calendar/ics";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { DocHelpButton } from "@/components/ui/doc-help-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
  createAcademicYear,
  createCalendarEvent,
  deleteCalendarEvent,
  getActiveAcademicYear,
  listCalendarEvents,
  listDayAgendaLessons,
  type CalendarEventSummary,
  updateCalendarEvent,
} from "@/features/calendar/server";
import type { DayAgendaLesson } from "@/features/calendar/day-lessons";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { canAccessPath } from "@/features/auth/access-policy";
import { agendaLessonActions } from "@/features/hr/teacher-classroom-links";
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
  estado: "todos",
};

type CalendarExportRow = {
  titulo: string;
  categoria: string;
  inicio: string;
  fim: string;
  descricao: string;
};

export const Route = createFileRoute("/calendario")({
  validateSearch: (search: Record<string, unknown>): { dia?: string } => ({
    dia:
      typeof search["dia"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search["dia"])
        ? search["dia"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Calendário Lectivo · SIGA" },
      {
        name: "description",
        content: "Períodos lectivos, feriados nacionais (Luanda) e subscrição ICS.",
      },
    ],
  }),
  component: CalendarioPage,
});

function lifecycleTone(life: TermLifecycle) {
  if (life === "em_curso") return toneClass.success;
  if (life === "futuro") return toneClass.info;
  return toneClass.muted;
}

function CalendarioPage() {
  const { dia } = Route.useSearch();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { selectedYearId, selectedYearLabel, school } = useSchoolSettings();
  const canManage = account.role === "Administrador" || account.role === "Secretaria";
  const canCall = canAccessPath("/pedagogica", account.role, account.grants);
  const canQr = canAccessPath("/professor/presenca", account.role, account.grants);
  const installed = useInstalledIntegrations();
  const gcalOn = installed.hasCapability("gcal.subscribe");
  const appleOn = installed.hasCapability("apple.ics");
  const whatsappOn = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");

  const copyCalendarFeed = async (kind: "plain" | "google" | "apple") => {
    const feed = await getOrCreateCalendarFeedToken();
    const url = calendarIcsFeedUrl(window.location.origin, feed.token);
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
    if (kind === "apple") {
      window.open(calendarWebcalFeedUrl(window.location.origin, feed.token), "_blank");
    }
  };
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "calendario",
    calendarioFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const today = todayInLuanda();

  const eventsQuery = useQuery({
    queryKey: ["calendar", "events", selectedYearId],
    queryFn: () =>
      listCalendarEvents({
        data: {
          limit: 50,
          academicYearId: selectedYearId ?? undefined,
          includePast: Boolean(selectedYearId),
        },
      }) as Promise<CalendarEventSummary[]>,
    retry: false,
  });

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // Sem ano lectivo activo nada se destranca: nem períodos, nem planos de
  // propina (fee_plans.academic_year_id é NOT NULL), nem estrutura pedagógica.
  const activeYearQuery = useQuery({
    queryKey: ["calendar", "active-year"],
    queryFn: () => getActiveAcademicYear(),
    retry: false,
  });
  const activeYear = activeYearQuery.data ?? null;
  const needsAcademicYear = !activeYearQuery.isLoading && !activeYear;

  const defineAcademicYear = async (values: Record<string, string>) => {
    await createAcademicYear({
      data: {
        name: values["nome"] ?? "",
        startsOn: values["inicio"] ?? "",
        endsOn: values["fim"] ?? "",
      },
    });
    await refreshCalendar();
    await queryClient.invalidateQueries({ queryKey: ["school", "settings"] });
  };

  const refreshCalendar = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
    ]);
  };

  const createPeriod = async (values: Record<string, string>) => {
    const inicio = values["inicio"] ?? "";
    const fim = values["fim"] ?? "";
    const overlap = events.find((event) =>
      inclusiveRangesOverlap(inicio, fim, event.event_date, event.ends_on || event.event_date),
    );
    if (overlap) {
      throw new Error(`Este intervalo sobrepõe-se a «${overlap.title}».`);
    }
    await createCalendarEvent({
      data: {
        title: values["nome"] ?? "",
        eventDate: inicio,
        endsOn: fim,
        academicYearId: selectedYearId ?? undefined,
        category: "academic",
      },
    });
    await refreshCalendar();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      const life = termLifecycle(event.event_date, event.ends_on, today);
      return (
        (estado === "todos" || life === estado) &&
        (!q ||
          String(event.title ?? "")
            .toLowerCase()
            .includes(q) ||
          String(event.description ?? "")
            .toLowerCase()
            .includes(q))
      );
    });
  }, [estado, events, query, today]);

  const holidays = useMemo(() => {
    if (!events.length) {
      const year = Number(today.slice(0, 4));
      return angolaHolidaysBetween(`${year}-01-01`, `${year + 1}-12-31`);
    }
    const from = events.reduce(
      (min, event) => (event.event_date < min ? event.event_date : min),
      events[0]?.event_date ?? today,
    );
    const to = events.reduce((max, event) => {
      const end = event.ends_on || event.event_date;
      return end > max ? end : max;
    }, events[0]?.ends_on ?? today);
    return angolaHolidaysBetween(from, to);
  }, [events, today]);
  const currentTerm = events.find((event) =>
    isoInInclusiveRange(today, event.event_date, event.ends_on),
  );
  const [monthOverride, setMonthOverride] = useState<string | null>(dia ? dia.slice(0, 7) : null);
  const [selectedDay, setSelectedDay] = useState<string | null>(dia ?? today);
  useEffect(() => {
    if (!dia) return;
    setSelectedDay(dia);
    setMonthOverride(dia.slice(0, 7));
  }, [dia]);
  const jumpToDay = (day: string) => {
    setSelectedDay(day);
    setMonthOverride(day.slice(0, 7));
  };
  const suggestedEnd = suggestTermEnd(selectedDay ?? today, events);
  // Setembro→Julho é o ano lectivo padrão em Angola; a escola confirma ou ajusta.
  const suggestedYearStartYear =
    Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 9 ? 1 : 0);
  const suggestedYearName = `${suggestedYearStartYear}/${suggestedYearStartYear + 1}`;
  const suggestedYearStart = `${suggestedYearStartYear}-09-01`;
  const suggestedYearEnd = `${suggestedYearStartYear + 1}-07-31`;
  const daysLeft = currentTerm
    ? inclusiveDaysLeft(currentTerm.ends_on || currentTerm.event_date, today)
    : 0;
  const yearMonth = monthOverride ?? initialCalendarMonth(events, today);
  const monthHolidays = holidays.filter((holiday) => holiday.date.slice(0, 7) === yearMonth);
  const selectedHoliday = selectedDay ? holidayOn(selectedDay, holidays) : undefined;
  const selectedTerms = selectedDay
    ? events.filter((event) => isoInInclusiveRange(selectedDay, event.event_date, event.ends_on))
    : [];

  const dayLessonsQuery = useQuery({
    queryKey: ["calendar", "day-lessons", selectedDay],
    queryFn: () =>
      listDayAgendaLessons({
        data: { date: selectedDay!, limit: 20 },
      }) as Promise<DayAgendaLesson[]>,
    enabled: Boolean(selectedDay),
    retry: false,
    staleTime: 60_000,
  });
  const dayLessons = dayLessonsQuery.data ?? [];

  const columns = [
    { label: "Evento", value: (row: CalendarExportRow) => row.titulo },
    { label: "Estado", value: (row: CalendarExportRow) => row.categoria },
    { label: "Início", value: (row: CalendarExportRow) => row.inicio },
    { label: "Fim", value: (row: CalendarExportRow) => row.fim },
    { label: "Descrição", value: (row: CalendarExportRow) => row.descricao },
  ];
  const periodExportRows: CalendarExportRow[] = filtered.map((event) => ({
    titulo: event.title,
    categoria: termLifecycleLabels[termLifecycle(event.event_date, event.ends_on, today)],
    inicio: event.event_date,
    fim: event.ends_on ?? "",
    descricao: event.description ?? "",
  }));
  const holidayExportRows: CalendarExportRow[] = holidays.map((holiday) => ({
    titulo: holiday.name,
    categoria: "Feriado nacional",
    inicio: holiday.date,
    fim: holiday.date,
    descricao: holiday.kind === "movable" ? "Móvel" : "Fixo",
  }));
  const exportRows: CalendarExportRow[] = [...periodExportRows, ...holidayExportRows];
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
            rows: periodExportRows.map((row) => ({
              label: String(row.titulo),
              value: `${row.inicio}${row.fim ? ` → ${row.fim}` : ""}`,
              note: String(row.categoria ?? ""),
            })),
          },
          ...(holidays.length
            ? [
                {
                  title: "Feriados nacionais",
                  rows: holidays.map((holiday) => ({
                    label: holiday.name,
                    value: holiday.date,
                    note: holiday.kind === "movable" ? "Móvel" : "Fixo",
                  })),
                },
              ]
            : []),
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
                label: "Estado",
                value: termLifecycleLabels[termLifecycle(event.event_date, event.ends_on, today)],
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
          description="Períodos lectivos, feriados nacionais (Luanda) e o mesmo feed ICS do telemóvel."
          actions={
            <>
              <DocHelpButton title="Navegação — Calendário lectivo" />
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarCsv}
                disabled={!exportRows.length}
              >
                <Download className="size-4" /> CSV
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarPdf}
                disabled={!exportRows.length}
              >
                <FileDown className="size-4" /> PDF
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={exportarOficial}
                disabled={!filtered.length && !holidays.length}
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
              {canManage && needsAcademicYear ? (
                <QuickFormModal
                  title="Definir ano lectivo"
                  description="Os períodos, as turmas e os planos de propina dependem de um ano lectivo activo. A escola indica as datas — o SIGA não as inventa."
                  icon={<CalendarDays className="size-5" />}
                  submitLabel="Criar ano lectivo"
                  successDescription="Ano lectivo activo criado."
                  onSubmit={defineAcademicYear}
                  fields={[
                    {
                      name: "nome",
                      label: "Nome",
                      placeholder: suggestedYearName,
                      defaultValue: suggestedYearName,
                      full: true,
                    },
                    {
                      name: "inicio",
                      label: "Início",
                      type: "date",
                      defaultValue: suggestedYearStart,
                    },
                    { name: "fim", label: "Fim", type: "date", defaultValue: suggestedYearEnd },
                  ]}
                  trigger={(open) => (
                    <Button className="gap-2" onClick={open}>
                      <CalendarDays className="size-4" /> Definir ano lectivo
                    </Button>
                  )}
                />
              ) : null}
              {canManage && !needsAcademicYear ? (
                <QuickFormModal
                  title="Novo período lectivo"
                  description="No SGA o calendário são períodos (terms), não eventos livres."
                  icon={<Plus className="size-5" />}
                  submitLabel="Criar período"
                  successDescription="Período lectivo criado no SGA."
                  onSubmit={createPeriod}
                  fields={[
                    { name: "nome", label: "Nome", placeholder: "1º Trimestre", full: true },
                    {
                      name: "inicio",
                      label: "Início",
                      type: "date",
                      defaultValue: selectedDay ?? today,
                    },
                    {
                      name: "fim",
                      label: "Fim",
                      type: "date",
                      defaultValue: suggestedEnd,
                    },
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

        <StatGrid
          collapsible
          storageKey="calendario"
          items={[
            {
              label: "Período actual",
              value: currentTerm?.title ?? "Fora de período",
              hint: currentTerm
                ? daysLeft === 1
                  ? "Termina hoje"
                  : `${daysLeft} dias restantes`
                : today,
            },
            {
              label: "Períodos do ano",
              value: String(events.length),
              hint: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || "terms",
            },
            {
              label: "Feriados no mês",
              value: String(monthHolidays.length),
              hint: "Calendário nacional",
            },
            {
              label: "Gestão",
              value: canManage ? "Escrita" : "Leitura",
              hint: canManage ? "Cria períodos na tabela terms" : "Somente consulta",
            },
          ]}
        />

        <Panel
          title="Calendário da escola"
          description="Grelha mensal com trimestres e feriados nacionais (Africa/Luanda)"
          icon={CalendarDays}
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <AcademicMonthCalendar
              events={events}
              holidays={holidays}
              yearMonth={yearMonth}
              selectedDay={selectedDay}
              onYearMonthChange={setMonthOverride}
              onSelectDay={jumpToDay}
            />
            <aside className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {selectedDay
                  ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("pt-PT", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : "Seleccione um dia"}
              </p>
              {selectedHoliday ? (
                <p className="text-sm font-semibold text-destructive">{selectedHoliday.name}</p>
              ) : null}
              {selectedTerms.length ? (
                <ul className="space-y-1 text-sm">
                  {selectedTerms.map((event) => (
                    <li key={event.id}>
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT")}
                        {event.ends_on
                          ? ` → ${new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT")}`
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Fora de período lectivo.</p>
              )}
              {selectedDay ? (
                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Aulas do horário
                  </p>
                  {dayLessonsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">A carregar aulas…</p>
                  ) : dayLessons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Sem aulas activas neste dia da semana.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dayLessons.map((lesson) => {
                        const actions = agendaLessonActions({
                          ...lesson,
                          date: selectedDay ?? undefined,
                        });
                        return (
                          <li key={lesson.id} className="text-sm">
                            <p className="font-semibold">
                              <span className="font-mono text-xs text-muted-foreground">
                                {lesson.startsAt}
                              </span>{" "}
                              {lesson.subjectName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {lesson.classGroupName}
                              {lesson.room ? ` · ${lesson.room}` : ""}
                              {lesson.teacherName ? ` · ${lesson.teacherName}` : ""}
                            </p>
                            {actions && (canCall || canQr) ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {canCall ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="secondary"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                  >
                                    <Link to="/pedagogica" search={actions.callSearch}>
                                      <CheckSquare className="size-3" /> Chamada
                                    </Link>
                                  </Button>
                                ) : null}
                                {canCall ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                  >
                                    <Link to="/pedagogica" search={actions.gradesSearch}>
                                      <PieChart className="size-3" /> Pauta
                                    </Link>
                                  </Button>
                                ) : null}
                                {canQr ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 gap-1 px-2 text-[11px]"
                                  >
                                    <Link to="/professor/presenca" search={actions.qrSearch}>
                                      <QrCode className="size-3" /> QR
                                    </Link>
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
              {canManage && selectedTerms[0] ? (
                <QuickFormModal
                  key={`edit-${selectedTerms[0].id}`}
                  title="Editar período"
                  description="Actualiza o nome e as datas deste período lectivo."
                  icon={<Pencil className="size-5" />}
                  submitLabel="Guardar"
                  successDescription="Período actualizado."
                  onSubmit={async (values) => {
                    const inicio = values["inicio"] ?? "";
                    const fim = values["fim"] ?? "";
                    const overlap = events.find(
                      (event) =>
                        event.id !== selectedTerms[0]?.id &&
                        inclusiveRangesOverlap(
                          inicio,
                          fim,
                          event.event_date,
                          event.ends_on || event.event_date,
                        ),
                    );
                    if (overlap) {
                      throw new Error(`Este intervalo sobrepõe-se a «${overlap.title}».`);
                    }
                    await updateCalendarEvent({
                      data: {
                        id: String(selectedTerms[0].id),
                        title: values["nome"] ?? "",
                        eventDate: inicio,
                        endsOn: fim,
                      },
                    });
                    await refreshCalendar();
                  }}
                  fields={[
                    {
                      name: "nome",
                      label: "Nome",
                      defaultValue: selectedTerms[0].title,
                      full: true,
                    },
                    {
                      name: "inicio",
                      label: "Início",
                      type: "date",
                      defaultValue: String(selectedTerms[0].event_date ?? ""),
                    },
                    {
                      name: "fim",
                      label: "Fim",
                      type: "date",
                      defaultValue: String(selectedTerms[0].ends_on ?? ""),
                    },
                  ]}
                  trigger={(open) => (
                    <Button size="sm" variant="outline" className="w-full gap-2" onClick={open}>
                      <Pencil className="size-3.5" /> Editar período
                    </Button>
                  )}
                />
              ) : null}
              {canManage && selectedDay ? (
                <QuickFormModal
                  key={selectedDay}
                  title="Novo período lectivo"
                  description="As datas partem do dia seleccionado na grelha."
                  icon={<Plus className="size-5" />}
                  submitLabel="Criar período"
                  successDescription="Período lectivo criado no SGA."
                  onSubmit={createPeriod}
                  fields={[
                    { name: "nome", label: "Nome", placeholder: "1º Trimestre", full: true },
                    {
                      name: "inicio",
                      label: "Início",
                      type: "date",
                      defaultValue: selectedDay,
                    },
                    {
                      name: "fim",
                      label: "Fim",
                      type: "date",
                      defaultValue: suggestedEnd,
                    },
                  ]}
                  trigger={(open) => (
                    <Button size="sm" className="w-full gap-2" onClick={open}>
                      <Plus className="size-3.5" /> Período neste dia
                    </Button>
                  )}
                />
              ) : null}
              {monthHolidays.length ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    Feriados deste mês
                  </p>
                  <ul className="space-y-1 text-xs">
                    {monthHolidays.map((holiday) => (
                      <li key={holiday.date}>
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => jumpToDay(holiday.date)}
                        >
                          {new Date(`${holiday.date}T12:00:00`).toLocaleDateString("pt-PT", {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · {holiday.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </div>
        </Panel>

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
                name: "estado",
                type: "select",
                label: "Estado",
                emptyValue: "todos",
                options: [
                  { value: "todos", label: "Todos os estados" },
                  { value: "em_curso", label: "Em curso" },
                  { value: "futuro", label: "Próximos" },
                  { value: "concluido", label: "Concluídos" },
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
            <EmptyState
              icon={CalendarDays}
              title={
                needsAcademicYear
                  ? "A escola ainda não tem ano lectivo"
                  : "Ainda não existem períodos neste ano lectivo"
              }
              description={
                !canManage
                  ? "Peça à secretaria ou à administração para definir o ano lectivo e os períodos."
                  : needsAcademicYear
                    ? "Use «Definir ano lectivo» no topo. Sem ele não é possível criar períodos, turmas nem planos de propina."
                    : "Use «Novo período» no topo para criar trimestres ou semestres e organizar avaliações e pautas."
              }
              compact
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhum período corresponde à pesquisa"
              description="Ajuste os filtros ou limpe a pesquisa para ver todos os períodos do ano lectivo."
              compact
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead className="text-right">Acções</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((event) => (
                    <TableRow
                      key={event.id}
                      className={cn(
                        "cursor-pointer",
                        selectedTerms.some((term) => term.id === event.id) && "bg-primary/6",
                      )}
                      onClick={() => jumpToDay(event.event_date)}
                    >
                      <TableCell>
                        <p className="font-semibold">{event.title}</p>
                        {event.description ? (
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const life = termLifecycle(event.event_date, event.ends_on, today);
                          return (
                            <span className={cn(badgeBase, lifecycleTone(life))}>
                              {termLifecycleLabels[life]}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {new Date(`${event.event_date}T00:00:00`).toLocaleDateString("pt-PT")}
                      </TableCell>
                      <TableCell>
                        {event.ends_on
                          ? new Date(`${event.ends_on}T00:00:00`).toLocaleDateString("pt-PT")
                          : "—"}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
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
                                  const inicio = values["inicio"] ?? "";
                                  const fim = values["fim"] ?? "";
                                  const overlap = events.find(
                                    (other) =>
                                      other.id !== event.id &&
                                      inclusiveRangesOverlap(
                                        inicio,
                                        fim,
                                        other.event_date,
                                        other.ends_on || other.event_date,
                                      ),
                                  );
                                  if (overlap) {
                                    throw new Error(
                                      `Este intervalo sobrepõe-se a «${overlap.title}».`,
                                    );
                                  }
                                  await updateCalendarEvent({
                                    data: {
                                      id: String(event.id),
                                      title: values["nome"] ?? "",
                                      eventDate: inicio,
                                      endsOn: fim,
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
