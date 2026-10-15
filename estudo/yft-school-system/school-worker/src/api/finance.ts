import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, Env } from '../app-env';
import { requireAdmin, requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

async function schoolCurrency(db: Env['DB'], schoolId: string): Promise<string> {
  const row = await db.prepare(
    'SELECT academic_calendar_json FROM Schools WHERE id = ? LIMIT 1'
  )
    .bind(schoolId)
    .first<{ academic_calendar_json: string | null }>();
  if (!row?.academic_calendar_json) return 'GHS';
  try {
    const j = JSON.parse(row.academic_calendar_json) as { currency?: string };
    const cur = j.currency?.trim();
    return cur && cur.length > 0 ? cur : 'GHS';
  } catch {
    return 'GHS';
  }
}

function firstNonEmptyString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

async function academicFeePeriod(
  db: Env['DB'],
  schoolId: string
): Promise<{ academic_year: string | null; fee_term: string | null }> {
  const row = await db.prepare(
    'SELECT academic_calendar_json FROM Schools WHERE id = ? LIMIT 1'
  )
    .bind(schoolId)
    .first<{ academic_calendar_json: string | null }>();
  if (!row?.academic_calendar_json) return { academic_year: null, fee_term: null };
  try {
    const j = JSON.parse(row.academic_calendar_json) as Record<string, unknown>;
    return {
      academic_year: firstNonEmptyString(j, ['academic_year', 'academicYear']),
      fee_term: firstNonEmptyString(j, [
        'active_term',
        'activeTerm',
        'fee_term',
        'feeTerm',
        'current_term',
        'currentTerm',
      ]),
    };
  } catch {
    return { academic_year: null, fee_term: null };
  }
}

const paymentSchema = z.object({
  student_id: z.string().trim().min(1),
  amount: z.number().positive(),
  description: z.string().trim().optional().nullable(),
  /** When sent, must match the student record (prevents mis-keyed ID). */
  verify_student_name: z.string().trim().min(1).optional(),
  verify_class_id: z.string().trim().min(1).optional(),
});

function normalizePersonLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const finance = new Hono<AppEnv>();

finance.get('/arrears', requireAdmin, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `
      SELECT
        s.id,
        s.name,
        s.class_id,
        s.balance,
        c.class_name
      FROM Students s
      LEFT JOIN Classes c ON c.id = s.class_id AND c.school_id = s.school_id
      WHERE s.school_id = ? AND s.balance < 0
      ORDER BY s.balance ASC, s.name
    `
  ).bind(user.schoolId).all();

  return jsonOk(c, { data: results });
});

finance.get('/receipts', requireRoles('parent'), async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `
    SELECT
      id,
      school_id,
      student_id,
      parent_uid,
      transaction_id,
      amount_paid,
      balance_before,
      balance_after,
      amount_to_debt,
      credit_added,
      currency,
      student_name,
      description,
      created_at,
      academic_year,
      fee_term
    FROM Receipts
    WHERE school_id = ? AND parent_uid = ?
    ORDER BY created_at DESC
    LIMIT 100
  `
  )
    .bind(user.schoolId, user.uid)
    .all();

  return jsonOk(c, { data: results });
});

finance.post('/payment', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = paymentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid payment payload', 400, parsed.error.flatten());
  }

  const student = await c.env.DB.prepare(
    'SELECT id, balance, parent_uid, name, class_id FROM Students WHERE id = ? AND school_id = ? LIMIT 1'
  )
    .bind(parsed.data.student_id, user.schoolId)
    .first<{
      id: string;
      balance: number;
      parent_uid: string | null;
      name: string;
      class_id: string;
    }>();

  if (!student) {
    return jsonError(c, 'Student not found in this school', 404);
  }

  if (parsed.data.verify_student_name) {
    if (
      normalizePersonLabel(parsed.data.verify_student_name) !==
      normalizePersonLabel(student.name)
    ) {
      return jsonError(
        c,
        'Verification failed: student name does not match this student ID. Check you selected the correct student.',
        409
      );
    }
  }
  if (parsed.data.verify_class_id && parsed.data.verify_class_id !== student.class_id) {
    return jsonError(
      c,
      'Verification failed: class does not match this student ID. Check you selected the correct student.',
      409
    );
  }

  const currency = await schoolCurrency(c.env.DB, user.schoolId);
  const feePeriod = await academicFeePeriod(c.env.DB, user.schoolId);
  const balanceBefore = Number(student.balance ?? 0);
  const amountPaid = parsed.data.amount;
  const debt = Math.max(0, -balanceBefore);
  const amountToDebt = Math.min(amountPaid, debt);
  const creditAdded = amountPaid - amountToDebt;
  const nextBalance = balanceBefore + amountPaid;

  const transactionId = createPrefixedId('txn');
  const receiptId = createPrefixedId('rcp');

  const statements = [
    c.env.DB.prepare(
      'INSERT INTO Transactions (id, school_id, student_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      transactionId,
      user.schoolId,
      parsed.data.student_id,
      amountPaid,
      'payment',
      parsed.data.description ?? null
    ),
    c.env.DB.prepare(
      'UPDATE Students SET balance = ? WHERE id = ? AND school_id = ?'
    ).bind(nextBalance, parsed.data.student_id, user.schoolId),
    c.env.DB.prepare(
      `INSERT INTO Receipts (
        id, school_id, student_id, parent_uid, transaction_id,
        amount_paid, balance_before, balance_after, amount_to_debt, credit_added,
        currency, student_name, description, academic_year, fee_term
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      receiptId,
      user.schoolId,
      parsed.data.student_id,
      student.parent_uid,
      transactionId,
      amountPaid,
      balanceBefore,
      nextBalance,
      amountToDebt,
      creditAdded,
      currency,
      student.name,
      parsed.data.description ?? null,
      feePeriod.academic_year,
      feePeriod.fee_term
    ),
  ];

  if (student.parent_uid) {
    const noticeId = createPrefixedId('ntc');
    const summary = `Payment: ${currency} ${amountPaid.toFixed(2)} for ${student.name}`;
    const balanceLabel =
      nextBalance < 0
        ? `Outstanding (owing): ${currency} ${Math.abs(nextBalance).toFixed(2)}`
        : nextBalance > 0
          ? `Credit balance: ${currency} ${nextBalance.toFixed(2)}`
          : `Balance: ${currency} 0.00 (fees cleared for now)`;

    const bodyLines = [
      `A fee payment was recorded for ${student.name}.`,
      '',
      `Amount received: ${currency} ${amountPaid.toFixed(2)}`,
      `Applied to fees owed: ${currency} ${amountToDebt.toFixed(2)}`,
      ...(creditAdded > 0
        ? [`Overpayment / credit added: ${currency} ${creditAdded.toFixed(2)}`]
        : []),
      '',
      balanceLabel,
      '',
      `Receipt: ${receiptId}`,
      `Transaction: ${transactionId}`,
      parsed.data.description ? `Note: ${parsed.data.description}` : '',
    ].filter((line) => line.length > 0);

    const body = bodyLines.join('\n');

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO Notices (id, school_id, parent_uid, title, summary, body, category)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        noticeId,
        user.schoolId,
        student.parent_uid,
        'Fee payment received',
        summary,
        body,
        'payment'
      )
    );
  }

  await c.env.DB.batch(statements);

  return jsonOk(
    c,
    {
      id: transactionId,
      receipt_id: receiptId,
      student_id: parsed.data.student_id,
      amount: amountPaid,
      balance: nextBalance,
      balance_before: balanceBefore,
      amount_to_debt: amountToDebt,
      credit_added: creditAdded,
      currency,
      notice_created: Boolean(student.parent_uid),
    },
    201
  );
});

const chargeClassSchema = z.object({
  class_id: z.string().trim().min(1),
  amount: z.number().positive(),
  description: z.string().trim().min(1),
  period_key: z.string().trim().min(1).optional().nullable(),
});

const adjustClassFeeSchema = z.object({
  class_id: z.string().trim().min(1),
  amount_delta: z.number(),
  description: z.string().trim().min(1),
});

async function hasAcademicCalendar(c: Context<AppEnv>, schoolId: string) {
  const school = await c.env.DB.prepare(
    'SELECT academic_calendar_json FROM Schools WHERE id = ? LIMIT 1'
  ).bind(schoolId).first<{ academic_calendar_json: string | null }>();

  return Boolean(school?.academic_calendar_json);
}

finance.post('/charge-class', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = chargeClassSchema.safeParse(await c.req.json().catch(() => null)); 
  if (!parsed.success) {
    return jsonError(c, 'Invalid charge payload', 400, parsed.error.flatten());
  }

  const calendarConfigured = await hasAcademicCalendar(c, user.schoolId);
  if (!calendarConfigured) {
    return jsonError(c, 'Configure the academic calendar before applying class fees', 400);
  }

  const { class_id, amount, description, period_key } = parsed.data;

  const classRow = await c.env.DB.prepare(
    'SELECT id, fee_last_applied_period FROM Classes WHERE id = ? AND school_id = ? LIMIT 1'
  ).bind(class_id, user.schoolId).first<{ id: string; fee_last_applied_period: string | null }>();

  if (!classRow) {
    return jsonError(c, 'Class not found', 404);
  }

  if (period_key && classRow.fee_last_applied_period === period_key) {
    return jsonError(c, 'Fees already applied for this period', 400);
  }

  const { results: students } = await c.env.DB.prepare(
    'SELECT id, balance FROM Students WHERE class_id = ? AND school_id = ?'
  ).bind(class_id, user.schoolId).all<{ id: string; balance: number }>();

  if (students.length === 0) {
    return jsonError(c, 'No students found in this class', 404);
  }

  const batch = [];
  
  for (const student of students) {
    const transactionId = createPrefixedId('txn');
    const nextBalance = Number(student.balance ?? 0) - amount;

    batch.push(
      c.env.DB.prepare(
        'INSERT INTO Transactions (id, school_id, student_id, class_id, amount, type, description, fee_period_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(transactionId, user.schoolId, student.id, class_id, amount, 'charge', description, period_key ?? null)
    );

    batch.push(
      c.env.DB.prepare(
        'UPDATE Students SET balance = ? WHERE id = ? AND school_id = ?'
      ).bind(nextBalance, student.id, user.schoolId)
    );
  }

  // Cloudflare D1 batch limit is typically 100 statements
  // We chunk them into 100 max
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100);
    await c.env.DB.batch(chunk);
  }

  if (period_key) {
    await c.env.DB.prepare(
      'UPDATE Classes SET fee_last_applied_period = ? WHERE id = ? AND school_id = ?'
    ).bind(period_key, class_id, user.schoolId).run();
  }

  return jsonOk(c, {
    charged_students: students.length,
    amount_per_student: amount,
    description,
    period_key: period_key ?? null,
  }, 201);
});

finance.post('/adjust-class-fee', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = adjustClassFeeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid fee adjustment payload', 400, parsed.error.flatten());
  }

  const calendarConfigured = await hasAcademicCalendar(c, user.schoolId);
  if (!calendarConfigured) {
    return jsonError(c, 'Configure the academic calendar before applying class fees', 400);
  }

  const { class_id, amount_delta, description } = parsed.data;
  if (amount_delta === 0) {
    return jsonOk(c, { adjusted_students: 0, amount_delta: 0, description }, 201);
  }

  const { results: students } = await c.env.DB.prepare(
    'SELECT id, balance FROM Students WHERE class_id = ? AND school_id = ?'
  ).bind(class_id, user.schoolId).all<{ id: string; balance: number }>();

  if (students.length === 0) {
    return jsonError(c, 'No students found in this class', 404);
  }

  const batch = [];
  const isPositiveAdjustment = amount_delta > 0;
  const adjustmentAmount = Math.abs(amount_delta);

  for (const student of students) {
    const transactionId = createPrefixedId('txn');
    const nextBalance = isPositiveAdjustment
      ? Number(student.balance ?? 0) - adjustmentAmount
      : Number(student.balance ?? 0) + adjustmentAmount;

    batch.push(
      c.env.DB.prepare(
        'INSERT INTO Transactions (id, school_id, student_id, class_id, amount, type, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        transactionId,
        user.schoolId,
        student.id,
        class_id,
        adjustmentAmount,
        isPositiveAdjustment ? 'charge' : 'payment',
        description,
      )
    );

    batch.push(
      c.env.DB.prepare(
        'UPDATE Students SET balance = ? WHERE id = ? AND school_id = ?'
      ).bind(nextBalance, student.id, user.schoolId)
    );
  }

  for (let i = 0; i < batch.length; i += 100) {
    await c.env.DB.batch(batch.slice(i, i + 100));
  }

  return jsonOk(c, {
    adjusted_students: students.length,
    amount_delta,
    description,
  }, 201);
});

finance.get('/student/:id/transactions', async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM Transactions WHERE student_id = ? AND school_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(studentId, user.schoolId).all();

  return jsonOk(c, { data: results });
});

export default finance;
