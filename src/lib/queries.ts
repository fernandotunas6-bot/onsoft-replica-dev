import { queryOptions } from "@tanstack/react-query";
import { students } from "@/lib/students-data";
import {
  ageDistribution,
  attendanceRate,
  enrollmentStatus,
  enrollmentsByMonth,
  financeSummary,
  genderSplit,
  miniStats,
  recentActivity,
  stats,
  studentsByClass,
  studentsByCourse,
  topClasses,
  upcoming,
} from "@/lib/school-data";
import {
  caixaResumo,
  disciplinas,
  documentos,
  faturas,
  movimentos,
  notas,
  turmas,
} from "@/lib/modules-data";

/**
 * Query options partilhadas: o AppShell pré-carrega estas chaves em tempo
 * livre do browser, por isso os módulos e filtros mais usados abrem
 * instantaneamente e ficam em cache entre navegações.
 */
const LONG = { staleTime: 5 * 60_000, gcTime: 30 * 60_000 } as const;

export const dashboardQuery = () =>
  queryOptions({
    queryKey: ["dashboard"],
    ...LONG,
    queryFn: async () => ({
      stats,
      miniStats,
      studentsByClass,
      genderSplit,
      enrollmentsByMonth,
      attendanceRate,
      ageDistribution,
      enrollmentStatus,
      financeSummary,
      studentsByCourse,
      topClasses,
      recentActivity,
      upcoming,
    }),
  });

export const studentsQuery = () =>
  queryOptions({
    queryKey: ["students"],
    ...LONG,
    queryFn: async () => students,
  });

export const pedagogicaQuery = () =>
  queryOptions({
    queryKey: ["pedagogica"],
    ...LONG,
    queryFn: async () => ({ turmas, disciplinas, notas }),
  });

export const financeiroQuery = () =>
  queryOptions({
    queryKey: ["financeiro"],
    ...LONG,
    queryFn: async () => ({ caixaResumo, movimentos, faturas }),
  });

export const documentosQuery = () =>
  queryOptions({
    queryKey: ["documentos"],
    ...LONG,
    queryFn: async () => documentos,
  });

/** Pré-busca de todos os módulos mais usados. */
export function warmQueries(queryClient: { prefetchQuery: (options: never) => Promise<void> }) {
  const list = [
    dashboardQuery(),
    studentsQuery(),
    pedagogicaQuery(),
    financeiroQuery(),
    documentosQuery(),
  ];
  for (const options of list) {
    void queryClient.prefetchQuery(options as never);
  }
}
