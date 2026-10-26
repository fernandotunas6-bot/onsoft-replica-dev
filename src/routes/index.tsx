// style-check: route-exempt - despacha para os painéis de portal (AdminPortalDashboard, TeacherPortalDashboard, etc.)
import { lazy, Suspense, useEffect, useId, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { realtimeInvalidator } from "@/lib/realtime-invalidate";
import { useDeclareEntityFocus } from "@/features/intelligence/entity-focus-context";
import type { EntityFocus } from "@/features/intelligence/types";
import type { DashboardOverviewSnapshot } from "@/features/intelligence/dashboard/dashboard-suggestion-rules";

import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { getDashboardOverview } from "@/features/dashboard/server";
import { warmDashboardCharts } from "@/lib/warm-charts";
import { startDashboardDateClock } from "@/features/dashboard/date-clock";
import { resolvePortalMode } from "@/features/auth/portal-engine";
import { PortalDashboardSkeleton } from "@/features/dashboard/portals/PortalDashboardSkeleton";
// Âncoras deliberadas, não uso directo nesta rota: mantêm o esqueleto puro dos
// gráficos e a dica do docente no grafo ESTÁTICO do ecrã de entrada, para que
// nenhum dos dois volte a chegar por um caminho pesado (`DashboardCharts`,
// `TeacherWorkspacePanel`) — ver `tests/ui/first-paint-budget.test.ts`.
import { DashboardChartsSkeleton as _DashboardChartsSkeletonPin } from "@/features/dashboard/DashboardChartsSkeleton";
import { TeacherWorkspaceHint as _TeacherWorkspaceHintPin } from "@/features/academic/TeacherWorkspaceHint";

/**
 * Um utilizador vê **um** portal, o do seu papel. Importados estaticamente, os quatro
 * entravam no grafo da rota `/` — que é também o ecrã de entrada — e arrastavam 55
 * módulos só deles, incluindo `features/higher-ed/server.ts` e
 * `pedagogica/attendance-server.ts`. Separados, cada papel carrega só o seu.
 */
// A estrutura do painel não é necessária para apresentar o login público.
// Carregá-la apenas quando o dashboard realmente renderiza reduz o JS inicial
// sem tocar em navegação, permissões ou lógica do AppShell autenticado.
const AppShell = lazy(() =>
  import("@/components/layout/AppShell").then((module) => ({
    default: module.AppShell,
  })),
);

const StudentPortalDashboard = lazy(() =>
  import("@/features/dashboard/portals/StudentPortalDashboard").then((module) => ({
    default: module.StudentPortalDashboard,
  })),
);
const GuardianPortalDashboard = lazy(() =>
  import("@/features/dashboard/portals/GuardianPortalDashboard").then((module) => ({
    default: module.GuardianPortalDashboard,
  })),
);
const TeacherPortalDashboard = lazy(() =>
  import("@/features/dashboard/portals/TeacherPortalDashboard").then((module) => ({
    default: module.TeacherPortalDashboard,
  })),
);
const AdminPortalDashboard = lazy(() =>
  import("@/features/dashboard/portals/AdminPortalDashboard").then((module) => ({
    default: module.AdminPortalDashboard,
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

export function Dashboard() {
  const realtimeInstanceId = useId();
  const queryClient = useQueryClient();
  const currentUser = useCurrentAccount();
  const portalMode = resolvePortalMode(currentUser.role);
  const { school } = useSchoolSettings();
  const [now, setNow] = useState<Date | null>(null);
  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => getDashboardOverview(),
  });

  useEffect(() => {
    if (portalMode !== "admin") return;
    warmDashboardCharts();
    return startDashboardDateClock(setNow);
  }, [portalMode]);

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

  const [activeTab, setActiveTab] = useState<"geral" | "pedagogico" | "financeiro" | "auditoria">(
    "geral",
  );

  return (
    <Suspense fallback={<PortalDashboardSkeleton />}>
      <AppShell>
        <Suspense fallback={<PortalDashboardSkeleton />}>
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
        </Suspense>
      </AppShell>
    </Suspense>
  );
}
