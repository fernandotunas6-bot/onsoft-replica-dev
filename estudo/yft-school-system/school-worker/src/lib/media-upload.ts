import type { Context } from 'hono';
import type { AppEnv } from '../app-env';
import { createPrefixedId } from './id';

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Lê o campo `file` de um multipart e guarda-o no R2 em
 * `profile-photos/<escola>/…`. Devolve a chave, ou a mensagem de erro (400).
 */
export async function storeProfilePhoto(
  c: Context<AppEnv>,
): Promise<{ key: string } | { error: string }> {
  const user = c.get('user');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return { error: 'Expected multipart form data' };
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return { error: 'Missing file field' };
  }

  const mime = (file as File).type || 'application/octet-stream';
  if (!ALLOWED_UPLOAD_TYPES.has(mime)) {
    return { error: 'Only JPEG, PNG, or WebP images are allowed' };
  }

  const buf = new Uint8Array(await (file as File).arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return { error: 'Image must be between 1 byte and 2 MB' };
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const key = `profile-photos/${user.schoolId}/${createPrefixedId('img')}.${ext}`;
  await c.env.MEDIA_BUCKET.put(key, buf, { httpMetadata: { contentType: mime } });
  return { key };
}
