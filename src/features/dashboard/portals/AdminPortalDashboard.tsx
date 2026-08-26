import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  CalendarDays,
  DoorOpen,
  GraduationCap,
  Megaphone,
  Receipt,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
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
import { inferIcon } from "@/lib/auto-icon";
import { kwanza } from "@/lib/currency";
import { schoolYear as fallbackSchoolYear } from "@/lib/school-config";
import { canAccessPath } from "@/features/auth/access-policy";
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

export function AdminPortalDashboard({
  data,
  isLoading,
  activeTab,
  setActiveTab,
  now,
  greeting,
}: {
  data: any;
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
      {/* BARRA DE SUBOPÇÕES CLICÁVEIS DO DASHBOARD */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant={activeTab === "geral" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("geral")}
          className="rounded-full text-xs font-bold"
        >
          Visão Geral
        </Button>
        <Button
          type="button"
          variant={activeTab === "pedagogico" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("pedagogico")}
          className="rounded-full text-xs font-bold"
        >
          Desempenho & Pautas
        </Button>
        {capabilities.finance ? (
          <Button
            type="button"
            variant={activeTab === "financeiro" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("financeiro")}
            className="rounded-full text-xs font-bold"
          >
            Projeção Financeira
          </Button>
        ) : null}
        <Button
          type="button"
          variant={activeTab === "auditoria" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("auditoria")}
          className="rounded-full text-xs font-bold"
        >
          Auditoria de Produtividade
        </Button>
      </div>

      <InstalledModuleTools module="comunicacoes" />

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
            <div
              key={s.label}
              className="surface-card p-5 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-card"
            >
              {card}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {miniStats.map((s) => (
          <div
            key={s.label}
            className="surface-card flex items-center gap-4 p-4 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-card"
          >
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
          <DisciplinePerformanceHeatmap />
        </div>
      ) : null}

      {(activeTab === "geral" || activeTab === "financeiro") && capabilities.finance ? (
        <div className="space-y-6">
          <CashFlowForecastChart />
        </div>
      ) : null}
    </div>
  );
}
