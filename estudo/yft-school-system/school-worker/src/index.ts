import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './app-env';
import { apiRoutes, superAdminRoutes } from './routes';

const app = new Hono<AppEnv>();

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    try {
      const url = new URL(origin);
      const host = url.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return origin;
    } catch { /* not a valid URL */ }
    if (origin.endsWith('.vercel.app') || origin.endsWith('.workers.dev')) return origin;
    return '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Super-Admin-Key'],
  maxAge: 86400,
}));
app.route('/api/super-admin', superAdminRoutes);
app.route('/api', apiRoutes);

app.get('/media/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace('/media/', ''));
  if (!key || key.includes('..') || key.startsWith('/')) {
    return c.json({ error: 'Invalid key' }, 400);
  }

  const allowedPrefixes = ['logos/', 'profile-photos/'];
  if (!allowedPrefixes.some((p) => key.startsWith(p))) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const object = await c.env.MEDIA_BUCKET.get(key);
  if (!object) {
    return c.json({ error: 'Not found' }, 404);
  }

  const headers = new Headers();
  const ct = object.httpMetadata?.contentType ?? 'application/octet-stream';
  headers.set('Content-Type', ct);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (ct === 'image/svg+xml') {
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  }

  return new Response(object.body, { headers });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
