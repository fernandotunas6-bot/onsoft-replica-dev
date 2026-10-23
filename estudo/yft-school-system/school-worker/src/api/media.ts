import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { detectImageKind } from '../lib/media-type';
import { jsonError, jsonOk } from '../lib/response';

const MAX_BYTES = 2 * 1024 * 1024;

const media = new Hono<AppEnv>();

media.post('/profile-photo', requireAdmin, async (c) => {
  const user = c.get('user');
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, 'O pedido devia vir em multipart/form-data', 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return jsonError(c, 'Falta o campo do ficheiro', 400);
  }

  const buf = new Uint8Array(await (file as File).arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
    return jsonError(c, 'A imagem tem de ter entre 1 byte e 2 MB', 400);
  }

  // O tipo vem do conteúdo, não do que o cliente declarou: é este tipo que
  // volta no Content-Type quando a imagem é servida. SVG não entra numa
  // fotografia de perfil — é um documento que pode trazer script.
  const kind = detectImageKind(buf);
  if (!kind) {
    return jsonError(c, 'Só são aceites imagens JPEG, PNG ou WebP', 400);
  }

  const key = `profile-photos/${user.schoolId}/${createPrefixedId('img')}.${kind.extension}`;

  await c.env.MEDIA_BUCKET.put(key, buf, {
    httpMetadata: { contentType: kind.contentType },
  });

  return jsonOk(c, { key });
});

export default media;
