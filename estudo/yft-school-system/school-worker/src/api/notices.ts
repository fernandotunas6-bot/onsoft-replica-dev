import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireRoles } from '../lib/auth-guards';
import { jsonError, jsonOk } from '../lib/response';

const notices = new Hono<AppEnv>();

notices.get('/unread-count', requireRoles('parent'), async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `
    SELECT COUNT(*) AS cnt FROM Notices n
    LEFT JOIN NoticeReads nr ON nr.notice_id = n.id AND nr.user_uid = ?
    WHERE n.school_id = ? AND (n.parent_uid IS NULL OR n.parent_uid = ?)
      AND nr.notice_id IS NULL
  `
  )
    .bind(user.uid, user.schoolId, user.uid)
    .first<{ cnt: number }>();

  const cnt = Number(row?.cnt ?? 0);
  return jsonOk(c, { unread_count: cnt });
});

notices.get('/', requireRoles('parent'), async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `
    SELECT
      n.id,
      n.school_id,
      n.parent_uid,
      n.title,
      n.summary,
      n.body,
      n.category,
      n.created_at,
      CASE WHEN nr.notice_id IS NOT NULL THEN 1 ELSE 0 END AS read_flag
    FROM Notices n
    LEFT JOIN NoticeReads nr ON nr.notice_id = n.id AND nr.user_uid = ?
    WHERE n.school_id = ? AND (n.parent_uid IS NULL OR n.parent_uid = ?)
    ORDER BY n.created_at DESC
    LIMIT 100
  `
  )
    .bind(user.uid, user.schoolId, user.uid)
    .all();

  return jsonOk(c, { data: results });
});

notices.post('/:id/read', requireRoles('parent'), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const notice = await c.env.DB.prepare(
    `
    SELECT id FROM Notices
    WHERE id = ? AND school_id = ? AND (parent_uid IS NULL OR parent_uid = ?)
    LIMIT 1
  `
  )
    .bind(id, user.schoolId, user.uid)
    .first<{ id: string }>();

  if (!notice) {
    return jsonError(c, 'Notice not found', 404);
  }

  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO NoticeReads (notice_id, user_uid) VALUES (?, ?)'
  )
    .bind(id, user.uid)
    .run();

  return jsonOk(c, { ok: true });
});

export default notices;
