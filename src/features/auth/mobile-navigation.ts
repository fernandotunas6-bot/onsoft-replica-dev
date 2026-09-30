import type { ApplicationRole } from "./access-policy";
import { getPortalNavigation, type NavChild } from "./portal-engine";
import type { Plan } from "@/features/saas/types";

export function getMobileNavigation(
  role: ApplicationRole,
  grants: Record<string, string> = {},
  plan?: Plan | null,
): NavChild[] {
  const entries = getPortalNavigation(role, grants, plan).flatMap((group) =>
    group.items.flatMap((item) => [
      ...(item.to
        ? [{ label: item.label, icon: item.icon, to: item.to, search: item.search }]
        : []),
      ...(item.children ?? []),
    ]),
  );
  const academicPortal = ["Professor", "Aluno", "Encarregado"].includes(role);
  const priorities = [
    "/",
    academicPortal ? "/pedagogica" : "/alunos",
    "/calendario",
    "/financeiro",
  ];
  const labels: Record<string, string> = {
    "/": "Início",
    "/alunos": "Alunos",
    "/pedagogica": "Académico",
    "/calendario": "Agenda",
    "/financeiro": "Finanças",
  };
  return priorities.flatMap((to) => {
    const entry = entries.find((item) => item.to === to);
    return entry ? [{ ...entry, label: labels[to] }] : [];
  });
}

export function isMobileDestinationActive(to: string, pathname: string): boolean {
  const roots =
    to === "/financeiro" ? [to, "/faturas", "/tesouraria", "/relatorios/financeiros"] : [to];
  return roots.some((root) =>
    root === "/" ? pathname === root : pathname === root || pathname.startsWith(`${root}/`),
  );
}
