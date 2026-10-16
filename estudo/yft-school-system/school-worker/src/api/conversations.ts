import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app-env';
import { requireRoles } from '../lib/auth-guards';
import { createPrefixedId } from '../lib/id';
import { jsonError, jsonOk } from '../lib/response';

/**
 * Conversas 1:1. Regras de quem fala com quem:
 * - encarregado → professores e administração da escola;
 * - professor e administração → qualquer pessoa da escola.
 * Encarregados não conversam entre si.
 */
const conversations = new Hono<AppEnv>();
conversations.use('*', requireRoles('admin', 'teacher', 'parent'));

type Role = 'admin' | 'teacher' | 'parent';

function canTalk(a: Role, b: Role) {
  return !(a === 'parent' && b === 'parent');
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 23);

async function membership(c: Context<AppEnv>, conversationId: string) {
  const user = c.get('user');
  return c.env.DB.prepare(
    `SELECT m.last_read_at FROM ConversationMembers m
     JOIN Conversations cv ON cv.id = m.conversation_id
     WHERE m.conversation_id = ? AND m.user_uid = ? AND cv.school_id = ?`
  ).bind(conversationId, user.uid, user.schoolId).first<{ last_read_at: string | null }>();
}

/** As minhas conversas, mais recentes primeiro, com a outra pessoa e as por ler. */
conversations.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT cv.id, cv.last_message_at, cv.last_preview,
            o.user_uid AS other_uid, u.name AS other_name, u.role AS other_role,
            u.photo_url AS other_photo,
            (SELECT COUNT(*) FROM Messages msg
              WHERE msg.conversation_id = cv.id AND msg.sender_uid != ?
                AND (me.last_read_at IS NULL OR msg.created_at > me.last_read_at)) AS unread
     FROM ConversationMembers me
     JOIN Conversations cv ON cv.id = me.conversation_id AND cv.school_id = ?
     JOIN ConversationMembers o ON o.conversation_id = cv.id AND o.user_uid != me.user_uid
     LEFT JOIN Users u ON u.uid = o.user_uid AND u.school_id = cv.school_id
     WHERE me.user_uid = ? AND cv.last_message_at IS NOT NULL
     ORDER BY cv.last_message_at DESC
     LIMIT 200`
  ).bind(user.uid, user.schoolId, user.uid).all();
  return jsonOk(c, { data: results });
});

conversations.get('/unread-count', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM Messages msg
     JOIN ConversationMembers me ON me.conversation_id = msg.conversation_id AND me.user_uid = ?
     WHERE msg.school_id = ? AND msg.sender_uid != ?
       AND (me.last_read_at IS NULL OR msg.created_at > me.last_read_at)`
  ).bind(user.uid, user.schoolId, user.uid).first<{ n: number }>();
  return jsonOk(c, { unread_count: Number(row?.n ?? 0) });
});

/**
 * Com quem posso começar uma conversa. Ao encarregado aparecem professores e
 * administração; aos funcionários aparecem também os encarregados, com os
 * nomes dos educandos activos para os distinguir.
 */
conversations.get('/contacts', async (c) => {
  const user = c.get('user');
  const roles = user.role === 'parent' ? ['admin', 'teacher'] : ['admin', 'teacher', 'parent'];
  const { results } = await c.env.DB.prepare(
    `SELECT u.uid, u.name, u.role, u.photo_url, u.subjects_text,
            (SELECT GROUP_CONCAT(s.name, ', ') FROM Students s
              WHERE s.school_id = u.school_id AND s.parent_uid = u.uid AND s.is_active = 1) AS wards
     FROM Users u
     WHERE u.school_id = ? AND u.uid != ? AND u.role IN (${roles.map(() => '?').join(',')})
     ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'teacher' THEN 1 ELSE 2 END, u.name COLLATE NOCASE
     LIMIT 1000`
  ).bind(user.schoolId, user.uid, ...roles).all();
  return jsonOk(c, { data: results });
});

/** Abre (ou reutiliza) a conversa 1:1 com outra pessoa da escola. */
conversations.post('/', async (c) => {
  const user = c.get('user');
  const parsed = z.object({ user_uid: z.string().trim().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 'user_uid is required', 400);
  const otherUid = parsed.data.user_uid;
  if (otherUid === user.uid) return jsonError(c, 'Cannot talk to yourself', 400);

  const other = await c.env.DB.prepare('SELECT uid, role FROM Users WHERE uid = ? AND school_id = ?')
    .bind(otherUid, user.schoolId)
    .first<{ uid: string; role: Role }>();
  if (!other) return jsonError(c, 'User not found', 404);
  if (!canTalk(user.role as Role, other.role)) return jsonError(c, 'Forbidden', 403);

  const pairKey = [user.uid, otherUid].sort().join('|');
  const find = () =>
    c.env.DB.prepare('SELECT id FROM Conversations WHERE school_id = ? AND pair_key = ?')
      .bind(user.schoolId, pairKey)
      .first<{ id: string }>();
  const existing = await find();
  if (existing) return jsonOk(c, { id: existing.id });

  // O índice único em (school_id, pair_key) resolve pedidos simultâneos: o
  // segundo INSERT é ignorado e ambos devolvem a mesma conversa.
  const id = createPrefixedId('cnv');
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT OR IGNORE INTO Conversations (id, school_id, pair_key) VALUES (?, ?, ?)')
      .bind(id, user.schoolId, pairKey),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO ConversationMembers (conversation_id, user_uid)
       SELECT ?, ? WHERE EXISTS (SELECT 1 FROM Conversations WHERE id = ?)`
    ).bind(id, user.uid, id),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO ConversationMembers (conversation_id, user_uid)
       SELECT ?, ? WHERE EXISTS (SELECT 1 FROM Conversations WHERE id = ?)`
    ).bind(id, otherUid, id),
  ]);
  const created = await find();
  return jsonOk(c, { id: created!.id }, created!.id === id ? 201 : 200);
});

/** Mensagens (até 200 mais recentes, por ordem) e marca a conversa como lida. */
conversations.get('/:id/messages', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!(await membership(c, id))) return jsonError(c, 'Conversation not found', 404);

  const { results } = await c.env.DB.prepare(
    `SELECT id, sender_uid, body, created_at FROM (
       SELECT id, sender_uid, body, created_at FROM Messages
       WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 200
     ) ORDER BY created_at ASC`
  ).bind(id).all<{ id: string; sender_uid: string; body: string; created_at: string }>();

  const other = await c.env.DB.prepare(
    `SELECT u.uid, u.name, u.role FROM ConversationMembers m
     LEFT JOIN Users u ON u.uid = m.user_uid AND u.school_id = ?
     WHERE m.conversation_id = ? AND m.user_uid != ?`
  ).bind(user.schoolId, id, user.uid).first();

  // Lido até à última mensagem devolvida — não até "agora", para não marcar
  // como lida uma mensagem que chegou entre a leitura e esta actualização.
  const lastSeen = results.at(-1)?.created_at;
  if (lastSeen) {
    await c.env.DB.prepare(
      `UPDATE ConversationMembers SET last_read_at = ?
       WHERE conversation_id = ? AND user_uid = ? AND (last_read_at IS NULL OR last_read_at < ?)`
    ).bind(lastSeen, id, user.uid, lastSeen).run();
  }

  return jsonOk(c, {
    data: results.map((m) => ({ ...m, mine: m.sender_uid === user.uid })),
    other,
  });
});

conversations.post('/:id/messages', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 'Message body is required (max 2000)', 400);
  if (!(await membership(c, id))) return jsonError(c, 'Conversation not found', 404);

  const at = now();
  const msgId = createPrefixedId('msg');
  const preview = parsed.data.body.length > 120 ? `${parsed.data.body.slice(0, 117)}…` : parsed.data.body;
  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO Messages (id, conversation_id, school_id, sender_uid, body, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(msgId, id, user.schoolId, user.uid, parsed.data.body, at),
    c.env.DB.prepare('UPDATE Conversations SET last_message_at = ?, last_preview = ? WHERE id = ?').bind(at, preview, id),
    // Quem escreve leu tudo até aqui.
    c.env.DB.prepare('UPDATE ConversationMembers SET last_read_at = ? WHERE conversation_id = ? AND user_uid = ?')
      .bind(at, id, user.uid),
  ]);
  return jsonOk(c, { id: msgId, created_at: at }, 201);
});

export default conversations;
