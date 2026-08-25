import { useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Award,
  Download,
  FileDown,
  Mail,
  MessageSquare,
  Monitor,
  Pencil,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, Panel, StatGrid, badgeBase, toneClass } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/modals/ConfirmActionModal";
import { QuickFormModal } from "@/components/modals/QuickFormModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { PickFileButton } from "@/features/arquivos/PickFileButton";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { documentValidationCode } from "@/features/academic/assessment-views";
import {
  announcementAudienceOptions,
  announcementChannelOptions,
  announcementStatusOptions,
} from "@/features/communications/schemas";
import {
  archiveSchoolAnnouncement,
  createSchoolAnnouncement,
  listSchoolAnnouncements,
  updateSchoolAnnouncement,
  updateSchoolAnnouncementStatus,
} from "@/features/communications/server";
import { exportCsv } from "@/lib/export-csv";
import { exportOfficialPautaPdf, exportPdfTable } from "@/lib/export-pdf-loader";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { ListFilterBar } from "@/components/filters/ListFilterBar";
import { usePersistedListFilters } from "@/lib/list-filters";
import { cn } from "@/lib/utils";

const comunicacoesFilterDefaults = {
  q: "",
  estado: "todos",
  canal: "todos",
};

export const Route = createFileRoute("/comunicacoes")({
  head: () => ({
    meta: [
      { title: "Comunicações · SIGA" },
      {
        name: "description",
        content:
          "Envie comunicados por SMS, e-mail ou portal para encarregados, alunos e professores da escola.",
      },
      { property: "og:title", content: "Comunicações · SIGA" },
      {
        property: "og:description",
        content: "Comunicados enviados, agendados e rascunhos num único painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComunicacoesPage,
});

type Audience = (typeof announcementAudienceOptions)[number];
type Channel = (typeof announcementChannelOptions)[number];
type Status = (typeof announcementStatusOptions)[number];
type AnnouncementStatus = Status | "cancelled";
type AnnouncementExportRow = {
  titulo: string;
  destino: string;
  canal: string;
  estado: string;
  data: string;
};

const canalIcon = {
  sms: MessageSquare,
  email: Mail,
  portal: Monitor,
} as const;

const canalLabel: Record<Channel, string> = {
  sms: "SMS",
  email: "E-mail",
  portal: "Portal",
};

const estadoTone: Record<string, string> = {
  sent: toneClass.success,
  scheduled: toneClass.info,
  draft: toneClass.muted,
  cancelled: toneClass.muted,
};

const estadoLabel: Record<string, string> = {
  sent: "Enviado",
  scheduled: "Agendado",
  draft: "Rascunho",
  cancelled: "Arquivado",
};

const audienceLabel: Record<Audience, string> = {
  school: "Toda a escola",
};

const audienceOptions: Array<{ value: Audience; label: string }> = (
  Object.entries(audienceLabel) as Array<[Audience, string]>
).map(([value, label]) => ({ value, label }));

function readAnnouncementForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    title: String(data.get("titulo") ?? ""),
    body: String(data.get("mensagem") ?? ""),
    audience: String(data.get("destino") ?? "school") as Audience,
    channel: String(data.get("canal") ?? "portal") as Channel,
    scheduledFor: String(data.get("agendar") || "") || undefined,
  };
}

function ComunicacoesPage() {
  const queryClient = useQueryClient();
  const account = useCurrentAccount();
  const { selectedYearLabel, school } = useSchoolSettings();
  const canManage = account.role === "Administrador" || account.role === "Secretaria";
  const installed = useInstalledIntegrations();
  const whatsappNotices = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const zoomInvites = installed.hasCapability("zoom.notices");
  const outlookOn = installed.hasCapability("m365.outlook");
  const formRef = useRef<HTMLFormElement>(null);
  const [draftAttachment, setDraftAttachment] = useState<string | null>(null);
  const { filters, setFilter, resetFilters, activeCount } = usePersistedListFilters(
    "comunicacoes",
    comunicacoesFilterDefaults,
  );
  const query = filters.q;
  const estado = filters.estado;
  const canal = filters.canal;

  const announcementsQuery = useQuery({
    queryKey: ["communications", "announcements"],
    queryFn: () => listSchoolAnnouncements({ data: { limit: 50 } }),
    retry: false,
  });

  const items = announcementsQuery.data ?? [];
  const migrationMissing =
    announcementsQuery.isError &&
    announcementsQuery.error instanceof Error &&
    /schema cache|does not exist|announcements|school_announcements|42P01|PGRST/i.test(
      announcementsQuery.error.message,
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const channel = String(item.channel ?? "");
      const status = String(item.status ?? "");
      return (
        (estado === "todos" || status === estado) &&
        (canal === "todos" || channel === canal) &&
        (!q ||
          String(item.title ?? "")
            .toLowerCase()
            .includes(q) ||
          String(item.body ?? "")
            .toLowerCase()
            .includes(q))
      );
    });
  }, [canal, estado, items, query]);

  const enviados = items.filter((item) => item.status === "sent");
  const agendados = items.filter((item) => item.status === "scheduled");
  const rascunhos = items.filter((item) => item.status === "draft");
  const exportRows: AnnouncementExportRow[] = filtered.map((item) => {
    const channel = item.channel as Channel;
    const status = item.status as AnnouncementStatus;
    const audience = item.audience as Audience;
    return {
      titulo: item.title,
      destino: audienceLabel[audience] ?? item.audience,
      canal: canalLabel[channel] ?? item.channel,
      estado: estadoLabel[status] ?? item.status,
      data:
        status === "scheduled" && item.scheduled_for
          ? item.scheduled_for
          : (item.published_at ?? item.created_at)?.slice(0, 10),
    };
  });
  const columns = [
    { label: "Título", value: (row: AnnouncementExportRow) => row.titulo },
    { label: "Destino", value: (row: AnnouncementExportRow) => row.destino },
    { label: "Canal", value: (row: AnnouncementExportRow) => row.canal },
    { label: "Estado", value: (row: AnnouncementExportRow) => row.estado },
    { label: "Data", value: (row: AnnouncementExportRow) => row.data },
  ];
  const exportarCsv = () => exportCsv("comunicados-filtrados", columns, exportRows);
  const exportarPdf = () =>
    exportPdfTable(
      "comunicados-filtrados",
      "Comunicados",
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

  const printAnnouncement = async (item: {
    title: string;
    body?: string | null;
    audience?: string;
    channel?: string;
    status?: string;
  }) => {
    await issuePrintDocument({
      tipo: "Comunicado escolar",
      school: printSchool,
      overlay: overlayServico({
        name: item.title || "Comunicado",
        areaLabel: "Comunicações",
        reference: item.title || "COM",
        status: estadoLabel[(item.status as Status) ?? "draft"] ?? item.status ?? "Rascunho",
        parties: [
          {
            label: "Audiência",
            value: audienceLabel[(item.audience as Audience) ?? "school"] ?? "Escola",
          },
          { label: "Canal", value: canalLabel[(item.channel as Channel) ?? "portal"] ?? "Portal" },
        ],
        sections: [{ title: "Mensagem", text: String(item.body ?? "Sem texto.") }],
        permissions: ["Secretaria", "Direcção"],
        term: "Comunicado institucional emitido pela secretaria da escola.",
      }),
    });
  };

  const exportarOficial = () => {
    void issuePrintDocument({
      tipo: "Comunicados da escola",
      school: printSchool,
      overlay: overlayServico({
        name: "Comunicados da escola",
        areaLabel: "Comunicações",
        reference: `COM-${exportRows.length}`,
        status: "Oficial",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [
          {
            title: "Lista",
            rows: exportRows.map((row) => ({
              label: String(row.titulo),
              value: `${row.canal} · ${row.estado}`,
              note: String(row.data ?? ""),
            })),
          },
        ],
      }),
      fallback: () =>
        exportOfficialPautaPdf(
          "comunicados-oficial",
          "Comunicados da escola",
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

  const abrirFormulario = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(
      () => formRef.current?.querySelector<HTMLInputElement>("#titulo")?.focus(),
      300,
    );
  };

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["communications", "announcements"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] }),
    ]);
  };

  const saveAnnouncement = async (
    form: HTMLFormElement,
    status: Extract<Status, "sent" | "draft" | "scheduled">,
  ) => {
    if (!canManage) return;
    const values = readAnnouncementForm(form);
    try {
      await createSchoolAnnouncement({
        data: {
          ...values,
          status,
          scheduledFor: status === "scheduled" ? values.scheduledFor : undefined,
        },
      });
      form.reset();
      setDraftAttachment(null);
      await invalidate();
      if (status === "sent" && values.channel === "email" && resendOn) {
        await navigator.clipboard.writeText(`${values.title}\n\n${values.body}`);
      }
      toast.success(
        status === "sent"
          ? "Comunicado registado como enviado"
          : status === "scheduled"
            ? "Comunicado agendado"
            : "Rascunho guardado",
        {
          description:
            status === "sent"
              ? values.channel === "email" && resendOn
                ? "Texto copiado para envio Resend."
                : whatsappNotices
                  ? "Use WhatsApp nos cartões publicados para partilhar."
                  : "Registo interno guardado."
              : undefined,
        },
      );
    } catch (error) {
      toast.error("Não foi possível guardar o comunicado", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const onSubmitSent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void saveAnnouncement(event.currentTarget, "sent");
  };

  const onSaveDraftOrSchedule = () => {
    const form = formRef.current;
    if (!form) return;
    if (!form.reportValidity()) return;
    const scheduledFor = readAnnouncementForm(form).scheduledFor;
    void saveAnnouncement(form, scheduledFor ? "scheduled" : "draft");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          group="Gestão e Comunicação"
          title="Comunicações"
          description="Comunicados institucionais para encarregados, alunos e corpo docente."
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
              <PickFileButton
                area="escola"
                onPick={(file) =>
                  toast.success(file.name, {
                    description: "Ficheiro da biblioteca para o comunicado.",
                  })
                }
              />
              {canManage && !migrationMissing ? (
                <Button className="gap-2" onClick={abrirFormulario}>
                  <Send className="size-4" /> Novo comunicado
                </Button>
              ) : null}
            </>
          }
        />

        <InstalledModuleTools module="comunicacoes" />

        <StatGrid collapsible storageKey="comunicacoes"
          items={[
            {
              label: "Comunicados",
              value: migrationMissing ? "—" : String(items.length),
              hint: migrationMissing ? "Migração pendente" : "Registos na escola",
            },
            {
              label: "Enviados",
              value: String(enviados.length),
              hint: "Publicados nos canais activos",
            },
            {
              label: "Agendados",
              value: String(agendados.length),
              hint: "Aguardam data programada",
            },
            {
              label: "Rascunhos",
              value: String(rascunhos.length),
              hint: "Conteúdos ainda em revisão",
            },
          ]}
        />

        {migrationMissing ? (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-4 text-sm">
            <p className="font-semibold">Migração de comunicações ainda não aplicada</p>
            <p className="mt-1 text-muted-foreground">
              A tabela <code className="font-mono">announcements</code> não está acessível neste
              projecto SGA. Os comunicados internos só funcionam quando o schema estiver disponível.
            </p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Histórico" description="Comunicados criados na escola">
            <ListFilterBar
              className="mb-4"
              values={filters}
              activeCount={activeCount}
              onChange={(name, value) => setFilter(name as keyof typeof filters, value)}
              onReset={resetFilters}
              fields={[
                {
                  name: "q",
                  placeholder: "Pesquisar assunto ou mensagem…",
                  "aria-label": "Pesquisar comunicado",
                },
                {
                  name: "estado",
                  type: "select",
                  label: "Estado",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos os estados" },
                    { value: "sent", label: "Enviado" },
                    { value: "scheduled", label: "Agendado" },
                    { value: "draft", label: "Rascunho" },
                    { value: "cancelled", label: "Arquivado" },
                  ],
                },
                {
                  name: "canal",
                  type: "select",
                  label: "Canal",
                  emptyValue: "todos",
                  options: [
                    { value: "todos", label: "Todos os canais" },
                    { value: "portal", label: "Portal" },
                    { value: "email", label: "E-mail" },
                    { value: "sms", label: "SMS" },
                  ],
                },
              ]}
            />
            {announcementsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">A carregar comunicados…</p>
            ) : announcementsQuery.isError && !migrationMissing ? (
              <p className="text-sm text-destructive">
                {announcementsQuery.error instanceof Error
                  ? announcementsQuery.error.message
                  : "Não foi possível carregar os comunicados."}
              </p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ainda não há comunicados.{canManage ? " Redija o primeiro à direita." : null}
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum comunicado corresponde aos filtros aplicados.
              </p>
            ) : (
              <ul className="space-y-4">
                {filtered.map((c) => {
                  const channel = c.channel as Channel;
                  const status = c.status as AnnouncementStatus;
                  const audience = c.audience as Audience;
                  const Icon = canalIcon[channel] ?? Monitor;
                  return (
                    <li key={c.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
                            <Icon className="size-4" />
                          </span>
                          <div>
                            <p className="font-semibold">{c.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {audienceLabel[audience] ?? c.audience} ·{" "}
                              {canalLabel[channel] ?? c.channel} ·{" "}
                              {status === "scheduled" && c.scheduled_for
                                ? `Agendado para ${new Date(
                                    `${c.scheduled_for}T00:00:00`,
                                  ).toLocaleDateString("pt-PT")}`
                                : status === "sent" && c.published_at
                                  ? new Date(c.published_at).toLocaleDateString("pt-PT")
                                  : new Date(c.created_at).toLocaleDateString("pt-PT")}
                            </p>
                            {whatsappNotices || resendOn || zoomInvites || outlookOn ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {whatsappNotices ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      const text = `${c.title}\n\n${c.body}`;
                                      await navigator.clipboard.writeText(text);
                                      window.open(
                                        `https://wa.me/?text=${encodeURIComponent(text)}`,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                      toast.success("Mensagem pronta no WhatsApp");
                                    }}
                                  >
                                    WhatsApp
                                  </Button>
                                ) : null}
                                {resendOn ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(
                                        `${c.title}\n\n${c.body}`,
                                      );
                                      toast.success("Texto copiado para envio Resend");
                                    }}
                                  >
                                    E-mail Resend
                                  </Button>
                                ) : null}
                                {outlookOn ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      const body = `${c.title}\n\n${c.body}`;
                                      await navigator.clipboard.writeText(body);
                                      window.open(
                                        `mailto:?subject=${encodeURIComponent(c.title)}&body=${encodeURIComponent(c.body)}`,
                                      );
                                      toast.success("Texto copiado para Outlook");
                                    }}
                                  >
                                    Outlook
                                  </Button>
                                ) : null}
                                {zoomInvites ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      await navigator.clipboard.writeText(
                                        `${c.title}\n${c.body}\n\nSala: instale o horário Zoom na Pedagógica.`,
                                      );
                                      toast.success("Convite copiado");
                                    }}
                                  >
                                    Convite Zoom
                                  </Button>
                                ) : null}
                              </div>
                            ) : null}
                            {canManage ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {status === "draft" || status === "scheduled" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        await updateSchoolAnnouncementStatus({
                                          data: { id: c.id, status: "sent" },
                                        });
                                        await invalidate();
                                        toast.success("Comunicado marcado como enviado");
                                      } catch (error) {
                                        toast.error("Falha ao actualizar", {
                                          description:
                                            error instanceof Error
                                              ? error.message
                                              : "Tente novamente.",
                                        });
                                      }
                                    }}
                                  >
                                    {status === "scheduled" ? "Publicar agora" : "Marcar enviado"}
                                  </Button>
                                ) : null}
                                {status === "cancelled" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        await updateSchoolAnnouncementStatus({
                                          data: { id: c.id, status: "sent" },
                                        });
                                        await invalidate();
                                        toast.success("Comunicado republicado no dashboard");
                                      } catch (error) {
                                        toast.error("Falha ao republicar", {
                                          description:
                                            error instanceof Error
                                              ? error.message
                                              : "Tente novamente.",
                                        });
                                      }
                                    }}
                                  >
                                    Republicar
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5"
                                  onClick={() => void printAnnouncement(c)}
                                >
                                  <FileDown className="size-3.5" /> Imprimir
                                </Button>
                                {status !== "cancelled" ? (
                                  <>
                                    <QuickFormModal
                                      title="Editar comunicado"
                                      description="Actualiza o assunto e o texto. O estado não muda."
                                      icon={<Pencil className="size-5" />}
                                      submitLabel="Guardar"
                                      successDescription="Comunicado actualizado."
                                      onSubmit={async (values) => {
                                        await updateSchoolAnnouncement({
                                          data: {
                                            id: c.id,
                                            title: values["titulo"] ?? "",
                                            body: values["mensagem"] ?? "",
                                          },
                                        });
                                        await invalidate();
                                      }}
                                      fields={[
                                        {
                                          name: "titulo",
                                          label: "Assunto",
                                          defaultValue: c.title,
                                          full: true,
                                        },
                                        {
                                          name: "mensagem",
                                          label: "Mensagem",
                                          type: "textarea",
                                          defaultValue: String(c.body ?? ""),
                                          full: true,
                                        },
                                      ]}
                                      trigger={(open) => (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="gap-1.5"
                                          onClick={open}
                                        >
                                          <Pencil className="size-3.5" /> Editar
                                        </Button>
                                      )}
                                    />
                                    <ConfirmActionModal
                                      title="Arquivar comunicado"
                                      description={`«${c.title}» deixa de aparecer no dashboard.`}
                                      confirmLabel="Arquivar"
                                      onConfirm={async () => {
                                        await archiveSchoolAnnouncement({ data: { id: c.id } });
                                        await invalidate();
                                      }}
                                      trigger={(open) => (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="gap-1.5 text-destructive"
                                          onClick={open}
                                        >
                                          <Archive className="size-3.5" /> Arquivar
                                        </Button>
                                      )}
                                    />
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <span className={cn(badgeBase, estadoTone[status] ?? toneClass.muted)}>
                          {estadoLabel[status] ?? c.status}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Redigir comunicado"
            description={
              canManage
                ? "Registo interno — envio SMS/e-mail externo ainda não ligado"
                : "Somente leitura para o seu perfil"
            }
          >
            {!canManage ? (
              <p className="text-sm text-muted-foreground">
                Apenas Administrador e Secretaria podem criar ou alterar comunicados.
              </p>
            ) : migrationMissing ? (
              <p className="text-sm text-muted-foreground">
                Aplique a migração para activar a redacção de comunicados.
              </p>
            ) : (
              <form ref={formRef} className="space-y-4" onSubmit={onSubmitSent}>
                <div className="space-y-2">
                  <Label htmlFor="titulo">Assunto</Label>
                  <Input
                    id="titulo"
                    name="titulo"
                    placeholder="Ex.: Reunião de encarregados"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="destino">Destinatários</Label>
                  <select
                    id="destino"
                    name="destino"
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="school"
                  >
                    {audienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="canal">Canal</Label>
                  <select
                    id="canal"
                    name="canal"
                    required
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="portal"
                  >
                    <option value="sms">SMS</option>
                    <option value="email">E-mail</option>
                    <option value="portal">Portal</option>
                  </select>
                  {resendOn || whatsappNotices ? (
                    <p className="text-xs text-muted-foreground">
                      {resendOn ? "Canal E-mail: texto copiado para Resend ao publicar. " : ""}
                      {whatsappNotices ? "Use WhatsApp nos cartões depois de publicar." : ""}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agendar">Agendar para (opcional)</Label>
                  <Input id="agendar" name="agendar" type="date" />
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="mensagem">Mensagem</Label>
                    <PickFileButton
                      label={draftAttachment ? "Trocar anexo" : "Anexar arquivo"}
                      area="escola"
                      variant="outline"
                      size="sm"
                      onPick={(file) => {
                        const line = `\n\n[Arquivo SIGA] ${file.name}`;
                        const textarea =
                          formRef.current?.querySelector<HTMLTextAreaElement>("#mensagem");
                        if (textarea) {
                          const next = `${textarea.value.trimEnd()}${line}`.slice(0, 4000);
                          textarea.value = next;
                          textarea.dispatchEvent(new Event("input", { bubbles: true }));
                        }
                        setDraftAttachment(file.name);
                        toast.success("Referência do ficheiro adicionada à mensagem", {
                          description: file.name,
                        });
                      }}
                    />
                  </div>
                  {draftAttachment ? (
                    <p className="text-xs text-muted-foreground">Anexo: {draftAttachment}</p>
                  ) : null}
                  <Textarea
                    id="mensagem"
                    name="mensagem"
                    rows={5}
                    placeholder="Escreva a mensagem…"
                    required
                    minLength={2}
                    maxLength={4000}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="submit" className="w-full gap-2">
                    <Send className="size-4" /> Registar como enviado
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={onSaveDraftOrSchedule}
                  >
                    Guardar rascunho / agendar
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
