/**
 * Quem pode conversar com quem. O pessoal da escola fala com toda a gente;
 * alunos, encarregados e contas sem cargo só com o pessoal. Sem isto, um
 * encarregado (um adulto de fora) escrevia em privado a qualquer aluno, e
 * alunos trocavam mensagens entre si sem supervisão.
 *
 * Lógica pura: o servidor aplica-a (`server.ts`, `chat-server.ts`) e o ecrã
 * usa-a só para explicar a regra a quem ainda não tem conversas.
 */
const MESSAGING_STAFF_ROLES = new Set(["Administrador", "Secretaria", "Tesouraria", "Professor"]);

export function isMessagingStaff(roles: readonly string[]): boolean {
  return roles.some((role) => MESSAGING_STAFF_ROLES.has(role));
}
