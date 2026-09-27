/** Defaults and display helpers for school settings when BD ainda não respondeu. */

export const schoolYear = "Ano Lectivo 2026/2027";

export const schoolSettingDefaults = {
  academicYear: "2026/2027",
  currency: "AOA",
  evaluationPeriods: 3,
  passingGrade: 10,
} as const;

/**
 * Natureza jurídica da instituição, no sentido usado pelo MINED. Aparece nos
 * documentos oficiais e distingue o regime a que a escola está sujeita.
 *
 * A lista é deliberadamente curta e tem "outra" como saída: é o ponto mais
 * provável de precisar de correcção por quem conhece a realidade angolana.
 */
export const angolaSchoolTypes = [
  { id: "publica", label: "Pública" },
  { id: "privada", label: "Privada" },
  { id: "comparticipada", label: "Comparticipada" },
  { id: "confessional", label: "Confessional" },
  { id: "internacional", label: "Internacional" },
  { id: "outra", label: "Outra" },
] as const;

export type AngolaSchoolTypeId = (typeof angolaSchoolTypes)[number]["id"];

export function isSchoolTypeId(value: unknown): value is AngolaSchoolTypeId {
  return angolaSchoolTypes.some((type) => type.id === value);
}

export const emptyInstitution = {
  nome: "",
  nif: "",
  diretor: "",
  telefone: "",
  email: "",
  endereco: "",
  provincia: "",
  municipio: "",
  comuna: "",
  bairro: "",
  gps: "",
} as const;
