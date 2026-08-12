import type { QueryClient } from "@tanstack/react-query";
import { listStaffModuleGrants } from "@/features/access/grants";
import { listSystemAccounts } from "@/features/access/server";
import { listPedagogicalWorkspace } from "@/features/academic/server";
import { listCalendarEvents } from "@/features/calendar/server";
import { listSchoolAnnouncements } from "@/features/communications/server";
import { getDashboardOverview } from "@/features/dashboard/server";
import { listDocumentWorkspace } from "@/features/documents/server";
import {
  getFinanceReporting,
  listCashEntries,
  listInvoices,
  listPaymentPlans,
} from "@/features/finance/server";
import { listStaffDirectory, listTeachers, searchPeople } from "@/features/people/server";
import { listSchoolFiles } from "@/features/arquivos/server";
import { searchStudents } from "@/features/students/server";
import { warmDashboardCharts, warmFinanceCharts, warmPedagogicaCharts, warmReportCharts } from "@/lib/warm-charts";

const prefetched = new Set<string>();

function once(key: string, fn: () => void) {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  fn();
}

function yearIdFromCache(queryClient: QueryClient) {
  const years = queryClient.getQueryData<Array<{ id: string; is_active?: boolean }>>([
    "school",
    "academic-years",
  ]);
  const active = years?.find((row) => row.is_active);
  return active?.id ?? years?.[0]?.id;
}

/** Pré-aquece dados do módulo quando o utilizador aponta para um link — resposta ao toque. */
export function prefetchRouteData(queryClient: QueryClient, pathname: string) {
  const path = pathname.split("?")[0] ?? pathname;
  if (!path || path === "/configuracoes") return;

  if (path === "/" || path === "") {
    once("data:/", () => {
      warmDashboardCharts();
      void queryClient.prefetchQuery({
        queryKey: ["dashboard", "overview"],
        queryFn: () => getDashboardOverview(),
      });
    });
    return;
  }

  if (path === "/alunos") {
    once("data:/alunos", () => {
      const yearId = yearIdFromCache(queryClient);
      void queryClient.prefetchQuery({
        queryKey: ["students", "search"],
        queryFn: () => searchStudents({ data: { limit: 100, offset: 0 } }),
      });
      void queryClient.prefetchQuery({
        queryKey: ["academic", "pedagogical-workspace", yearId],
        queryFn: () =>
          listPedagogicalWorkspace({
            data: yearId ? { academicYearId: yearId } : {},
          }),
      });
    });
    return;
  }

  if (path === "/pedagogica") {
    once("data:/pedagogica", () => {
      warmPedagogicaCharts();
      const yearId = yearIdFromCache(queryClient);
      void queryClient.prefetchQuery({
        queryKey: ["academic", "pedagogical-workspace", yearId],
        queryFn: () =>
          listPedagogicalWorkspace({
            data: yearId ? { academicYearId: yearId } : {},
          }),
      });
    });
    return;
  }

  if (path === "/pessoas") {
    once("data:/pessoas", () => {
      void queryClient.prefetchQuery({
        queryKey: ["people", "search", ""],
        queryFn: () => searchPeople({ data: { query: "", limit: 50 } }),
      });
      void queryClient.prefetchQuery({
        queryKey: ["people", "teachers", "", "all"],
        queryFn: () => listTeachers({ data: { status: "all", limit: 100 } }),
      });
    });
    return;
  }

  if (path === "/financeiro") {
    once("data:/financeiro", () => {
      warmFinanceCharts();
      void queryClient.prefetchQuery({
        queryKey: ["finance", "cash-entries"],
        queryFn: () => listCashEntries({ data: { limit: 250 } }),
      });
      void queryClient.prefetchQuery({
        queryKey: ["finance", "payment-plans"],
        queryFn: () => listPaymentPlans(),
      });
    });
    return;
  }

  if (path === "/faturas") {
    once("data:/faturas", () => {
      void queryClient.prefetchQuery({
        queryKey: ["finance", "invoices"],
        queryFn: () => listInvoices({ data: { limit: 250 } }),
      });
    });
    return;
  }

  if (path === "/documentos") {
    once("data:/documentos", () => {
      void queryClient.prefetchQuery({
        queryKey: ["documents", "workspace"],
        queryFn: () => listDocumentWorkspace(),
      });
    });
    return;
  }

  if (path === "/arquivos") {
    once("data:/arquivos", () => {
      void queryClient.prefetchQuery({
        queryKey: ["arquivos", "list", undefined, ""],
        queryFn: () => listSchoolFiles({ data: { limit: 48 } }),
      });
    });
    return;
  }

  if (path === "/comunicacoes") {
    once("data:/comunicacoes", () => {
      void queryClient.prefetchQuery({
        queryKey: ["communications", "announcements"],
        queryFn: () => listSchoolAnnouncements({ data: { limit: 50 } }),
      });
    });
    return;
  }

  if (path === "/calendario") {
    once("data:/calendario", () => {
      void queryClient.prefetchQuery({
        queryKey: ["calendar", "events"],
        queryFn: () => listCalendarEvents({ data: { limit: 50 } }),
      });
    });
    return;
  }

  if (path === "/acessos") {
    once("data:/acessos", () => {
      void queryClient.prefetchQuery({
        queryKey: ["access", "accounts"],
        queryFn: () => listSystemAccounts(),
      });
      void queryClient.prefetchQuery({
        queryKey: ["people", "staff"],
        queryFn: () => listStaffDirectory(),
      });
      void queryClient.prefetchQuery({
        queryKey: ["access", "grants"],
        queryFn: () => listStaffModuleGrants(),
      });
    });
    return;
  }

  if (path.startsWith("/relatorios")) {
    once(`data:${path}`, () => {
      if (path.includes("financeiros")) {
        warmFinanceCharts();
        void queryClient.prefetchQuery({
          queryKey: ["finance", "reporting"],
          queryFn: () => getFinanceReporting(),
        });
        return;
      }
      warmReportCharts();
      const yearId = yearIdFromCache(queryClient);
      void queryClient.prefetchQuery({
        queryKey: ["academic", "pedagogical-workspace", yearId],
        queryFn: () =>
          listPedagogicalWorkspace({
            data: yearId ? { academicYearId: yearId } : {},
          }),
      });
    });
  }
}

export function resetRoutePrefetchCache() {
  prefetched.clear();
}
