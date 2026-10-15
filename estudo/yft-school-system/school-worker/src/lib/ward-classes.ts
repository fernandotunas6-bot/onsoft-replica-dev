import type { AppEnv } from '../app-env';
import type { Context } from 'hono';

/** Turmas dos educandos activos do encarregado autenticado. */
export async function wardClassIds(c: Context<AppEnv>): Promise<string[]> {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT DISTINCT class_id FROM Students WHERE school_id = ? AND parent_uid = ? AND is_active = 1'
  ).bind(user.schoolId, user.uid).all<{ class_id: string }>();
  return results.map((r) => r.class_id);
}
