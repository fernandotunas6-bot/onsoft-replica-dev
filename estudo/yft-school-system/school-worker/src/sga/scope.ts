/**
 * Que turmas uma conta vê na app, pelo papel (como `appRole`: direcção >
 * professor > encarregado):
 *  - direcção/secretaria/tesouraria: as turmas do ano lectivo activo;
 *  - professor: as turmas onde tem disciplinas atribuídas (e só essas
 *    disciplinas, quando importa);
 *  - encarregado: as turmas activas dos educandos.
 */
import { loadWards } from './guardian';
import type { SgaMembership, SgaUser } from './identity';
import { SgaDb, inList } from './rest';
import { teacherIdFor } from './teacher';

export type ClassScope = {
  kind: 'manager' | 'teacher' | 'guardian' | 'none';
  classes: { id: string; name: string }[];
  /** Professor: disciplinas por turma (as que lhe estão atribuídas). */
  teacherSubjects?: Map<string, Set<string>>;
};

const MANAGER = ['Administrador', 'Secretaria', 'Tesouraria'];

export async function classScope(db: SgaDb, m: SgaMembership, user: SgaUser): Promise<ClassScope> {
  const schoolId = m.schoolId;
  if (m.roles.some((r) => MANAGER.includes(r))) {
    const [year] = await db.select<{ id: string }>('academic_years', {
      select: 'id',
      school_id: `eq.${schoolId}`,
      status: 'eq.active',
      order: 'starts_on.desc',
      limit: '1',
    });
    const groups = await db.selectAll<{ id: string; name: string }>('class_groups', {
      select: 'id,name',
      school_id: `eq.${schoolId}`,
      ...(year ? { academic_year_id: `eq.${year.id}` } : {}),
      order: 'name.asc,id.asc',
    });
    return { kind: 'manager', classes: groups };
  }
  if (m.roles.includes('Professor')) {
    const teacherId = await teacherIdFor(db, schoolId, user);
    if (!teacherId) return { kind: 'teacher', classes: [], teacherSubjects: new Map() };
    const cs = await db.select<{ class_group_id: string; subject_id: string }>('class_subjects', {
      select: 'class_group_id,subject_id',
      school_id: `eq.${schoolId}`,
      teacher_id: `eq.${teacherId}`,
      status: 'eq.active',
    });
    const teacherSubjects = new Map<string, Set<string>>();
    for (const c of cs) {
      teacherSubjects.set(c.class_group_id, (teacherSubjects.get(c.class_group_id) ?? new Set()).add(c.subject_id));
    }
    const ids = [...teacherSubjects.keys()];
    const groups = ids.length
      ? await db.select<{ id: string; name: string }>('class_groups', {
          select: 'id,name',
          school_id: `eq.${schoolId}`,
          id: inList(ids),
          order: 'name.asc',
        })
      : [];
    return { kind: 'teacher', classes: groups, teacherSubjects };
  }
  if (m.roles.includes('Encarregado')) {
    const wards = await loadWards(db, schoolId, user);
    const seen = new Map<string, string>();
    for (const w of wards) if (w.classGroupId) seen.set(w.classGroupId, w.className ?? 'Turma');
    return { kind: 'guardian', classes: [...seen].map(([id, name]) => ({ id, name })) };
  }
  return { kind: 'none', classes: [] };
}

/**
 * Faltas de uma turma, por aluno, no formato de GET /api/attendance/summary:
 * dias com alguma falta e dias só com presenças, no ano lectivo da turma,
 * sem aulas canceladas (as mesmas regras de loadStudentAttendance).
 */
export async function loadClassAttendanceSummary(db: SgaDb, schoolId: string, classGroupId: string) {
  const [group] = await db.select<{ academic_year_id: string | null }>('class_groups', {
    select: 'academic_year_id',
    school_id: `eq.${schoolId}`,
    id: `eq.${classGroupId}`,
  });
  const enrollments = await db.select<{ student_id: string }>('enrollments', {
    select: 'student_id',
    school_id: `eq.${schoolId}`,
    class_group_id: `eq.${classGroupId}`,
    status: 'in.(active,pending)',
  });
  const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
  const students = studentIds.length
    ? await db.selectIn<{ id: string; person_id: string }>('students', 'id', studentIds, {
        select: 'id,person_id',
        school_id: `eq.${schoolId}`,
      })
    : [];
  const people = students.length
    ? await db.selectIn<{ id: string; full_name: string | null; preferred_name: string | null }>(
        'people',
        'id',
        students.map((s) => s.person_id),
        { select: 'id,full_name,preferred_name', school_id: `eq.${schoolId}` },
      )
    : [];
  const sessions = group?.academic_year_id
    ? await db.selectAll<{ id: string; lesson_date: string }>('siga_attendance_sessions', {
        select: 'id,lesson_date',
        school_id: `eq.${schoolId}`,
        class_group_id: `eq.${classGroupId}`,
        academic_year_id: `eq.${group.academic_year_id}`,
        status: 'neq.cancelled',
        order: 'id.asc',
      })
    : [];
  const dateOf = new Map(sessions.map((s) => [s.id, s.lesson_date.slice(0, 10)]));
  const records = sessions.length
    ? await db.selectIn<{ session_id: string; student_id: string; status: string }>(
        'siga_attendance_records',
        'session_id',
        sessions.map((s) => s.id),
        { select: 'session_id,student_id,status', school_id: `eq.${schoolId}`, status: 'neq.not_registered' },
      )
    : [];
  const seen = new Map<string, Set<string>>();
  const absent = new Map<string, Set<string>>();
  const daysMarked = new Set<string>();
  for (const r of records) {
    const d = dateOf.get(r.session_id);
    if (!d) continue;
    daysMarked.add(d);
    seen.set(r.student_id, (seen.get(r.student_id) ?? new Set()).add(d));
    if (r.status === 'absent') absent.set(r.student_id, (absent.get(r.student_id) ?? new Set()).add(d));
  }
  const personOf = new Map(students.map((s) => [s.id, s.person_id]));
  const nameOf = new Map(people.map((p) => [p.id, p.preferred_name || p.full_name || 'Aluno']));
  const data = studentIds
    .map((id) => {
      const a = absent.get(id)?.size ?? 0;
      return {
        student_id: id,
        name: nameOf.get(personOf.get(id) ?? '') ?? 'Aluno',
        present_days: (seen.get(id)?.size ?? 0) - a,
        absent_days: a,
      };
    })
    .sort((x, y) => y.absent_days - x.absent_days || x.name.localeCompare(y.name, 'pt'));
  return { data, days_marked: daysMarked.size };
}
