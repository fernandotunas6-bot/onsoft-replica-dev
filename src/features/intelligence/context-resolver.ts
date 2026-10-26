import type { AppContext, ContextFrame, EntityFocus, EntityType, ResolvedContext } from "./types";

/**
 * SIGA Context Engine — resolução do contexto activo.
 *
 * Transforma a URL num caminho de entidades validado (Turma A → Matemática),
 * lido depois pela sidebar, pelo breadcrumb, pelo conteúdo e pelo painel de
 * relações. Não autoriza nada: só usa entidades que o servidor confirmou para a
 * escola activa, e o servidor continua a validar cada leitura e escrita.
 *
 * Ordem de resolução:
 * 1. parâmetros tipados da rota;
 * 2. entidade declarada pela página (`useDeclareEntityFocus`);
 * 3. contexto superior de cada recurso (a turma de uma disciplina);
 * 4. memória de navegação, só quando revalidada;
 * 5. nenhum: fica a área geral autorizada.
 */

export type ContextCandidate = { type: EntityType; id: string };

/** O que o servidor confirmou sobre uma entidade. */
export type ValidatedEntity = ContextFrame & {
  schoolId: string;
  /** O recurso superior, quando existe (a turma de uma disciplina). */
  parent?: ContextCandidate | null;
};

/**
 * Lê uma entidade já validada no servidor (normalmente da cache do React Query).
 * Devolve null quando o servidor recusou, não a conhece ou ainda não respondeu.
 */
export type ContextLookup = (candidate: ContextCandidate) => ValidatedEntity | null | undefined;

export type ContextSource = "route" | "focus" | "memory" | "area";

export type ResolveContextInput = {
  base: AppContext;
  schoolId: string;
  academicYearId: string | null;
  route: ContextCandidate[];
  focus?: EntityFocus | null;
  memory?: ContextCandidate[];
  lookup: ContextLookup;
};

export type ResolveContextResult = {
  context: ResolvedContext;
  source: ContextSource;
  /** O primeiro id da URL que o servidor não confirmou; o contexto fica no nível acima. */
  refused: ContextCandidate | null;
};

const MAX_DEPTH = 6;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function subjectOfferingId(classId: string, subjectId: string) {
  return `${classId}:${subjectId}`;
}

export function parseSubjectOfferingId(id: string): { classId: string; subjectId: string } | null {
  const [classId, subjectId, extra] = id.split(":");
  if (extra !== undefined || !classId || !subjectId) return null;
  if (!UUID.test(classId) || !UUID.test(subjectId)) return null;
  return { classId, subjectId };
}

/** Páginas que abrem uma turma por `?turma=` e, nas que o aceitam, a disciplina por `?disciplina=`. */
export const CLASS_SEARCH_ROUTES: ReadonlySet<string> = new Set([
  "/pedagogica",
  "/planos-aula",
  "/pedagogica/trabalhos",
  // Os ficheiros, os relatórios académicos e os alunos em risco estão por turma:
  // não aceitam disciplina.
  "/arquivos",
  "/relatorios/academicos",
  "/pedagogica/risco",
]);
const SUBJECT_SEARCH_ROUTES: ReadonlySet<string> = new Set([
  "/pedagogica",
  "/planos-aula",
  "/pedagogica/trabalhos",
]);
/**
 * Páginas que filtram por professor (`?professor=`, sem turma): o horário e as
 * aulas do dia da escola (só nos separadores Horários e Presenças), os planos de
 * aula e os trabalhos.
 */
function filtersByTeacher(pathname: string, search: Record<string, unknown>): boolean {
  if (pathname === "/pedagogica") return search.tab === "horarios" || search.tab === "presencas";
  return pathname === "/planos-aula" || pathname === "/pedagogica/trabalhos";
}

/** (1) Só rotas e parâmetros tipados que já existem; ids mal formados são ignorados. */
export function routeContextCandidates(
  pathname: string,
  search: Record<string, unknown> = {},
): ContextCandidate[] {
  const [, first, second, extra, more, rest] = pathname.split("/");
  // A ficha da turma (`/pedagogica/turmas/$turmaId`) e a renovação das
  // matrículas dela (`/pedagogica/turmas/$turmaId/renovar`).
  if (
    first === "pedagogica" &&
    second === "turmas" &&
    rest === undefined &&
    (more === undefined || more === "renovar")
  ) {
    return extra && UUID.test(extra) ? [{ type: "class", id: extra }] : [];
  }
  if (extra === undefined && second && UUID.test(second)) {
    if (first === "alunos") return [{ type: "student", id: second }];
    if (first === "professores") return [{ type: "teacher", id: second }];
    if (first === "faturas") return [{ type: "invoice", id: second }];
    if (first === "comunicacoes") return [{ type: "announcement", id: second }];
  }
  if (CLASS_SEARCH_ROUTES.has(pathname)) {
    const turma = typeof search.turma === "string" && UUID.test(search.turma) ? search.turma : null;
    if (!turma) {
      // O horário ou os planos de um professor (`?professor=`).
      const professor = search.professor;
      return filtersByTeacher(pathname, search) &&
        typeof professor === "string" &&
        UUID.test(professor)
        ? [{ type: "teacher", id: professor }]
        : [];
    }
    const candidates: ContextCandidate[] = [{ type: "class", id: turma }];
    const disciplina = search.disciplina;
    if (
      SUBJECT_SEARCH_ROUTES.has(pathname) &&
      typeof disciplina === "string" &&
      UUID.test(disciplina)
    ) {
      candidates.push({ type: "subject-offering", id: subjectOfferingId(turma, disciplina) });
    }
    return candidates;
  }
  return [];
}

const sameCandidate = (a: ContextCandidate, b: ContextCandidate) =>
  a.type === b.type && a.id === b.id;

const toFrame = ({ type, id, label, relations }: ContextFrame): ContextFrame =>
  relations ? { type, id, label, relations } : { type, id, label };

export function contextKey(
  schoolId: string,
  role: string,
  academicYearId: string | null,
  trail: ContextFrame[],
) {
  return [schoolId, role, academicYearId ?? "-", ...trail.map((f) => `${f.type}:${f.id}`)].join(
    "|",
  );
}

export function resolveContext(input: ResolveContextInput): ResolveContextResult {
  const { base, schoolId, academicYearId, lookup } = input;

  const validate = (candidate: ContextCandidate): ValidatedEntity | null => {
    const entity = lookup(candidate);
    // Outra escola, outro tipo ou outro id: tratado como recusado.
    if (!entity || entity.schoolId !== schoolId || !sameCandidate(entity, candidate)) return null;
    return entity;
  };

  /** Valida uma cadeia do mais geral para o mais específico; pára no primeiro recusado. */
  const validateChain = (candidates: ContextCandidate[]) => {
    const accepted: ValidatedEntity[] = [];
    for (const candidate of candidates) {
      const entity = validate(candidate);
      const previous = accepted.at(-1);
      // A disciplina tem de pertencer à turma que a precede na URL.
      const mismatched =
        entity && previous && entity.parent && !sameCandidate(entity.parent, previous);
      if (!entity || mismatched) return { accepted, refused: candidate };
      accepted.push(entity);
    }
    return { accepted, refused: null as ContextCandidate | null };
  };

  /** (3) Acrescenta à frente os recursos superiores confirmados. */
  const withParents = (first: ValidatedEntity | null, frames: ContextFrame[]) => {
    const trail = [...frames];
    const seen = new Set(trail.map((f) => `${f.type}:${f.id}`));
    let current = first;
    while (current?.parent && trail.length < MAX_DEPTH) {
      const parent = validate(current.parent);
      const key = parent ? `${parent.type}:${parent.id}` : "";
      if (!parent || seen.has(key)) break;
      seen.add(key);
      trail.unshift(toFrame(parent));
      current = parent;
    }
    return trail;
  };

  const finish = (
    trail: ContextFrame[],
    source: ContextSource,
    refused: ContextCandidate | null,
  ): ResolveContextResult => ({
    context: {
      ...base,
      schoolId,
      academicYearId,
      trail,
      activeView: null,
      key: contextKey(schoolId, base.role, academicYearId, trail),
    },
    source,
    refused,
  });

  // (1) A URL manda. Um id recusado deixa o contexto no nível acima, sem
  // recorrer a foco ou memória que mostrariam outra coisa que não a URL.
  if (input.route.length > 0) {
    const { accepted, refused } = validateChain(input.route);
    if (accepted.length === 0) return finish([], "area", refused);
    return finish(withParents(accepted[0], accepted.map(toFrame)), "route", refused);
  }

  // (2) Entidade declarada pela página, já lida do servidor para esta escola.
  const focus = input.focus;
  if (focus && focus.schoolId === schoolId) {
    const frame = toFrame(focus);
    return finish(withParents(validate(frame), [frame]), "focus", null);
  }

  // (4) Memória: só o que o servidor voltar a confirmar.
  if (input.memory && input.memory.length > 0) {
    const { accepted } = validateChain(input.memory);
    if (accepted.length > 0) {
      return finish(withParents(accepted[0], accepted.map(toFrame)), "memory", null);
    }
  }

  // (5) Área geral autorizada.
  return finish([], "area", null);
}

/**
 * Confirma só a entidade que a página declarou (`useDeclareEntityFocus`), já lida
 * do servidor com a escola a que pertence. Serve para validar o id da URL; nunca
 * cria contexto sozinha.
 */
export function focusContextLookup(focus: EntityFocus | null | undefined): ContextLookup {
  return (candidate) =>
    focus && sameCandidate(focus, candidate)
      ? {
          type: focus.type,
          id: focus.id,
          label: focus.label,
          schoolId: focus.schoolId,
          ...(focus.relations ? { relations: focus.relations } : {}),
        }
      : null;
}

/** A primeira fonte que confirma a entidade ganha. */
export function combineContextLookups(...lookups: ContextLookup[]): ContextLookup {
  return (candidate) => {
    for (const lookup of lookups) {
      const entity = lookup(candidate);
      if (entity) return entity;
    }
    return null;
  };
}
