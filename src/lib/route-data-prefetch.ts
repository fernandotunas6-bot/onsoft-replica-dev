import { canPrefetchResources } from "@/lib/preload";
import { mergeFilterSources, parseFilterBag, readStoredListFilters } from "@/lib/list-filters";
import type { QueryClient } from "@tanstack/react-query";
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
import type { SearchPeopleInput } from "@/features/people/schemas";
import { searchStudents } from "@/features/students/server";
import {
  warmDashboardCharts,
  warmFinanceCharts,
  warmPedagogicaCharts,
  warmReportCharts,
} from "@/lib/warm-charts";

export type RoutePrefetchScope = {
  schoolId: string | null;
  academicYearId: string | null;
  search?: Record<string, string | undefined>;
};

/** Usa a cache real: também volta a aquecer depois de expirar, falhar ou mudar de escola. */
export function prefetchRouteData(
  queryClient: QueryClient,
  pathname: string,
  scope: RoutePrefetchScope,
) {
  // Uma intenção atrasada não pode preencher chaves com o contexto da escola anterior.
  const school = queryClient.getQueryData<{ id: string }>(["school", "settings"]);
  if (!scope.schoolId || school?.id !== scope.schoolId || !canPrefetchResources()) return;
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  const yearId = scope.academicYearId ?? undefined;
  // Não disputar a rede com as leituras do ecrã actual, nem lançar rajadas ao passar no menu.
  const prefetch: QueryClient["prefetchQuery"] = (options) => {
    if (queryClient.isFetching() >= 2) return Promise.resolve();
    return queryClient.prefetchQuery(options);
  };
  const academicWorkspace = () =>
    prefetch({
      queryKey: ["academic", "pedagogical-workspace", yearId ?? null],
      queryFn: ({ signal }) =>
        listPedagogicalWorkspace({
          data: yearId ? { academicYearId: yearId } : {},
          signal,
        }),
    });

  switch (path) {
    case "/":
      warmDashboardCharts();
      void prefetch({
        queryKey: ["dashboard", "overview"],
        queryFn: ({ signal }) => getDashboardOverview({ signal }),
      });
      break;
    case "/alunos":
      void prefetch({
        queryKey: ["students", "search"],
        queryFn: ({ signal }) => searchStudents({ data: { limit: 1000, offset: 0 }, signal }),
      });
      void academicWorkspace();
      break;
    case "/pedagogica":
      warmPedagogicaCharts();
      void academicWorkspace();
      break;
    case "/pessoas": {
      const filters = mergeFilterSources(
        { q: "", province: "", municipality: "", role: "", teacherStatus: "all" },
        readStoredListFilters("pessoas"),
        scope.search?.lf ? parseFilterBag(scope.search.lf) : null,
      );
      void prefetch({
        queryKey: [
          "people",
          "search",
          filters.q.trim(),
          filters.province,
          filters.municipality,
          filters.role,
        ],
        queryFn: ({ signal }) =>
          searchPeople({
            data: {
              query: filters.q.trim(),
              province: filters.province || undefined,
              municipality: filters.municipality || undefined,
              // O tipo vem do esquema, não da assinatura do server fn: o primeiro
              // parâmetro dele é opcional e não se deixa indexar por ["data"].
              role: (filters.role || undefined) as SearchPeopleInput["role"],
              limit: 50,
            },
            signal,
          }),
      });
      void prefetch({
        queryKey: ["people", "teachers", filters.q, filters.teacherStatus],
        queryFn: ({ signal }) =>
          listTeachers({
            data: {
              query: filters.q || undefined,
              status: filters.teacherStatus as "all" | "active" | "inactive",
              limit: 100,
            },
            signal,
          }),
      });
      break;
    }
    case "/financeiro":
      warmFinanceCharts();
      void prefetch({
        queryKey: ["finance", "cash-entries"],
        queryFn: ({ signal }) => listCashEntries({ data: { limit: 250 }, signal }),
      });
      void prefetch({
        queryKey: ["finance", "payment-plans"],
        queryFn: ({ signal }) => listPaymentPlans({ signal }),
      });
      break;
    case "/faturas":
      void prefetch({
        queryKey: ["finance", "invoices"],
        queryFn: ({ signal }) => listInvoices({ data: { limit: 250 }, signal }),
      });
      break;
    case "/documentos":
      void prefetch({
        queryKey: ["documents", "workspace"],
        queryFn: ({ signal }) => listDocumentWorkspace({ data: { limit: 250 }, signal }),
      });
      break;
    // Arquivos tem área, pasta e filtros por papel: o Link aquece o código,
    // mas só o FileBrowser conhece os parâmetros seguros para ler os ficheiros.
    case "/comunicacoes":
      void prefetch({
        queryKey: ["communications", "announcements"],
        queryFn: ({ signal }) => listSchoolAnnouncements({ data: { limit: 50 }, signal }),
      });
      break;
    case "/calendario": {
      const calendarYearId = scope.search?.ano ?? scope.academicYearId;
      void prefetch({
        queryKey: ["calendar", "events", scope.schoolId, calendarYearId],
        queryFn: ({ signal }) =>
          listCalendarEvents({
            data: {
              limit: 50,
              academicYearId: calendarYearId ?? undefined,
              includePast: Boolean(calendarYearId),
            },
            signal,
          }),
      });
      break;
    }
    case "/acessos":
      void prefetch({
        queryKey: ["access", "accounts"],
        queryFn: ({ signal }) => listSystemAccounts({ signal }),
      });
      void prefetch({
        queryKey: ["people", "staff"],
        queryFn: ({ signal }) => listStaffDirectory({ signal }),
      });
      break;
    case "/relatorios/financeiros":
      warmFinanceCharts();
      void prefetch({
        queryKey: ["finance", "reporting"],
        queryFn: ({ signal }) => getFinanceReporting({ signal }),
      });
      break;
    case "/relatorios/academicos":
      warmReportCharts();
      void academicWorkspace();
      break;
  }
}
