import { SgaDb, SgaError, inList, sgaConfig, type SgaEnv } from './rest';

export interface SgaUser {
  id: string;
  /** Só quando o e-mail está confirmado: um e-mail por confirmar nunca liga a uma ficha. */
  verifiedEmail: string | null;
}

/** Valida o token de sessão Supabase junto do próprio Auth do SGA. */
export async function verifySgaToken(env: SgaEnv, token: string): Promise<SgaUser> {
  const cfg = sgaConfig(env);
  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: { apikey: cfg.publishableKey, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new SgaError(401, 'SESSION_INVALID');
  if (!res.ok) throw new SgaError(503, 'SGA_AUTH_UNAVAILABLE');
  const u = (await res.json()) as { id?: string; email?: string | null; email_confirmed_at?: string | null };
  if (!u.id) throw new SgaError(401, 'SESSION_INVALID');
  return {
    id: u.id,
    verifiedEmail: u.email && u.email_confirmed_at ? u.email.trim().toLowerCase() : null,
  };
}

/** Os mesmos códigos que o SIGA (src/integrations/supabase/sga.ts). */
const ROLE_BY_CODE: Record<string, SgaRole> = {
  owner: 'Administrador',
  admin: 'Administrador',
  administrador: 'Administrador',
  secretary: 'Secretaria',
  secretaria: 'Secretaria',
  treasury: 'Tesouraria',
  tesouraria: 'Tesouraria',
  finance: 'Tesouraria',
  teacher: 'Professor',
  professor: 'Professor',
  guardian: 'Encarregado',
  encarregado: 'Encarregado',
  parent: 'Encarregado',
  student: 'Aluno',
  aluno: 'Aluno',
};

export type SgaRole =
  | 'Administrador'
  | 'Secretaria'
  | 'Tesouraria'
  | 'Professor'
  | 'Encarregado'
  | 'Aluno'
  | 'Utilizador';

export interface SgaMembership {
  schoolId: string;
  schoolName: string;
  roles: SgaRole[];
}

/**
 * Vínculos activos do utilizador, com a escola e os papéis. A escola pedida
 * (cabeçalho X-School-Id) só é usada se for uma delas.
 */
export async function loadMemberships(db: SgaDb, userId: string): Promise<SgaMembership[]> {
  const memberships = await db.select<{ id: string; school_id: string }>('school_memberships', {
    select: 'id,school_id',
    user_id: `eq.${userId}`,
    status: 'eq.active',
    order: 'created_at.asc',
  });
  if (!memberships.length) return [];

  const [schools, memberRoles] = await Promise.all([
    db.select<{ id: string; name: string }>('schools', {
      select: 'id,name',
      id: inList([...new Set(memberships.map((m) => m.school_id))]),
    }),
    db.select<{ membership_id: string; roles: { code: string } | { code: string }[] | null }>('member_roles', {
      select: 'membership_id,roles!member_roles_role_id_fkey(code)',
      membership_id: inList(memberships.map((m) => m.id)),
    }),
  ]);

  const names = new Map(schools.map((s) => [s.id, s.name]));
  return memberships.map((m) => {
    const roles = new Set<SgaRole>();
    for (const mr of memberRoles.filter((r) => r.membership_id === m.id)) {
      for (const r of Array.isArray(mr.roles) ? mr.roles : mr.roles ? [mr.roles] : []) {
        roles.add(ROLE_BY_CODE[r.code.trim().toLowerCase()] ?? 'Utilizador');
      }
    }
    return {
      schoolId: m.school_id,
      schoolName: names.get(m.school_id) ?? 'Instituição escolar',
      roles: roles.size ? [...roles] : ['Utilizador'],
    };
  });
}

export function pickMembership(all: SgaMembership[], preferred?: string | null): SgaMembership {
  const chosen = (preferred && all.find((m) => m.schoolId === preferred)) || all[0];
  if (!chosen) throw new SgaError(403, 'NO_ACTIVE_MEMBERSHIP');
  return chosen;
}

/** Papel do app: direcção, professor ou encarregado (por esta ordem). */
export function appRole(roles: readonly SgaRole[]): 'admin' | 'teacher' | 'parent' | 'student' | null {
  if (roles.some((r) => r === 'Administrador' || r === 'Secretaria' || r === 'Tesouraria')) return 'admin';
  if (roles.includes('Professor')) return 'teacher';
  if (roles.includes('Encarregado')) return 'parent';
  if (roles.includes('Aluno')) return 'student';
  return null;
}
