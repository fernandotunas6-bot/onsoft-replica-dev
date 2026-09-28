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
