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
  if (match.group.title.startsWith("Portal do")) {
    const links = flattenNavigationGroup(match.group).items;
    const isAcademic = (to = "") =>
      ["/pedagogica", "/planos-aula", "/professor/presenca"].some(
        (base) => to === base || to.startsWith(`${base}/`),
      );
    const isFinancial = (to = "") =>
      ["/financeiro", "/faturas", "/tesouraria"].some(
        (base) => to === base || to.startsWith(`${base}/`),
      );
    if (isAcademic(pathname) || isFinancial(pathname)) {
      const accepts = isAcademic(pathname) ? isAcademic : isFinancial;
      return {
        title: isAcademic(pathname) ? "Académico" : "Financeiro",
        items: links.filter((link) => accepts(link.to)),
      };
    }
    return { title: match.item.label, items: match.item.children ?? [match.item] };
  }
  const area = getNavigationAreas(groups).find((group) =>
    group.items.some((item) => item.to === pathname || pathname.startsWith(`${item.to}/`)),
  );
  if (area && area.title !== "Sistema") return area;
  if (match.item.children) {
    return { title: match.item.label, items: match.item.children };
  }
  return { title: match.item.label, items: [match.item] };
}

/** Uma área geral abre apenas os seus destinos, mantendo a ordem do catálogo. */
export function flattenNavigationGroup(group: NavGroup): NavGroup {
  return {
    ...group,
    items: group.items.flatMap<NavGroup["items"][number]>((item) => item.children ?? [item]),
  };
}

/** A mesma organização no desktop, gaveta e pesquisa; só usa destinos autorizados. */
export function getNavigationAreas(groups: NavGroup[]): NavGroup[] {
  const areas = groups.map(flattenNavigationGroup);
  const reports = areas.find((group) => group.title === "Relatórios");
  if (!reports) return areas;
  const moved = new Set<string>();
  const result = areas.map((group) => {
    const reportPath =
      group.title === "Financeiro"
        ? "/relatorios/financeiros"
        : group.title === "Académico"
          ? "/relatorios/academicos"
          : null;
    if (!reportPath) return group;
    const links = reports.items.filter((item) => item.to === reportPath);
    links.forEach((item) => moved.add(item.to!));
    return { ...group, items: [...group.items, ...links] };
  });
  return result
    .map((group) =>
      group.title === "Relatórios"
        ? { ...group, items: group.items.filter((item) => !moved.has(item.to!)) }
        : group,
    )
    .filter((group) => group.items.length > 0);
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
