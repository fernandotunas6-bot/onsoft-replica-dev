import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireAdminOrTeacher } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const subjectSchema = z.object({
  name: z.string().trim().min(1),
  class_ids: z.array(z.string().trim().min(1)).min(1).optional(),
  class_id: z.string().trim().min(1).optional(),
});

const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  class_ids: z.array(z.string().trim().min(1)).min(1).optional(),
  class_id: z.string().trim().min(1).optional(),
});

const subjects = new Hono<AppEnv>();

subjects.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const classId = c.req.query('class_id')?.trim();

  const sql = classId
    ? `
      SELECT
        s.id,
        s.school_id,
        s.name,
        s.created_at,
        GROUP_CONCAT(sc.class_id) AS class_ids
      FROM Subjects s
      JOIN SubjectClasses sc ON sc.subject_id = s.id AND sc.school_id = s.school_id
      WHERE s.school_id = ? AND sc.class_id = ?
      GROUP BY s.id
      ORDER BY s.name
    `
    : `
      SELECT
        s.id,
        s.school_id,
        s.name,
        s.created_at,
        GROUP_CONCAT(sc.class_id) AS class_ids
      FROM Subjects s
      LEFT JOIN SubjectClasses sc ON sc.subject_id = s.id AND sc.school_id = s.school_id
      WHERE s.school_id = ?
      GROUP BY s.id
      ORDER BY s.name
    `;

  const statement = classId
    ? c.env.DB.prepare(sql).bind(user.schoolId, classId)
    : c.env.DB.prepare(sql).bind(user.schoolId);
  const { results } = await statement.all();

  return jsonOk(c, {
    data: results.map((row) => ({
      ...row,
      class_ids: typeof row.class_ids === 'string' && row.class_ids.length > 0
        ? row.class_ids.split(',').filter(Boolean)
        : [],
    })),
  });
});

subjects.post('/', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = subjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid subject payload', 400, parsed.error.flatten());
  }

  const classIds = parsed.data.class_ids ?? (parsed.data.class_id ? [parsed.data.class_id] : []);
  const distinctClassIds = [...new Set(classIds)];
  if (distinctClassIds.length === 0) {
    return jsonError(c, 'At least one class is required', 400);
  }

  const placeholders = distinctClassIds.map(() => '?').join(',');
  const existingClasses = await c.env.DB.prepare(
    `SELECT id FROM Classes WHERE school_id = ? AND id IN (${placeholders})`
  ).bind(user.schoolId, ...distinctClassIds).all<{ id: string }>();

  if (existingClasses.results.length !== distinctClassIds.length) {
    return jsonError(c, 'One or more classes do not exist in this school', 400);
  }

  const subjectId = createPrefixedId('sub');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO Subjects (id, school_id, name) VALUES (?, ?, ?)')
      .bind(subjectId, user.schoolId, parsed.data.name),
    ...distinctClassIds.map((classId) =>
      c.env.DB.prepare(
        'INSERT INTO SubjectClasses (id, school_id, subject_id, class_id) VALUES (?, ?, ?, ?)'
      ).bind(createPrefixedId('subcls'), user.schoolId, subjectId, classId)
    ),
  ]);

  return jsonOk(c, {
    id: subjectId,
    name: parsed.data.name,
    class_ids: distinctClassIds,
  }, 201);
});

subjects.patch('/:subjectId', requireAdmin, async (c) => {
  const user = c.get('user');
  const subjectId = c.req.param('subjectId');
  const parsed = updateSubjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid subject payload', 400, parsed.error.flatten());
  }

  const classIds = parsed.data.class_ids ?? (parsed.data.class_id ? [parsed.data.class_id] : []);
  const distinctClassIds = [...new Set(classIds)];

  if (!parsed.data.name && distinctClassIds.length === 0) {
    return jsonError(c, 'At least one field must be provided', 400);
  }

  const existingSubject = await c.env.DB.prepare(
    'SELECT id FROM Subjects WHERE id = ? AND school_id = ?'
  ).bind(subjectId, user.schoolId).first<{ id: string }>();

  if (!existingSubject) {
    return jsonError(c, 'Subject not found', 404);
  }

  if (distinctClassIds.length > 0) {
    const placeholders = distinctClassIds.map(() => '?').join(',');
    const existingClasses = await c.env.DB.prepare(
      `SELECT id FROM Classes WHERE school_id = ? AND id IN (${placeholders})`
    ).bind(user.schoolId, ...distinctClassIds).all<{ id: string }>();

    if (existingClasses.results.length !== distinctClassIds.length) {
      return jsonError(c, 'One or more classes do not exist in this school', 400);
    }
  }

  const statements = [] as ReturnType<typeof c.env.DB.prepare>[];

  if (parsed.data.name) {
    statements.push(
      c.env.DB.prepare('UPDATE Subjects SET name = ? WHERE id = ? AND school_id = ?')
        .bind(parsed.data.name, subjectId, user.schoolId)
    );
  }

  if (distinctClassIds.length > 0) {
    statements.push(
      c.env.DB.prepare('DELETE FROM SubjectClasses WHERE subject_id = ? AND school_id = ?')
        .bind(subjectId, user.schoolId),
      ...distinctClassIds.map((classId) =>
        c.env.DB.prepare(
          'INSERT INTO SubjectClasses (id, school_id, subject_id, class_id) VALUES (?, ?, ?, ?)'
        ).bind(createPrefixedId('subcls'), user.schoolId, subjectId, classId)
      ),
    );
  }

  await c.env.DB.batch(statements);

  const { results } = await c.env.DB.prepare(
    `
      SELECT
        s.id,
        s.school_id,
        s.name,
        s.created_at,
        GROUP_CONCAT(sc.class_id) AS class_ids
      FROM Subjects s
      LEFT JOIN SubjectClasses sc ON sc.subject_id = s.id AND sc.school_id = s.school_id
      WHERE s.school_id = ? AND s.id = ?
      GROUP BY s.id
    `
  ).bind(user.schoolId, subjectId).all();

  const row = results[0] as {
    id: string;
    school_id: string;
    name: string;
    created_at: string;
    class_ids: string | null;
  } | undefined;

  if (!row) {
    return jsonError(c, 'Subject not found', 404);
  }

  return jsonOk(c, {
    ...row,
    class_ids: typeof row.class_ids === 'string' && row.class_ids.length > 0
      ? row.class_ids.split(',').filter(Boolean)
      : [],
  });
});

export default subjects;
