/**
 * Contas de acesso dos alunos. Puro: o servidor usa-o para criar as contas.
 *
 * O aluno quase nunca tem e-mail. A conta (Supabase Auth) leva um endereço
 * interno, sem caixa de correio, que nunca aparece no ecrã: o aluno entra com o
 * número de aluno (ou o BI) e a senha. A primeira senha é provisória, entregue
 * em papel pela Secretaria, e tem de ser trocada no primeiro acesso.
 */
import { passwordMeetsPolicy } from "@/lib/password-policy-error";

/** Por chamada: cada conta são ~6 pedidos à base; o ecrã envia a turma em lotes. */
export const ACCOUNTS_BATCH = 10;

/** Domínio da plataforma, sem caixas de correio: nada enviado para lá chega a alguém. */
export const STUDENT_LOGIN_DOMAIN = "alunos.portal-siga.com";

/** Endereço interno e único: número de aluno + código público da escola. */
export function studentLoginEmail(studentNumber: string, schoolCode: string): string {
  const number = studentNumber.replace(/[^0-9a-z]/gi, "").toLowerCase();
  const school = schoolCode.replace(/[^0-9a-z]/gi, "").toLowerCase();
  if (!number || !school) throw new Error("Aluno sem número ou escola sem código público.");
  return `${number}.${school}@${STUDENT_LOGIN_DOMAIN}`;
}

// Sem 0/O, 1/I/l: a senha vai em papel e é copiada por crianças.
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";

/** Senha provisória legível: «KMPT-4827-ra». Cumpre a política (maiúscula, minúscula, número, ≥ 8). */
export function provisionalPassword(
  random: (max: number) => number = (max) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0]! % max;
  },
): string {
  const pick = (alphabet: string, count: number) =>
    Array.from({ length: count }, () => alphabet[random(alphabet.length)]).join("");
  const password = `${pick(UPPER, 4)}-${pick(DIGITS, 4)}-${pick(LOWER, 2)}`;
  if (!passwordMeetsPolicy(password)) throw new Error("Senha provisória fora da política.");
  return password;
}

/** A conta tem de trocar a senha? (`app_metadata`: só o servidor escreve.) */
export function mustChangePassword(appMetadata: unknown): boolean {
  return Boolean(
    appMetadata &&
      typeof appMetadata === "object" &&
      (appMetadata as Record<string, unknown>).must_change_password === true,
  );
}
