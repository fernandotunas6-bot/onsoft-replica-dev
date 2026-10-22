import type { MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';
import type { AppEnv } from '../app-env';
import { resolveTenantUser } from '../lib/school-context';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid token' }, 401);
  }

  const token = authHeader.slice(7);

  const projectId = c.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    return c.json({ error: 'Server config error' }, 500);
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });

    const resolvedUser = await resolveTenantUser(c, payload as Record<string, unknown>);
    if (!resolvedUser) {
      return c.json({ error: 'Account not provisioned' }, 403);
    }

    if (resolvedUser.role !== 'super_admin') {
      const school = await c.env.DB.prepare(
        'SELECT is_active FROM Schools WHERE id = ? LIMIT 1'
      ).bind(resolvedUser.schoolId).first<{ is_active: number }>();

      if (!school || school.is_active === 0) {
        return c.json(
          {
            error:
              'Your school account is temporarily suspended. Please contact your school administrator or support for assistance.',
            code: 'school_suspended',
          },
          403
        );
      }
    }

    c.set('user', resolvedUser);

    return next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let tokenAud: unknown;
    let tokenIss: unknown;
    try {
      const decoded = decodeJwt(token) as { aud?: unknown; iss?: unknown };
      tokenAud = decoded.aud;
      tokenIss = decoded.iss;
    } catch {
      // Not a JWT-shaped string
    }
    console.error('JWT verification failed', {
      message,
      expectedProjectId: projectId,
      tokenAud,
      tokenIss,
    });
    return c.json({ error: 'Unauthorized' }, 401);
  }
};

