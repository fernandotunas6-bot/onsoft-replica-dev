import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../app-env';
import { jsonError } from './response';

const SCHOOL_ROLES = new Set(['admin', 'teacher', 'parent']);

export function requireRoles(...roles: Array<'admin' | 'teacher' | 'parent'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!SCHOOL_ROLES.has(user.role)) {
      return jsonError(c, 'Forbidden', 403);
    }

    if (roles.length > 0 && !roles.includes(user.role as 'admin' | 'teacher' | 'parent')) {
      return jsonError(c, 'Forbidden', 403);
    }

    await next();
  };
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return jsonError(c, 'Forbidden: Admin role required', 403);
  }

  await next();
};

export const requireAdminOrTeacher: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin' && user.role !== 'teacher') {
    return jsonError(c, 'Forbidden: Admin or teacher role required', 403);
  }

  await next();
};

export const requireSuperAdminKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  const configuredKey = c.env.SUPER_ADMIN_API_KEY;
  if (!configuredKey) {
    console.error('SUPER_ADMIN_API_KEY is not configured');
    return jsonError(c, 'Service unavailable', 503);
  }

  const providedKey = c.req.header('X-Super-Admin-Key');
  if (!providedKey || providedKey !== configuredKey) {
    return jsonError(c, 'Forbidden', 403);
  }

  await next();
};
