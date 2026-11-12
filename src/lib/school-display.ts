/** Display labels only: persisted codes and form values must remain unchanged. */
export const SCHOOL_SHIFT_LABELS: Record<string, string> = {
  morning: "Manhã",
  afternoon: "Tarde",
  evening: "Noite",
};

export function schoolShiftLabel(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? (SCHOOL_SHIFT_LABELS[text.toLowerCase()] ?? text) : "—";
}

export function studentGenderLabel(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "—";
  const labels: Record<string, string> = {
    m: "Masculino",
    male: "Masculino",
    masculino: "Masculino",
    f: "Feminino",
    female: "Feminino",
    feminino: "Feminino",
    other: "Outro",
    outro: "Outro",
  };
  return labels[text.toLowerCase()] ?? text;
}
