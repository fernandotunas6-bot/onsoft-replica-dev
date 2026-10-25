import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useAcademicNavTree } from "@/features/academic/use-academic-nav-tree";
import { academicContextLookup } from "./academic-context-lookup";
import {
  combineContextLookups,
  focusContextLookup,
  resolveContext,
  routeContextCandidates,
  type ResolveContextResult,
} from "./context-resolver";
import { useEntityFocus } from "./entity-focus-context";

/**
 * O contexto activo da página, resolvido uma vez para sidebar, breadcrumb,
 * conteúdo e painel. Só lê turmas e disciplinas quando a URL as traz; enquanto
 * o servidor não responde, o contexto fica no nível da área.
 */
export function useResolvedContext(): ResolveContextResult {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const { focusedEntity } = useEntityFocus();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const searchKey = JSON.stringify(search ?? {});

  const route = useMemo(
    () => routeContextCandidates(pathname, JSON.parse(searchKey) as Record<string, unknown>),
    [pathname, searchKey],
  );
  const needsAcademic = route.some(
    (candidate) => candidate.type === "class" || candidate.type === "subject-offering",
  );
  const academic = useAcademicNavTree({ enabled: needsAcademic });
  const schoolId = account.schoolId ?? null;

  return useMemo(
    () =>
      resolveContext({
        base: {
          userId: account.id,
          role: account.role,
          grants: account.grants,
          pathname,
          focusedEntity,
        },
        schoolId: schoolId ?? "",
        academicYearId: selectedYearId ?? null,
        route,
        focus: focusedEntity,
        lookup: combineContextLookups(
          // A árvore vem com a escola para que foi lida; outra escola é recusada.
          academicContextLookup(academic.tree, academic.schoolId),
          focusContextLookup(focusedEntity),
        ),
      }),
    [
      account.id,
      account.role,
      account.grants,
      pathname,
      focusedEntity,
      schoolId,
      selectedYearId,
      route,
      academic.tree,
      academic.schoolId,
    ],
  );
}
