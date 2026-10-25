import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

const media = new Hono<AppEnv>();

media.post('/profile-photo', requireAdmin, async (c) => {
  const user = c.get('user');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, 'Expected multipart form data', 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return jsonError(c, 'Missing file field', 400);
  }

  const mime = (file as File).type || 'application/octet-stream';
  if (!ALLOWED_UPLOAD_TYPES.has(mime)) {
    return jsonError(c, 'Only JPEG, PNG, or WebP images are allowed', 400);
  }

  const buf = new Uint8Array(await (file as File).arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return jsonError(c, 'Image must be between 1 byte and 2 MB', 400);
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const key = `profile-photos/${user.schoolId}/${createPrefixedId('img')}.${ext}`;

  await c.env.MEDIA_BUCKET.put(key, buf, {
    httpMetadata: { contentType: mime },
  });

  return jsonOk(c, { key });
});

export default media;
