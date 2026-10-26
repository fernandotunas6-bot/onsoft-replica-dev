import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdminOrTeacher, requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { canMarkClass, canSeeStudent } from '../lib/ward-classes';
import { z } from 'zod';

const grades = new Hono<AppEnv>();

const putBodySchema = z.object({
  student_id: z.string().trim().min(1),
  term: z.string().trim().min(1),
  academic_year: z.string().trim().max(20).optional(),
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

/**
 * Anos lectivos em que o aluno tem notas, mais o actual da escola (primeiro
 * o mais recente). Serve o selector de ano das notas e do boletim.
 */
grades.get('/years', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const studentId = c.req.query('student_id')?.trim();
  if (!studentId) return jsonError(c, 'student_id is required', 400);
  if (!(await canSeeStudent(c, studentId))) return jsonError(c, 'Student not found', 404);

  const current = await resolveAcademicYear(c.env.DB, user.schoolId, undefined);
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT academic_year FROM Enrollments
     WHERE school_id = ? AND student_id = ? AND academic_year != ''`
  ).bind(user.schoolId, studentId).all<{ academic_year: string }>();
  const years = [...new Set([current, ...results.map((r) => r.academic_year)])]
    .filter((y) => y !== '')
    .sort()
    .reverse();
  return jsonOk(c, { data: years, current });
});

// O encarregado lê as notas (boletim) dos seus educandos activos.
/**
 * Ano lectivo pedido, ou o actual da escola (calendário académico).
 * Sem calendário, '' — o mesmo valor que as notas antigas receberam.
 */
async function resolveAcademicYear(
  db: D1Database,
  schoolId: string,
  requested: string | undefined,
): Promise<string> {
  if (requested) return requested;
  const row = await db.prepare(
    "SELECT json_extract(academic_calendar_json, '$.academic_year') AS year FROM Schools WHERE id = ? LIMIT 1",
  ).bind(schoolId).first<{ year: string | null }>();
  return row?.year ?? '';
}

grades.get('/', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const studentId = c.req.query('student_id')?.trim();
  const term = c.req.query('term')?.trim();
  if (!studentId || !term) {
    return jsonError(c, 'student_id and term are required', 400);
  }

  if (!(await canSeeStudent(c, studentId))) {
    return jsonError(c, 'Student not found', 404);
  }

  const academicYear = await resolveAcademicYear(
    c.env.DB,
    user.schoolId,
    c.req.query('academic_year')?.trim() || undefined,
  );

  const { results } = await c.env.DB.prepare(
    `
    SELECT
      e.subject_id,
      e.term_id,
      e.class_score,
      e.exam_score,
      e.academic_year,
      s.name AS subject_name
    FROM Enrollments e
    JOIN Subjects s ON s.id = e.subject_id AND s.school_id = e.school_id
    WHERE e.school_id = ? AND e.student_id = ? AND e.term_id = ? AND e.academic_year = ?
    ORDER BY s.name
    `,
  ).bind(user.schoolId, studentId, term, academicYear).all();

  return jsonOk(c, { data: results, academic_year: academicYear });
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
  const academicYear = await resolveAcademicYear(c.env.DB, user.schoolId, parsed.data.academic_year);

  const student = await c.env.DB.prepare(
    'SELECT id, class_id FROM Students WHERE id = ? AND school_id = ? LIMIT 1',
  ).bind(studentId, user.schoolId).first<{ id: string; class_id: string }>();
  if (!student) {
    return jsonError(c, 'Student not found', 404);
  }
  if (!(await canMarkClass(c, student.class_id))) {
    return jsonError(c, 'You do not teach this class', 403);
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
      WHERE school_id = ? AND student_id = ? AND subject_id = ? AND term_id = ? AND academic_year = ?
      LIMIT 1
      `,
    ).bind(user.schoolId, studentId, row.subject_id, term, academicYear).first<{ id: string }>();

    if (existing) {
      await c.env.DB.prepare(
        'UPDATE Enrollments SET class_score = ?, exam_score = ? WHERE id = ?',
      ).bind(row.class_score, row.exam_score, existing.id).run();
    } else {
      const id = createPrefixedId('enr');
      await c.env.DB.prepare(
        `
        INSERT INTO Enrollments (id, school_id, student_id, subject_id, term_id, class_score, exam_score, academic_year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      ).bind(
        id,
        user.schoolId,
        studentId,
        row.subject_id,
        term,
        row.class_score,
        row.exam_score,
        academicYear,
      ).run();
    }
  }

  return jsonOk(c, { ok: true, updated: rows.length, academic_year: academicYear });
});

export default grades;
