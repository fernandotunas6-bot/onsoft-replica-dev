import { SignJWT, importPKCS8 } from 'jose';
import type { Env } from '../app-env';

/**
 * Deletes a Firebase Auth user using a service account (same as Admin SDK).
 * Set Wrangler secret `FIREBASE_SERVICE_ACCOUNT_JSON` to the full JSON of a
 * Firebase service account key. If unset, returns { skipped: true } (D1-only delete).
 */
export async function deleteFirebaseAuthUser(
  env: Env,
  uid: string,
): Promise<{ ok: boolean; skipped: boolean; error?: string }> {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    console.warn(
      '[firebase] FIREBASE_SERVICE_ACCOUNT_JSON not set; skipping Auth delete for uid',
      uid,
    );
    return { ok: true, skipped: true };
  }

  let clientEmail: string;
  let privateKey: string;
  try {
    const sa = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!sa.client_email || !sa.private_key) {
      return { ok: false, skipped: true, error: 'Invalid service account JSON' };
    }
    clientEmail = sa.client_email;
    privateKey = sa.private_key.replace(/\\n/g, '\n');
  } catch {
    return { ok: false, skipped: true, error: 'Invalid service account JSON' };
  }

  const projectId = env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    return { ok: false, skipped: true, error: 'FIREBASE_PROJECT_ID missing' };
  }

  try {
    const key = await importPKCS8(privateKey, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      scope: 'https://www.googleapis.com/auth/firebase',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(clientEmail)
      .setSubject(clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(key);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const tokenJson = (await tokenRes.json().catch(() => null)) as {
      access_token?: string;
      error?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('[firebase] token exchange failed', tokenJson?.error);
      return { ok: false, skipped: false, error: 'Token exchange failed' };
    }

    const delUrl = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts/${encodeURIComponent(uid)}`;
    const delRes = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!delRes.ok && delRes.status !== 404) {
      const text = await delRes.text().catch(() => '');
      console.error('[firebase] delete account failed', delRes.status, text);
      return { ok: false, skipped: false, error: 'Firebase delete failed' };
    }
    return { ok: true, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[firebase] delete exception', msg);
    return { ok: false, skipped: false, error: msg };
  }
}
