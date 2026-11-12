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

/**
 * O professor pode marcar presenças nesta turma. Se o horário o tem como
 * professor de alguma turma, só nessas; se a escola ainda não lhe atribuiu
 * tempos, em qualquer uma (como antes de haver horário). A direcção pode
 * sempre.
 */
export async function canMarkClass(c: Context<AppEnv>, classId: string): Promise<boolean> {
  const user = c.get('user');
  if (user.role !== 'teacher') return true;
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(class_id = ?), 0) AS here
     FROM TimetableSlots WHERE school_id = ? AND teacher_uid = ?`
  ).bind(classId, user.schoolId, user.uid).first<{ total: number; here: number }>();
  return !row || row.total === 0 || row.here > 0;
}
