import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireSuperAdminKey } from '../lib/auth-guards';
import { createFirebaseEmailUser } from '../lib/firebase-auth';
import { createPrefixedId } from '../lib/id';
import { createTempPassword } from '../lib/password';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const onboardSchema = z.object({
  school: z.object({
    name: z.string().trim().min(1),
    location: z.string().trim().optional().nullable(),
    term_system: z.number().int().min(1).max(3).default(3),
    logo_url: z.string().trim().optional().nullable(),
    motto: z.string().trim().optional().nullable(),
    phone: z.string().trim().optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    address: z.string().trim().optional().nullable(),
    default_password: z.string().trim().min(6).default('Welcome@123'),
    student_id_prefix: z.string().trim().min(1).max(10).default('STU'),
    teacher_id_prefix: z.string().trim().min(1).max(10).default('TCH'),
  }),
  admin: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    email: z.string().trim().email(),
  }),
});

const statusSchema = z.object({
  is_active: z.boolean(),
});

const superAdmin = new Hono<AppEnv>();

superAdmin.use('*', requireSuperAdminKey);

superAdmin.get('/metrics', async (c) => {
  const [totals, systemDist, trends] = await Promise.all([
    c.env.DB.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM Schools) as total_schools,
        (SELECT COUNT(*) FROM Schools WHERE is_active = 1) as active_schools,
        (SELECT COUNT(*) FROM Schools WHERE is_active = 0) as suspended_schools,
        (SELECT COALESCE(SUM(amount), 0) FROM Transactions WHERE type = 'payment') as total_revenue
    `).first<{
      total_schools: number;
      active_schools: number;
      suspended_schools: number;
      total_revenue: number;
    }>(),
    
    c.env.DB.prepare(`
      SELECT 
        CASE term_system 
          WHEN 3 THEN 'Trimester' 
          WHEN 2 THEN 'Semester' 
          ELSE 'Other' 
        END as name,
        COUNT(*) as value
      FROM Schools 
      GROUP BY term_system
    `).all<{ name: string; value: number }>(),

    c.env.DB.prepare(`
      WITH RECURSIVE dates(date) AS (
        SELECT date('now', '-6 days')
        UNION ALL
        SELECT date(date, '+1 day') FROM dates WHERE date < date('now')
      )
      SELECT 
        d.date as label,
        (SELECT COUNT(*) FROM Schools s WHERE date(s.created_at) <= d.date) as schools,
        (SELECT COALESCE(SUM(amount), 0) FROM Transactions t WHERE t.type = 'payment' AND date(t.created_at) <= d.date) as revenue
      FROM dates d
      ORDER BY d.date ASC
    `).all<{ label: string; schools: number; revenue: number }>()
  ]);

  return jsonOk(c, {
    ...totals,
    system_distribution: systemDist.results,
    historical_trends: trends.results
  });
});

superAdmin.get('/schools', async (c) => {
  const { results } = await c.env.DB.prepare(
    `
      SELECT
        s.id,
        s.name,
        s.location,
        s.logo_url,
        s.motto,
        s.phone,
        s.email,
        s.address,
        s.term_system,
        s.current_term_id,
        s.is_active,
        s.student_id_prefix,
        s.teacher_id_prefix,
        s.created_at,
        (SELECT COUNT(*) FROM Students st WHERE st.school_id = s.id) AS student_count,
        (SELECT COUNT(*) FROM Users u WHERE u.school_id = s.id) AS user_count
      FROM Schools s
      ORDER BY s.created_at DESC
    `
  ).all();

  return jsonOk(c, {
    data: results.map((school) => ({
      ...school,
      is_active: Boolean(school.is_active),
    })),
  });
});

superAdmin.get('/schools/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const [school, admin] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, location, logo_url, motto, phone, email, address,
              term_system, current_term_id, is_active, student_id_prefix,
              teacher_id_prefix, created_at
       FROM Schools WHERE id = ? LIMIT 1`
    ).bind(schoolId).first(),
    c.env.DB.prepare(
      `SELECT uid, name, phone, email, created_at
       FROM Users WHERE school_id = ? AND role = 'admin'
       ORDER BY created_at ASC LIMIT 1`
    ).bind(schoolId).first<{ uid: string; name: string; phone: string; email: string; created_at: string }>(),
  ]);

  if (!school) {
    return jsonError(c, 'School not found', 404);
  }

  return jsonOk(c, {
    data: {
      ...school,
      is_active: Boolean((school as { is_active?: number }).is_active),
      admin: admin ?? null,
    },
  });
});

superAdmin.delete('/schools/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');

  const school = await c.env.DB.prepare(
    'SELECT id FROM Schools WHERE id = ? LIMIT 1'
  ).bind(schoolId).first<{ id: string }>();

  if (!school) {
    return jsonError(c, 'School not found', 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM DeviceTokens WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Transactions WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Enrollments WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Students WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM SubjectClasses WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Subjects WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Classes WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Users WHERE school_id = ?').bind(schoolId),
    c.env.DB.prepare('DELETE FROM Schools WHERE id = ?').bind(schoolId),
  ]);

  return jsonOk(c, { deleted: true, school_id: schoolId });
});

superAdmin.patch('/schools/:schoolId/status', async (c) => {
  const schoolId = c.req.param('schoolId');
  const parsed = statusSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid status payload', 400, parsed.error.flatten());
  }

  const result = await c.env.DB.prepare(
    'UPDATE Schools SET is_active = ? WHERE id = ?'
  ).bind(parsed.data.is_active ? 1 : 0, schoolId).run();

  if (result.meta.changes === 0) {
    return jsonError(c, 'School not found', 404);
  }

  return jsonOk(c, {
    school_id: schoolId,
    is_active: parsed.data.is_active,
  });
});

const updateSchoolSchema = z.object({
  name: z.string().trim().min(1).optional(),
  location: z.string().trim().optional().nullable(),
  term_system: z.number().int().min(1).max(3).optional(),
  logo_url: z.string().trim().optional().nullable(),
  motto: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  default_password: z.string().trim().min(6).optional(),
  student_id_prefix: z.string().trim().min(1).max(10).optional(),
  teacher_id_prefix: z.string().trim().min(1).max(10).optional(),
});

superAdmin.patch('/schools/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const parsed = updateSchoolSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid update payload', 400, parsed.error.flatten());
  }

  const fields = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];

  const columnMap: Record<string, string> = {
    name: 'name', location: 'location', term_system: 'term_system',
    logo_url: 'logo_url', motto: 'motto', phone: 'phone',
    email: 'email', address: 'address', default_password: 'default_password',
    student_id_prefix: 'student_id_prefix', teacher_id_prefix: 'teacher_id_prefix',
  };

  for (const [key, col] of Object.entries(columnMap)) {
    if (key in fields) {
      setClauses.push(`${col} = ?`);
      values.push((fields as Record<string, unknown>)[key] ?? null);
    }
  }

  if (setClauses.length === 0) {
    return jsonError(c, 'No fields to update', 400);
  }

  values.push(schoolId);
  const result = await c.env.DB.prepare(
    `UPDATE Schools SET ${setClauses.join(', ')} WHERE id = ?`
  ).bind(...values).run();

  if (result.meta.changes === 0) {
    return jsonError(c, 'School not found', 404);
  }

  const updated = await c.env.DB.prepare(
    `SELECT id, name, location, logo_url, motto, phone, email, address,
            term_system, current_term_id, is_active, student_id_prefix,
            teacher_id_prefix, created_at
     FROM Schools WHERE id = ? LIMIT 1`
  ).bind(schoolId).first();

  return jsonOk(c, { data: { ...updated, is_active: Boolean((updated as { is_active?: number })?.is_active) } });
});

const updateAdminSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
});

superAdmin.patch('/schools/:schoolId/admin', async (c) => {
  const schoolId = c.req.param('schoolId');
  const parsed = updateAdminSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid admin payload', 400, parsed.error.flatten());
  }

  const admin = await c.env.DB.prepare(
    `SELECT uid FROM Users WHERE school_id = ? AND role = 'admin' ORDER BY created_at ASC LIMIT 1`
  ).bind(schoolId).first<{ uid: string }>();

  if (!admin) {
    return jsonError(c, 'No admin found for this school', 404);
  }

  const fields = parsed.data;
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (fields.name !== undefined) { setClauses.push('name = ?'); values.push(fields.name); }
  if (fields.phone !== undefined) { setClauses.push('phone = ?'); values.push(fields.phone); }
  if (fields.email !== undefined) { setClauses.push('email = ?'); values.push(fields.email); }

  if (setClauses.length === 0) {
    return jsonError(c, 'No fields to update', 400);
  }

  values.push(admin.uid);
  await c.env.DB.prepare(
    `UPDATE Users SET ${setClauses.join(', ')} WHERE uid = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    'SELECT uid, name, phone, email, created_at FROM Users WHERE uid = ? LIMIT 1'
  ).bind(admin.uid).first();

  return jsonOk(c, { data: updated });
});

superAdmin.post('/upload-logo', async (c) => {
  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return jsonError(c, 'Expected multipart form data', 400);
  }

  const file = formData.get('logo');
  if (!file || !(file instanceof File)) {
    return jsonError(c, 'Missing "logo" file field', 400);
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    return jsonError(c, `Invalid file type "${file.type}". Allowed: png, jpeg, webp, svg`, 400);
  }

  const maxSize = 2 * 1024 * 1024;
  if (file.size > maxSize) {
    return jsonError(c, 'File too large. Maximum size is 2 MB', 400);
  }

  const mimeToExt: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  };
  const ext = mimeToExt[file.type] ?? 'png';
  const key = `logos/${createPrefixedId('logo')}.${ext}`;

  await c.env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return jsonOk(c, { key, content_type: file.type }, 201);
});

superAdmin.post('/onboard-school', async (c) => {
  const parsed = onboardSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid onboarding payload', 400, parsed.error.flatten());
  }

  const schoolId = createPrefixedId('sch');
  const adminTempPassword = createTempPassword();
  const adminEmail = parsed.data.admin.email;

  const schoolInsert = c.env.DB.prepare(
    `INSERT INTO Schools (id, name, location, term_system, is_active, logo_url, motto, phone, email, address, default_password, student_id_prefix, teacher_id_prefix)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    schoolId,
    parsed.data.school.name,
    parsed.data.school.location ?? null,
    parsed.data.school.term_system,
    parsed.data.school.logo_url ?? null,
    parsed.data.school.motto ?? null,
    parsed.data.school.phone ?? null,
    parsed.data.school.email ?? null,
    parsed.data.school.address ?? null,
    parsed.data.school.default_password,
    parsed.data.school.student_id_prefix,
    parsed.data.school.teacher_id_prefix,
  );

  const adminFirebase = await createFirebaseEmailUser(c.env, {
    email: adminEmail,
    password: adminTempPassword,
    displayName: parsed.data.admin.name,
  });

  await c.env.DB.batch([
    schoolInsert,
    c.env.DB.prepare(
      'INSERT INTO Users (uid, school_id, role, name, phone, email) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      adminFirebase.uid,
      schoolId,
      'admin',
      parsed.data.admin.name,
      parsed.data.admin.phone,
      adminEmail
    ),
  ]);

  return jsonOk(c, {
    school: {
      id: schoolId,
      name: parsed.data.school.name,
      location: parsed.data.school.location ?? null,
      term_system: parsed.data.school.term_system,
      logo_url: parsed.data.school.logo_url ?? null,
      student_id_prefix: parsed.data.school.student_id_prefix,
      teacher_id_prefix: parsed.data.school.teacher_id_prefix,
    },
    admin: {
      uid: adminFirebase.uid,
      email: adminEmail,
      temp_password: adminTempPassword,
    },
  }, 201);
});

export default superAdmin;
