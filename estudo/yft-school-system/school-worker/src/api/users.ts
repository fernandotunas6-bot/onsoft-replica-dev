import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireRoles } from '../lib/auth-guards';
import { createFirebaseEmailUser } from '../lib/firebase-auth';
import { createPrefixedId } from '../lib/id';
import { buildSyntheticEmailFromPhone } from '../lib/phone';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const tokenSchema = z.object({
  token: z.string().trim().min(1).max(512),
  platform: z.enum(['android', 'ios', 'web']).optional().nullable(),
});

const registerTeacherSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  photo_url: z.string().trim().optional().nullable(),
  residential_address: z.string().trim().optional().nullable(),
  qualification: z.string().trim().optional().nullable(),
  years_experience: z.number().int().nonnegative().optional().nullable(),
  subjects_text: z.string().trim().optional().nullable(),
  ssnit_number: z.string().trim().optional().nullable(),
  marital_status: z.string().trim().optional().nullable(),
  emergency_contact_name: z.string().trim().optional().nullable(),
  emergency_contact_phone: z.string().trim().optional().nullable(),
  bank_name: z.string().trim().optional().nullable(),
  bank_account_number: z.string().trim().optional().nullable(),
  bank_account_holder: z.string().trim().optional().nullable(),
  date_of_birth: z.string().trim().optional().nullable(),
});

const academicCalendarTermSchema = z.object({
  name: z.string().trim().min(1),
  start_date: z.string().trim().min(1),
  end_date: z.string().trim().min(1),
});

const academicCalendarSchema = z.object({
  academic_year: z.string().trim().min(1),
  active_term: z.string().trim().min(1),
  currency: z.string().trim().min(1),
  term_system: z.number().int().min(2).max(3),
  terms: z.array(academicCalendarTermSchema).min(2).max(3),
});

function isValidDate(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function buildAcademicCalendarPayload(data: z.infer<typeof academicCalendarSchema>) {
  const distinctNames = new Set<string>();
  for (const term of data.terms) {
    if (distinctNames.has(term.name)) {
      throw new Error('Duplicate term names are not allowed');
    }
    distinctNames.add(term.name);

    if (!isValidDate(term.start_date) || !isValidDate(term.end_date)) {
      throw new Error(`Invalid dates for ${term.name}`);
    }

    if (new Date(term.start_date) > new Date(term.end_date)) {
      throw new Error(`Start date must be before end date for ${term.name}`);
    }
  }

  if (data.terms.length !== data.term_system) {
    throw new Error('Term count does not match the selected term system');
  }

  if (!data.terms.some((term) => term.name === data.active_term)) {
    throw new Error('Active term must match one of the configured terms');
  }

  return {
    academic_year: data.academic_year,
    active_term: data.active_term,
    currency: data.currency,
    term_system: data.term_system,
    terms: data.terms,
  };
}

const users = new Hono<AppEnv>();

users.get('/me', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const [profile, school] = await Promise.all([
    c.env.DB.prepare(
      `SELECT uid, school_id, role, name, phone, email, staff_id, created_at,
        photo_url, residential_address, qualification, years_experience, subjects_text,
        ssnit_number, marital_status, emergency_contact_name, emergency_contact_phone,
        bank_name, bank_account_number, bank_account_holder, date_of_birth, gender
       FROM Users WHERE uid = ? AND school_id = ? LIMIT 1`
    ).bind(user.uid, user.schoolId).first(),
    c.env.DB.prepare(
      `SELECT name, logo_url, term_system, academic_calendar_json, teacher_can_edit_results,
        address, email, phone, motto
       FROM Schools WHERE id = ? LIMIT 1`
    ).bind(user.schoolId).first<{
      name: string;
      logo_url: string | null;
      term_system: number;
      academic_calendar_json: string | null;
      teacher_can_edit_results: number | null;
      address: string | null;
      email: string | null;
      phone: string | null;
      motto: string | null;
    }>(),
  ]);

  return jsonOk(c, {
    data: {
      ...(profile ?? user),
      school_name: school?.name ?? null,
      school_logo_url: school?.logo_url ?? null,
      school_address: school?.address ?? null,
      school_email: school?.email ?? null,
      school_phone: school?.phone ?? null,
      school_motto: school?.motto ?? null,
      school_term_system: school?.term_system ?? null,
      school_calendar_configured: Boolean(school?.academic_calendar_json),
      teacher_can_edit_results: Boolean(school?.teacher_can_edit_results),
    },
  });
});

users.get('/teachers/:targetUid', requireRoles('admin', 'teacher'), async (c) => {
  const user = c.get('user');
  const targetUid = c.req.param('targetUid');
  if (user.role !== 'admin' && user.uid !== targetUid) {
    return jsonError(c, 'Forbidden', 403);
  }

  const row = await c.env.DB.prepare(
    `SELECT uid, school_id, role, name, phone, email, staff_id, created_at,
      photo_url, residential_address, qualification, years_experience, subjects_text,
      ssnit_number, marital_status, emergency_contact_name, emergency_contact_phone,
      bank_name, bank_account_number, bank_account_holder, date_of_birth, gender
     FROM Users WHERE uid = ? AND school_id = ? AND role = 'teacher' LIMIT 1`
  ).bind(targetUid, user.schoolId).first();

  if (!row) {
    return jsonError(c, 'Teacher not found', 404);
  }

  return jsonOk(c, { data: row });
});

users.get('/me/academic-calendar', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const school = await c.env.DB.prepare(
    'SELECT term_system, academic_calendar_json, academic_calendar_updated_at FROM Schools WHERE id = ? LIMIT 1'
  ).bind(user.schoolId).first<{
    term_system: number;
    academic_calendar_json: string | null;
    academic_calendar_updated_at: string | null;
  }>();

  if (!school || !school.academic_calendar_json) {
    return jsonOk(c, { data: null });
  }

  try {
    return jsonOk(c, {
      data: {
        ...JSON.parse(school.academic_calendar_json),
        term_system: school.term_system,
        updated_at: school.academic_calendar_updated_at,
      },
    });
  } catch {
    return jsonOk(c, { data: null });
  }
});

users.patch('/me/academic-calendar', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = academicCalendarSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid academic calendar payload', 400, parsed.error.flatten());
  }

  let payload;
  try {
    payload = buildAcademicCalendarPayload(parsed.data);
  } catch (error) {
    return jsonError(c, String(error instanceof Error ? error.message : error), 400);
  }

  const result = await c.env.DB.prepare(
    `
      UPDATE Schools
      SET term_system = ?, current_term_id = ?, academic_calendar_json = ?, academic_calendar_updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).bind(
    payload.term_system,
    payload.active_term,
    JSON.stringify(payload),
    user.schoolId,
  ).run();

  if (result.meta.changes === 0) {
    return jsonError(c, 'School not found', 404);
  }

  return jsonOk(c, {
    data: {
      ...payload,
      updated_at: new Date().toISOString(),
    },
  });
});

users.post('/register-teacher', requireAdmin, async (c) => {
  const user = c.get('user');
  const parsed = registerTeacherSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid teacher payload', 400, parsed.error.flatten());
  }

  const schoolConfig = await c.env.DB.prepare(
    'SELECT default_password, teacher_id_prefix FROM Schools WHERE id = ? LIMIT 1'
  ).bind(user.schoolId).first<{ default_password: string; teacher_id_prefix: string }>();

  const teacherEmail = parsed.data.email?.trim() || buildSyntheticEmailFromPhone(parsed.data.phone, user.schoolId);
  const teacherPassword = schoolConfig?.default_password || 'Welcome@123';
  const teacherIdPrefix = schoolConfig?.teacher_id_prefix?.toLowerCase() || 'tch';
  const staffId = createPrefixedId(teacherIdPrefix);

  const existing = await c.env.DB.prepare(
    'SELECT uid FROM Users WHERE school_id = ? AND phone = ? AND role = ? LIMIT 1'
  ).bind(user.schoolId, parsed.data.phone, 'teacher').first<{ uid: string }>();

  if (existing) {
    return jsonError(c, 'A teacher with this phone number already exists', 409);
  }

  const firebaseUser = await createFirebaseEmailUser(c.env, {
    email: teacherEmail,
    password: teacherPassword,
    displayName: parsed.data.name,
  });

  await c.env.DB.prepare(
    `INSERT INTO Users (
      uid, school_id, role, name, phone, email, staff_id,
      photo_url, residential_address, qualification, years_experience, subjects_text,
      ssnit_number, marital_status, emergency_contact_name, emergency_contact_phone,
      bank_name, bank_account_number, bank_account_holder, date_of_birth, gender
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    firebaseUser.uid,
    user.schoolId,
    'teacher',
    parsed.data.name,
    parsed.data.phone,
    teacherEmail,
    staffId,
    parsed.data.photo_url ?? null,
    parsed.data.residential_address ?? null,
    parsed.data.qualification ?? null,
    parsed.data.years_experience ?? null,
    parsed.data.subjects_text ?? null,
    parsed.data.ssnit_number ?? null,
    parsed.data.marital_status ?? null,
    parsed.data.emergency_contact_name ?? null,
    parsed.data.emergency_contact_phone ?? null,
    parsed.data.bank_name ?? null,
    parsed.data.bank_account_number ?? null,
    parsed.data.bank_account_holder ?? null,
    parsed.data.date_of_birth ?? null,
    parsed.data.gender ?? null
  ).run();

  return jsonOk(c, {
    uid: firebaseUser.uid,
    staff_id: staffId,
    login_email: teacherEmail,
    default_password_used: true,
  }, 201);
});

users.put('/me/fcm-token', requireRoles('admin', 'teacher', 'parent'), async (c) => {
  const user = c.get('user');
  const parsed = tokenSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid token payload', 400, parsed.error.flatten());
  }

  const tokenId = createPrefixedId('tok');
  await c.env.DB.prepare(
    `
      INSERT INTO DeviceTokens (id, school_id, user_uid, token, platform)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        school_id = excluded.school_id,
        user_uid = excluded.user_uid,
        platform = excluded.platform
    `
  ).bind(tokenId, user.schoolId, user.uid, parsed.data.token, parsed.data.platform ?? null).run();

  return jsonOk(c, {
    id: tokenId,
    stored: true,
  }, 201);
});

export default users;
