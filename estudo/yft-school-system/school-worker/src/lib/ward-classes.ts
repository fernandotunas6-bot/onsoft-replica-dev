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

/**
 * O aluno existe na escola e o utilizador pode vê-lo: funcionários vêem
 * todos; o encarregado só os seus educandos activos.
 */
export async function canSeeStudent(c: Context<AppEnv>, studentId: string): Promise<boolean> {
  const user = c.get('user');
  const row = user.role === 'parent'
    ? await c.env.DB.prepare(
      'SELECT id FROM Students WHERE id = ? AND school_id = ? AND parent_uid = ? AND is_active = 1 LIMIT 1'
    ).bind(studentId, user.schoolId, user.uid).first()
    : await c.env.DB.prepare('SELECT id FROM Students WHERE id = ? AND school_id = ? LIMIT 1')
      .bind(studentId, user.schoolId)
      .first();
  return row !== null;
}
