import { Hono } from 'hono';
import type { AppEnv } from '../app-env';
import { requireAdmin } from '../lib/auth-guards';
import { storeProfilePhoto } from '../lib/media-upload';
import { jsonError, jsonOk } from '../lib/response';

const media = new Hono<AppEnv>();

/** Fotografia para a ficha de um aluno ou professor (o admin grava a chave). */
media.post('/profile-photo', requireAdmin, async (c) => {
  const result = await storeProfilePhoto(c);
  if ('error' in result) return jsonError(c, result.error, 400);
  return jsonOk(c, { key: result.key });
});

export default media;
