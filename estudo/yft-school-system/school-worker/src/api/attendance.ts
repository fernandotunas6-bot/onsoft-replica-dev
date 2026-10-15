import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireAdminOrTeacher, requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const putSchema = z.object({
  class_id: z.string().trim().min(1),
  date: day,
  records: z
    .array(z.object({ student_id: z.string().trim().min(1), present: z.boolean() }))
    .min(1)
    .max(300),
});

/** Hoje em Luanda (UTC+1), para recusar presenças no futuro. */
function todayLuanda(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

const attendance = new Hono<AppEnv>();

/**
 * Lista da turma num dia, com o estado de cada aluno activo:
 * `present` é true/false se já foi marcado, ou null.
 */
attendance.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const classId = c.req.query('class_id')?.trim();
  const date = c.req.query('date')?.trim();
  if (!classId || !date || !day.safeParse(date).success) {
    return jsonError(c, 'class_id and date (YYYY-MM-DD) are required', 400);
  }
  const cls = await c.env.DB.prepare('SELECT id FROM Classes WHERE id = ? AND school_id = ?')
    .bind(classId, user.schoolId)
    .first();
  if (!cls) return jsonError(c, 'Class not found', 404);

  const { results } = await c.env.DB.prepare(
    `SELECT s.id AS student_id, s.name, s.photo_url, a.present
     FROM Students s
     LEFT JOIN Attendance a
       ON a.student_id = s.id AND a.school_id = s.school_id AND a.date = ?
     WHERE s.school_id = ? AND s.class_id = ? AND s.is_active = 1
     ORDER BY s.name COLLATE NOCASE`
  ).bind(date, user.schoolId, classId).all<{ student_id: string; name: string; photo_url: string | null; present: number | null }>();

  return jsonOk(c, {
    data: results.map((r) => ({ ...r, present: r.present === null ? null : r.present === 1 })),
    marked: results.some((r) => r.present !== null),
  });
});

attendance.put('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const parsed = putSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid attendance payload', 400, parsed.error.flatten());
  }
  const { class_id: classId, date, records } = parsed.data;
  if (date > todayLuanda()) return jsonError(c, 'Date is in the future', 400);

  const ids = [...new Set(records.map((r) => r.student_id))];
  const { results: valid } = await c.env.DB.prepare(
    `SELECT id FROM Students
     WHERE school_id = ? AND class_id = ? AND is_active = 1 AND id IN (${ids.map(() => '?').join(',')})`
  ).bind(user.schoolId, classId, ...ids).all<{ id: string }>();
  if (valid.length !== ids.length) {
    return jsonError(c, 'Some students are not active in this class', 400);
  }

  await c.env.DB.batch(
    records.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO Attendance (id, school_id, student_id, class_id, date, present, marked_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(school_id, student_id, date) DO UPDATE SET
           present = excluded.present,
           class_id = excluded.class_id,
           marked_by = excluded.marked_by,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(createPrefixedId('att'), user.schoolId, r.student_id, classId, date, r.present ? 1 : 0, user.uid)
    ),
  );

  return jsonOk(c, { saved: records.length });
});

/** Totais por aluno de uma turma: dias presente e faltas. */
attendance.get('/summary', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const classId = c.req.query('class_id')?.trim();
  if (!classId) return jsonError(c, 'class_id is required', 400);

  const { results } = await c.env.DB.prepare(
    `SELECT s.id AS student_id, s.name,
            COALESCE(SUM(a.present = 1), 0) AS present_days,
            COALESCE(SUM(a.present = 0), 0) AS absent_days
     FROM Students s
     LEFT JOIN Attendance a ON a.student_id = s.id AND a.school_id = s.school_id
     WHERE s.school_id = ? AND s.class_id = ? AND s.is_active = 1
     GROUP BY s.id
     ORDER BY absent_days DESC, s.name COLLATE NOCASE`
  ).bind(user.schoolId, classId).all();
  const days = await c.env.DB.prepare(
    'SELECT COUNT(DISTINCT date) AS n FROM Attendance WHERE school_id = ? AND class_id = ?'
  ).bind(user.schoolId, classId).first<{ n: number }>();

  return jsonOk(c, { data: results, days_marked: days?.n ?? 0 });
});

/**
 * Histórico de um aluno: totais e as faltas mais recentes. O encarregado
 * só vê os seus educandos activos.
 */
attendance.get('/student/:studentId', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  const student = user.role === 'parent'
    ? await c.env.DB.prepare(
      'SELECT id FROM Students WHERE id = ? AND school_id = ? AND parent_uid = ? AND is_active = 1'
    ).bind(studentId, user.schoolId, user.uid).first()
    : await c.env.DB.prepare('SELECT id FROM Students WHERE id = ? AND school_id = ?')
      .bind(studentId, user.schoolId)
      .first();
  if (!student) return jsonError(c, 'Student not found', 404);

  const totals = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(present = 1), 0) AS present_days,
            COALESCE(SUM(present = 0), 0) AS absent_days
     FROM Attendance WHERE school_id = ? AND student_id = ?`
  ).bind(user.schoolId, studentId).first<{ present_days: number; absent_days: number }>();
  const { results: absences } = await c.env.DB.prepare(
    `SELECT date FROM Attendance
     WHERE school_id = ? AND student_id = ? AND present = 0
     ORDER BY date DESC LIMIT 60`
  ).bind(user.schoolId, studentId).all<{ date: string }>();

  return jsonOk(c, {
    present_days: totals?.present_days ?? 0,
    absent_days: totals?.absent_days ?? 0,
    absences: absences.map((a) => a.date),
  });
});

export default attendance;
