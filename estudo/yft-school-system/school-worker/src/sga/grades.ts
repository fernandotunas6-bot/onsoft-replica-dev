/**
 * Boletim do educando a partir do SIGA: MAC/NPP/NPT por trimestre e a média
 * trimestral (MT), na escala angolana 0–20. As fórmulas são as do SIGA
 * (src/lib/angola-academic.ts, Decreto Executivo n.º 424/25): não mudar uma
 * sem a outra.
 */
import { SgaDb, inList } from './rest';

const round1 = (v: number) => Math.round((v + Number.EPSILON) * 10) / 10;

export function normalizeScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 20) return null;
  return round1(n);
}

/** MT = (MAC + NPT) / 2; só com uma das duas, vale essa. A NPP não entra. */
export function trimesterAverage(mac: unknown, npt: unknown): number | null {
  const m = normalizeScore(mac);
  const t = normalizeScore(npt);
  if (m !== null && t !== null) return round1((m + t) / 2);
  return m ?? t;
}

/** Diários fechados/homologados: a nota deixa de ser provisória. */
const FINAL_GRADEBOOK = new Set(['closed', 'homologated', 'published', 'locked']);

type Enrollment = { id: string; academic_year_id: string | null; class_group_id: string | null; status: string };
type Year = { id: string; name: string; status: string | null; starts_on: string | null };

async function enrollmentsWithYears(db: SgaDb, schoolId: string, studentId: string) {
  const enrollments = await db.select<Enrollment>('enrollments', {
    select: 'id,academic_year_id,class_group_id,status',
    school_id: `eq.${schoolId}`,
    student_id: `eq.${studentId}`,
    status: 'neq.cancelled',
  });
  const yearIds = [...new Set(enrollments.map((e) => e.academic_year_id).filter((x): x is string => !!x))];
  const years = yearIds.length
    ? await db.select<Year>('academic_years', {
        select: 'id,name,status,starts_on',
        school_id: `eq.${schoolId}`,
        id: inList(yearIds),
      })
    : [];
  return { enrollments, years };
}

/** O ano actual: o da matrícula activa num ano activo; senão o mais recente. */
function currentYear(enrollments: Enrollment[], years: Year[]): Year | undefined {
  const byId = new Map(years.map((y) => [y.id, y]));
  const active = enrollments.find((e) => e.status === 'active' && byId.get(e.academic_year_id ?? '')?.status === 'active');
  if (active) return byId.get(active.academic_year_id!);
  return [...years].sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''))[0];
}

/** Anos com matrícula, mais recente primeiro, no formato de GET /api/grades/years. */
export async function loadGradeYears(db: SgaDb, schoolId: string, studentId: string) {
  const { enrollments, years } = await enrollmentsWithYears(db, schoolId, studentId);
  const sorted = [...years].sort((a, b) => (b.starts_on ?? '').localeCompare(a.starts_on ?? ''));
  return { data: sorted.map((y) => y.name), current: currentYear(enrollments, years)?.name ?? '' };
}

/**
 * Boletim de um trimestre ("Term N") de um ano (pelo nome; sem nome, o
 * actual). Todas as disciplinas da turma, com ou sem notas.
 */
export async function loadReportCard(db: SgaDb, schoolId: string, studentId: string, term: string, yearName?: string) {
  const { enrollments, years } = await enrollmentsWithYears(db, schoolId, studentId);
  const year = yearName ? years.find((y) => y.name === yearName) : currentYear(enrollments, years);
  const enrollment = year && enrollments.find((e) => e.academic_year_id === year.id);
  const empty = { academic_year: year?.name ?? yearName ?? '', scale: 20, data: [] as unknown[] };
  if (!year || !enrollment?.class_group_id) return empty;

  const sequence = Number(/(\d+)/.exec(term)?.[1] ?? 0);
  const [terms, classSubjects] = await Promise.all([
    db.select<{ id: string }>('terms', {
      select: 'id',
      school_id: `eq.${schoolId}`,
      academic_year_id: `eq.${year.id}`,
      sequence: `eq.${sequence}`,
    }),
    db.select<{ id: string; subject_id: string }>('class_subjects', {
      select: 'id,subject_id',
      school_id: `eq.${schoolId}`,
      class_group_id: `eq.${enrollment.class_group_id}`,
    }),
  ]);
  if (!classSubjects.length) return empty;
  const subjects = await db.select<{ id: string; name: string }>('subjects', {
    select: 'id,name',
    school_id: `eq.${schoolId}`,
    id: inList([...new Set(classSubjects.map((c) => c.subject_id))]),
  });

  type Acc = { mac: number | null; npp: number | null; npt: number | null; provisional: boolean };
  const bySubject = new Map<string, Acc>();
  const termId = terms[0]?.id;
  if (termId) {
    const gradebooks = await db.select<{ id: string; class_subject_id: string; status: string | null }>('gradebooks', {
      select: 'id,class_subject_id,status',
      school_id: `eq.${schoolId}`,
      class_group_id: `eq.${enrollment.class_group_id}`,
      term_id: `eq.${termId}`,
    });
    const items = gradebooks.length
      ? await db.select<{ id: string; code: string; gradebook_id: string }>('grade_items', {
          select: 'id,code,gradebook_id',
          school_id: `eq.${schoolId}`,
          gradebook_id: inList(gradebooks.map((g) => g.id)),
        })
      : [];
    const scores = items.length
      ? await db.select<{ grade_item_id: string; score: number | null }>('grade_scores', {
          select: 'grade_item_id,score',
          school_id: `eq.${schoolId}`,
          enrollment_id: `eq.${enrollment.id}`,
          grade_item_id: inList(items.map((i) => i.id)),
        })
      : [];
    const gradebook = new Map(gradebooks.map((g) => [g.id, g]));
    const item = new Map(items.map((i) => [i.id, i]));
    const subjectOf = new Map(classSubjects.map((c) => [c.id, c.subject_id]));
    for (const s of scores) {
      const it = item.get(s.grade_item_id);
      const gb = it && gradebook.get(it.gradebook_id);
      const subjectId = gb && subjectOf.get(gb.class_subject_id);
      if (!it || !gb || !subjectId) continue;
      const acc = bySubject.get(subjectId) ?? {
        mac: null,
        npp: null,
        npt: null,
        provisional: !FINAL_GRADEBOOK.has(gb.status ?? ''),
      };
      const code = it.code.toUpperCase();
      if (code === 'MAC') acc.mac = normalizeScore(s.score);
      if (code === 'NPP') acc.npp = normalizeScore(s.score);
      if (code === 'NPT') acc.npt = normalizeScore(s.score);
      bySubject.set(subjectId, acc);
    }
  }

  const name = new Map(subjects.map((s) => [s.id, s.name]));
  const data = [...new Set(classSubjects.map((c) => c.subject_id))]
    .map((subjectId) => {
      const acc = bySubject.get(subjectId);
      return {
        subject_id: subjectId,
        subject_name: name.get(subjectId) ?? 'Disciplina',
        mac: acc?.mac ?? null,
        npp: acc?.npp ?? null,
        npt: acc?.npt ?? null,
        mt: acc ? trimesterAverage(acc.mac, acc.npt) : null,
        provisional: acc?.provisional ?? false,
      };
    })
    .sort((a, b) => a.subject_name.localeCompare(b.subject_name, 'pt'));
  return { academic_year: year.name, scale: 20, data };
}
