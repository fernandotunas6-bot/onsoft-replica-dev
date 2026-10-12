/**
 * Cliente que divide os `.in(...)` longos em lotes, sem mudar quem o usa.
 *
 * A lista de um `.in(...)` vai no URL, e o URL tem tamanho máximo: com ~200 uuids o
 * pedido falha. Há centenas de leituras assim (os alunos de uma turma, as fichas de
 * uma lista, as faturas de um conjunto de contratos) e muitas ignoram o erro — numa
 * escola um pouco maior, o ecrã ficava vazio em vez de avisar. O cliente do servidor
 * (`loadSgaAdminClient`) passa por aqui.
 *
 * Só leituras de listas com uma lista acima de `IN_CHUNK` mudam: cada lote é pedido à
 * parte, as linhas juntam-se e voltam a ordenar-se pela ordem da consulta (colunas da
 * própria tabela). Contagens (`head`) somam-se. Tudo o resto passa tal e qual: escritas,
 * `single`/`maybeSingle`, `range`/`limit` (o corte não se pode juntar entre lotes) e
 * qualquer consulta com listas curtas.
 */

export const IN_CHUNK = 150;

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
type Row = Record<string, unknown>;
type OrderOptions = {
  ascending?: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
  referencedTable?: string;
};

function replay(db: Db, table: string, calls: Call[]) {
  let query = db.from(table) as AnyBuilder;
  for (const call of calls) query = query[call.method](...call.args);
  return query;
}

function longInIndex(calls: Call[]) {
  if (calls.some((call) => PASS_THROUGH.has(call.method))) return -1;
  if (!calls.some((call) => call.method === "select")) return -1;
  return calls.findIndex(
    (call) =>
      call.method === "in" &&
      Array.isArray(call.args[1]) &&
      // Pela lista tal como vai no URL (com repetidos): os lotes vão sem repetidos.
      (call.args[1] as unknown[]).length > IN_CHUNK,
  );
}

function compareValues(a: unknown, b: unknown, options: OrderOptions) {
  const ascending = options.ascending ?? true;
  // Como o Postgres: nulos no fim em ordem crescente, no início em decrescente.
  const nullsFirst = options.nullsFirst ?? !ascending;
  if (a == null || b == null) {
    if (a == null && b == null) return 0;
    return (a == null ? -1 : 1) * (nullsFirst ? 1 : -1);
  }
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a) < String(b)
        ? -1
        : String(a) > String(b)
          ? 1
          : 0;
  return ascending ? order : -order;
}

/** Volta a ordenar as linhas juntas pelas `.order(...)` da consulta (colunas da tabela). */
function sortLikeQuery(rows: Row[], calls: Call[]) {
  const orders = calls
    .filter((call) => call.method === "order")
    .map((call) => ({
      column: String(call.args[0]),
      options: (call.args[1] ?? {}) as OrderOptions,
    }))
    .filter(
      (order) =>
        !order.options.foreignTable &&
        !order.options.referencedTable &&
        !order.column.includes("."),
    );
  if (!orders.length) return rows;
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const diff = compareValues(a[order.column], b[order.column], order.options);
      if (diff) return diff;
    }
    return 0;
  });
}

async function execute(db: Db, table: string, calls: Call[]): Promise<Result> {
  const index = longInIndex(calls);
  if (index < 0) return replay(db, table, calls);

  const values = [...new Set(calls[index].args[1] as unknown[])];
  const options = calls.find((call) => call.method === "select")?.args[1] as
    { head?: boolean; count?: string } | undefined;
  const rows: Row[] = [];
  let count: number | null = options?.count ? 0 : null;
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    const chunkCalls = calls.map((call, position) =>
      position === index ? { method: "in", args: [call.args[0], chunk] } : call,
    );
    const part = await replay(db, table, chunkCalls);
    if (part.error) return { data: null, error: part.error, count: null };
    if (Array.isArray(part.data)) rows.push(...(part.data as Row[]));
    if (count != null) count += part.count ?? 0;
  }
  return { data: options?.head ? null : sortLikeQuery(rows, calls), error: null, count };
}

function recorder(db: Db, table: string, calls: Call[]): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === "then") {
          return (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
            execute(db, table, calls).then(resolve, reject);
        }
        if (property === "catch") {
          return (handler: (reason: unknown) => unknown) =>
            execute(db, table, calls).catch(handler);
        }
        if (property === "finally") {
          return (handler: () => void) => execute(db, table, calls).finally(handler);
        }
        if (typeof property !== "string") return undefined;
        return (...args: unknown[]) => recorder(db, table, [...calls, { method: property, args }]);
      },
    },
  );
}

export function chunkedInClient<T extends Db>(db: T): T {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property === "from") {
        return (table: string) => recorder(target, table, []);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
