import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export const SESSION_COOKIE = 'sa_session';
/** HttpOnly cookie max-age (matches portal session JWT lifetime). */
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

/** Minimum length for HMAC signing; use a long random value in production. */
export const MIN_PORTAL_SESSION_SECRET_LENGTH = 8;

const jwks = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

function getPortalSessionSecret(): Uint8Array {
  const raw =
    process.env.SUPER_ADMIN_JWT_SECRET?.trim() ||
    process.env.SUPER_ADMIN_API_KEY?.trim();
  if (!raw || raw.length < MIN_PORTAL_SESSION_SECRET_LENGTH) {
    throw new Error(
      'Set SUPER_ADMIN_JWT_SECRET (recommended) or SUPER_ADMIN_API_KEY '
      + `(min ${MIN_PORTAL_SESSION_SECRET_LENGTH} chars) for portal sessions.`,
    );
  }
  return new TextEncoder().encode(raw);
}

/** One-time verification of Firebase ID token at login (short-lived). */
export async function verifyFirebaseSessionToken(
  token: string,
  projectId: string,
) {
  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  return payload;
}

export async function verifySuperAdmin(token: string, projectId: string) {
  const payload = await verifyFirebaseSessionToken(token, projectId);

  const isSuperAdmin =
    payload.super_admin === true ||
    payload.super_admin === 'true' ||
    payload.role === 'super_admin';

  if (!isSuperAdmin) {
    throw new Error('Not a super admin session');
  }

  return payload;
}

/**
 * Long-lived HttpOnly cookie value. Do not store the raw Firebase ID token in
 * cookies — it expires in ~1 hour while the browser cookie was set for days.
 */
export async function signSuperAdminPortalSession(input: {
  sub: string;
  email?: string;
}): Promise<string> {
  return new SignJWT({
    super_admin: true,
    role: 'super_admin',
    ...(input.email ? { email: input.email } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(input.sub)
    .setIssuer('yft-super-admin')
    .setAudience('yft-super-admin-session')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SEC}s`)
    .sign(getPortalSessionSecret());
}

export async function verifySuperAdminPortalSession(
  token: string,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getPortalSessionSecret(), {
    issuer: 'yft-super-admin',
    audience: 'yft-super-admin-session',
    algorithms: ['HS256'],
  });

  const isSuperAdmin =
    payload.super_admin === true ||
    payload.super_admin === 'true' ||
    payload.role === 'super_admin';

  if (!isSuperAdmin) {
    throw new Error('Not a super admin session');
  }

  return payload;
}

export function sessionIsExpired(payload: JWTPayload) {
  return typeof payload.exp === 'number' && Date.now() / 1000 >= payload.exp;
}
