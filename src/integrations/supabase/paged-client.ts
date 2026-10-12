/**
 * Cliente que lê tudo: cada `select` é repetido por páginas e um `.in(...)` longo é
 * dividido em lotes, sem mudar quem o usa.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido (e corta sem erro), e um
 * `.in(...)` com centenas de uuids passa o tamanho máximo do URL. A exportação de
 * dados («nenhum ficheiro parcial será gerado») fazia ~40 leituras assim: numa escola
 * com mais de 1000 alunos o ficheiro saía cortado, e um erro dava uma folha vazia.
 *
 * Só para leituras de listas. Escritas, `single`/`maybeSingle`, contagens (`head`) e
 * consultas que já escolhem `range`/`limit` passam tal e qual. As páginas ordenam por
 * `id` (depois da ordem que a consulta já tiver), por isso a tabela tem de ter `id`.
 */
import { isMissingTable } from "./server-error";

export const PAGED_CLIENT_PAGE = 1000;
export const PAGED_CLIENT_IN_CHUNK = 150;
/** Tecto de segurança por consulta: 200 000 linhas. */
const MAX_PAGES = 200;

const PASS_THROUGH = new Set([
  "single",
  "maybeSingle",
  "range",
  "limit",
  "csv",
  "explain",
  "insert",
  "update",
  "upsert",
  "delete",
]);

type Call = { method: string; args: unknown[] };
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null; count?: number | null };
type AnyBuilder = Record<string, (...args: unknown[]) => AnyBuilder> & PromiseLike<Result>;
type Db = { from: (table: string) => unknown };

export class PagedReadError extends Error {
  readonly table: string;
  readonly dbError: DbError;
  constructor(table: string, dbError: DbError) {
    super(`Não foi possível ler ${table}: ${dbError.message}`);
    this.table = table;
    this.dbError = dbError;
  }
}

function replay(db: Db, table: string, calls: Call[]) {
  let query = db.from(table) as AnyBuilder;
  for (const call of calls) query = query[call.method](...call.args);
  return query;
}

function isPlainList(calls: Call[]) {
  if (calls.some((call) => PASS_THROUGH.has(call.method))) return false;
  const select = calls.find((call) => call.method === "select");
  if (!select) return false;
  const options = select.args[1] as { head?: boolean } | undefined;
  return !options?.head;
}

async function readPages(db: Db, table: string, calls: Call[], opts: Options): Promise<Result> {
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGED_CLIENT_PAGE;
    let query = replay(db, table, calls);
    for (const column of opts.keys(table)) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGED_CLIENT_PAGE - 1);
    if (error) return { data: null, error };
    const list = (data ?? []) as unknown[];
    rows.push(...list);
    if (list.length < PAGED_CLIENT_PAGE) break;
  }
  return { data: rows, error: null };
}

async function execute(db: Db, table: string, calls: Call[], opts: Options): Promise<Result> {
  if (!isPlainList(calls)) return replay(db, table, calls);

  const longIn = calls.findIndex(
    (call) =>
      call.method === "in" &&
      Array.isArray(call.args[1]) &&
      (call.args[1] as unknown[]).length > PAGED_CLIENT_IN_CHUNK,
  );
  let result: Result;
  if (longIn < 0) {
    result = await readPages(db, table, calls, opts);
  } else {
    const values = [...new Set(calls[longIn].args[1] as unknown[])];
    const rows: unknown[] = [];
    result = { data: rows, error: null };
    for (let i = 0; i < values.length; i += PAGED_CLIENT_IN_CHUNK) {
      const chunk = values.slice(i, i + PAGED_CLIENT_IN_CHUNK);
      const chunkCalls = calls.map((call, index) =>
        index === longIn ? { method: "in", args: [call.args[0], chunk] } : call,
      );
      const part = await readPages(db, table, chunkCalls, opts);
      if (part.error) {
        result = part;
        break;
      }
      rows.push(...(part.data as unknown[]));
    }
  }
  if (result.error && opts.strict && !isMissingTable(result.error)) {
    throw new PagedReadError(table, result.error);
  }
  return result;
}

function recorder(db: Db, table: string, calls: Call[], opts: Options): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
            execute(db, table, calls, opts).then(resolve, reject);
        }
        if (typeof property !== "string") return undefined;
        return (...args: unknown[]) =>
          recorder(db, table, [...calls, { method: property, args }], opts);
      },
    },
  );
}

/**
 * Tabelas sem `id`: as páginas ordenam pela chave primária composta.
 */
const KEYS_WITHOUT_ID: Record<string, string[]> = {
  member_roles: ["membership_id", "role_id"],
};

type Options = { strict: boolean; keys: (table: string) => string[] };

/**
 * `strict`: um erro de leitura lança `PagedReadError` (a tabela em falta continua a
 * devolver o erro, para quem já trata esse caso). Sem `strict`, o erro volta no
 * resultado, como no cliente normal. `keys`: colunas únicas por tabela para ordenar
 * as páginas (por omissão `id`, ou a chave de `KEYS_WITHOUT_ID`).
 */
export function pagedReadClient<T extends Db>(
  db: T,
  options: { strict?: boolean; keys?: Record<string, string[]> } = {},
): T {
  const opts: Options = {
    strict: options.strict ?? false,
    keys: (table) => options.keys?.[table] ?? KEYS_WITHOUT_ID[table] ?? ["id"],
  };
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => recorder(target, table, [], opts);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
