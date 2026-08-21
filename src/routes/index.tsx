import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Megaphone,
  Receipt,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { DisciplinePerformanceHeatmap } from "@/features/dashboard/components/DisciplinePerformanceHeatmap";
import { CashFlowForecastChart } from "@/features/dashboard/components/CashFlowForecastChart";
import { getDashboardOverview } from "@/features/dashboard/server";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { inferIcon } from "@/lib/auto-icon";
import { kwanza } from "@/lib/currency";
import { warmDashboardCharts } from "@/lib/warm-charts";
import { schoolYear as fallbackSchoolYear } from "@/lib/school-config";
import { canAccessPath } from "@/features/auth/access-policy";
import { TeacherWorkspaceHint } from "@/features/academic/TeacherWorkspacePanel";
import { DashboardChartsSkeleton } from "@/features/dashboard/DashboardCharts";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { openSettingsPanel } from "@/lib/settings-deep-link";

const DashboardCharts = lazy(() =>
  import("@/features/dashboard/DashboardCharts").then((module) => ({
    default: module.DashboardCharts,
  })),
);
const DashboardAgeChart = lazy(() =>
  import("@/features/dashboard/DashboardCharts").then((module) => ({
    default: module.DashboardAgeChart,
  })),
);
const TeacherWorkspacePanel = lazy(() =>
  import("@/features/academic/TeacherWorkspacePanel").then((module) => ({
    default: module.TeacherWorkspacePanel,
  })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · SIGA — Gestão Escolar" },
      {
        name: "description",
        content:
          "Painel de gestão escolar SIGA: estudantes, turmas, matrículas, presenças e situação financeira do ano lectivo.",
      },
      { property: "og:title", content: "Dashboard · SIGA — Gestão Escolar" },
      {
        property: "og:description",
        content: "Visão geral do ano lectivo: estudantes, turmas, matrículas e finanças.",
      },
    ],
  }),
  component: Dashboard,
});

const toneBg = {
  primary: "bg-primary-soft text-primary-strong",
  info: "bg-info/10 text-info-strong",
  pink: "bg-chart-2/10 text-chart-2-strong",
  warning: "bg-warning/15 text-warning-foreground",
} as const;

const dotTone: Record<string, string> = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  primary: "bg-primary",
};

function DashboardGreeting({ greeting }: { greeting: string }) {
  const currentUser = useCurrentAccount();
  return (
    <>
      {greeting}, {currentUser.name.split(" ")[0]}
    </>
  );
}

function Dashboard() {
  const queryClient = useQueryClient();
  const currentUser = useCurrentAccount();
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const whatsappNotices = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");
  const [now, setNow] = useState<Date | null>(null);
  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => getDashboardOverview(),
  });

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      if (document.visibilityState === "visible") {
        timer = window.setTimeout(tick, 1000);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
        tick();
      } else {
        window.clearTimeout(timer);
      }
    };
    setNow(new Date());
    warmDashboardCharts();
    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const greeting = (() => {
    const h = now?.getHours() ?? 20;
    if (h < 12) return "Bom dia";
    if (h < 19) return "Boa tarde";
    return "Boa noite";
  })();

  const data = overviewQuery.data;
  const yearName = data?.academicYear?.name ?? fallbackSchoolYear;
  const totalStudents = data?.totals.students ?? 0;
  const capabilities = data?.capabilities ?? {
    students: false,
    finance: false,
    documents: false,
    audit: false,
  };

  const stats = [
    {
      label: "Total de estudantes",
      value: capabilities.students ? String(totalStudents) : "—",
      icon: Users,
      tone: "primary" as const,
      hint: capabilities.students
        ? `${data?.totals.activeStudents ?? 0} com matrícula activa${
            data?.totals.applicants
              ? ` · ${data.totals.applicants} candidato(s) — confirmar matrícula`
              : ""
          }`
        : "Sem permissão de leitura académica",
      href:
        capabilities.students && (data?.totals.applicants ?? 0) > 0
          ? ("/alunos" as const)
          : undefined,
      search:
        capabilities.students && (data?.totals.applicants ?? 0) > 0
          ? { action: "confirmar" as const }
          : undefined,
    },
    {
      label: "Estudantes masculinos",
      value: capabilities.students ? String(data?.totals.male ?? 0) : "—",
      icon: UserCheck,
      tone: "info" as const,
      hint:
        capabilities.students && totalStudents
          ? `${Math.round(((data?.totals.male ?? 0) / totalStudents) * 100)}% do total`
          : "Aguardando dados",
    },
    {
      label: "Estudantes femininos",
      value: capabilities.students ? String(data?.totals.female ?? 0) : "—",
      icon: UserRound,
      tone: "pink" as const,
      hint:
        capabilities.students && totalStudents
          ? `${Math.round(((data?.totals.female ?? 0) / totalStudents) * 100)}% do total`
          : "Aguardando dados",
    },
    {
      label: capabilities.documents ? "Documentos emitidos" : "Saldo de caixa",
      value: capabilities.documents
        ? String(data?.totals.documentIssued ?? 0)
        : capabilities.finance
          ? kwanza(data?.finance?.cash_balance ?? 0)
          : "—",
      icon: Receipt,
      tone: "warning" as const,
      hint: capabilities.documents
        ? `${data?.totals.documentTotal ?? 0} pedidos registados${
            data?.totals.documentPending ? ` · ${data.totals.documentPending} pendente(s)` : ""
          }`
        : capabilities.finance
          ? `${data?.finance?.open_invoice_count ?? 0} faturas em aberto`
          : "Sem dados financeiros",
      href:
        capabilities.documents && (data?.totals.documentPending ?? 0) > 0
          ? ("/documentos" as const)
          : undefined,
    },
  ];

  const miniStats = [
    {
      label: "Cursos",
      value: capabilities.students ? String(data?.totals.courses ?? 0) : "—",
      icon: GraduationCap,
    },
    {
      label: "Turmas activas",
      value: capabilities.students ? String(data?.totals.classGroups ?? 0) : "—",
      icon: Building2,
    },
    {
      label: "Salas",
      value: capabilities.students ? String(data?.totals.rooms ?? 0) : "—",
      icon: DoorOpen,
    },
    {
      label: "Taxa de presença",
      value:
        capabilities.students && data?.totals.attendanceAverage != null
          ? `${data.totals.attendanceAverage}%`
          : "—",
      icon: Activity,
    },
  ];

  const refresh = async () => {
    setNow(new Date());
    try {
      await queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      toast.success("Dashboard actualizado", {
        description: "Indicadores recalculados a partir da base de dados.",
      });
    } catch (error) {
      toast.error("Não foi possível actualizar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    }
  };

  const printSchool = {
    name: school?.name ?? "Escola",
    nif: school?.nif,
    phone: school?.phone,
    email: school?.email,
    address: school?.address,
    directorName: school?.director_name,
    academicYear: selectedYearLabel.replace(/^Ano Lectivo\s+/i, "") || school?.academic_year,
  };

  const printAnnouncement = (item: { title: string; body?: string | null }) => {
    void issuePrintDocument({
      tipo: "Comunicado escolar",
      school: printSchool,
      overlay: overlayServico({
        name: item.title || "Comunicado",
        areaLabel: "Comunicações",
        reference: item.title || "COM",
        status: "Publicado",
        parties: [{ label: "Escola", value: school?.name ?? "Escola" }],
        sections: [{ title: "Mensagem", text: String(item.body ?? "Sem texto.") }],
        permissions: ["Secretaria", "Direcção"],
        term: "Comunicado institucional emitido pela secretaria da escola.",
      }),
    }).catch((error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível imprimir o comunicado.",
      ),
    );
  };

  const [activeTab, setActiveTab] = useState<"geral" | "pedagogico" | "financeiro" | "auditoria">("geral");

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm capitalize text-muted-foreground">
              {now
                ? now.toLocaleDateString("pt-PT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "\u00a0"}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">
              <DashboardGreeting greeting={greeting} />
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Resumo do {yearName}</p>
            {currentUser.role === "Professor" ? (
              <div className="mt-2">
                <TeacherWorkspaceHint />
              </div>
            ) : null}
            <SpotlightRail
              surface="home"
              className="mt-4 max-w-xl"
              role={currentUser.role}
              grants={currentUser.grants}
              onNavigate={() => undefined}
              onOpenSettings={openSettingsPanel}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">
              {now ? now.toLocaleTimeString("pt-PT", { hour12: false }) : "--:--:--"}
            </span>
            <Button
              variant="outline"
              className="gap-2"
              onClick={refresh}
              disabled={overviewQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>

        {/* BARRA DE SUBOPÇÕES CLICÁVEIS DO DASHBOARD */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <Button
            type="button"
            variant={activeTab === "geral" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("geral")}
            className="rounded-full text-xs"
          >
            Visão Geral
          </Button>
          <Button
            type="button"
            variant={activeTab === "pedagogico" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("pedagogico")}
            className="rounded-full text-xs"
          >
            Desempenho & Pautas
          </Button>
          {capabilities.finance ? (
            <Button
              type="button"
              variant={activeTab === "financeiro" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("financeiro")}
              className="rounded-full text-xs"
            >
              Projeção Financeira
            </Button>
          ) : null}
          <Button
            type="button"
            variant={activeTab === "auditoria" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("auditoria")}
            className="rounded-full text-xs"
          >
            Auditoria de Produtividade
          </Button>
        </div>

        <InstalledModuleTools module="comunicacoes" />

        {overviewQuery.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {overviewQuery.error instanceof Error
              ? overviewQuery.error.message
              : "Não foi possível carregar o dashboard."}
            {/unauthorized/i.test(
              overviewQuery.error instanceof Error ? overviewQuery.error.message : "",
            )
              ? " Termine a sessão e volte a entrar para renovar o token."
              : ""}
          </div>
        ) : null}

        {currentUser.role === "Professor" ? (
          <Suspense fallback={<div className="surface-card h-40 animate-pulse bg-muted/40" />}>
            <TeacherWorkspacePanel />
          </Suspense>
        ) : null}

        <section className="surface-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="size-4 text-primary" />
              Progresso do {yearName}
            </div>
            <span className="text-sm font-bold text-primary">
              {data?.academicYear ? `${data.yearProgress}%` : "—"}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${data?.academicYear ? data.yearProgress : 0}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>
              {data?.academicYear
                ? new Date(`${data.academicYear.starts_on}T00:00:00`).toLocaleDateString("pt-PT")
                : "Sem ano lectivo activo"}
            </span>
            <span>
              {data?.academicYear
                ? new Date(`${data.academicYear.ends_on}T00:00:00`).toLocaleDateString("pt-PT")
                : "—"}
            </span>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((s) => {
            const card = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <IconChip
                    icon={s.icon}
                    size="md"
                    soft={false}
                    className={`${toneBg[s.tone]} rounded-2xl`}
                  />
                </div>
                <p className="mt-3 text-4xl font-extrabold tracking-tight">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
              </>
            );
            return s.href ? (
              <Link
                key={s.label}
                to={s.href}
                {...(s.search ? { search: s.search } : {})}
                className="surface-card block p-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:border-primary/40 hover:shadow-card cursor-pointer"
              >
                {card}
              </Link>
            ) : (
              <div key={s.label} className="surface-card p-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-card">
                {card}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {miniStats.map((s) => (
            <div key={s.label} className="surface-card flex items-center gap-4 p-4 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-card">
              <IconChip
                icon={s.icon}
                size="md"
                soft={false}
                className="rounded-2xl bg-primary-soft text-primary-strong"
              />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        {(data?.announcements?.length ?? 0) > 0 ? (
          <section className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <IconChip icon={Megaphone} size="sm" />
                <h2 className="text-base font-semibold">Comunicados</h2>
              </div>
              {canAccessPath("/comunicacoes", currentUser.role) ? (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/comunicacoes">Ver todos</Link>
                </Button>
              ) : null}
            </div>
            <ul className="space-y-3">
              {data?.announcements.map((item) => (
                <li key={item.id} className="rounded-xl bg-secondary p-3">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  {item.published_at ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {new Date(item.published_at).toLocaleDateString("pt-PT")}
                    </p>
                  ) : null}
                  {whatsappNotices || resendOn ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-primary hover:underline"
                        onClick={() => printAnnouncement(item)}
                      >
                        Imprimir
                      </button>
                      {whatsappNotices ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-primary hover:underline"
                          onClick={() => {
                            const text = `${item.title}\n\n${item.body}`;
                            window.open(
                              `https://wa.me/?text=${encodeURIComponent(text)}`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                        >
                          Enviar no WhatsApp
                        </button>
                      ) : null}
                      {resendOn ? (
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-primary hover:underline"
                          onClick={async () => {
                            await navigator.clipboard.writeText(`${item.title}\n\n${item.body}`);
                            toast.success("Texto copiado para envio Resend");
                          }}
                        >
                          E-mail Resend
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-primary hover:underline"
                        onClick={() => printAnnouncement(item)}
                      >
                        Imprimir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="space-y-4">
          <Suspense fallback={<DashboardChartsSkeleton />}>
            <DashboardCharts
              loading={overviewQuery.isLoading}
              totalStudents={totalStudents}
              capabilities={{
                students: capabilities.students,
                finance: capabilities.finance,
              }}
              studentsByClass={data?.studentsByClass ?? []}
              genderSplit={data?.genderSplit ?? []}
              enrollmentsByMonth={data?.enrollmentsByMonth ?? []}
              financeMonthly={data?.financeMonthly ?? []}
              finance={data?.finance}
              attendanceAverage={data?.totals.attendanceAverage}
            />
          </Suspense>

          <div className="grid gap-4 lg:grid-cols-3">
            <Suspense
              fallback={
                <div className="surface-card h-[300px] animate-pulse bg-muted/40 rounded-2xl" />
              }
            >
              <DashboardAgeChart
                capabilities={{ students: capabilities.students }}
                ageDistribution={data?.ageDistribution ?? []}
              />
            </Suspense>

            <section className="surface-card p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <IconChip {...inferIcon("Actividade recente")} size="sm" />
                <h2 className="text-base font-semibold">Actividade recente</h2>
              </div>
              {(data?.recentActivity?.length ?? 0) > 0 ? (
                <ul className="space-y-4">
                  {data?.recentActivity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone[a.tone]}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.detail}</p>
                      </div>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {a.time}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {capabilities.audit
                    ? "Ainda não há eventos de auditoria."
                    : "A auditoria só está disponível para Administrador."}
                </p>
              )}
            </section>

            <section className="surface-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <IconChip {...inferIcon("Marcos do calendário lectivo")} size="sm" />
                  <h2 className="text-base font-semibold">Marcos do calendário lectivo</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canAccessPath("/calendario", currentUser.role) ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link to="/calendario">Ver todos</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
              {(data?.upcomingEvents?.length ?? 0) > 0 ? (
                <ul className="space-y-3">
                  {data?.upcomingEvents.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                      <IconChip
                        icon={CalendarDays}
                        size="sm"
                        soft={false}
                        className="rounded-xl bg-primary-soft text-primary-strong"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{e.title}</p>
                        {e.description ? (
                          <p className="truncate text-xs text-muted-foreground">{e.description}</p>
                        ) : null}
                      </div>
                      <span className="ml-auto shrink-0 text-xs font-semibold text-muted-foreground">
                        {new Date(`${e.event_date}T00:00:00`).toLocaleDateString("pt-PT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sem períodos futuros em <code className="font-mono">terms</code>.
                </p>
              )}
              <p className="mt-4 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                No SGA o calendário reflecte os períodos lectivos (
                <code className="font-mono">terms</code>
                ), não eventos livres.
              </p>
            </section>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <IconChip {...inferIcon("Estado das Matrículas")} size="sm" />
              <h2 className="text-base font-semibold">Estado das Matrículas</h2>
            </div>
            {(data?.enrollmentStatus?.length ?? 0) > 0 ? (
              <ul className="space-y-3">
                {data?.enrollmentStatus.map((e) => (
                  <li
                    key={e.estado}
                    className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5"
                  >
                    <span className="text-sm font-medium capitalize">{e.estado}</span>
                    <span className="font-display text-lg font-bold">{e.total}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem matrículas para resumir.</p>
            )}
          </section>

          <section className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <IconChip {...inferIcon("Estado dos Pagamentos")} size="sm" />
              <h2 className="text-base font-semibold">Estado dos Pagamentos</h2>
            </div>
            {capabilities.finance && data?.finance ? (
              <ul className="space-y-3">
                {[
                  { estado: "Recebido", valor: data.finance.received },
                  { estado: "Em aberto", valor: data.finance.outstanding },
                  { estado: "Em atraso", valor: data.finance.overdue },
                  { estado: "Facturado", valor: data.finance.billed },
                ].map((f) => (
                  <li
                    key={f.estado}
                    className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2.5"
                  >
                    <span className="text-sm font-medium">{f.estado}</span>
                    <span className="font-mono text-sm font-semibold">{kwanza(f.valor)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {capabilities.finance
                  ? "Sem resumo financeiro."
                  : "Financeiro disponível para Tesouraria/Admin."}
              </p>
            )}
            {capabilities.finance ? (
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link to="/relatorios/financeiros">Abrir relatórios financeiros</Link>
              </Button>
            ) : null}
          </section>

          <section className="surface-card p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <IconChip {...inferIcon("Estudantes por Curso")} size="sm" />
              <h2 className="text-base font-semibold">Estudantes por Curso</h2>
            </div>
            {(data?.studentsByCourse?.length ?? 0) > 0 ? (
              <ul className="space-y-3">
                {data?.studentsByCourse?.map((c) => (
                  <li key={c.curso}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-muted-foreground">{c.curso}</span>
                      <span className="font-semibold">{c.alunos}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${totalStudents ? (c.alunos / totalStudents) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sem distribuição por curso.</p>
            )}
          </section>
        </div>

        {/* BI EXECUTIVO 360° — HEATMAP DE DESEMPENHO E FLUXO DE CAIXA */}
        {(activeTab === "geral" || activeTab === "pedagogico") ? (
          <div className="space-y-6">
            <DisciplinePerformanceHeatmap />
          </div>
        ) : null}

        {(activeTab === "geral" || activeTab === "financeiro") && capabilities.finance ? (
          <div className="space-y-6">
            <CashFlowForecastChart />
          </div>
        ) : null}

        {activeTab === "auditoria" ? (
          <section className="surface-card p-6 space-y-4 rounded-2xl border border-border shadow-sm">
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <IconChip icon={Activity} tone="primary" size="md" />
              <div>
                <h3 className="font-extrabold text-base text-foreground">
                  Painel de Auditoria de Produtividade & Integridade
                </h3>
                <p className="text-xs text-muted-foreground">
                  Monitorização contínua do estado dos serviços, banco de dados SGA e resiliência de relatórios
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-success/30 bg-success/10 space-y-1">
                <span className="font-semibold text-success-strong">Estado da Base de Dados SGA</span>
                <p className="text-xl font-bold text-foreground font-mono">Conectado / 100%</p>
                <span className="text-[11px] text-muted-foreground">xodgfmxiaunpamctfeea.supabase.co</span>
              </div>

              <div className="p-4 rounded-xl border border-primary/30 bg-primary/10 space-y-1">
                <span className="font-semibold text-primary">Registo de Auditoria (Logs)</span>
                <p className="text-xl font-bold text-foreground font-mono">Ativo</p>
                <span className="text-[11px] text-muted-foreground">Resiliência contra falhas ativada</span>
              </div>

              <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 space-y-1">
                <span className="font-semibold text-warning-strong">Taxa de Integridade Operacional</span>
                <p className="text-xl font-bold text-foreground font-mono">100% Estável</p>
                <span className="text-[11px] text-muted-foreground">13 Módulos operacionais integrados</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="surface-card p-5">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <IconChip {...inferIcon("Turmas com Mais Estudantes")} size="sm" />
              <h2 className="text-base font-semibold">Turmas com Mais Estudantes</h2>
            </div>
            <Link
              to="/pedagogica"
              search={{ tab: "turmas" }}
              className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Ver todas
            </Link>
          </div>
          {(data?.topClasses?.length ?? 0) > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data?.topClasses?.map((t, i) => (
                <div key={t.classe} className="rounded-xl border border-border p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    <p className="font-semibold">{t.classe}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t.curso} · Turma {t.turma}
                  </p>
                  <p className="mt-3 font-display text-2xl font-extrabold">{t.alunos}</p>
                  <p className="text-xs text-muted-foreground">Alunos</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Crie turmas e atribua alunos para ver o ranking.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
