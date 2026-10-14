import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireAdminOrTeacher } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const createClassSchema = z.object({
  class_name: z.string().trim().min(1),
  level: z.number().int().optional().nullable(),
  fee_amount: z.number().finite().nonnegative().optional().nullable(),
  fee_collection_cycle: z.enum(['term', 'year']).optional().nullable(),
});

const updateClassSchema = z.object({
  class_name: z.string().trim().min(1).optional(),
  level: z.number().int().optional().nullable(),
  fee_amount: z.number().finite().nonnegative().optional().nullable(),
  fee_collection_cycle: z.enum(['term', 'year']).optional().nullable(),
});

async function requireAcademicCalendar(c: any, schoolId: string) {
  const school = await c.env.DB.prepare(
    'SELECT academic_calendar_json FROM Schools WHERE id = ? LIMIT 1'
  ).bind(schoolId).first<{ academic_calendar_json: string | null }>();

  return Boolean(school?.academic_calendar_json);
}

const classes = new Hono<AppEnv>();

classes.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT id, school_id, class_name, level, fee_amount, fee_collection_cycle, fee_last_applied_period, created_at FROM Classes WHERE school_id = ? ORDER BY COALESCE(level, 9999), class_name'
  ).bind(user.schoolId).all();

  return jsonOk(c, { data: results });
});

classes.post('/', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = createClassSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid class payload', 400, parsed.error.flatten());
  }

  if ((parsed.data.fee_amount ?? 0) > 0 || parsed.data.fee_collection_cycle) {
    const hasCalendar = await requireAcademicCalendar(c, user.schoolId);
    if (!hasCalendar) {
      return jsonError(c, 'Configure the academic calendar before saving class fees', 400);
    }
  }

  const classId = createPrefixedId('cls');
  await c.env.DB.prepare(
    'INSERT INTO Classes (id, school_id, class_name, level, fee_amount, fee_collection_cycle) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    classId,
    user.schoolId,
    parsed.data.class_name,
    parsed.data.level ?? null,
    parsed.data.fee_amount ?? 0,
    parsed.data.fee_collection_cycle ?? 'term',
  ).run();

  return jsonOk(c, { id: classId, school_id: user.schoolId, class_name: parsed.data.class_name, level: parsed.data.level ?? null, fee_amount: parsed.data.fee_amount ?? 0, fee_collection_cycle: parsed.data.fee_collection_cycle ?? 'term' }, 201);
});

classes.patch('/:classId', requireAdmin, async (c) => {
  const user = c.get('user');
  const classId = c.req.param('classId');
  const parsed = updateClassSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid class payload', 400, parsed.error.flatten());
  }

  if ((parsed.data.fee_amount ?? null) !== null || parsed.data.fee_collection_cycle) {
    const hasCalendar = await requireAcademicCalendar(c, user.schoolId);
    if (!hasCalendar) {
      return jsonError(c, 'Configure the academic calendar before saving class fees', 400);
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  if ('class_name' in parsed.data) {
    setClauses.push('class_name = ?');
    values.push(parsed.data.class_name ?? null);
  }
  if ('level' in parsed.data) {
    setClauses.push('level = ?');
    values.push(parsed.data.level ?? null);
  }
  if ('fee_amount' in parsed.data) {
    setClauses.push('fee_amount = ?');
    values.push(parsed.data.fee_amount ?? 0);
  }
  if ('fee_collection_cycle' in parsed.data) {
    setClauses.push('fee_collection_cycle = ?');
    values.push(parsed.data.fee_collection_cycle ?? 'term');
  }

  if (setClauses.length === 0) {
    return jsonError(c, 'No fields to update', 400);
  }

  const result = await c.env.DB.prepare(
    `UPDATE Classes SET ${setClauses.join(', ')} WHERE id = ? AND school_id = ?`
  ).bind(...values, classId, user.schoolId).run();

  if (result.meta.changes === 0) return jsonError(c, 'Class not found', 404);

  return jsonOk(c, { id: classId, ...parsed.data });
});

classes.delete('/:classId', requireAdmin, async (c) => {
  const user = c.get('user');
  const classId = c.req.param('classId');

  const studentCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM Students WHERE class_id = ? AND school_id = ?'
  ).bind(classId, user.schoolId).first<{ count: number }>();

  if (studentCount && studentCount.count > 0) {
    return jsonError(c, `Cannot delete class with ${studentCount.count} student(s). Reassign them first.`, 400);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM SubjectClasses WHERE class_id = ? AND school_id = ?').bind(classId, user.schoolId),
    c.env.DB.prepare('DELETE FROM Classes WHERE id = ? AND school_id = ?').bind(classId, user.schoolId),
  ]);

  return jsonOk(c, { deleted: true, class_id: classId });
});

export default classes;
