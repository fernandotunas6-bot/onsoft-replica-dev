/** Abaixo da aprovação a vermelho; da aprovação em diante a verde. */
export function gradeToneClass(value: number | null | undefined, passing = 10) {
  if (value == null) return "text-muted-foreground";
  return value < passing ? "text-destructive" : "text-success-strong";
}
