import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdminOrTeacher } from '../lib/auth-guards';
import { jsonOk } from '../lib/response';

const parents = new Hono<AppEnv>();

parents.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const search = c.req.query('q')?.trim() ?? '';

  let query: string;
  let bindings: unknown[];

  if (search) {
    query = `
      SELECT u.uid, u.name, u.phone, u.email,
        (SELECT COUNT(*) FROM Students s WHERE s.parent_uid = u.uid AND s.is_active = 1) AS student_count
      FROM Users u
      WHERE u.school_id = ? AND u.role = 'parent'
        AND (u.name LIKE ? OR u.phone LIKE ?)
      ORDER BY u.name
      LIMIT 50
    `;
    const like = `%${search}%`;
    bindings = [user.schoolId, like, like];
  } else {
    query = `
      SELECT u.uid, u.name, u.phone, u.email,
        (SELECT COUNT(*) FROM Students s WHERE s.parent_uid = u.uid AND s.is_active = 1) AS student_count
      FROM Users u
      WHERE u.school_id = ? AND u.role = 'parent'
      ORDER BY u.name
      LIMIT 50
    `;
    bindings = [user.schoolId];
  }

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all();

  return jsonOk(c, { data: results });
});

export default parents;
