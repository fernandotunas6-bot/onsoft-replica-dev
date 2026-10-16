/**
 * API móvel sobre o Supabase do SIGA (SGA): a conta é a do SIGA (token de
 * sessão Supabase) e os dados são os que a escola já gere no SIGA.
 *
 * Só leitura, por agora, e só o que o encarregado pode ver dos seus
 * educandos. A autorização decide-se aqui, a cada pedido: o cliente nunca
 * indica o utilizador, e a escola pedida só vale se for um vínculo activo.
 */
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../app-env';
import {
  hasOverdueInvoice,
  loadClassTimetable,
  loadReceipts,
  loadStudentAttendance,
  loadWards,
  wardIds,
} from '../sga/guardian';
import {
  appRole,
  loadMemberships,
  pickMembership,
  verifySgaToken,
  type SgaMembership,
  type SgaUser,
} from '../sga/identity';
import { SgaDb, SgaError, inList } from '../sga/rest';

type SgaVars = { sgaUser: SgaUser; sgaDb: SgaDb; membership: SgaMembership; memberships: SgaMembership[] };
type SgaAppEnv = { Bindings: AppEnv['Bindings']; Variables: SgaVars };

const sga = new Hono<SgaAppEnv>();

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };

sga.onError((err, c) => {
  if (err instanceof SgaError) return c.json({ error: err.code }, err.status as 401, noStore);
  console.error('[sga]', err instanceof Error ? err.message : 'erro');
  return c.json({ error: 'SGA_FAILURE' }, 503, noStore);
});

sga.use('*', async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new SgaError(401, 'SESSION_REQUIRED');
  const db = SgaDb.from(c.env);
  const user = await verifySgaToken(c.env, token);
  const memberships = await loadMemberships(db, user.id);
  const membership = pickMembership(memberships, c.req.header('X-School-Id'));
  c.set('sgaUser', user);
  c.set('sgaDb', db);
  c.set('membership', membership);
  c.set('memberships', memberships);
  await next();
  for (const [k, v] of Object.entries(noStore)) c.header(k, v);
});

const requireGuardian = (c: Context<SgaAppEnv>) => {
  if (!c.get('membership').roles.includes('Encarregado')) throw new SgaError(403, 'GUARDIAN_ONLY');
};

/** Quem sou nesta escola, e as outras escolas onde tenho vínculo activo. */
sga.get('/me', async (c) => {
  const m = c.get('membership');
  const user = c.get('sgaUser');
  const [profile] = await c.get('sgaDb').select<{ full_name: string | null; display_name: string | null }>('profiles', {
    select: 'full_name,display_name',
    id: `eq.${user.id}`,
    limit: '1',
  });
  return c.json({
    user_id: user.id,
    name: profile?.display_name || profile?.full_name || null,
    school: { id: m.schoolId, name: m.schoolName },
    roles: m.roles,
    role: appRole(m.roles),
    schools: c.get('memberships').map((s) => ({ id: s.schoolId, name: s.schoolName, role: appRole(s.roles) })),
  });
});

sga.get('/wards', async (c) => {
  requireGuardian(c);
  const { schoolId } = c.get('membership');
  const wards = await loadWards(c.get('sgaDb'), schoolId, c.get('sgaUser'));
  // No formato de GET /api/wards, para o app ler com o mesmo modelo.
  return c.json({
    data: wards.map((w) => ({
      id: w.id,
      school_id: schoolId,
      class_id: w.classGroupId ?? '',
      class_name: w.className,
      name: w.name,
      photo_url: w.photoUrl,
      student_number: w.studentNumber,
      enrollment_id: w.enrollmentId,
      is_active: 1,
    })),
  });
});

/** Horário da turma de um educando (?class_id=); sem turma, o da primeira. */
sga.get('/timetable', async (c) => {
  requireGuardian(c);
  const { schoolId } = c.get('membership');
  const wards = await loadWards(c.get('sgaDb'), schoolId, c.get('sgaUser'));
  const classes = [...new Set(wards.map((w) => w.classGroupId).filter((x): x is string => !!x))];
  const requested = c.req.query('class_id')?.trim();
  if (requested && !classes.includes(requested)) throw new SgaError(404, 'CLASS_NOT_FOUND');
  const classId = requested || classes[0];
  if (!classId) return c.json({ data: [] });
  return c.json({ data: await loadClassTimetable(c.get('sgaDb'), schoolId, classId) });
});

/** Faltas de um educando. Outro aluno responde 404, como um que não existe. */
sga.get('/attendance/student/:studentId', async (c) => {
  requireGuardian(c);
  const db = c.get('sgaDb');
  const { schoolId } = c.get('membership');
  const studentId = c.req.param('studentId');
  if (!(await wardIds(db, schoolId, c.get('sgaUser'))).includes(studentId)) {
    throw new SgaError(404, 'STUDENT_NOT_FOUND');
  }
  return c.json(await loadStudentAttendance(db, schoolId, studentId));
});

/** Recibos dos educandos (pagamentos registados no SIGA, sem os anulados). */
sga.get('/finance/receipts', async (c) => {
  requireGuardian(c);
  const db = c.get('sgaDb');
  const { schoolId } = c.get('membership');
  const wards = await loadWards(db, schoolId, c.get('sgaUser'));
  return c.json({ data: await loadReceipts(db, schoolId, wards) });
});

/** Comunicados publicados para encarregados (e, com dívida vencida, os de cobrança). */
sga.get('/notices', async (c) => {
  requireGuardian(c);
  const db = c.get('sgaDb');
  const { schoolId } = c.get('membership');
  const audiences = ['all_guardians'];
  if (await hasOverdueInvoice(db, schoolId, await wardIds(db, schoolId, c.get('sgaUser')))) {
    audiences.push('guardians_with_debt');
  }
  const rows = await db.select<{
    id: string;
    title: string;
    body: string | null;
    audience: string;
    published_at: string | null;
    created_at: string;
  }>('school_announcements', {
    select: 'id,title,body,audience,published_at,created_at',
    school_id: `eq.${schoolId}`,
    status: 'eq.sent',
    deleted_at: 'is.null',
    audience: inList(audiences),
    order: 'published_at.desc.nullslast,created_at.desc',
    limit: '100',
  });
  // No formato de GET /api/notices. O SIGA não guarda o "lido" por pessoa.
  return c.json({
    data: rows.map((n) => {
      const body = n.body ?? '';
      return {
        id: n.id,
        school_id: schoolId,
        title: n.title,
        summary: body.length > 140 ? `${body.slice(0, 137).trimEnd()}…` : body,
        body,
        category: n.audience === 'guardians_with_debt' ? 'finance' : 'general',
        created_at: n.published_at ?? n.created_at,
        audience: n.audience,
        read_flag: 0,
      };
    }),
  });
});

export default sga;
