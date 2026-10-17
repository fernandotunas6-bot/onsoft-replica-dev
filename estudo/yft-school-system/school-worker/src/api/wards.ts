import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireRoles } from '../lib/auth-guards';
import { jsonOk } from '../lib/response';

const wards = new Hono<AppEnv>();

wards.get('/', requireRoles('parent'), async (c) => {
  const user = c.get('user');

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
      c.class_name
    FROM Students s
    LEFT JOIN Classes c ON c.id = s.class_id AND c.school_id = s.school_id
    WHERE s.school_id = ? AND s.parent_uid = ? AND s.is_active = 1
    ORDER BY s.name
  `;

  const { results } = await c.env.DB.prepare(query).bind(user.schoolId, user.uid).all();

  return jsonOk(c, {
    data: results,
  });
});

export default wards;
