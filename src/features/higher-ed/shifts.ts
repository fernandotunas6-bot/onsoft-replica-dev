/**
 * Turnos das cadeiras (`course_unit_enrollments.class_group_id`, 20261006090000).
 *
 * Um turno é uma turma do curso onde a cadeira é dada (tem a disciplina em
 * `class_subjects`). Quando o mesmo ano tem várias turmas, cada inscrição na cadeira
 * fica num turno e o professor só vê e lança os estudantes dos turnos que dá.
 * Inscrições sem turno (antigas, ou cadeira sem turma) continuam visíveis a todos os
 * professores da cadeira, como antes.
 */

/** Quem lança uma cadeira: a coordenação (todos os turnos) ou o professor (os seus). */
export type LaunchScope = { all: true } | { all: false; groups: ReadonlySet<string> };

export const NO_LAUNCH: LaunchScope = { all: false, groups: new Set() };

export function canLaunchAny(scope: LaunchScope) {
  return scope.all || scope.groups.size > 0;
}

/** O professor vê o estudante se a inscrição não tem turno ou é num turno seu. */
export function shiftVisible(scope: LaunchScope, shift: string | null) {
  return scope.all || shift === null || scope.groups.has(shift);
}

/**
 * Turno por omissão de uma nova inscrição: a turma do estudante, se dá a cadeira; senão,
 * o único turno que a dá; com vários e nenhum do estudante, fica sem turno (a secretaria
 * escolhe).
 */
export function defaultShift(
  studentGroupIds: readonly string[],
  offeringGroupIds: readonly string[],
): string | null {
  const own = studentGroupIds.find((id) => offeringGroupIds.includes(id));
  if (own) return own;
  return offeringGroupIds.length === 1 ? offeringGroupIds[0]! : null;
}
