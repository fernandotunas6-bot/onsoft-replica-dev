import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireRoles } from '../lib/auth-guards';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const settings = new Hono<AppEnv>();

const accessPatchSchema = z.object({
  teacher_can_edit_results: z.boolean(),
});

settings.get('/access-control', requireRoles('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT teacher_can_edit_results FROM Schools WHERE id = ? LIMIT 1',
  ).bind(user.schoolId).first<{ teacher_can_edit_results: number }>();

  return jsonOk(c, {
    data: {
      teacher_can_edit_results: Boolean(row?.teacher_can_edit_results),
    },
  });
});

settings.patch('/access-control', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = accessPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid payload', 400, parsed.error.flatten());
  }

  const flag = parsed.data.teacher_can_edit_results ? 1 : 0;
  const result = await c.env.DB.prepare(
    'UPDATE Schools SET teacher_can_edit_results = ? WHERE id = ?',
  ).bind(flag, user.schoolId).run();

  if (result.meta.changes === 0) {
    return jsonError(c, 'School not found', 404);
  }

  return jsonOk(c, {
    data: { teacher_can_edit_results: parsed.data.teacher_can_edit_results },
  });
});

export default settings;
