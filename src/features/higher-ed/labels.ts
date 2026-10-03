import type { EnrollmentStatus, ExamSeason } from "./engine";

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  inscrito: "Inscrito",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  dispensado: "Creditada",
  anulado: "Anulada",
  excluido_faltas: "Excluído por faltas",
  excluido_frequencia: "Excluído por frequência",
};

export const SEASON_LABEL: Record<ExamSeason, string> = {
  frequencia: "Frequência",
  normal: "Época normal",
  recurso: "Recurso",
  especial: "Época especial",
  melhoria: "Melhoria",
};
