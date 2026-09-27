/**
 * Estado das avaliações de um professor no trimestre (puro, sem I/O):
 * componentes da pauta (MAC, NPP, NPT) lançados por turma e prazo de fecho.
 */

export type ComponentCode = "MAC" | "NPP" | "NPT";
export const PAUTA_COMPONENTS: ComponentCode[] = ["MAC", "NPP", "NPT"];

export type ComponentState = "done" | "partial" | "none" | "no-students";

export function componentState(scored: number, enrolled: number): ComponentState {
  if (enrolled <= 0) return "no-students";
  if (scored <= 0) return "none";
  return scored >= enrolled ? "done" : "partial";
}

export function componentLabel(code: ComponentCode, scored: number, enrolled: number) {
  const state = componentState(scored, enrolled);
  if (state === "done") return `${code} lançada`;
  if (state === "no-students") return `${code} · sem alunos`;
  if (state === "none") return `${code} por lançar`;
  return `${code} ${scored}/${enrolled}`;
}

/** Dias (civis) até ao fim do período; negativo se já passou. */
export function daysUntil(isoDate: string, today: string) {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((toUtc(isoDate) - toUtc(today)) / 86_400_000);
}

export function deadlineLabel(daysLeft: number | null) {
  if (daysLeft == null) return null;
  if (daysLeft < 0) return "O período já terminou";
  if (daysLeft === 0) return "O lançamento fecha hoje";
  if (daysLeft === 1) return "O lançamento fecha amanhã";
  return `O lançamento fecha em ${daysLeft} dias`;
}

/** Período em curso; senão o próximo; senão o último. */
export function pickCurrentTerm<T extends { starts_on: string; ends_on: string; sequence: number }>(
  terms: T[],
  today: string,
): T | null {
  const sorted = [...terms].sort((a, b) => a.sequence - b.sequence);
  return (
    sorted.find((t) => t.starts_on <= today && today <= t.ends_on) ??
    sorted.find((t) => t.starts_on > today) ??
    sorted[sorted.length - 1] ??
    null
  );
}

/** Lembretes do prazo: só nestes dias antes do fim, e só havendo notas por lançar. */
export const DEADLINE_REMINDER_DAYS = [7, 3, 1];

export function shouldRemindDeadline(daysLeft: number, pendingComponents: number) {
  return pendingComponents > 0 && DEADLINE_REMINDER_DAYS.includes(daysLeft);
}
