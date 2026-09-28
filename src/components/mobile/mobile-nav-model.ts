import type { ElementType } from "react";
import {
  BookOpen,
  Boxes,
  CalendarDays,
  GraduationCap,
  Home,
  LayoutGrid,
  Users,
  Wallet,
} from "lucide-react";

import { canAccessPath, type ApplicationRole } from "@/features/auth/access-policy";
import { getPortalNavigation, resolvePortalMode } from "@/features/auth/portal-engine";
import type { Plan } from "@/features/saas/types";

/**
 * Modelo da navegação mobile (§8–§9).
 *
 * A barra inferior **não** é a barra lateral encolhida: são no máximo cinco
 * destinos, quatro escolhidos por papel e o quinto sempre "Mais". O que sobra
 * da barra lateral vai para o hub, agrupado — e é por isso que o hub se lê do
 * mesmo catálogo (`portal-engine`) em vez de repetir a lista à mão: qualquer
 * módulo que ganhe ou perca permissão aparece e desaparece nos dois sítios.
 */
export type MobileNavDestination = {
  label: string;
  icon: ElementType;
  to: string;
  search?: Record<string, string | undefined>;
  /** Caminhos que também acendem este destino (subpáginas do módulo). */
  matches?: string[];
};

const MORE: MobileNavDestination = { label: "Mais", icon: LayoutGrid, to: "__more__" };

/** O destino "Mais" é reconhecido por este `to` — não é uma rota real. */
export const MORE_DESTINATION_TO = MORE.to;

function pick(
  candidates: MobileNavDestination[],
  role: ApplicationRole,
  grants: Record<string, string>,
  plan?: Plan | null,
): MobileNavDestination[] {
  return candidates
    .filter((item) => canAccessPath(item.to, role, grants, plan))
    .slice(0, 4)
    .concat(MORE);
}

export function getMobileDestinations(
  role: ApplicationRole,
  grants: Record<string, string> = {},
  plan?: Plan | null,
): MobileNavDestination[] {
  const mode = resolvePortalMode(role);

  if (mode === "teacher") {
    return pick(
      [
        { label: "Início", icon: Home, to: "/" },
        {
          label: "Chamada",
          icon: Users,
          to: "/pedagogica",
          search: { tab: "chamada" },
          matches: ["/pedagogica"],
        },
        { label: "Turmas", icon: GraduationCap, to: "/pedagogica", search: { tab: "turmas" } },
        { label: "Agenda", icon: CalendarDays, to: "/calendario" },
      ],
      role,
      grants,
      plan,
    );
  }

  if (mode === "student" || mode === "guardian") {
    return pick(
      [
        { label: "Início", icon: Home, to: "/" },
        { label: "Notas", icon: BookOpen, to: "/pedagogica", search: { tab: "notas" } },
        { label: "Agenda", icon: CalendarDays, to: "/calendario" },
        { label: "Propinas", icon: Wallet, to: "/financeiro" },
      ],
      role,
      grants,
      plan,
    );
  }

  return pick(
    [
      { label: "Início", icon: Home, to: "/" },
      {
        label: "Académico",
        icon: GraduationCap,
        to: "/pedagogica",
        matches: ["/pedagogica", "/planos-aula"],
      },
      { label: "Pessoas", icon: Users, to: "/alunos", matches: ["/alunos", "/pessoas"] },
      {
        label: "Finanças",
        icon: Wallet,
        to: "/financeiro",
        matches: ["/financeiro", "/tesouraria", "/faturas"],
      },
    ],
    role,
    grants,
    plan,
  );
}

/**
 * Qual o destino aceso para o caminho actual. Um `/alunos/xyz` acende "Pessoas",
 * e o que não pertence a nenhum módulo da barra acende "Mais" — nunca nada.
 */
export function activeDestinationTo(
  pathname: string,
  destinations: MobileNavDestination[],
): string {
  if (pathname === "/") return "/";
  const byMatch = destinations.find((destination) =>
    (destination.matches ?? [destination.to]).some(
      (base) => base !== "/" && (pathname === base || pathname.startsWith(`${base}/`)),
    ),
  );
  return byMatch?.to ?? MORE.to;
}

export type MoreHubGroup = {
  title: string;
  items: {
    label: string;
    icon: ElementType;
    to: string;
    search?: Record<string, string | undefined>;
  }[];
};

/**
 * Hub "Mais" (§9): o catálogo do papel, achatado e agrupado pelos títulos que a
 * barra lateral já usa, menos o que está na barra inferior — repetir "Início"
 * no hub só faz o utilizador duvidar se são a mesma coisa.
 */
export function getMoreHubGroups(
  role: ApplicationRole,
  grants: Record<string, string> = {},
  plan?: Plan | null,
): MoreHubGroup[] {
  const inBottomNav = new Set(
    getMobileDestinations(role, grants, plan)
      .filter((destination) => destination.to !== MORE.to)
      .map((destination) => destination.to),
  );

  return getPortalNavigation(role, grants, plan)
    .map((group) => ({
      title: group.title,
      items: group.items
        .flatMap((item) =>
          item.children?.length
            ? item.children.map((child) => ({
                label: child.label,
                icon: child.icon,
                to: child.to,
                search: child.search,
              }))
            : item.to
              ? [{ label: item.label, icon: item.icon, to: item.to, search: item.search }]
              : [],
        )
        // Um módulo com sub-itens (ex. Definições) fica no hub; o que já está na
        // barra inferior sem sub-itens sai.
        .filter((entry) => !(inBottomNav.has(entry.to) && !entry.search)),
    }))
    .filter((group) => group.items.length > 0);
}

export const MORE_HUB_FALLBACK_ICON = Boxes;
