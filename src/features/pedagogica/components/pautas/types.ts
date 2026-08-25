export type Gender = 'M' | 'F' | '';

export type StudentStatus =
  | 'TRANSITA'
  | 'NÃO TRANSITA'
  | 'APROVADO'
  | 'REPROVADO'
  | 'ADMITIDO'
  | 'NÃO ADMITIDO'
  | 'ADMITIDO A EXAME'
  | 'RECURSO'
  | 'APTO (PAP)'
  | 'NÃO APTO (PAP)'
  | 'RETIDO'
  | 'EXCLUÍDO'
  | '';

export type AngolaTeachingCycle = 'primario' | 'i_ciclo' | 'ii_ciclo' | 'tecnico' | 'adultos';

export type PautaMode = 'mini' | 'trimestre' | 'final' | 'exames';

export interface SchoolIdentity {
  republic?: string;
  province: string;
  municipality: string;
  educationOffice?: string;
  schoolName: string;
  schoolCode?: string;
  logoUrl?: string;
}

export interface ClassContext {
  academicYear: string;
  className: string;
  classGroup: string;
  room?: string;
  period: string;
  teacher?: string;
  courseName?: string;
  pautaNumber?: string;
  cycle?: AngolaTeachingCycle;
  term?: number;
}

export interface TrimesterRecord {
  mact?: number | null;
  npp?: number | null;
  npt?: number | null;
  mt?: number | null;
}

export interface MiniPautaStudent {
  id: string;
  code?: string;
  number: number;
  name: string;
  gender: Gender;
  t1: TrimesterRecord;
  t2: TrimesterRecord;
  t3: TrimesterRecord;
  mfd?: number | null;
  observation?: string;
  status?: StudentStatus;
}

export interface MiniPautaDocument {
  school: SchoolIdentity;
  context: ClassContext;
  subject: string;
  students: MiniPautaStudent[];
  signatures?: {
    teacher?: string;
    pedagogicalDeputy?: string;
    director?: string;
  };
}

export interface SubjectResult {
  subjectId: string;
  subjectName: string;
  mt1?: number | null;
  mt2?: number | null;
  mt3?: number | null;
  mfd?: number | null;
}

export interface FinalPautaStudent {
  id: string;
  code?: string;
  number: number;
  name: string;
  gender: Gender;
  subjects: SubjectResult[];
  observation?: string;
  status?: StudentStatus;
}

export interface FinalPautaDocument {
  school: SchoolIdentity;
  context: ClassContext;
  subjects: { id: string; name: string; shortName?: string }[];
  students: FinalPautaStudent[];
  signatures?: {
    jury?: string[];
    pedagogicalDeputy?: string;
    director?: string;
  };
}

export interface TrimesterPautaStudent {
  id: string;
  code?: string;
  number: number;
  name: string;
  gender: Gender;
  subjectGrades: Record<string, number | null>; // subjectId -> MT
  average?: number | null;
  status?: StudentStatus;
  observation?: string;
}

export interface TrimesterPautaDocument {
  school: SchoolIdentity;
  context: ClassContext;
  subjects: { id: string; name: string; shortName?: string }[];
  students: TrimesterPautaStudent[];
  signatures?: {
    classCoordinator?: string;
    pedagogicalDeputy?: string;
    director?: string;
  };
}

export interface ExamPautaStudent {
  id: string;
  code?: string;
  number: number;
  name: string;
  gender: Gender;
  mfd?: number | null;
  examGrade?: number | null;
  finalGrade?: number | null;
  papGrade?: number | null; // Prova de Aptidão Profissional
  internshipGrade?: number | null; // Estágio Curricular
  status?: StudentStatus;
  observation?: string;
}

export interface ExamPautaDocument {
  school: SchoolIdentity;
  context: ClassContext;
  subject?: string;
  isTechnical?: boolean;
  students: ExamPautaStudent[];
  signatures?: {
    jury?: string[];
    pedagogicalDeputy?: string;
    director?: string;
  };
}
