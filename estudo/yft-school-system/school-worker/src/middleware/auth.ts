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
    return c.json({ error: 'Sem sessão: falta a credencial ou é inválida' }, 401);
  }

  const token = authHeader.slice(7);

  const projectId = c.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    return c.json({ error: 'Erro de configuração do servidor' }, 500);
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });

    const resolvedUser = await resolveTenantUser(c, payload as Record<string, unknown>);
    if (!resolvedUser) {
      return c.json({ error: 'Conta sem acesso configurado' }, 403);
    }

    if (resolvedUser.role !== 'super_admin') {
      const school = await c.env.DB.prepare(
        'SELECT is_active FROM Schools WHERE id = ? LIMIT 1'
      ).bind(resolvedUser.schoolId).first<{ is_active: number }>();

      if (!school || school.is_active === 0) {
        return c.json(
          {
            error:
              'A conta da sua escola está suspensa temporariamente. Contacte a administração da escola ou o apoio.',
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
    return c.json({ error: 'Sem autorização' }, 401);
  }
};

