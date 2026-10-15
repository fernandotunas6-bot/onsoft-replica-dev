import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { wardClassIds } from '../lib/ward-classes';

const notices = new Hono<AppEnv>();

/**
 * Condição SQL (sobre `n`) dos comunicados que o utilizador pode ver:
 * - encarregado: os dirigidos a ele (recibos) e os gerais para encarregados,
 *   para todos, ou para a turma de um educando activo;
 * - professor: os gerais para todos, para professores ou para uma turma;
 * - admin: todos os gerais (não os recibos individuais).
 */
async function visibility(c: Context<AppEnv>): Promise<{ sql: string; binds: unknown[] }> {
  const user = c.get('user');
  if (user.role === 'parent') {
    const classes = await wardClassIds(c);
    const classClause = classes.length
      ? `OR (n.audience = 'class' AND n.class_id IN (${classes.map(() => '?').join(',')}))`
      : '';
    return {
      sql: `(n.parent_uid = ? OR (n.parent_uid IS NULL AND (n.audience IN ('all', 'parents') ${classClause})))`,
      binds: [user.uid, ...classes],
    };
  }
  if (user.role === 'teacher') {
    return { sql: `(n.parent_uid IS NULL AND n.audience IN ('all', 'teachers', 'class'))`, binds: [] };
  }
  return { sql: 'n.parent_uid IS NULL', binds: [] };
}

const schoolRoles = requireRoles('admin', 'teacher', 'parent');

notices.get('/unread-count', schoolRoles, async (c) => {
  const user = c.get('user');
  const v = await visibility(c);
  const row = await c.env.DB.prepare(
    `
    SELECT COUNT(*) AS cnt FROM Notices n
    LEFT JOIN NoticeReads nr ON nr.notice_id = n.id AND nr.user_uid = ?
    WHERE n.school_id = ? AND ${v.sql} AND nr.notice_id IS NULL
  `
  )
    .bind(user.uid, user.schoolId, ...v.binds)
    .first<{ cnt: number }>();

  return jsonOk(c, { unread_count: Number(row?.cnt ?? 0) });
});

notices.get('/', schoolRoles, async (c) => {
  const user = c.get('user');
  const v = await visibility(c);
  const { results } = await c.env.DB.prepare(
    `
    SELECT
      n.id, n.school_id, n.parent_uid, n.title, n.summary, n.body, n.category,
      n.audience, n.class_id, cl.class_name, n.created_at,
      CASE WHEN nr.notice_id IS NOT NULL THEN 1 ELSE 0 END AS read_flag
    FROM Notices n
    LEFT JOIN NoticeReads nr ON nr.notice_id = n.id AND nr.user_uid = ?
    LEFT JOIN Classes cl ON cl.id = n.class_id AND cl.school_id = n.school_id
    WHERE n.school_id = ? AND ${v.sql}
    ORDER BY n.created_at DESC
    LIMIT 100
  `
  )
    .bind(user.uid, user.schoolId, ...v.binds)
    .all();

  return jsonOk(c, { data: results });
});

notices.post('/:id/read', schoolRoles, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const v = await visibility(c);
  const notice = await c.env.DB.prepare(
    `SELECT n.id FROM Notices n WHERE n.id = ? AND n.school_id = ? AND ${v.sql} LIMIT 1`
  )
    .bind(id, user.schoolId, ...v.binds)
    .first<{ id: string }>();

  if (!notice) {
    return jsonError(c, 'Notice not found', 404);
  }

  await c.env.DB.prepare('INSERT OR IGNORE INTO NoticeReads (notice_id, user_uid) VALUES (?, ?)')
    .bind(id, user.uid)
    .run();

  return jsonOk(c, { ok: true });
});

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(5000),
    summary: z.string().trim().max(200).optional(),
    audience: z.enum(['all', 'parents', 'teachers', 'class']),
    class_id: z.string().trim().min(1).optional(),
    category: z.enum(['general', 'academic', 'event', 'urgent']).default('general'),
  })
  .refine((n) => n.audience !== 'class' || n.class_id, { message: 'class_id is required for audience=class' });

notices.post('/', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid notice', 400, parsed.error.flatten());
  }
  const n = parsed.data;
  const classId = n.audience === 'class' ? n.class_id! : null;
  if (classId) {
    const cls = await c.env.DB.prepare('SELECT id FROM Classes WHERE id = ? AND school_id = ?')
      .bind(classId, user.schoolId)
      .first();
    if (!cls) return jsonError(c, 'Class not found', 404);
  }
  const summary = n.summary || (n.body.length > 140 ? `${n.body.slice(0, 137).trimEnd()}…` : n.body);
  const id = createPrefixedId('ntc');
  await c.env.DB.prepare(
    `INSERT INTO Notices (id, school_id, parent_uid, title, summary, body, category, audience, class_id, created_by)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.schoolId, n.title, summary, n.body, n.category, n.audience, classId, user.uid).run();
  return jsonOk(c, { id }, 201);
});

/** O admin apaga comunicados gerais; os recibos individuais não. */
notices.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const result = await c.env.DB.prepare(
    'DELETE FROM Notices WHERE id = ? AND school_id = ? AND parent_uid IS NULL'
  ).bind(c.req.param('id'), user.schoolId).run();
  if (!result.meta.changes) return jsonError(c, 'Notice not found', 404);
  return jsonOk(c, { ok: true });
});

export default notices;
