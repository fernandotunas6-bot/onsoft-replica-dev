// style-check: route-exempt - despacha para os painéis de portal (AdminPortalDashboard, TeacherPortalDashboard, etc.)
import { lazy, Suspense, useEffect, useId, useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { realtimeInvalidator } from "@/lib/realtime-invalidate";
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
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import type { EntityFocus } from "@/features/intelligence/types";
import type { DashboardOverviewSnapshot } from "@/features/intelligence/dashboard/dashboard-suggestion-rules";
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
import { kwanza } from "@/lib/currency";
import { warmDashboardCharts } from "@/lib/warm-charts";
import { schoolYear as fallbackSchoolYear } from "@/lib/school-config";
import { canAccessPath } from "@/features/auth/access-policy";
import { TeacherWorkspaceHint } from "@/features/academic/TeacherWorkspacePanel";
import { DashboardChartsSkeleton } from "@/features/dashboard/DashboardCharts";
import { resolvePortalMode } from "@/features/auth/portal-engine";
import { StudentPortalDashboard } from "@/features/dashboard/portals/StudentPortalDashboard";
import { GuardianPortalDashboard } from "@/features/dashboard/portals/GuardianPortalDashboard";
import { TeacherPortalDashboard } from "@/features/dashboard/portals/TeacherPortalDashboard";
import { AdminPortalDashboard } from "@/features/dashboard/portals/AdminPortalDashboard";

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
  const realtimeInstanceId = useId();
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

  // Realtime — invalida o overview sempre que dados críticos mudam na BD
  useEffect(() => {
    const realtime = realtimeInvalidator(queryClient);
    const overview = () => realtime.invalidate(["dashboard", "overview"]);
    const channel = supabase
      .channel(`dashboard_realtime_overview:${realtimeInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "students" }, overview)
      .on("postgres_changes", { event: "*", schema: "public", table: "enrollments" }, overview)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "finance_invoices" },
        overview,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "school_announcements" },
        overview,
      )
      .subscribe();

    return () => {
      realtime.dispose();
      supabase.removeChannel(channel);
    };
  }, [queryClient, realtimeInstanceId]);

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

  const focusedDashboardEntity = useMemo<EntityFocus<DashboardOverviewSnapshot> | null>(() => {
    if (!data) return null;
    return {
      type: "dashboard-overview",
      id: "global",
      label: "Visão Global",
      schoolId: school?.id ?? "desconhecida",
      data: {
        academicYear: data.academicYear,
        overviewCounts: { students: data.totals.students, classes: data.totals.classGroups },
        pendingEnrollmentApplications: data.totals.applicants ?? 0,
        unpaidInvoices: 0, // Placeholder se não vier na query principal (pode cruzar num endpoint estendido)
        upcomingEvents: data.upcomingEvents.length,
      },
    };
  }, [data, school]);

  useDeclareEntityFocus(focusedDashboardEntity);

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

  const [activeTab, setActiveTab] = useState<"geral" | "pedagogico" | "financeiro" | "auditoria">(
    "geral",
  );

  const portalMode = resolvePortalMode(currentUser.role);

  return (
    <AppShell>
      {portalMode === "student" ? (
        <StudentPortalDashboard />
      ) : portalMode === "guardian" ? (
        <GuardianPortalDashboard />
      ) : portalMode === "teacher" ? (
        <TeacherPortalDashboard />
      ) : (
        <AdminPortalDashboard
          data={data}
          isLoading={overviewQuery.isLoading}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          now={now}
          greeting={greeting}
        />
      )}
    </AppShell>
  );
}
