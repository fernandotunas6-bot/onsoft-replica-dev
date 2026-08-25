import type { FinalPautaDocument, MiniPautaDocument, MiniPautaStudent } from '../types';
import { calculateFinalDisciplineAverage, calculateTrimesterAverage } from '../lib/assessment';

const school = {
  republic: 'REPÚBLICA DE ANGOLA',
  province: 'GOVERNO PROVINCIAL DE LUANDA',
  municipality: 'ADMINISTRAÇÃO MUNICIPAL DE __________________',
  educationOffice: 'DIRECÇÃO MUNICIPAL DA EDUCAÇÃO',
  schoolName: 'COMPLEXO ESCOLAR Nº __________________',
};

const context = {
  academicYear: '2026/2027',
  className: '7.ª Classe',
  classGroup: 'A',
  room: '12',
  period: 'Manhã',
  teacher: '________________________________',
  pautaNumber: '_____/2026',
};

function tr(mact: number, npp: number, npt: number) {
  return { mact, npp, npt, mt: calculateTrimesterAverage(mact, npt) };
}

const miniBase: MiniPautaStudent[] = [
    { id: '1', code: '000001', number: 1, name: 'Ana Manuel António', gender: 'F', t1: tr(14, 13, 12), t2: tr(15, 14, 14), t3: tr(16, 15, 14), status: 'TRANSITA', observation: '' },
    { id: '2', code: '000002', number: 2, name: 'Carlos João Mateus', gender: 'M', t1: tr(10, 9, 8), t2: tr(11, 10, 9), t3: tr(12, 11, 10), status: 'TRANSITA', observation: '' },
    { id: '3', code: '000003', number: 3, name: 'Domingas Paulo José', gender: 'F', t1: tr(8, 7, 6), t2: tr(9, 8, 7), t3: tr(8, 7, 6), status: 'NÃO TRANSITA', observation: 'Resultado pedagógico a confirmar pelo conselho de notas.' },
];

const miniStudents: MiniPautaStudent[] = miniBase.map((s) => ({ ...s, mfd: calculateFinalDisciplineAverage(s.t1.mt, s.t2.mt, s.t3.mt) }));

export const miniPautaDemo: MiniPautaDocument = {
  school,
  context,
  subject: 'Língua Portuguesa',
  students: miniStudents,
  signatures: { teacher: '', pedagogicalDeputy: '', director: '' },
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
  school,
  context,
  subjects,
  students: [
    {
      id: '1', code: '000001', number: 1, name: 'Ana Manuel António', gender: 'F', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 12 + (i % 3), 13 + (i % 3), 14 + (i % 3))),
    },
    {
      id: '2', code: '000002', number: 2, name: 'Carlos João Mateus', gender: 'M', status: 'TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 10 + (i % 2), 11 + (i % 2), 12 + (i % 2))),
    },
    {
      id: '3', code: '000003', number: 3, name: 'Domingas Paulo José', gender: 'F', status: 'NÃO TRANSITA',
      subjects: subjects.map((s, i) => result(s.id, s.name, 7 + (i % 2), 8 + (i % 2), 8 + (i % 2))),
      observation: 'Situação final definida pelo conselho de notas.',
    },
  ],
  signatures: { jury: ['', '', ''], pedagogicalDeputy: '', director: '' },
};
