import { useMemo } from "react";
import { ArrowLeft, History } from "lucide-react";
import { canAccessPath } from "@/features/auth/access-policy";
import { useCurrentAccount } from "@/features/auth/use-current-account";
import { useSchoolSettings } from "@/features/auth/use-school-settings";
import { useTenant } from "@/features/saas/tenant-context";
import { useAcademicNavTree } from "@/features/academic/use-academic-nav-tree";
import { academicContextLookup } from "@/features/intelligence/academic-context-lookup";
import { useEntityFocus } from "@/features/intelligence/entity-focus-context";
import {
  canOpenEntityMenu,
  CONTEXT_ENTRIES,
  contextBackLink,
} from "@/features/intelligence/context-modules";
import {
  teacherContextLookup,
  useTeacherNavList,
} from "@/features/intelligence/teacher-context-lookup";
import {
  contextEntryLink,
  findActiveContextEntry,
  getContextEntries,
} from "@/features/intelligence/context-registry";
import {
  combineContextLookups,
  focusContextLookup,
  resolveContext,
  routeContextCandidates,
} from "@/features/intelligence/context-resolver";
import {
  entityKindLabel,
  groupContextEntries,
  type EntityNavigation,
} from "@/features/intelligence/entity-navigation";
import type { ContextFrame, ResolvedContext } from "@/features/intelligence/types";
import { navMemoryOwner, readRecentNav } from "@/lib/navigation-memory";
import { cn } from "@/lib/utils";
import { pickResumeTarget } from "@/features/intelligence/resume-context";
import { NavLinkRow, NavSubheader } from "./NavItem";

/**
 * SIGA Context Engine — menu da entidade na sidebar existente (opção A: sem
 * coluna nova). Quando a URL abre uma turma, uma disciplina ou um aluno que o
 * servidor devolveu à conta, a sidebar mostra «Voltar», o nome da entidade e só
 * as funções dessa entidade. A URL que o servidor não confirma não muda o menu.
 */

/** Resolve o contexto da URL. Devolve null quando não há entidade confirmada. */
export function useEntityNavigation(
  pathname: string,
  search: Record<string, unknown>,
): EntityNavigation | null {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const { activePlan } = useTenant();
  const { focusedEntity } = useEntityFocus();
  // Cada módulo diz quem recebe o menu das suas entidades (o da turma é da equipa,
  // o da fatura da tesouraria); as outras entidades da URL nem se resolvem.
  const route = useMemo(
    () =>
      routeContextCandidates(pathname, search).filter((candidate) =>
        canOpenEntityMenu(candidate.type, account.role),
      ),
    [account.role, pathname, search],
  );
  // Só pede turmas e disciplinas quando a URL traz uma turma; noutras páginas
  // nada é carregado.
  const academic = route.some(
    (candidate) => candidate.type === "class" || candidate.type === "subject-offering",
  );
  const { tree, schoolId } = useAcademicNavTree({ enabled: academic });
  // O professor do horário (`?professor=`) confirma-se na lista da escola; no
  // perfil, pelo foco que a página declara.
  const teachers = useTeacherNavList({
    enabled: !pathname.startsWith("/professores/") && route.some((c) => c.type === "teacher"),
  });

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
      // Turma e disciplina vêm da lista que o servidor devolveu à conta; o aluno e
      // o professor, da ficha que a página leu do servidor (a entidade em foco) ou,
      // no horário, da lista de professores da escola.
      lookup: combineContextLookups(
        academicContextLookup(tree, schoolId),
        focusContextLookup(focusedEntity),
        teacherContextLookup(teachers, schoolId),
      ),
    });
    if (context.trail.length === 0) return null;
    const entries = getContextEntries(context, CONTEXT_ENTRIES, activePlan);
    if (entries.length === 0) return null;
    return {
      context,
      entries,
      activeId: findActiveContextEntry(entries, context, pathname, search),
      back: contextBackLink(context, pathname, search),
    };
  }, [
    route,
    schoolId,
    tree,
    teachers,
    focusedEntity,
    account.id,
    account.role,
    account.grants,
    activePlan,
    selectedYearId,
    pathname,
    search,
  ]);
}

export type ResumeLink = {
  to: string;
  search: Record<string, string>;
  label: string;
};

/**
 * Memória de contexto: na área académica sem turma aberta, a turma ou
 * disciplina onde a conta estava, se o servidor ainda a devolve. Os recentes
 * são por utilizador e escola; o nome vem da árvore académica do servidor.
 */
export function useResumeNavigation(
  pathname: string,
  search: Record<string, unknown>,
  enabled: boolean,
): ResumeLink | null {
  const account = useCurrentAccount();
  const { selectedYearId } = useSchoolSettings();
  const { activePlan } = useTenant();
  // «Continuar» reabre uma turma ou disciplina: só a quem recebe esse menu.
  const staff = canOpenEntityMenu("class", account.role);
  const owner = navMemoryOwner(account.id || account.email || "anon", account.schoolId);
  // Lê os recentes antes de a página actual entrar neles (o AppShell grava depois).
  const target = useMemo(() => {
    if (!enabled || !staff) return null;
    if (!pathname.startsWith("/pedagogica") && !pathname.startsWith("/planos-aula")) return null;
    return pickResumeTarget(readRecentNav(owner), { path: pathname, search });
  }, [enabled, staff, pathname, search, owner]);
  const { tree, schoolId } = useAcademicNavTree({ enabled: target !== null });

  return useMemo(() => {
    if (!target || !schoolId) return null;
    if (!canAccessPath(target.path, account.role, account.grants, activePlan)) return null;
    const { context } = resolveContext({
      base: {
        userId: account.id,
        role: account.role,
        grants: account.grants,
        pathname: target.path,
        focusedEntity: null,
      },
      schoolId,
      academicYearId: selectedYearId ?? null,
      route: target.candidates,
      lookup: academicContextLookup(tree, schoolId),
    });
    // Só retoma o que o servidor confirmou por inteiro (turma e, se havia, disciplina).
    if (context.trail.length !== target.candidates.length) return null;
    return {
      to: target.path,
      search: target.search,
      label: context.trail.map((frame) => frame.label).join(" · "),
    };
  }, [
    target,
    schoolId,
    tree,
    account.id,
    account.role,
    account.grants,
    activePlan,
    selectedYearId,
  ]);
}

export function ResumeContextLink({ link, collapsed }: { link: ResumeLink; collapsed: boolean }) {
  return (
    <div data-context-resume="">
      <NavLinkRow
        to={link.to}
        search={link.search}
        label={`Continuar em ${link.label}`}
        icon={History}
        collapsed={collapsed}
        active={false}
      />
    </div>
  );
}

function EntityHeader({ trail, collapsed }: { trail: ContextFrame[]; collapsed: boolean }) {
  const inner = trail.at(-1)!;
  const kind = entityKindLabel(inner.type);
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
  const groups = groupContextEntries(entries);
  const inner = context.trail.at(-1)!;

  return (
    <section
      aria-label={`${entityKindLabel(inner.type)}: ${inner.label}`}
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
