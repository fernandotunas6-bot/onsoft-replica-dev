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

/** "08:30:00" → "08:30". */
const hhmm = (t: string | null) => (t ?? '').slice(0, 5);

/**
 * Horário de uma turma (só tempos activos), no formato de GET /api/timetable.
 * Quem chama já confirmou que a turma é de um educando.
 */
export async function loadClassTimetable(db: SgaDb, schoolId: string, classGroupId: string) {
  const [classes, classSubjects] = await Promise.all([
    db.select<{ id: string; name: string }>('class_groups', {
      select: 'id,name',
      school_id: `eq.${schoolId}`,
      id: `eq.${classGroupId}`,
    }),
    db.select<{ id: string; subject_id: string; teacher_id: string | null }>('class_subjects', {
      select: 'id,subject_id,teacher_id',
      school_id: `eq.${schoolId}`,
      class_group_id: `eq.${classGroupId}`,
    }),
  ]);
  if (!classSubjects.length) return [];
  const subjectIds = [...new Set(classSubjects.map((c) => c.subject_id))];
  const teacherIds = [...new Set(classSubjects.map((c) => c.teacher_id).filter((x): x is string => !!x))];
  const [slots, subjects, teachers] = await Promise.all([
    db.select<{ id: string; class_subject_id: string; weekday: number; starts_at: string; ends_at: string; room: string | null }>(
      'timetable_slots',
      {
        select: 'id,class_subject_id,weekday,starts_at,ends_at,room',
        school_id: `eq.${schoolId}`,
        class_subject_id: inList(classSubjects.map((c) => c.id)),
        status: 'eq.active',
        order: 'weekday.asc,starts_at.asc',
      },
    ),
    db.select<{ id: string; name: string }>('subjects', {
      select: 'id,name',
      school_id: `eq.${schoolId}`,
      id: inList(subjectIds),
    }),
    teacherIds.length
      ? db.select<{ id: string; person_id: string | null }>('teachers', {
          select: 'id,person_id',
          school_id: `eq.${schoolId}`,
          id: inList(teacherIds),
        })
      : Promise.resolve([]),
  ]);
  const teacherPeople = teachers.map((t) => t.person_id).filter((x): x is string => !!x);
  const people = teacherPeople.length
    ? await db.select<{ id: string; full_name: string | null; preferred_name: string | null }>('people', {
        select: 'id,full_name,preferred_name',
        school_id: `eq.${schoolId}`,
        id: inList(teacherPeople),
      })
    : [];

  const cs = new Map(classSubjects.map((c) => [c.id, c]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const personOf = new Map(teachers.map((t) => [t.id, t.person_id]));
  const personName = new Map(people.map((p) => [p.id, p.preferred_name || p.full_name]));
  const className = classes[0]?.name ?? '';
  return slots.map((s) => {
    const c = cs.get(s.class_subject_id);
    const person = c?.teacher_id ? personOf.get(c.teacher_id) : null;
    return {
      id: s.id,
      class_id: classGroupId,
      class_name: className,
      subject_id: c?.subject_id ?? null,
      subject_name: c ? (subjectName.get(c.subject_id) ?? null) : null,
      title: null,
      weekday: s.weekday,
      start_time: hhmm(s.starts_at),
      end_time: hhmm(s.ends_at),
      room: s.room,
      teacher_name: person ? (personName.get(person) ?? null) : null,
      teacher_uid: null,
    };
  });
}

/**
 * Faltas de um aluno, no formato de GET /api/attendance/student/:id. O SIGA
 * marca por aula; o app mostra dias: um dia com alguma falta é dia de falta,
 * um dia só com presenças (ou atrasos e faltas justificadas) é de presença.
 */
export async function loadStudentAttendance(db: SgaDb, schoolId: string, studentId: string) {
  const records = await db.select<{ session_id: string; status: string }>('siga_attendance_records', {
    select: 'session_id,status',
    school_id: `eq.${schoolId}`,
    student_id: `eq.${studentId}`,
    status: 'neq.not_registered',
  });
  if (!records.length) return { present_days: 0, absent_days: 0, absences: [] as string[] };
  const sessions = await db.select<{ id: string; lesson_date: string }>('siga_attendance_sessions', {
    select: 'id,lesson_date',
    school_id: `eq.${schoolId}`,
    id: inList([...new Set(records.map((r) => r.session_id))]),
  });
  const dateOf = new Map(sessions.map((s) => [s.id, s.lesson_date.slice(0, 10)]));
  const absent = new Set<string>();
  const seen = new Set<string>();
  for (const r of records) {
    const d = dateOf.get(r.session_id);
    if (!d) continue;
    seen.add(d);
    if (r.status === 'absent') absent.add(d);
  }
  return {
    present_days: seen.size - absent.size,
    absent_days: absent.size,
    absences: [...absent].sort().reverse().slice(0, 60),
  };
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const money = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;

/**
 * Recibos dos educandos, no formato de GET /api/finance/receipts. O SIGA não
 * guarda saldos no recibo: o "saldo depois" é o que falta pagar dessa factura
 * (valor − desconto + multa) depois deste recibo e dos anteriores não anulados.
 */
export async function loadReceipts(db: SgaDb, schoolId: string, wards: { id: string; name: string }[]) {
  if (!wards.length) return [];
  const enrollments = await db.select<{ id: string; student_id: string; academic_year_id: string | null }>('enrollments', {
    select: 'id,student_id,academic_year_id',
    school_id: `eq.${schoolId}`,
    student_id: inList(wards.map((w) => w.id)),
  });
  if (!enrollments.length) return [];
  const contracts = await db.select<{ id: string; enrollment_id: string }>('finance_contracts', {
    select: 'id,enrollment_id',
    school_id: `eq.${schoolId}`,
    enrollment_id: inList(enrollments.map((e) => e.id)),
  });
  if (!contracts.length) return [];
  const invoices = await db.select<{
    id: string;
    contract_id: string;
    fee_item_id: string | null;
    invoice_number: string | null;
    competence_month: string | null;
    amount: number;
    discount_amount: number | null;
    penalty_amount: number | null;
  }>('finance_invoices', {
    select: 'id,contract_id,fee_item_id,invoice_number,competence_month,amount,discount_amount,penalty_amount',
    school_id: `eq.${schoolId}`,
    contract_id: inList(contracts.map((c) => c.id)),
  });
  if (!invoices.length) return [];
  const receipts = await db.select<{
    id: string;
    invoice_id: string;
    receipt_number: string | null;
    amount: number;
    paid_on: string | null;
    created_at: string;
  }>('finance_receipts', {
    select: 'id,invoice_id,receipt_number,amount,paid_on,created_at',
    school_id: `eq.${schoolId}`,
    invoice_id: inList(invoices.map((i) => i.id)),
    reversed_at: 'is.null',
  });
  if (!receipts.length) return [];

  const feeIds = [...new Set(invoices.map((i) => i.fee_item_id).filter((x): x is string => !!x))];
  const yearIds = [...new Set(enrollments.map((e) => e.academic_year_id).filter((x): x is string => !!x))];
  const [fees, years, schools] = await Promise.all([
    feeIds.length
      ? db.select<{ id: string; name: string }>('fee_items', { select: 'id,name', school_id: `eq.${schoolId}`, id: inList(feeIds) })
      : Promise.resolve([]),
    yearIds.length
      ? db.select<{ id: string; name: string }>('academic_years', { select: 'id,name', school_id: `eq.${schoolId}`, id: inList(yearIds) })
      : Promise.resolve([]),
    db.select<{ currency_code: string | null }>('schools', { select: 'currency_code', id: `eq.${schoolId}` }),
  ]);

  const invoice = new Map(invoices.map((i) => [i.id, i]));
  const contract = new Map(contracts.map((c) => [c.id, c]));
  const enrollment = new Map(enrollments.map((e) => [e.id, e]));
  const wardName = new Map(wards.map((w) => [w.id, w.name]));
  const feeName = new Map(fees.map((f) => [f.id, f.name]));
  const yearName = new Map(years.map((y) => [y.id, y.name]));
  const currency = schools[0]?.currency_code || 'AOA';
  const when = (r: { paid_on: string | null; created_at: string }) => r.paid_on ?? r.created_at;

  // Pagamentos de cada factura por ordem, para o saldo depois de cada um.
  const byInvoice = new Map<string, typeof receipts>();
  for (const r of [...receipts].sort((a, b) => when(a).localeCompare(when(b)) || a.created_at.localeCompare(b.created_at))) {
    byInvoice.set(r.invoice_id, [...(byInvoice.get(r.invoice_id) ?? []), r]);
  }
  const out = [];
  for (const [invoiceId, list] of byInvoice) {
    const inv = invoice.get(invoiceId)!;
    const enr = enrollment.get(contract.get(inv.contract_id)?.enrollment_id ?? '');
    if (!enr) continue;
    const total = money(inv.amount) - money(inv.discount_amount) + money(inv.penalty_amount);
    const month = inv.competence_month ? MONTHS[Number(inv.competence_month.slice(5, 7)) - 1] : null;
    const label = [inv.fee_item_id ? feeName.get(inv.fee_item_id) : null, month].filter(Boolean).join(' · ') || 'Pagamento';
    let paid = 0;
    for (const r of list) {
      const amount = money(r.amount);
      const before = money(total - paid);
      paid += amount;
      out.push({
        id: r.id,
        school_id: schoolId,
        student_id: enr.student_id,
        parent_uid: null,
        transaction_id: r.receipt_number ?? r.id,
        amount_paid: amount,
        balance_before: before,
        balance_after: money(total - paid),
        amount_to_debt: amount,
        credit_added: 0,
        currency,
        student_name: wardName.get(enr.student_id) ?? null,
        description: inv.invoice_number ? `${label} (factura ${inv.invoice_number})` : label,
        created_at: when(r),
        academic_year: enr.academic_year_id ? (yearName.get(enr.academic_year_id) ?? null) : null,
        fee_term: null,
      });
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
