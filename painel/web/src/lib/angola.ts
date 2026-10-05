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
 * Níveis de ensino e cursos do II Ciclo — os mesmos ids de
 * src/lib/angola-academic.ts no SIGA. Com eles o SIGA cria logo as classes,
 * cursos e disciplinas certos para a escola (uma primária não nasce com a
 * 10ª classe; um complexo nasce com todos os níveis que lecciona).
 */
export const TEACHING_LEVELS = [
  { id: "pre_escolar", label: "Iniciação", hint: "Pré-escolar" },
  { id: "primario", label: "Ensino Primário", hint: "1ª à 6ª classe" },
  { id: "i_ciclo", label: "I Ciclo", hint: "7ª à 9ª classe" },
  { id: "ii_ciclo", label: "II Ciclo / Médio", hint: "10ª à 12ª/13ª classe" },
  { id: "superior", label: "Ensino Superior", hint: "Licenciatura" },
] as const

export type TeachingLevelId = (typeof TEACHING_LEVELS)[number]["id"]

export const SECONDARY_COURSES = [
  { id: "cfb", label: "Ciências Físicas e Biológicas" },
  { id: "cej", label: "Ciências Económico-Jurídicas" },
  { id: "letras", label: "Letras" },
  { id: "tecnico", label: "Técnico-Profissional" },
] as const
