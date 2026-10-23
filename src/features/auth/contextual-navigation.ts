import { isNavChildActive, type NavGroup } from "./portal-engine";

/** Resolve only from the navigation already filtered by role, grants and plan. */
export function getNavigationContext(
  groups: NavGroup[],
  pathname: string,
  search: Record<string, unknown> = {},
): NavGroup | null {
  const candidates = groups.flatMap((group) =>
    group.items.flatMap((item) => {
      const links = item.children ?? (item.to ? [{ ...item, to: item.to }] : []);
      return links
        .filter((link) => link.to === pathname || pathname.startsWith(`${link.to}/`))
        .map((link) => ({
          group,
          item,
          score:
            link.to.length * 100 +
            (isNavChildActive(link, pathname, search) ? 10 : 0) +
            Object.entries(link.search ?? {}).filter(
              ([key, value]) => value !== undefined && search[key] === value,
            ).length,
        }));
    }),
  );
  candidates.sort((a, b) => b.score - a.score);
  const match = candidates[0];
  if (!match || match.group.title === "Principal" || match.item.to === "/portal") return null;
  // O módulo reúne os destinos autorizados, incluindo relatórios antes separados
  // no catálogo global. Nunca acrescenta um link que não veio desse catálogo.
  const moduleTitle =
    match.group.title === "Financeiro" || pathname.startsWith("/relatorios/financeiros")
      ? "Financeiro"
      : match.group.title === "Académico" || pathname.startsWith("/relatorios/academicos")
        ? "Académico"
        : null;
  if (moduleTitle) {
    const reportPath =
      moduleTitle === "Financeiro" ? "/relatorios/financeiros" : "/relatorios/academicos";
    const items = groups.flatMap((group) =>
      group.items.flatMap((item) => {
        if (group.title === moduleTitle) return item.children ?? [item];
        return (item.children ?? [item]).filter((link) => link.to === reportPath);
      }),
    );
    return { title: moduleTitle, items };
  }
  if (match.item.children) {
    return { title: match.item.label, items: match.item.children };
  }
  return match.group.title.startsWith("Portal do")
    ? { title: match.item.label, items: [match.item] }
    : match.group;
}

/** Uma área geral abre apenas os seus destinos, mantendo a ordem do catálogo. */
export function flattenNavigationGroup(group: NavGroup): NavGroup {
  return {
    ...group,
    items: group.items.flatMap<NavGroup["items"][number]>((item) => item.children ?? [item]),
  };
}

/** Prefer the most specific destination, so list/actions do not light up together. */
export function isContextDestinationActive(
  link: { to: string; search?: Record<string, string | undefined> },
  groups: NavGroup[],
  pathname: string,
  search: Record<string, unknown>,
): boolean {
  const links = groups.flatMap((group) =>
    group.items.flatMap((item) => item.children ?? (item.to ? [{ ...item, to: item.to }] : [])),
  );
  const matchesPath = (to: string) => to === pathname || pathname.startsWith(`${to}/`);
  const matchesSearch = (item: typeof link) =>
    Object.entries(item.search ?? {}).every(
      ([key, value]) => value === undefined || search[key] === value,
    );
  const matches = links.filter((item) => matchesPath(item.to) && matchesSearch(item));
  matches.sort(
    (a, b) =>
      b.to.length - a.to.length ||
      Object.keys(b.search ?? {}).length - Object.keys(a.search ?? {}).length,
  );
  const best = matches[0];
  return Boolean(
    best &&
    best.to === link.to &&
    matchesSearch(link) &&
    Object.keys(link.search ?? {}).length === Object.keys(best.search ?? {}).length,
  );
}
