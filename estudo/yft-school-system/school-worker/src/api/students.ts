import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin, requireAdminOrTeacher } from '../lib/auth-guards';
import { deleteFirebaseAuthUser } from '../lib/firebase-delete-user';
import { buildSyntheticEmailFromPhone } from '../lib/phone';
import { createTempPassword } from '../lib/password';
import { createFirebaseEmailUser } from '../lib/firebase-auth';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';
import { z } from 'zod';

const studentSchema = z.object({
  name: z.string().trim().min(1),
  class_id: z.string().trim().min(1),
  dob: z.string().trim().min(1).optional().nullable(),
  gender: z.string().trim().min(1).optional().nullable(),
  balance: z.number().finite().optional().nullable(),
  parent_uid: z.string().trim().min(1).optional().nullable(),
  photo_url: z.string().trim().min(1).optional().nullable(),
  previous_school: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  emergency_contact_name: z.string().trim().optional().nullable(),
  emergency_contact_phone: z.string().trim().optional().nullable(),
  blood_group: z.string().trim().optional().nullable(),
  medical_notes: z.string().trim().optional().nullable(),
  parent: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    email: z.string().trim().email().optional().nullable(),
  }).optional(),
}).refine(
  (data) => data.parent_uid || data.parent,
  { message: 'Either parent_uid or parent object is required' },
);

const studentPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  class_id: z.string().trim().min(1).optional(),
  dob: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
  photo_url: z.string().trim().optional().nullable(),
  previous_school: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  emergency_contact_name: z.string().trim().optional().nullable(),
  emergency_contact_phone: z.string().trim().optional().nullable(),
  blood_group: z.string().trim().optional().nullable(),
  medical_notes: z.string().trim().optional().nullable(),
  parent: z
    .object({
      name: z.string().trim().min(1).optional(),
      phone: z.string().trim().min(1).optional(),
      email: z.string().trim().email().optional().nullable(),
    })
    .optional(),
});

const students = new Hono<AppEnv>();

async function hasAcademicCalendar(c: Context<AppEnv>, schoolId: string) {
  const school = await c.env.DB.prepare(
    'SELECT academic_calendar_json FROM Schools WHERE id = ? LIMIT 1'
  )
    .bind(schoolId)
    .first<{ academic_calendar_json: string | null }>();

  return Boolean(school?.academic_calendar_json);
}

students.get('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const classId = c.req.query('class_id')?.trim();
  const page = Math.max(Number.parseInt(c.req.query('page') ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') ?? '25', 10) || 25, 1), 100);
  const offset = (page - 1) * limit;

  const whereClause = classId ? 'AND s.class_id = ?' : '';
  const countStatement = classId
    ? c.env.DB.prepare(`SELECT COUNT(*) AS total FROM Students s WHERE s.school_id = ? AND s.class_id = ?`)
        .bind(user.schoolId, classId)
    : c.env.DB.prepare('SELECT COUNT(*) AS total FROM Students s WHERE s.school_id = ?').bind(user.schoolId);
  const countRow = await countStatement.first<{ total: number }>();

  const query = `
    SELECT
      s.id,
      s.school_id,
      s.class_id,
      s.parent_uid,
      s.name,
      s.dob,
      s.gender,
      s.balance,
      s.created_at,
      s.photo_url,
      s.previous_school,
      s.address,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.blood_group,
      s.medical_notes,
      s.is_active,
      c.class_name,
      u.name AS parent_name,
      u.phone AS parent_phone,
      u.email AS parent_email
    FROM Students s
    LEFT JOIN Classes c ON c.id = s.class_id AND c.school_id = s.school_id
    LEFT JOIN Users u ON u.uid = s.parent_uid
    WHERE s.school_id = ? ${whereClause}
    ORDER BY s.created_at DESC, s.name
    LIMIT ? OFFSET ?
  `;

  const statement = classId
    ? c.env.DB.prepare(query).bind(user.schoolId, classId, limit, offset)
    : c.env.DB.prepare(query).bind(user.schoolId, limit, offset);
  const { results } = await statement.all();

  return jsonOk(c, {
    data: results,
    meta: {
      page,
      limit,
      total: countRow?.total ?? 0,
    },
  });
});

students.get('/:studentId', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');

  const row = await c.env.DB.prepare(
    `
    SELECT
      s.id,
      s.school_id,
      s.class_id,
      s.parent_uid,
      s.name,
      s.dob,
      s.gender,
      s.balance,
      s.created_at,
      s.photo_url,
      s.previous_school,
      s.address,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.blood_group,
      s.medical_notes,
      s.is_active,
      c.class_name,
      u.name AS parent_name,
      u.phone AS parent_phone,
      u.email AS parent_email
    FROM Students s
    LEFT JOIN Classes c ON c.id = s.class_id AND c.school_id = s.school_id
    LEFT JOIN Users u ON u.uid = s.parent_uid
    WHERE s.id = ? AND s.school_id = ?
    LIMIT 1
  `
  ).bind(studentId, user.schoolId).first();

  if (!row) {
    return jsonError(c, 'Student not found', 404);
  }

  return jsonOk(c, row);
});

students.patch('/:studentId', requireAdmin, async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');
  const parsed = studentPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid student update payload', 400, parsed.error.flatten());
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, parent_uid, class_id FROM Students WHERE id = ? AND school_id = ? LIMIT 1'
  )
    .bind(studentId, user.schoolId)
    .first<{ id: string; parent_uid: string | null; class_id: string }>();

  if (!existing) {
    return jsonError(c, 'Student not found', 404);
  }

  const d = parsed.data;
  const hasStudentField =
    d.name !== undefined ||
    d.class_id !== undefined ||
    d.dob !== undefined ||
    d.gender !== undefined ||
    d.is_active !== undefined ||
    d.photo_url !== undefined ||
    d.previous_school !== undefined ||
    d.address !== undefined ||
    d.emergency_contact_name !== undefined ||
    d.emergency_contact_phone !== undefined ||
    d.blood_group !== undefined ||
    d.medical_notes !== undefined;

  if (d.class_id !== undefined) {
    const cls = await c.env.DB.prepare(
      'SELECT id FROM Classes WHERE id = ? AND school_id = ? LIMIT 1'
    )
      .bind(d.class_id, user.schoolId)
      .first<{ id: string }>();
    if (!cls) {
      return jsonError(c, 'Selected class does not exist in this school', 400);
    }
  }

  if (hasStudentField) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (d.name !== undefined) {
      sets.push('name = ?');
      vals.push(d.name);
    }
    if (d.class_id !== undefined) {
      sets.push('class_id = ?');
      vals.push(d.class_id);
    }
    if (d.dob !== undefined) {
      sets.push('dob = ?');
      vals.push(d.dob);
    }
    if (d.gender !== undefined) {
      sets.push('gender = ?');
      vals.push(d.gender);
    }
    if (d.is_active !== undefined) {
      sets.push('is_active = ?');
      vals.push(d.is_active ? 1 : 0);
    }
    if (d.photo_url !== undefined) {
      sets.push('photo_url = ?');
      vals.push(d.photo_url);
    }
    if (d.previous_school !== undefined) {
      sets.push('previous_school = ?');
      vals.push(d.previous_school);
    }
    if (d.address !== undefined) {
      sets.push('address = ?');
      vals.push(d.address);
    }
    if (d.emergency_contact_name !== undefined) {
      sets.push('emergency_contact_name = ?');
      vals.push(d.emergency_contact_name);
    }
    if (d.emergency_contact_phone !== undefined) {
      sets.push('emergency_contact_phone = ?');
      vals.push(d.emergency_contact_phone);
    }
    if (d.blood_group !== undefined) {
      sets.push('blood_group = ?');
      vals.push(d.blood_group);
    }
    if (d.medical_notes !== undefined) {
      sets.push('medical_notes = ?');
      vals.push(d.medical_notes);
    }
    vals.push(studentId, user.schoolId);
    await c.env.DB.prepare(
      `UPDATE Students SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`
    )
      .bind(...vals)
      .run();
  }

  const hasParentPatch =
    Boolean(d.parent) &&
    (d.parent!.name !== undefined ||
      d.parent!.phone !== undefined ||
      d.parent!.email !== undefined);

  if (hasParentPatch && existing.parent_uid) {
    const parentPatch = d.parent;
    if (!parentPatch) {
      return jsonError(c, 'Invalid parent payload', 400);
    }

    const cur = await c.env.DB.prepare(
      'SELECT name, phone, email FROM Users WHERE uid = ? AND school_id = ? AND role = ? LIMIT 1'
    )
      .bind(existing.parent_uid, user.schoolId, 'parent')
      .first<{ name: string; phone: string; email: string | null }>();

    if (!cur) {
      return jsonError(c, 'Linked parent user not found', 400);
    }

    const nextPhone = parentPatch.phone ?? cur.phone;
    const nextName = parentPatch.name ?? cur.name;
    const nextEmail = parentPatch.email !== undefined ? parentPatch.email : cur.email;

    if (parentPatch.phone !== undefined && parentPatch.phone !== cur.phone) {
      const clash = await c.env.DB.prepare(
        'SELECT uid FROM Users WHERE school_id = ? AND phone = ? AND role = ? AND uid != ? LIMIT 1'
      )
        .bind(user.schoolId, parentPatch.phone, 'parent', existing.parent_uid)
        .first<{ uid: string }>();
      if (clash) {
        return jsonError(c, 'Another parent already uses this phone number', 409);
      }
    }

    await c.env.DB.prepare(
      'UPDATE Users SET name = ?, phone = ?, email = ? WHERE uid = ? AND school_id = ? AND role = ?'
    )
      .bind(nextName, nextPhone, nextEmail ?? null, existing.parent_uid, user.schoolId, 'parent')
      .run();
  } else if (hasParentPatch && !existing.parent_uid) {
    return jsonError(c, 'This student has no linked parent to update', 400);
  }

  if (!hasStudentField && !hasParentPatch) {
    return jsonError(c, 'No fields to update', 400);
  }

  const row = await c.env.DB.prepare(
    `
    SELECT
      s.id,
      s.school_id,
      s.class_id,
      s.parent_uid,
      s.name,
      s.dob,
      s.gender,
      s.balance,
      s.created_at,
      s.photo_url,
      s.previous_school,
      s.address,
      s.emergency_contact_name,
      s.emergency_contact_phone,
      s.blood_group,
      s.medical_notes,
      s.is_active,
      c.class_name,
      u.name AS parent_name,
      u.phone AS parent_phone,
      u.email AS parent_email
    FROM Students s
    LEFT JOIN Classes c ON c.id = s.class_id AND c.school_id = s.school_id
    LEFT JOIN Users u ON u.uid = s.parent_uid
    WHERE s.id = ? AND s.school_id = ?
    LIMIT 1
  `
  )
    .bind(studentId, user.schoolId)
    .first();

  return jsonOk(c, row);
});

students.delete('/:studentId', requireAdmin, async (c) => {
  const user = c.get('user');
  const studentId = c.req.param('studentId');

  const row = await c.env.DB.prepare(
    'SELECT id, parent_uid FROM Students WHERE id = ? AND school_id = ? LIMIT 1'
  )
    .bind(studentId, user.schoolId)
    .first<{ id: string; parent_uid: string | null }>();

  if (!row) {
    return jsonError(c, 'Student not found', 404);
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM Enrollments WHERE student_id = ? AND school_id = ?').bind(studentId, user.schoolId),
    c.env.DB.prepare('DELETE FROM Transactions WHERE student_id = ? AND school_id = ?').bind(studentId, user.schoolId),
    c.env.DB.prepare('DELETE FROM Students WHERE id = ? AND school_id = ?').bind(studentId, user.schoolId),
  ]);

  let parentDeleted = false;
  let firebaseParentDeleted = false;

  if (row.parent_uid) {
    const cnt = await c.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM Students WHERE school_id = ? AND parent_uid = ?'
    )
      .bind(user.schoolId, row.parent_uid)
      .first<{ n: number }>();

    if ((cnt?.n ?? 0) === 0) {
      await c.env.DB.prepare('DELETE FROM DeviceTokens WHERE school_id = ? AND user_uid = ?')
        .bind(user.schoolId, row.parent_uid)
        .run();
      const delUser = await c.env.DB.prepare(
        'DELETE FROM Users WHERE uid = ? AND school_id = ? AND role = ?'
      )
        .bind(row.parent_uid, user.schoolId, 'parent')
        .run();
      parentDeleted = (delUser.meta.changes ?? 0) > 0;
      if (parentDeleted) {
        const fr = await deleteFirebaseAuthUser(c.env, row.parent_uid);
        firebaseParentDeleted = Boolean(fr.ok && !fr.skipped);
        if (!fr.ok && !fr.skipped) {
          console.error('[students] Firebase parent delete failed', fr.error);
        }
      }
    }
  }

  return jsonOk(c, {
    deleted: true,
    parent_deleted: parentDeleted,
    firebase_parent_deleted: firebaseParentDeleted,
  });
});

students.post('/', requireAdminOrTeacher, async (c) => {
  const user = c.get('user');
  const parsed = studentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(c, 'Invalid student payload', 400, parsed.error.flatten());
  }

  const calendarConfigured = await hasAcademicCalendar(c, user.schoolId);
  if (!calendarConfigured) {
    return jsonError(c, 'Configure the academic calendar before creating student records', 400);
  }

  const [classRow, schoolConfig] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, fee_amount, fee_collection_cycle FROM Classes WHERE id = ? AND school_id = ? LIMIT 1'
    ).bind(parsed.data.class_id, user.schoolId).first<{ id: string; fee_amount: number | null; fee_collection_cycle: string | null }>(),
    c.env.DB.prepare(
      'SELECT default_password, student_id_prefix FROM Schools WHERE id = ? LIMIT 1'
    ).bind(user.schoolId).first<{ default_password: string; student_id_prefix: string }>(),
  ]);

  if (!classRow) {
    return jsonError(c, 'Selected class does not exist in this school', 400);
  }

  let parentUid = parsed.data.parent_uid ?? null;
  let createdParent = false;
  let parentLoginEmail: string | null = null;

  if (parentUid) {
    const existingByUid = await c.env.DB.prepare(
      'SELECT uid FROM Users WHERE uid = ? AND school_id = ? AND role = ? LIMIT 1'
    ).bind(parentUid, user.schoolId, 'parent').first<{ uid: string }>();

    if (!existingByUid) {
      return jsonError(c, 'Selected parent not found in this school', 400);
    }
  } else if (parsed.data.parent) {
    const parentEmail = parsed.data.parent.email?.trim() || buildSyntheticEmailFromPhone(parsed.data.parent.phone, user.schoolId);
    const parentPassword = schoolConfig?.default_password || createTempPassword();

    const existingParent = await c.env.DB.prepare(
      'SELECT uid, name, phone, email FROM Users WHERE school_id = ? AND phone = ? AND role = ? LIMIT 1'
    ).bind(user.schoolId, parsed.data.parent.phone, 'parent').first<{ uid: string; name: string; phone: string; email: string }>();

    parentUid = existingParent?.uid ?? null;

    if (!parentUid) {
      const firebaseUser = await createFirebaseEmailUser(c.env, {
        email: parentEmail,
        password: parentPassword,
        displayName: parsed.data.parent.name,
      });

      parentUid = firebaseUser.uid;
      createdParent = true;

      await c.env.DB.prepare(
        'INSERT INTO Users (uid, school_id, role, name, phone, email) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(parentUid, user.schoolId, 'parent', parsed.data.parent.name, parsed.data.parent.phone, parentEmail).run();
    }
    parentLoginEmail = parentEmail;
  }

  const studentId = createPrefixedId(schoolConfig?.student_id_prefix?.toLowerCase() || 'stu');
  const classFeeAmount = Number(classRow?.fee_amount ?? 0);
  const openingBalance = (parsed.data.balance ?? 0) - classFeeAmount;
  const feeDescription = classFeeAmount > 0
    ? `Class fee (${classRow?.fee_collection_cycle ?? 'term'})`
    : null;

  await c.env.DB.prepare(
    `INSERT INTO Students (
      id, school_id, class_id, parent_uid, name, dob, gender, balance,
      photo_url, previous_school, address, emergency_contact_name, emergency_contact_phone, blood_group, medical_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    studentId,
    user.schoolId,
    parsed.data.class_id,
    parentUid,
    parsed.data.name,
    parsed.data.dob ?? null,
    parsed.data.gender ?? null,
    openingBalance,
    parsed.data.photo_url ?? null,
    parsed.data.previous_school ?? null,
    parsed.data.address ?? null,
    parsed.data.emergency_contact_name ?? null,
    parsed.data.emergency_contact_phone ?? null,
    parsed.data.blood_group ?? null,
    parsed.data.medical_notes ?? null
  ).run();

  if (classFeeAmount > 0) {
    await c.env.DB.prepare(
      'INSERT INTO Transactions (id, school_id, student_id, class_id, amount, type, description, fee_collection_cycle) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      createPrefixedId('txn'),
      user.schoolId,
      studentId,
      parsed.data.class_id,
      classFeeAmount,
      'charge',
      feeDescription,
      classRow?.fee_collection_cycle ?? 'term'
    ).run();
  }

  return jsonOk(c, {
    id: studentId,
    parent_uid: parentUid,
    parent_created: createdParent,
    parent_login_email: parentLoginEmail,
    uses_school_default_password: createdParent,
  }, 201);
});

export default students;
