import type { Context } from 'hono';
import type { AppEnv, User } from '../app-env';
import { jsonError } from './response';

type UserRow = {
  uid: string;
  school_id: string;
  role: string;
};

export async function resolveTenantUser(c: Context<AppEnv>, tokenClaims: Record<string, unknown>): Promise<User | null> {
  const uid = typeof tokenClaims.sub === 'string' ? tokenClaims.sub : undefined;
  const claimSchoolId = typeof tokenClaims.school_id === 'string' ? tokenClaims.school_id : undefined;
  const claimRole = typeof tokenClaims.role === 'string' ? tokenClaims.role : undefined;

  if (!uid) {
    return null;
  }

  // 1. Check if this is a Super Admin (Global)
  const isSuperAdminClaim = tokenClaims.super_admin === true || claimRole === 'super_admin';
  if (isSuperAdminClaim) {
    const superAdmin = await c.env.DB.prepare(
      'SELECT uid, role FROM SuperAdmins WHERE uid = ? LIMIT 1'
    ).bind(uid).first<{ uid: string; role: string }>();

    if (superAdmin) {
      return {
        uid: superAdmin.uid,
        schoolId: 'global',
        role: 'super_admin',
      };
    }
  }

  // 2. Check regular Users table
  const dbUser = await c.env.DB.prepare(
    'SELECT uid, school_id, role FROM Users WHERE uid = ? LIMIT 1'
  ).bind(uid).first<UserRow>();

  if (dbUser) {
    if (claimSchoolId && claimSchoolId !== dbUser.school_id) {
      return null;
    }

    if (claimRole && claimRole !== dbUser.role) {
      return null;
    }

    return {
      uid: dbUser.uid,
      schoolId: dbUser.school_id,
      role: dbUser.role as User['role'],
    };
  }

  // 3. Fallback to claims (for onboarding or if DB is out of sync)
  if (!claimSchoolId || !claimRole) {
    return null;
  }

  return {
    uid,
    schoolId: claimSchoolId,
    role: claimRole as User['role'],
  };
}

export function requireSchoolUser(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user.schoolId || !user.role) {
    return jsonError(c, 'Forbidden: Missing tenant context', 403);
  }

  return user;
}
