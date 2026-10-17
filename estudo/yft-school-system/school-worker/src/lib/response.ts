import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export function jsonError(c: Context, message: string, status: ContentfulStatusCode, details?: unknown) {
  return c.json({ error: message, ...(details ? { details } : {}) }, status);
}

export function jsonOk<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json(data, status);
}
