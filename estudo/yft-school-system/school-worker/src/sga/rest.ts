/**
 * Leitura do Supabase do SIGA (SGA) pelo PostgREST, com a chave de servidor.
 *
 * A chave nunca sai do Worker. As tabelas sensíveis do SGA têm RLS forçado e
 * só o servidor as lê (docs/agents/DATABASE_RULES.md): por isso cada rota
 * decide primeiro o que o utilizador pode ver e só depois consulta, sempre
 * filtrada pela escola e pelos ids autorizados.
 */
export interface SgaEnv {
  SGA_SUPABASE_URL?: string;
  /** Publicável: só para validar o token de sessão em /auth/v1/user. */
  SGA_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Segredo do Worker (`wrangler secret put SGA_SUPABASE_SECRET_KEY`). */
  SGA_SUPABASE_SECRET_KEY?: string;
}

export class SgaError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function sgaConfig(env: SgaEnv) {
  const url = env.SGA_SUPABASE_URL?.replace(/\/+$/, '');
  if (!url || !env.SGA_SUPABASE_PUBLISHABLE_KEY || !env.SGA_SUPABASE_SECRET_KEY) {
    throw new SgaError(503, 'SGA_NOT_CONFIGURED');
  }
  return { url, publishableKey: env.SGA_SUPABASE_PUBLISHABLE_KEY, secretKey: env.SGA_SUPABASE_SECRET_KEY };
}

/** `in.(a,b)` do PostgREST; os valores vêm de outras leituras, nunca do cliente. */
export const inList = (values: readonly string[]) =>
  `in.(${values.map((v) => `"${v.replace(/"/g, '')}"`).join(',')})`;

export class SgaDb {
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  static from(env: SgaEnv): SgaDb {
    const cfg = sgaConfig(env);
    return new SgaDb(cfg.url, cfg.secretKey);
  }

  async select<T>(table: string, query: Record<string, string>): Promise<T[]> {
    const u = new URL(`${this.url}/rest/v1/${table}`);
    for (const [k, v] of Object.entries(query)) u.searchParams.append(k, v);
    const res = await fetch(u.toString(), {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, Accept: 'application/json' },
    });
    // Uma falha de leitura nunca vira lista vazia: o app mostraria "sem
    // educandos" a quem os tem.
    if (!res.ok) throw new SgaError(503, 'SGA_READ_FAILED');
    return (await res.json()) as T[];
  }

  /**
   * Todas as linhas, por páginas de 1000 (o máximo que o PostgREST devolve):
   * sem isto, um aluno com mais de 1000 registos ficava com contas curtas.
   * `order` tem de ser estável (ex.: `id.asc`).
   */
  async selectAll<T>(table: string, query: Record<string, string>, max = 20000): Promise<T[]> {
    const out: T[] = [];
    for (let offset = 0; offset < max; offset += 1000) {
      const page = await this.select<T>(table, { ...query, limit: '1000', offset: String(offset) });
      out.push(...page);
      if (page.length < 1000) break;
    }
    return out;
  }

  /** O mesmo filtro `in` dividido em blocos, com os resultados juntos. */
  async selectIn<T>(table: string, column: string, ids: readonly string[], query: Record<string, string>): Promise<T[]> {
    const parts = await Promise.all(chunks([...new Set(ids)]).map((part) => this.select<T>(table, { ...query, [column]: inList(part) })));
    return parts.flat();
  }
}

/** Divide uma lista de ids em blocos (um `in.(…)` gigante parte o URL). */
export function chunks<T>(list: readonly T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Dia de hoje em Luanda (YYYY-MM-DD), como o SIGA (`schoolTodayIso`). */
export function luandaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(now);
}
