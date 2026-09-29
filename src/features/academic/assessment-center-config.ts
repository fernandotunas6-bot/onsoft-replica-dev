import type { PautaExportRow } from "@/features/academic/OfficialPautaView";

/** Tipos e configuração do Centro de Avaliação (`AssessmentCenter.tsx`). */

export type EnrollmentRow = {
  id: string;
  student_name: string;
  student_photo_url?: string | null;
  registration_number?: string | null;
  class_group_id?: string | null;
  class_group_name: string;
};

export type TermGradeRow = {
  enrollment_id: string;
  subject_id: string;
  term: number;
  mac: number;
  npp: number;
  npt: number;
};

export type StudentListExportRow = Pick<PautaExportRow, "n" | "aluno" | "proc">;

export type ClassMapExportRow = {
  classe: string;
  curso: string;
  turma: string;
  alunos: number;
  media: string;
  transitam: number;
  pendentes: number;
};

export type ClassGroupOption = {
  id: string;
  name: string;
  course_name?: string;
  grade_name?: string;
};

export type ClassSubjectRow = {
  class_group_id: string;
  subject_id: string;
  teacher_id?: string | null;
};

export type SubjectOption = {
  id: string;
  name: string;
  code?: string | null;
};

export type WorkMode =
  | "lancamento"
  | "avaliacoes"
  | "recursos"
  | "exames"
  | "revisao"
  | "fecho"
  | "pauta"
  | "estatisticas";

export type ScopeId = "alunos" | "disciplinas" | "turmas" | "classes" | "avaliacoes" | "exames";

export const filterDefaults = {
  q: "",
  classe: "todas",
  curso: "todos",
  turma: "todas",
  disciplina: "todas",
  trimestre: "1",
  situacao: "todos",
};

export const scopes: Array<{ id: ScopeId; label: string }> = [
  { id: "alunos", label: "Alunos" },
  { id: "disciplinas", label: "Disciplinas" },
  { id: "turmas", label: "Turmas" },
  { id: "classes", label: "Classes/Cursos" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "exames", label: "Exames" },
];

export const workModes: Array<{ id: WorkMode; label: string }> = [
  { id: "lancamento", label: "Lançamento" },
  { id: "avaliacoes", label: "Avaliações" },
  { id: "recursos", label: "Recursos" },
  { id: "exames", label: "Exames" },
  { id: "revisao", label: "Revisão" },
  { id: "fecho", label: "Fecho" },
  { id: "pauta", label: "Pauta" },
  { id: "estatisticas", label: "Estatísticas" },
];
