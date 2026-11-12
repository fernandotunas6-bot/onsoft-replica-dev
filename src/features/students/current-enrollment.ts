import { CURRENT_ENROLLMENT_STATUSES } from "./enrollment-sync";

type EnrollmentLike = { status: string; enrolled_on?: string | null };

/**
 * A matrícula que a ficha e a lista mostram como «a do aluno».
 *
 * Com a matrícula antecipada (auditoria 14, A2) um aluno pode ter duas correntes: a do
 * ano em curso e a do ano seguinte, com data de matrícula no início desse ano. A ficha
 * escolhia uma qualquer e a lista a última activa da ordenação. Regra:
 * 1. entre as correntes (pendente ou activa), as que já começaram (data até hoje);
 *    dessas, a activa antes da pendente, e a mais recente;
 * 2. sem nenhuma começada, a corrente que começa primeiro (só a antecipada);
 * 3. sem correntes, a mais recente de todas (anulada, transferida…).
 */
export function pickCurrentEnrollment<T extends EnrollmentLike>(
  rows: readonly T[],
  today: string,
): T | null {
  const current = rows.filter((row) =>
    (CURRENT_ENROLLMENT_STATUSES as readonly string[]).includes(row.status),
  );
  const date = (row: T) => row.enrolled_on ?? "";
  const started = current
    .filter((row) => date(row) <= today)
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        date(b).localeCompare(date(a)),
    );
  if (started[0]) return started[0];
  const upcoming = current.slice().sort((a, b) => date(a).localeCompare(date(b)));
  if (upcoming[0]) return upcoming[0];
  return rows.slice().sort((a, b) => date(b).localeCompare(date(a)))[0] ?? null;
}
