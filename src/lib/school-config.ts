/** Defaults and display helpers for school settings when BD ainda não respondeu. */

export const schoolYear = "Ano Lectivo 2026/2027";

export const schoolSettingDefaults = {
  academicYear: "2026/2027",
  currency: "AOA",
  evaluationPeriods: 3,
  passingGrade: 10,
} as const;

export const emptyInstitution = {
  nome: "",
  nif: "",
  diretor: "",
  telefone: "",
  email: "",
  endereco: "",
} as const;
