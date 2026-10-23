import type { Context } from 'hono';
import type { AppEnv, User } from '../app-env';
import { jsonError } from './response';

type UserRow = {
  uid: string;
  school_id: string;
  role: string;
};

export async function resolveTenantUser(c: Context<AppEnv>, tokenClaims: Record<string, unknown>): Promise<User | null> {
  const uid = typeof tokenClaims.sub === 'string' ? tokenClaims.sub : undefined;
  const claimSchoolId = typeof tokenClaims.school_id === 'string' ? tokenClaims.school_id : undefined;
  const claimRole = typeof tokenClaims.role === 'string' ? tokenClaims.role : undefined;

  if (!uid) {
    return null;
  }

  // 1. Check if this is a Super Admin (Global)
  const isSuperAdminClaim = tokenClaims.super_admin === true || claimRole === 'super_admin';
  if (isSuperAdminClaim) {
    const superAdmin = await c.env.DB.prepare(
      'SELECT uid, role FROM SuperAdmins WHERE uid = ? LIMIT 1'
    ).bind(uid).first<{ uid: string; role: string }>();

    if (superAdmin) {
      return {
        uid: superAdmin.uid,
        schoolId: 'global',
        role: 'super_admin',
      };
    }
  }

  // 2. Check regular Users table
  const dbUser = await c.env.DB.prepare(
    'SELECT uid, school_id, role FROM Users WHERE uid = ? LIMIT 1'
  ).bind(uid).first<UserRow>();

  if (dbUser) {
    if (claimSchoolId && claimSchoolId !== dbUser.school_id) {
      return null;
    }

    if (claimRole && claimRole !== dbUser.role) {
      return null;
    }

    return {
      uid: dbUser.uid,
      schoolId: dbUser.school_id,
      role: dbUser.role as User['role'],
    };
  }

  // Não há reserva pelas claims do token.
  //
  // Havia aqui um ramo que, sem linha em `Users`, aceitava o `school_id` e o
  // `role` que vinham no token «para a adesão ou se a base estiver
  // dessincronizada». Mas todos os caminhos que criam contas — adesão da
  // escola, registo de professor e admissão de aluno — inserem em `Users`,
  // pelo que nenhuma conta legítima precisava do ramo. O que ele permitia era
  // o contrário: uma conta removida da base continuar a entrar, com a escola e
  // o papel do token, até as claims serem limpas no Firebase. Remover a conta
  // tem de retirar o acesso.
  return null;
}

export function requireSchoolUser(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user.schoolId || !user.role) {
    return jsonError(c, 'Sem autorização: falta o contexto da escola', 403);
  }

  return user;
}
