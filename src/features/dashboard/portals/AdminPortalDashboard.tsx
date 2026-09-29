import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity,
  BookOpen,
  Building2,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Megaphone,
  Plus,
  FileText,
  Receipt,
  TrendingUp,
  UserCheck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getDashboardOverview } from "@/features/dashboard/server";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useInstalledIntegrations } from "@/features/integrations/use-installed-integrations";
import { InstalledModuleTools } from "@/features/integrations/InstalledModuleTools";
import { DisciplinePerformanceHeatmap } from "@/features/dashboard/components/DisciplinePerformanceHeatmap";
import { CashFlowForecastChart } from "@/features/dashboard/components/CashFlowForecastChart";
import { DashboardChartsSkeleton } from "@/features/dashboard/DashboardCharts";
import { overlayServico } from "@/features/documents/print-overlays";
import { issuePrintDocument } from "@/features/documents/print-issue-loader";
import { Button } from "@/components/ui/button";
import { IconChip } from "@/components/ui/icon-chip";
import { kwanza } from "@/lib/currency";
import { schoolYear as fallbackSchoolYear } from "@/lib/school-config";
import { canAccessPath } from "@/features/auth/access-policy";
import { SpotlightRail } from "@/features/spotlight/SpotlightRail";
import { DashboardCalendarCard } from "@/features/dashboard/components/DashboardCalendarCard";
import { TodayAtSchoolCard } from "@/features/dashboard/components/TodayAtSchoolCard";
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

type DashboardOverview = Awaited<ReturnType<typeof getDashboardOverview>>;

export function AdminPortalDashboard({
  data,
  isLoading,
  activeTab,
  setActiveTab,
  now,
  greeting,
}: {
  data: DashboardOverview | undefined;
  isLoading: boolean;
  activeTab: "geral" | "pedagogico" | "financeiro" | "auditoria";
  setActiveTab: (tab: "geral" | "pedagogico" | "financeiro" | "auditoria") => void;
  now: Date | null;
  greeting: string;
}) {
  const currentUser = useCurrentAccount();
  const { school, selectedYearLabel } = useSchoolSettings();
  const installed = useInstalledIntegrations();
  const whatsappNotices = installed.hasCapability("whatsapp.notices");
  const resendOn = installed.hasCapability("resend.send");

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
      icon: Users,
      value: capabilities.students ? String(totalStudents) : "—",
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
      icon: UserRound,
      value: capabilities.students ? String(data?.totals.male ?? 0) : "—",
      tone: "info" as const,
      hint:
        capabilities.students && totalStudents
          ? `${Math.round(((data?.totals.male ?? 0) / totalStudents) * 100)}% do total`
          : "Aguardando dados",
    },
    {
      label: "Estudantes femininos",
      icon: UserRound,
      value: capabilities.students ? String(data?.totals.female ?? 0) : "—",
      tone: "pink" as const,
      hint:
        capabilities.students && totalStudents
          ? `${Math.round(((data?.totals.female ?? 0) / totalStudents) * 100)}% do total`
          : "Aguardando dados",
    },
    {
      label: capabilities.documents ? "Documentos emitidos" : "Saldo de caixa",
      icon: capabilities.documents ? FileText : Receipt,
      value: capabilities.documents
        ? String(data?.totals.documentIssued ?? 0)
        : capabilities.finance
          ? kwanza(data?.finance?.cash_balance ?? 0)
          : "—",
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
      icon: BookOpen,
      value: capabilities.students ? String(data?.totals.courses ?? 0) : "—",
    },
    {
      label: "Turmas activas",
      icon: Users,
      value: capabilities.students ? String(data?.totals.classGroups ?? 0) : "—",
    },
    {
      label: "Salas",
      icon: DoorOpen,
      value: capabilities.students ? String(data?.totals.rooms ?? 0) : "—",
    },
    {
      label: "Taxa de presença",
      icon: UserCheck,
      value:
        capabilities.students && data?.totals.attendanceAverage != null
          ? `${data.totals.attendanceAverage}%`
          : "—",
    },
  ];

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

  return (
    <div className="space-y-6">
      {/* CABEÇALHO — RESUMO DE HOJE (sem cartão: título directo na tela) */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex size-1.5 rounded-full bg-success" aria-hidden="true" />
            <span className="truncate">{school?.name ?? "Escola"}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate first-letter:uppercase">
              {now
                ? now.toLocaleDateString("pt-PT", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Resumo de hoje"}
            </span>
          </p>
          <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
            {greeting}, {currentUser.name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canAccessPath("/financeiro", currentUser.role) ? (
            <Button asChild size="sm" variant="outline" className="flex-1 sm:flex-none">
              <Link to="/financeiro">Caixa &amp; pagamentos</Link>
            </Button>
          ) : null}
          {canAccessPath("/alunos", currentUser.role) ? (
            <Button asChild size="sm" className="flex-1 sm:flex-none">
              <Link to="/alunos" search={{ action: "matricular" }}>
                <Plus className="size-4" aria-hidden="true" />
                Nova matrícula
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {/* SEPARADORES — sublinhado, deslizam na horizontal no telemóvel */}
      <div
        role="tablist"
        aria-label="Vistas do painel"
        className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-border)] md:mx-0 md:px-0"
      >
        {(
          [
            { id: "geral", label: "Visão geral", show: true },
            { id: "pedagogico", label: "Desempenho e pautas", show: true },
            { id: "financeiro", label: "Projecção financeira", show: capabilities.finance },
            { id: "auditoria", label: "Produtividade", show: true },
          ] as const
        )
          .filter((tab) => tab.show)
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative shrink-0 whitespace-nowrap pb-3 pt-1 text-sm font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent hover:text-foreground aria-selected:text-foreground aria-selected:after:bg-foreground"
            >
              {tab.label}
            </button>
          ))}
      </div>

      {activeTab === "geral" && capabilities.students && totalStudents === 0 ? (
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h2 className="text-sm font-bold">Primeiros passos da escola</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.academicYear
              ? "O provisionamento deixou a escola pronta para configurar. Complete estes passos para começar a operar."
              : "A escola ainda não tem ano lectivo activo — sem ele não é possível criar turmas nem planos de propina. Comece por defini-lo."}
          </p>
          <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {data?.academicYear ? null : (
              <li className="sm:col-span-2">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => openSettingsPanel("escola")}
                >
                  1. Definir o ano lectivo (nome, início e fim)
                </button>
              </li>
            )}
            <li>
              <Link
                to="/alunos"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {data?.academicYear ? "1." : "2."} Matricular o primeiro aluno
              </Link>
            </li>
            <li>
              <Link
                to="/pedagogica"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {data?.academicYear ? "2." : "3."} Rever turmas e disciplinas
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="font-medium text-primary underline-offset-2 hover:underline"
                onClick={() => openSettingsPanel("financeiro")}
              >
                {data?.academicYear ? "3." : "4."} Definir valores de propina
              </button>
            </li>
            <li>
              {data?.enrollmentPublicLink?.isOpen ? (
                <a
                  href={data.enrollmentPublicLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {data?.academicYear ? "4." : "5."} Partilhar link público de matrícula
                </a>
              ) : (
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  onClick={() => openSettingsPanel("matricula")}
                >
                  {data?.academicYear ? "4." : "5."} Activar link público de matrícula
                </button>
              )}
            </li>
            {data?.enrollmentPublicLink?.isOpen ? (
              <li className="sm:col-span-2 text-xs text-muted-foreground">
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {data.enrollmentPublicLink.url}
                </code>
              </li>
            ) : null}
          </ol>
        </section>
      ) : null}

      <InstalledModuleTools module="comunicacoes" />

      {activeTab === "geral" ? <TodayAtSchoolCard /> : null}

      {activeTab === "geral" && data?.imports?.available ? (
        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconChip icon={Upload} tone="info" size="sm" />
              Importações de dados
            </div>
            <Link
              to="/importar"
              className="text-xs font-bold text-primary underline-offset-2 hover:underline"
            >
              Abrir importação
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { label: "Ficheiros", value: data.imports.totalJobs },
              { label: "Concluídos", value: data.imports.completedJobs },
              { label: "Em curso", value: data.imports.pendingJobs },
              { label: "Registos importados", value: data.imports.importedRows },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-xl font-bold">{item.value}</p>
              </div>
            ))}
          </div>
          {data.imports.recent.length > 0 ? (
            <ul className="mt-4 divide-y divide-border/60">
              {data.imports.recent.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{job.fileName ?? job.module}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.module} · {job.importedRows}/{job.totalRows} linhas
                      {job.errorRows > 0 ? ` · ${job.errorRows} com erro` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {job.createdAt ? new Date(job.createdAt).toLocaleDateString("pt-PT") : "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Ainda não importou ficheiros. Envie Excel ou CSV de turmas, alunos ou pautas.
            </p>
          )}
        </section>
      ) : null}

      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <TrendingUp className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">Progresso do {yearName}</span>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {data?.academicYear
              ? data.yearPhase === "not_started"
                ? "Ainda não começou"
                : data.yearPhase === "ended"
                  ? "Concluído"
                  : `${data.yearProgress}%`
              : "—"}
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((s) => {
          const card = (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-muted-foreground">{s.label}</p>
                <s.icon
                  className="size-4 shrink-0 text-muted-foreground/70"
                  aria-label={s.label}
                  role="img"
                />
              </div>
              <p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                {s.value}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{s.hint}</p>
            </>
          );
          return s.href ? (
            <Link
              key={s.label}
              to={s.href}
              {...(s.search ? { search: s.search } : {})}
              className="surface-card block p-4 transition-colors hover:border-foreground/20 sm:p-5"
            >
              {card}
            </Link>
          ) : (
            <div key={s.label} className="surface-card p-4 sm:p-5">
              {card}
            </div>
          );
        })}
      </div>

      <div className="surface-card grid grid-cols-2 gap-px overflow-hidden bg-border/60 p-0 xl:grid-cols-4">
        {miniStats.map((s) => (
          <div key={s.label} className="flex items-center gap-3 bg-card px-4 py-3.5 sm:px-5">
            <IconChip icon={s.icon} size="sm" tone="muted" label={s.label} />
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
              <p className="text-base font-semibold tabular-nums">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCalendarCard />
        {(data?.announcements?.length ?? 0) > 0 ? (
          <section className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <IconChip icon={Megaphone} size="sm" label="Comunicados" />
                <h2 className="text-base font-semibold">Comunicados</h2>
              </div>
              {canAccessPath("/comunicacoes", currentUser.role) ? (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/comunicacoes">Ver todos</Link>
                </Button>
              ) : null}
            </div>
            <ul className="space-y-3">
              {data?.announcements.map((item: any) => (
                <li key={item.id} className="rounded-xl bg-secondary p-3">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  {item.published_at ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {new Date(item.published_at).toLocaleDateString("pt-PT")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="space-y-4">
        <Suspense fallback={<DashboardChartsSkeleton />}>
          <DashboardCharts
            loading={isLoading}
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
      </div>

      {activeTab === "geral" || activeTab === "pedagogico" ? (
        <div className="space-y-6">
          <DisciplinePerformanceHeatmap dataByTerm={data?.performanceHeatmap ?? {}} />
        </div>
      ) : null}

      {(activeTab === "geral" || activeTab === "financeiro") && capabilities.finance ? (
        <div className="space-y-6">
          <CashFlowForecastChart
            data={data?.cashFlowForecast?.months ?? []}
            averageCollectionRate={data?.cashFlowForecast?.averageCollectionRate ?? undefined}
            forecastInadimplenciaRate={data?.cashFlowForecast?.forecastDefaultRate ?? undefined}
            mainPaymentChannel={data?.cashFlowForecast?.mainPaymentChannel ?? undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
