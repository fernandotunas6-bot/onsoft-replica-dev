import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { wardClassIds } from '../lib/ward-classes';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

const slotSchema = z
  .object({
    class_id: z.string().trim().min(1),
    subject_id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(60).optional(),
    weekday: z.number().int().min(1).max(7),
    start_time: time,
    end_time: time,
    room: z.string().trim().max(40).optional(),
    teacher_name: z.string().trim().max(80).optional(),
  })
  .refine((s) => s.subject_id || s.title, { message: 'subject_id or title is required' })
  .refine((s) => s.end_time > s.start_time, { message: 'end_time must be after start_time' });

const timetable = new Hono<AppEnv>();

/**
 * Tempos da semana. Admin e professor vêem qualquer turma da escola;
 * o encarregado só as turmas dos seus educandos.
 */
timetable.get('/', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const requested = c.req.query('class_id')?.trim();

  let classIds: string[] | null = null;
  if (user.role === 'parent') {
    const mine = await wardClassIds(c);
    if (requested && !mine.includes(requested)) {
      return jsonError(c, 'Forbidden', 403);
    }
    classIds = requested ? [requested] : mine;
    if (classIds.length === 0) return jsonOk(c, { data: [] });
  } else if (requested) {
    classIds = [requested];
  }

  const filter = classIds ? `AND t.class_id IN (${classIds.map(() => '?').join(',')})` : '';
  const { results } = await c.env.DB.prepare(
    `
      SELECT
        t.id, t.class_id, c.class_name, t.subject_id, s.name AS subject_name,
        t.title, t.weekday, t.start_time, t.end_time, t.room, t.teacher_name
      FROM TimetableSlots t
      JOIN Classes c ON c.id = t.class_id AND c.school_id = t.school_id
      LEFT JOIN Subjects s ON s.id = t.subject_id AND s.school_id = t.school_id
      WHERE t.school_id = ? ${filter}
      ORDER BY t.weekday, t.start_time, c.class_name
    `
  ).bind(user.schoolId, ...(classIds ?? [])).all();

  return jsonOk(c, { data: results });
});

timetable.post('/', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = slotSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid timetable slot', 400, parsed.error.flatten());
  }
  const slot = parsed.data;

  const cls = await c.env.DB.prepare('SELECT id FROM Classes WHERE id = ? AND school_id = ?')
    .bind(slot.class_id, user.schoolId)
    .first();
  if (!cls) return jsonError(c, 'Class not found', 404);

  if (slot.subject_id) {
    const subject = await c.env.DB.prepare('SELECT id FROM Subjects WHERE id = ? AND school_id = ?')
      .bind(slot.subject_id, user.schoolId)
      .first();
    if (!subject) return jsonError(c, 'Subject not found', 404);
  }

  // Dois tempos da mesma turma não se podem sobrepor.
  const clash = await c.env.DB.prepare(
    `SELECT id FROM TimetableSlots
     WHERE school_id = ? AND class_id = ? AND weekday = ?
       AND start_time < ? AND end_time > ?
     LIMIT 1`
  ).bind(user.schoolId, slot.class_id, slot.weekday, slot.end_time, slot.start_time).first();
  if (clash) return jsonError(c, 'Overlaps another slot of this class', 409);

  const id = createPrefixedId('tts');
  await c.env.DB.prepare(
    `INSERT INTO TimetableSlots
       (id, school_id, class_id, subject_id, title, weekday, start_time, end_time, room, teacher_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.schoolId,
    slot.class_id,
    slot.subject_id ?? null,
    slot.title ?? null,
    slot.weekday,
    slot.start_time,
    slot.end_time,
    slot.room ?? null,
    slot.teacher_name ?? null,
  ).run();

  return jsonOk(c, { id, ...slot }, 201);
});

timetable.delete('/:slotId', requireAdmin, async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare('DELETE FROM TimetableSlots WHERE id = ? AND school_id = ?')
    .bind(c.req.param('slotId'), user.schoolId)
    .run();
  if (!result.meta.changes) return jsonError(c, 'Slot not found', 404);
  return jsonOk(c, { ok: true });
});

export default timetable;
