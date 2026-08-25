import type { FinalPautaDocument, MiniPautaDocument, MiniPautaStudent, TrimesterPautaDocument, ExamPautaDocument } from './types';
import { calculateFinalDisciplineAverage, calculateTrimesterAverage, calculateExamFinalGrade } from './assessment';

export const demoSchool = {
  republic: 'REPÚBLICA DE ANGOLA',
  province: 'GOVERNO PROVINCIAL DE LUANDA',
  municipality: 'ADMINISTRAÇÃO MUNICIPAL DE CAZENGA',
  educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
  schoolName: 'COMPLEXO ESCOLAR N.º 2045',
};

export const demoContext = {
  academicYear: '2025/2026',
  className: '7.ª Classe',
  classGroup: 'Turma A',
  room: 'Sala 04',
  period: 'Manhã',
  teacher: 'Prof. António Mateus',
  pautaNumber: '104/2026',
  term: 1,
  cycle: 'i_ciclo' as const,
};

function tr(mact: number, npp: number, npt: number) {
  return { mact, npp, npt, mt: calculateTrimesterAverage(mact, npt) };
}

const miniBase: MiniPautaStudent[] = [
  { id: '1', code: '2026001', number: 1, name: 'Ana Manuel António', gender: 'F', t1: tr(14, 13, 12), t2: tr(15, 14, 14), t3: tr(16, 15, 14), status: 'TRANSITA', observation: '' },
  { id: '2', code: '2026002', number: 2, name: 'Carlos João Mateus', gender: 'M', t1: tr(10, 9, 8), t2: tr(11, 10, 9), t3: tr(12, 11, 10), status: 'TRANSITA', observation: '' },
  { id: '3', code: '2026003', number: 3, name: 'Domingas Paulo José', gender: 'F', t1: tr(8, 7, 6), t2: tr(9, 8, 7), t3: tr(8, 7, 6), status: 'NÃO TRANSITA', observation: 'Resultado sujeito a ratificação em conselho.' },
  { id: '4', code: '2026004', number: 4, name: 'Eduardo Fernando Silva', gender: 'M', t1: tr(15, 16, 17), t2: tr(16, 17, 18), t3: tr(17, 18, 19), status: 'TRANSITA', observation: 'Quadro de Honra' },
  { id: '5', code: '2026005', number: 5, name: 'Francisca Kiala Gabriel', gender: 'F', t1: tr(11, 12, 10), t2: tr(12, 11, 13), t3: tr(13, 12, 14), status: 'TRANSITA', observation: '' },
];

const miniStudents: MiniPautaStudent[] = miniBase.map((s) => ({
  ...s,
  mfd: calculateFinalDisciplineAverage(s.t1.mt, s.t2.mt, s.t3.mt),
}));

export const miniPautaDemo: MiniPautaDocument = {
  school: demoSchool,
  context: demoContext,
  subject: 'Língua Portuguesa',
  students: miniStudents,
  signatures: { teacher: 'António Mateus', pedagogicalDeputy: '', director: '' },
};

const subjects = [
  { id: 'lp', name: 'Língua Portuguesa', shortName: 'L. PORTUGUESA' },
  { id: 'mat', name: 'Matemática', shortName: 'MATEMÁTICA' },
  { id: 'cn', name: 'Ciências da Natureza', shortName: 'C. NATUREZA' },
  { id: 'geo', name: 'Geografia', shortName: 'GEOGRAFIA' },
  { id: 'hist', name: 'História', shortName: 'HISTÓRIA' },
  { id: 'emc', name: 'Educação Moral e Cívica', shortName: 'E.M.C.' },
  { id: 'ef', name: 'Educação Física', shortName: 'ED. FÍSICA' },
];

const result = (subjectId: string, subjectName: string, a: number, b: number, c: number) => ({
  subjectId, subjectName, mt1: a, mt2: b, mt3: c, mfd: calculateFinalDisciplineAverage(a, b, c),
});

export const finalPautaDemo: FinalPautaDocument = {
  school: demoSchool,
  context: demoContext,
  subjects,
  students: [
    {
      id: '1', code: '2026001', number: 1, name: 'Ana Manuel António', gender: 'F', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 12 + (i % 3), 13 + (i % 3), 14 + (i % 3))),
    },
    {
      id: '2', code: '2026002', number: 2, name: 'Carlos João Mateus', gender: 'M', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 10 + (i % 2), 11 + (i % 2), 12 + (i % 2))),
    },
    {
      id: '3', code: '2026003', number: 3, name: 'Domingas Paulo José', gender: 'F', status: 'NÃO TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 7 + (i % 2), 8 + (i % 2), 8 + (i % 2))),
      observation: 'Situação final definida pelo conselho de notas.',
    },
    {
      id: '4', code: '2026004', number: 4, name: 'Eduardo Fernando Silva', gender: 'M', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 16 + (i % 2), 17 + (i % 2), 18 + (i % 2))),
      observation: 'Quadro de Honra',
    },
    {
      id: '5', code: '2026005', number: 5, name: 'Francisca Kiala Gabriel', gender: 'F', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 12, 13, 14)),
    },
  ],
  signatures: { jury: ['', '', ''], pedagogicalDeputy: '', director: '' },
};

export const trimesterPautaDemo: TrimesterPautaDocument = {
  school: demoSchool,
  context: { ...demoContext, term: 1 },
  subjects,
  students: [
    {
      id: '1', code: '2026001', number: 1, name: 'Ana Manuel António', gender: 'F', status: 'TRANSITA',
      subjectGrades: { lp: 13, mat: 14, cn: 12, geo: 15, hist: 14, emc: 16, ef: 17 },
      average: 14.4,
    },
    {
      id: '2', code: '2026002', number: 2, name: 'Carlos João Mateus', gender: 'M', status: 'TRANSITA',
      subjectGrades: { lp: 10, mat: 11, cn: 10, geo: 12, hist: 11, emc: 14, ef: 15 },
      average: 11.8,
    },
    {
      id: '3', code: '2026003', number: 3, name: 'Domingas Paulo José', gender: 'F', status: 'NÃO TRANSITA',
      subjectGrades: { lp: 8, mat: 7, cn: 9, geo: 10, hist: 8, emc: 12, ef: 14 },
      average: 9.7,
    },
  ],
  signatures: { classCoordinator: '', pedagogicalDeputy: '', director: '' },
};

export const examPautaDemo: ExamPautaDocument = {
  school: { ...demoSchool, schoolName: 'INSTITUTO TÉCNICO INDUSTRIAL DE LUANDA (ITIL)' },
  context: { ...demoContext, className: '13.ª Classe', courseName: 'Técnico de Informática', cycle: 'tecnico' },
  isTechnical: true,
  subject: 'Prova de Aptidão Profissional & Estágio',
  students: [
    { id: '1', code: '2026001', number: 1, name: 'Ana Manuel António', gender: 'F', mfd: 14, papGrade: 16, internshipGrade: 17, finalGrade: 15.7, status: 'APTO (PAP)', observation: 'Projeto Aprovado com Louvor' },
    { id: '2', code: '2026002', number: 2, name: 'Carlos João Mateus', gender: 'M', mfd: 11, papGrade: 13, internshipGrade: 14, finalGrade: 12.6, status: 'APTO (PAP)', observation: '' },
    { id: '3', code: '2026003', number: 3, name: 'Domingas Paulo José', gender: 'F', mfd: 9, papGrade: 8, internshipGrade: 10, finalGrade: 9.0, status: 'NÃO APTO (PAP)', observation: 'Aguarda Época Especial de Defesa' },
  ],
  signatures: { jury: ['Prof. Dr. Mateus', 'Eng.º Silva', 'Lic. Domingos'], pedagogicalDeputy: '', director: '' },
};
