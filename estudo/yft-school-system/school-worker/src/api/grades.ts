import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdminOrTeacher } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const grades = new Hono<AppEnv>();

const putBodySchema = z.object({
  student_id: z.string().trim().min(1),
  term: z.string().trim().min(1),
  grades: z.array(z.object({
    subject_id: z.string().trim().min(1),
    class_score: z.number().finite().min(0).max(100),
    exam_score: z.number().finite().min(0).max(100),
  })).min(1),
});

async function schoolAllowsTeacherGradeEdits(
  db: D1Database,
  schoolId: string,
): Promise<boolean> {
  const row = await db.prepare(
    'SELECT teacher_can_edit_results FROM Schools WHERE id = ? LIMIT 1',
  ).bind(schoolId).first<{ teacher_can_edit_results: number }>();
  return Boolean(row?.teacher_can_edit_results);
}

grades.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const studentId = c.req.query('student_id')?.trim();
  const term = c.req.query('term')?.trim();
  if (!studentId || !term) {
    return jsonError(c, 'student_id and term are required', 400);
  }

  const student = await c.env.DB.prepare(
    'SELECT id FROM Students WHERE id = ? AND school_id = ? LIMIT 1',
  ).bind(studentId, user.schoolId).first<{ id: string }>();
  if (!student) {
    return jsonError(c, 'Student not found', 404);
  }

  const { results } = await c.env.DB.prepare(
    `
    SELECT
      e.subject_id,
      e.term_id,
      e.class_score,
      e.exam_score,
      s.name AS subject_name
    FROM Enrollments e
    JOIN Subjects s ON s.id = e.subject_id AND s.school_id = e.school_id
    WHERE e.school_id = ? AND e.student_id = ? AND e.term_id = ?
    ORDER BY s.name
    `,
  ).bind(user.schoolId, studentId, term).all();

  return jsonOk(c, { data: results });
});

grades.put('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const parsed = putBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid grades payload', 400, parsed.error.flatten());
  }

  if (user.role === 'teacher') {
    const allowed = await schoolAllowsTeacherGradeEdits(c.env.DB, user.schoolId);
    if (!allowed) {
      return jsonError(
        c,
        'Teachers are not allowed to edit results. Ask an admin to enable this in Security settings.',
        403,
      );
    }
  }

  const { student_id: studentId, term, grades: rows } = parsed.data;

  const student = await c.env.DB.prepare(
    'SELECT id FROM Students WHERE id = ? AND school_id = ? LIMIT 1',
  ).bind(studentId, user.schoolId).first<{ id: string }>();
  if (!student) {
    return jsonError(c, 'Student not found', 404);
  }

  for (const row of rows) {
    const subject = await c.env.DB.prepare(
      'SELECT id FROM Subjects WHERE id = ? AND school_id = ? LIMIT 1',
    ).bind(row.subject_id, user.schoolId).first<{ id: string }>();
    if (!subject) {
      return jsonError(c, `Unknown subject: ${row.subject_id}`, 400);
    }
  }

  for (const row of rows) {
    const existing = await c.env.DB.prepare(
      `
      SELECT id FROM Enrollments
      WHERE school_id = ? AND student_id = ? AND subject_id = ? AND term_id = ?
      LIMIT 1
      `,
    ).bind(user.schoolId, studentId, row.subject_id, term).first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        'UPDATE Enrollments SET class_score = ?, exam_score = ? WHERE id = ?',
      ).bind(row.class_score, row.exam_score, existing.id).run();
    } else {
      const id = createPrefixedId('enr');
      await c.env.DB.prepare(
        `
        INSERT INTO Enrollments (id, school_id, student_id, subject_id, term_id, class_score, exam_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        id,
        user.schoolId,
        studentId,
        row.subject_id,
        term,
        row.class_score,
        row.exam_score,
      ).run();
    }
  }

  return jsonOk(c, { ok: true, updated: rows.length });
});

export default grades;
