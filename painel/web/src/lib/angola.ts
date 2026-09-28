/**
 * Listas partilhadas com o SIGA (src/lib/angola-territory.ts e
 * src/lib/school-config.ts). O servidor valida com as mesmas; um valor fora
 * delas é ignorado, não recusa o registo.
 */
export const ANGOLA_PROVINCES = [
  "Bengo",
  "Benguela",
  "Bié",
  "Cabinda",
  "Cuando",
  "Cuanza Norte",
  "Cuanza Sul",
  "Cubango",
  "Cunene",
  "Huambo",
  "Huíla",
  "Icolo e Bengo",
  "Luanda",
  "Lunda Norte",
  "Lunda Sul",
  "Malanje",
  "Moxico",
  "Moxico Leste",
  "Namibe",
  "Uíge",
  "Zaire",
] as const

export const SCHOOL_TYPES = [
  { id: "privada", label: "Privada" },
  { id: "publica", label: "Pública" },
  { id: "comparticipada", label: "Comparticipada" },
  { id: "confessional", label: "Confessional" },
  { id: "internacional", label: "Internacional" },
  { id: "outra", label: "Outra" },
] as const

export type SchoolTypeId = (typeof SCHOOL_TYPES)[number]["id"]

/**
 * Níveis de ensino oferecidos. Mesma lista que `INSTITUTION_LEVELS` no SIGA
 * (src/features/saas/institution-profile.ts): o servidor cria a partir dela as
 * classes, disciplinas e períodos.
 */
export const TEACHING_LEVELS = [
  { id: "pre_escolar", label: "Pré-escolar", detail: "Iniciação", grades: 1, semesters: false },
  { id: "primario", label: "Primário", detail: "1ª à 6ª classe", grades: 6, semesters: false },
  { id: "i_ciclo", label: "I Ciclo", detail: "7ª à 9ª classe", grades: 3, semesters: false },
  { id: "ii_ciclo", label: "II Ciclo / Médio", detail: "10ª à 12ª classe", grades: 3, semesters: false },
  { id: "tecnico", label: "Técnico-profissional", detail: "10ª à 13ª classe", grades: 4, semesters: false },
  { id: "superior", label: "Ensino Superior", detail: "Cursos e semestres", grades: 0, semesters: true },
] as const

export const TEACHING_LEVEL_IDS = TEACHING_LEVELS.map((level) => level.id) as unknown as [
  (typeof TEACHING_LEVELS)[number]["id"],
  ...(typeof TEACHING_LEVELS)[number]["id"][],
]

export const SHIFT_OPTIONS = [
  { id: "morning", label: "Manhã", detail: "07:00–12:30" },
  { id: "afternoon", label: "Tarde", detail: "13:00–18:30" },
  { id: "evening", label: "Noite", detail: "18:30–22:30" },
] as const

export const SHIFT_IDS = SHIFT_OPTIONS.map((shift) => shift.id) as unknown as [
  (typeof SHIFT_OPTIONS)[number]["id"],
  ...(typeof SHIFT_OPTIONS)[number]["id"][],
]

/** Frase curta com o que a escola recebe ao ser criada. */
export function institutionSummary(levels: readonly string[], rooms: number): string[] {
  const chosen = TEACHING_LEVELS.filter((level) => levels.includes(level.id))
  if (!chosen.length) return []
  const grades = chosen.reduce((total, level) => total + level.grades, 0)
  const onlyHigher = chosen.every((level) => level.semesters)
  const lines: string[] = []
  if (chosen.length > 1) lines.push(`Complexo escolar com ${chosen.length} níveis de ensino`)
  if (grades) lines.push(`${grades} classe(s) com as disciplinas do plano de estudos`)
  if (chosen.some((level) => level.semesters)) lines.push("Ensino superior: os cursos criam-se no SIGA")
  lines.push(onlyHigher ? "Ano lectivo em 2 semestres" : "Ano lectivo em 3 trimestres")
  if (rooms > 0) lines.push(`${rooms} sala(s) prontas para o horário`)
  return lines
}

/**
 * País do sistema de ensino seguido. Mesma lista que `EDUCATION_COUNTRIES` no
 * SIGA (src/features/academic/higher-ed-regulation.ts): define a escala de
 * notas, o nome dos créditos e as regras; tudo se muda depois.
 */
export const EDUCATION_COUNTRIES = [
  { code: "AO", name: "Angola" },
  { code: "MZ", name: "Moçambique" },
  { code: "CV", name: "Cabo Verde" },
  { code: "GW", name: "Guiné-Bissau" },
  { code: "ST", name: "São Tomé e Príncipe" },
  { code: "TL", name: "Timor-Leste" },
  { code: "PT", name: "Portugal" },
  { code: "ES", name: "Espanha" },
  { code: "FR", name: "França" },
  { code: "BR", name: "Brasil" },
  { code: "US", name: "Estados Unidos" },
  { code: "CA", name: "Canadá" },
  { code: "GB", name: "Reino Unido" },
  { code: "ZA", name: "África do Sul" },
  { code: "NA", name: "Namíbia" },
] as const
