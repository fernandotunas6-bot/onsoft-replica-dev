import { SgaDb, inList, luandaToday } from './rest';
import type { SgaUser } from './identity';

export interface Ward {
  id: string;
  name: string;
  studentNumber: string | null;
  photoUrl: string | null;
  enrollmentId: string | null;
  classGroupId: string | null;
  className: string | null;
}

/**
 * A ficha (people) da conta nesta escola: pela conta ligada e, se não houver,
 * pelo e-mail confirmado — a mesma regra do SIGA (auth/server.ts).
 */
async function personIdFor(db: SgaDb, schoolId: string, user: SgaUser): Promise<string | null> {
  const byUser = await db.select<{ id: string }>('people', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    user_id: `eq.${user.id}`,
    deleted_at: 'is.null',
    limit: '1',
  });
  if (byUser[0]) return byUser[0].id;
  if (!user.verifiedEmail) return null;
  const byEmail = await db.select<{ id: string }>('people', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    email: `eq.${user.verifiedEmail}`,
    deleted_at: 'is.null',
    limit: '2',
  });
  // Duas fichas com o mesmo e-mail: ambíguo, não liga a nenhuma.
  return byEmail.length === 1 ? byEmail[0].id : null;
}

/** Ids dos educandos com ligação em vigor (sem fim, ou a terminar hoje ou depois). */
export async function wardIds(db: SgaDb, schoolId: string, user: SgaUser): Promise<string[]> {
  const personId = await personIdFor(db, schoolId, user);
  if (!personId) return [];
  const today = luandaToday();
  const links = await db.select<{ student_id: string }>('student_guardians', {
    select: 'student_id',
    school_id: `eq.${schoolId}`,
    guardian_person_id: `eq.${personId}`,
    or: `(valid_until.is.null,valid_until.gte.${today})`,
  });
  return [...new Set(links.map((l) => l.student_id))];
}

export async function loadWards(db: SgaDb, schoolId: string, user: SgaUser): Promise<Ward[]> {
  const ids = await wardIds(db, schoolId, user);
  if (!ids.length) return [];
  const students = await db.select<{ id: string; student_number: string | null; person_id: string }>('students', {
    select: 'id,student_number,person_id',
    school_id: `eq.${schoolId}`,
    id: inList(ids),
    deleted_at: 'is.null',
  });
  if (!students.length) return [];

  const [people, enrollments] = await Promise.all([
    db.select<{ id: string; full_name: string | null; preferred_name: string | null; photo_url: string | null }>('people', {
      select: 'id,full_name,preferred_name,photo_url',
      school_id: `eq.${schoolId}`,
      id: inList(students.map((s) => s.person_id)),
    }),
    db.select<{ id: string; student_id: string; class_group_id: string | null }>('enrollments', {
      select: 'id,student_id,class_group_id',
      school_id: `eq.${schoolId}`,
      student_id: inList(students.map((s) => s.id)),
      status: 'eq.active',
    }),
  ]);
  const classIds = [...new Set(enrollments.map((e) => e.class_group_id).filter((x): x is string => !!x))];
  const classes = classIds.length
    ? await db.select<{ id: string; name: string }>('class_groups', {
        select: 'id,name',
        school_id: `eq.${schoolId}`,
        id: inList(classIds),
      })
    : [];

  const person = new Map(people.map((p) => [p.id, p]));
  const enrollment = new Map(enrollments.map((e) => [e.student_id, e]));
  const className = new Map(classes.map((c) => [c.id, c.name]));
  return students
    .map((s) => {
      const p = person.get(s.person_id);
      const e = enrollment.get(s.id);
      return {
        id: s.id,
        name: p?.preferred_name || p?.full_name || 'Educando',
        studentNumber: s.student_number,
        photoUrl: p?.photo_url ?? null,
        enrollmentId: e?.id ?? null,
        classGroupId: e?.class_group_id ?? null,
        className: e?.class_group_id ? (className.get(e.class_group_id) ?? null) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}

/** Há factura vencida por pagar de algum educando (público «encarregados em dívida»). */
export async function hasOverdueInvoice(db: SgaDb, schoolId: string, studentIds: string[]): Promise<boolean> {
  if (!studentIds.length) return false;
  const enrollments = await db.select<{ id: string }>('enrollments', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    student_id: inList(studentIds),
  });
  if (!enrollments.length) return false;
  const contracts = await db.select<{ id: string }>('finance_contracts', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    enrollment_id: inList(enrollments.map((e) => e.id)),
  });
  if (!contracts.length) return false;
  const overdue = await db.select<{ id: string }>('finance_invoices', {
    select: 'id',
    school_id: `eq.${schoolId}`,
    contract_id: inList(contracts.map((c) => c.id)),
    status: 'in.(open,partially_paid)',
    due_date: `lt.${luandaToday()}`,
    limit: '1',
  });
  return overdue.length > 0;
}
