import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useTenant } from "@/features/saas/tenant-context";
import { useAcademicNavTree } from "@/features/academic/use-academic-nav-tree";
import { ACADEMIC_CONTEXT_ENTRIES } from "@/features/intelligence/academic-context-entries";
import { academicContextLookup } from "@/features/intelligence/academic-context-lookup";
import {
  contextEntryLink,
  findActiveContextEntry,
  getContextEntries,
  type ContextNavEntry,
} from "@/features/intelligence/context-registry";
import { resolveContext, routeContextCandidates } from "@/features/intelligence/context-resolver";
import type { ContextFrame, EntityType, ResolvedContext } from "@/features/intelligence/types";
import { cn } from "@/lib/utils";
import { NavLinkRow, NavSubheader } from "./NavItem";

/**
 * SIGA Context Engine — menu da entidade na sidebar existente (opção A: sem
 * coluna nova). Quando a URL abre uma turma ou uma disciplina que o servidor
 * devolveu à conta, a sidebar mostra «Voltar», o nome da entidade e só as
 * funções dessa entidade. A URL que o servidor não confirma não muda o menu.
 */

const ENTITY_KIND: Partial<Record<EntityType, string>> = {
  class: "Turma",
  "subject-offering": "Disciplina",
  student: "Aluno",
  teacher: "Professor",
};

/**
 * As entradas académicas são de gestão da turma (pauta, chamada, planos). Aluno e
 * encarregado vêem o que é seu pelo portal; as regras de rota deixam-nos abrir
 * `/pedagogica` e `/planos-aula`, por isso a restrição fica aqui, só a estreitar.
 */
const ACADEMIC_ENTITY_ROLES = new Set(["Administrador", "Secretaria", "Professor"]);

export type EntityNavigation = {
  context: ResolvedContext;
  entries: ContextNavEntry[];
  activeId: string | null;
  back: { to: string; search?: Record<string, string | undefined> };
};

/** Resolve o contexto da URL. Devolve null quando não há entidade confirmada. */
export function useEntityNavigation(
  pathname: string,
  search: Record<string, unknown>,
): EntityNavigation | null {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const { activePlan } = useTenant();
  const staff = ACADEMIC_ENTITY_ROLES.has(account.role);
  const route = useMemo(
    () => (staff ? routeContextCandidates(pathname, search) : []),
    [staff, pathname, search],
  );
  // Só pede dados quando a URL traz uma turma; noutras páginas nada é carregado.
  const { tree, schoolId } = useAcademicNavTree({ enabled: route.length > 0 });

  return useMemo(() => {
    if (route.length === 0 || !schoolId) return null;
    const { context } = resolveContext({
      base: {
        userId: account.id,
        role: account.role,
        grants: account.grants,
        pathname,
        focusedEntity: null,
      },
      schoolId,
      academicYearId: selectedYearId ?? null,
      route,
      lookup: academicContextLookup(tree, schoolId),
    });
    if (context.trail.length === 0) return null;
    const entries = getContextEntries(context, ACADEMIC_CONTEXT_ENTRIES, activePlan);
    if (entries.length === 0) return null;
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    return {
      context,
      entries,
      activeId: findActiveContextEntry(entries, context, pathname, search),
      back: { to: pathname, ...(tab ? { search: { tab } } : {}) },
    };
  }, [
    route,
    schoolId,
    tree,
    account.id,
    account.role,
    account.grants,
    activePlan,
    selectedYearId,
    pathname,
    search,
  ]);
}

function EntityHeader({ trail, collapsed }: { trail: ContextFrame[]; collapsed: boolean }) {
  const inner = trail.at(-1)!;
  const kind = ENTITY_KIND[inner.type] ?? "Contexto";
  const parents = trail.slice(0, -1).map((frame) => frame.label);
  if (collapsed) return <span className="sr-only">{`${kind} · ${inner.label}`}</span>;
  return (
    <div className="px-3 pt-3 pb-1" data-context-entity={inner.type}>
      <p className="truncate text-sm font-semibold text-sidebar-foreground" title={inner.label}>
        <span className="text-sidebar-muted">{kind} · </span>
        {inner.label}
      </p>
      {parents.length > 0 ? (
        <p className="truncate text-[11px] font-medium text-sidebar-muted">{parents.join(" · ")}</p>
      ) : null}
    </div>
  );
}

export function ContextEntityNav({
  navigation,
  areaTitle,
  collapsed = false,
}: {
  navigation: EntityNavigation;
  areaTitle: string | null;
  collapsed?: boolean;
}) {
  const { context, entries, activeId, back } = navigation;
  const groups = entries.reduce<Array<{ title: string; items: ContextNavEntry[] }>>(
    (result, entry) => {
      const group = result.find((item) => item.title === entry.group);
      if (group) group.items.push(entry);
      else result.push({ title: entry.group, items: [entry] });
      return result;
    },
    [],
  );

  return (
    <section
      aria-label={`${ENTITY_KIND[context.trail.at(-1)!.type] ?? "Contexto"}: ${context.trail.at(-1)!.label}`}
      data-context-nav=""
      className={cn(!collapsed && "border-b border-sidebar-border/40 pb-2")}
    >
      <NavLinkRow
        to={back.to}
        {...(back.search ? { search: back.search } : {})}
        label={areaTitle ? `Voltar a ${areaTitle}` : "Voltar"}
        icon={ArrowLeft}
        collapsed={collapsed}
        active={false}
      />
      <EntityHeader trail={context.trail} collapsed={collapsed} />
      {groups.map((group) => (
        <div key={group.title}>
          <NavSubheader title={group.title} collapsed={collapsed} />
          <ul className="space-y-0.5">
            {group.items.map((entry) => {
              const link = contextEntryLink(entry, context);
              return (
                <li key={entry.id}>
                  <NavLinkRow
                    to={link.to}
                    search={link.search}
                    label={entry.label}
                    icon={entry.icon}
                    collapsed={collapsed}
                    active={entry.id === activeId}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
