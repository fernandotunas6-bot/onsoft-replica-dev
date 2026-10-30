/**
 * Leituras do professor (e da direcção/secretaria) para lançar notas no app.
 * Só leitura e exacta: as escritas vão para o SIGA (/api/mobile/grades), que
 * aplica as regras e a auditoria do SIGA.
 */
import { personIdFor } from './guardian';
import { FINAL_GRADEBOOK, normalizeScore } from './grades';
import type { SgaMembership, SgaUser } from './identity';
import { SgaDb, SgaError, inList } from './rest';

const MANAGER = new Set(['Administrador', 'Secretaria']);

/** Ficha de docente da conta: como o SIGA (teachers.person_id ou user_id). */
export async function teacherIdFor(db: SgaDb, schoolId: string, user: SgaUser): Promise<string | null> {
  const personId = await personIdFor(db, schoolId, user);
  const rows = await db.select<{ id: string }>('teachers', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    or: personId ? `(person_id.eq.${personId},user_id.eq.${user.id})` : `(user_id.eq.${user.id})`,
    limit: '1',
  });
  return rows[0]?.id ?? null;
}

/** Turmas e disciplinas do professor (atribuições activas). */
export async function loadTeacherAssignments(db: SgaDb, schoolId: string, user: SgaUser) {
  const teacherId = await teacherIdFor(db, schoolId, user);
  if (!teacherId) return [];
  const cs = await db.select<{ class_group_id: string; subject_id: string }>('class_subjects', {
    select: 'class_group_id,subject_id',
    school_id: `eq.${schoolId}`,
    teacher_id: `eq.${teacherId}`,
    status: 'eq.active',
  });
  if (!cs.length) return [];
  const [groups, subjects] = await Promise.all([
    db.select<{ id: string; name: string }>('class_groups', {
      select: 'id,name',
      school_id: `eq.${schoolId}`,
      id: inList([...new Set(cs.map((c) => c.class_group_id))]),
    }),
    db.select<{ id: string; name: string }>('subjects', {
      select: 'id,name',
      school_id: `eq.${schoolId}`,
      id: inList([...new Set(cs.map((c) => c.subject_id))]),
    }),
  ]);
  const g = new Map(groups.map((x) => [x.id, x.name]));
  const s = new Map(subjects.map((x) => [x.id, x.name]));
  return cs
    .map((c) => ({
      class_group_id: c.class_group_id,
      class_name: g.get(c.class_group_id) ?? 'Turma',
      subject_id: c.subject_id,
      subject_name: s.get(c.subject_id) ?? 'Disciplina',
    }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'pt') || a.subject_name.localeCompare(b.subject_name, 'pt'));
}

/**
 * Notas MAC/NPP/NPT de uma turma numa disciplina e trimestre, para todos os
 * alunos matriculados (activos ou pendentes, como o SIGA aceita no
 * lançamento). Professor: só a sua disciplina na turma; direcção/secretaria:
 * qualquer uma.
 */
export async function loadClassSubjectGrades(
  db: SgaDb,
  membership: SgaMembership,
  user: SgaUser,
  classGroupId: string,
  subjectId: string,
  term: number,
) {
  const schoolId = membership.schoolId;
  const [classSubject] = await db.select<{ id: string; teacher_id: string | null }>('class_subjects', {
    select: 'id,teacher_id',
    school_id: `eq.${schoolId}`,
    class_group_id: `eq.${classGroupId}`,
    subject_id: `eq.${subjectId}`,
    status: 'eq.active',
    limit: '1',
  });
  if (!classSubject) throw new SgaError(404, 'CLASS_SUBJECT_NOT_FOUND');
  const isManager = membership.roles.some((r) => MANAGER.has(r));
  if (!isManager) {
    if (!membership.roles.includes('Professor')) throw new SgaError(403, 'TEACHER_ONLY');
    const teacherId = await teacherIdFor(db, schoolId, user);
    // Disciplina de outro professor: o mesmo 404 de uma que não existe.
    if (!teacherId || classSubject.teacher_id !== teacherId) throw new SgaError(404, 'CLASS_SUBJECT_NOT_FOUND');
  }

  const [group] = await db.select<{ academic_year_id: string | null }>('class_groups', {
    select: 'academic_year_id',
    school_id: `eq.${schoolId}`,
    id: `eq.${classGroupId}`,
  });
  const enrollments = await db.select<{ id: string; student_id: string }>('enrollments', {
    select: 'id,student_id',
    school_id: `eq.${schoolId}`,
    class_group_id: `eq.${classGroupId}`,
    status: 'in.(active,pending)',
  });
  if (!enrollments.length) return { term, provisional: true, students: [] };

  const students = await db.select<{ id: string; person_id: string }>('students', {
    select: 'id,person_id',
    school_id: `eq.${schoolId}`,
    id: inList(enrollments.map((e) => e.student_id)),
  });
  const people = students.length
    ? await db.select<{ id: string; full_name: string | null; preferred_name: string | null; photo_url: string | null }>(
        'people',
        {
          select: 'id,full_name,preferred_name,photo_url',
          school_id: `eq.${schoolId}`,
          id: inList(students.map((s) => s.person_id)),
        },
      )
    : [];

  // O diário desta disciplina neste trimestre (pode ainda não existir).
  const terms = group?.academic_year_id
    ? await db.select<{ id: string }>('terms', {
        select: 'id',
        school_id: `eq.${schoolId}`,
        academic_year_id: `eq.${group.academic_year_id}`,
        sequence: `eq.${term}`,
      })
    : [];
  const scores = new Map<string, { mac: number | null; npp: number | null; npt: number | null }>();
  let provisional = true;
  if (terms[0]) {
    const gradebooks = await db.select<{ id: string; status: string | null }>('gradebooks', {
      select: 'id,status',
      school_id: `eq.${schoolId}`,
      class_subject_id: `eq.${classSubject.id}`,
      term_id: `eq.${terms[0].id}`,
    });
    if (gradebooks.length) {
      provisional = !gradebooks.some((g) => FINAL_GRADEBOOK.has(g.status ?? ''));
      const items = await db.select<{ id: string; code: string }>('grade_items', {
        select: 'id,code',
        school_id: `eq.${schoolId}`,
        gradebook_id: inList(gradebooks.map((g) => g.id)),
      });
      const code = new Map(items.map((i) => [i.id, i.code.toUpperCase()]));
      const rows = items.length
        ? await db.select<{ grade_item_id: string; enrollment_id: string; score: number | null }>('grade_scores', {
            select: 'grade_item_id,enrollment_id,score',
            school_id: `eq.${schoolId}`,
            grade_item_id: inList(items.map((i) => i.id)),
            enrollment_id: inList(enrollments.map((e) => e.id)),
          })
        : [];
      for (const r of rows) {
        const acc = scores.get(r.enrollment_id) ?? { mac: null, npp: null, npt: null };
        const c = code.get(r.grade_item_id);
        if (c === 'MAC') acc.mac = normalizeScore(r.score);
        if (c === 'NPP') acc.npp = normalizeScore(r.score);
        if (c === 'NPT') acc.npt = normalizeScore(r.score);
        scores.set(r.enrollment_id, acc);
      }
    }
  }

  const personOf = new Map(students.map((s) => [s.id, s.person_id]));
  const person = new Map(people.map((p) => [p.id, p]));
  return {
    term,
    provisional,
    students: enrollments
      .map((e) => {
        const p = person.get(personOf.get(e.student_id) ?? '');
        const sc = scores.get(e.id);
        return {
          enrollment_id: e.id,
          student_id: e.student_id,
          name: p?.preferred_name || p?.full_name || 'Aluno',
          photo_url: p?.photo_url ?? null,
          mac: sc?.mac ?? null,
          npp: sc?.npp ?? null,
          npt: sc?.npt ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt')),
  };
}
