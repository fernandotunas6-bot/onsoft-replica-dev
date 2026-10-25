/**
 * SIGA Context Engine — resolução do contexto activo.
 *
 * Função pura: recebe a rota já validada pelo router (pathname + search tipado),
 * a conta activa e a entidade declarada pela página, e devolve um único "frame"
 * com a escola, o papel, o ano lectivo e a entidade em que o utilizador trabalha.
 *
 * Ordem de resolução (spec §6): 1) rota e parâmetros tipados; 2) entidade activa
 * declarada pela página, se pertencer à mesma escola e for coerente com a rota;
 * 3) contexto geral. Não lê `localStorage` nem confia em IDs para autorizar: um
 * frame só decide o que a navegação mostra. O servidor continua a validar.
 *
 * Contrato: docs/specs/SIGA_CONTEXT_ENGINE_2026.md
 */
import type { EntityFocus } from "./types";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rotas com turma/disciplina tipadas por `validateSearch` (zod `.guid()`). */
const CLASS_SCOPED_PATHS = ["/pedagogica", "/planos-aula", "/professor/presenca"] as const;

export type ContextEntity =
  | { type: "subject"; classGroupId: string; subjectId: string }
  | { type: "class"; classGroupId: string }
  | { type: "student"; studentId: string }
  | { type: "teacher"; teacherId: string };

export type ContextEntityType = ContextEntity["type"];

export type ContextSource = "route" | "focus" | "none";

export interface ContextFrame {
  schoolId: string | null;
  role: string;
  academicYearId: string | null;
  entity: ContextEntity | null;
  source: ContextSource;
  /** Nível 4 — a função seleccionada (pathname + tab, quando existe). */
  activeView: { pathname: string; tab: string | null };
  /**
   * Identidade estável do contexto. Muda quando muda a escola, o papel, o ano ou a
   * entidade: serve de chave para memória e para descartar estado antigo.
   */
  key: string;
}

export interface ResolveContextInput {
  pathname: string;
  search?: Record<string, unknown>;
  schoolId: string | null | undefined;
  role: string;
  academicYearId?: string | null;
  focusedEntity?: EntityFocus | null;
}

function guid(value: unknown): string | null {
  return typeof value === "string" && GUID.test(value) ? value : null;
}

function matchesPath(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function entityFromRoute(pathname: string, search: Record<string, unknown>): ContextEntity | null {
  const student = pathname.match(/^\/alunos\/([^/]+)$/);
  if (student && guid(student[1])) return { type: "student", studentId: student[1]! };
  const teacher = pathname.match(/^\/professores\/([^/]+)$/);
  if (teacher && guid(teacher[1])) return { type: "teacher", teacherId: teacher[1]! };

  if (CLASS_SCOPED_PATHS.some((base) => matchesPath(pathname, base))) {
    const classGroupId = guid(search.turma);
    const subjectId = guid(search.disciplina);
    if (classGroupId && subjectId) return { type: "subject", classGroupId, subjectId };
    if (classGroupId) return { type: "class", classGroupId };
  }
  return null;
}

function entityFromFocus(focus: EntityFocus): ContextEntity | null {
  if (!guid(focus.id)) return null;
  if (focus.type === "student") return { type: "student", studentId: focus.id };
  if (focus.type === "teacher") return { type: "teacher", teacherId: focus.id };
  if (focus.type === "class") return { type: "class", classGroupId: focus.id };
  return null;
}

function entityId(entity: ContextEntity) {
  switch (entity.type) {
    case "subject":
      return `${entity.classGroupId}/${entity.subjectId}`;
    case "class":
      return entity.classGroupId;
    case "student":
      return entity.studentId;
    case "teacher":
      return entity.teacherId;
  }
}

export function contextEntityKey(entity: ContextEntity | null) {
  return entity ? `${entity.type}:${entityId(entity)}` : "none";
}

export function resolveContextFrame(input: ResolveContextInput): ContextFrame {
  const search = input.search ?? {};
  const schoolId = input.schoolId ?? null;
  const academicYearId = input.academicYearId ?? null;

  let entity = entityFromRoute(input.pathname, search);
  let source: ContextSource = entity ? "route" : "none";

  if (!entity && input.focusedEntity && schoolId) {
    const focus = input.focusedEntity;
    // Uma entidade declarada por outra escola (render intermédio ao trocar de
    // escola) nunca entra no frame.
    if (focus.schoolId === schoolId) {
      const candidate = entityFromFocus(focus);
      // A entidade declarada só vale na sua própria página de detalhe ou numa
      // página sem entidade própria; nunca substitui o que a rota diz.
      if (candidate) {
        entity = candidate;
        source = "focus";
      }
    }
  }

  const tab = typeof search.tab === "string" ? search.tab : null;
  return {
    schoolId,
    role: input.role,
    academicYearId,
    entity,
    source,
    activeView: { pathname: input.pathname, tab },
    key: [schoolId ?? "-", input.role, academicYearId ?? "-", contextEntityKey(entity)].join("|"),
  };
}

/** Dois frames pertencem ao mesmo contexto (escola, papel, ano e entidade). */
export function isSameContext(a: ContextFrame, b: ContextFrame) {
  return a.key === b.key;
}
