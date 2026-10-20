import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLUNAS_ESPERA_MIGRACAO, FUNCOES_ESPERA_MIGRACAO } from "./espera-migracao";

/**
 * O código só lê e filtra colunas que existem na produção
 * (`supabase/PRODUCTION_SNAPSHOT.json`, regra de docs/agents/DATABASE_RULES.md).
 * Uma coluna inexistente não dá erro de compilação: dá um 400 em produção ou,
 * pior, uma leitura sempre vazia. Coluna nova → migração aplicada e retrato
 * recapturado antes do código que a usa, ou registada em ./espera-migracao.ts com o
 * código a funcionar sem ela até lá.
 */
type Snapshot = {
  tabelas: Array<{ tabela: string; colunas: string[] }>;
  funcoes: Array<{ schema: string; funcao: string }>;
  valores: Array<{ tabela: string; coluna: string; valores: string[] }>;
};
const snapshot = JSON.parse(readFileSync("supabase/PRODUCTION_SNAPSHOT.json", "utf8")) as Snapshot;
const columns = new Map(snapshot.tabelas.map((t) => [t.tabela, new Set(t.colunas)]));
// Contratos atómicos já presentes no retrato; conservar a mensagem de indisponibilidade.
const workflowFunctions = ["siga_enroll_new_student_atomic", "siga_save_active_academic_year"];

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts")) out.push(path);
  }
  return out;
}

function chainAfter(source: string, index: number) {
  let chain = source.slice(index, index + 1500);
  const end = chain.indexOf(";");
  if (end >= 0) chain = chain.slice(0, end);
  const next = chain.indexOf(".from(");
  return next >= 0 ? chain.slice(0, next) : chain;
}

describe("colunas usadas existem na produção", () => {
  const problems: string[] = [];
  for (const file of walk("src")) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?<!storage)\.from\("([a-z_0-9]+)"\)/g)) {
      const table = match[1]!;
      const known = columns.get(table);
      if (!known) continue; // vistas e tabelas fora do retrato
      const chain = chainAfter(source, match.index! + match[0].length);
      const where = `${file}:${source.slice(0, match.index).split("\n").length}`;
      const select = chain.match(/^\s*\.select\(\s*(["'`])([^"'`]*)\1/);
      if (select && !/[(:*${]/.test(select[2]!)) {
        for (const column of select[2]!
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)) {
          if (!known.has(column) && !COLUNAS_ESPERA_MIGRACAO.has(`${table}.${column}`)) {
            problems.push(`${where} select ${table}.${column}`);
          }
        }
      }
      for (const filter of chain.matchAll(
        /\.(eq|neq|in|is|order|gt|gte|lt|lte|like|ilike|contains)\(\s*"([a-z_0-9]+)"/g,
      )) {
        if (!known.has(filter[2]!) && !COLUNAS_ESPERA_MIGRACAO.has(`${table}.${filter[2]}`)) {
          problems.push(`${where} ${filter[1]} ${table}.${filter[2]}`);
        }
      }
    }
  }

  it("select e filtros", () => {
    expect(problems).toEqual([]);
  });

  it("funções chamadas por .rpc() existem na produção", () => {
    const functions = new Set(
      snapshot.funcoes.filter((f) => f.schema === "public").map((f) => f.funcao),
    );
    const missing: string[] = [];
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\.rpc\(\s*"([a-z_0-9]+)"/g)) {
        if (!functions.has(match[1]!) && !FUNCOES_ESPERA_MIGRACAO.has(match[1]!)) {
          missing.push(`${file}: ${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("a RPC pendente de paragens tem SQL real, grants restritos e recusa sem função", () => {
    const rpc = "siga_transport_save_stops_atomic";
    expect(FUNCOES_ESPERA_MIGRACAO.has(rpc)).toBe(true);
    const migration = readFileSync(
      "supabase/migrations/20261018120000_school_transport.sql",
      "utf8",
    );
    const core = readFileSync("src/features/transport/transport-core.server.ts", "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public." + rpc + "(");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.siga_transport_save_stops_atomic");
    expect(core).toContain('if (!db.rpc) throw new TransportError("TRANSPORT_NOT_READY")');
    expect(core).toContain("fail(result.error)");
  });

  it("a RPC de estado do dia tem migração restrita e comparação transaccional", () => {
    const rpc = "siga_transport_set_day_status_atomic";
    expect(FUNCOES_ESPERA_MIGRACAO.has(rpc)).toBe(true);
    const migration = readFileSync(
      "supabase/migrations/20261018120000_school_transport.sql",
      "utf8",
    );
    const core = readFileSync("src/features/transport/transport-core.server.ts", "utf8");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public." + rpc + "(");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public." + rpc);
    expect(migration).toContain("INSERT INTO public.notifications");
    expect(migration).toContain("p_recipient_user_ids uuid[]");
    expect(migration).toContain("JOIN public.student_guardians AS g");
    expect(migration).toContain("JOIN public.students AS s");
    expect(migration).toContain("supplied_user_ids IS DISTINCT FROM expected_user_ids");
    expect(core).toContain("p_recipient_user_ids: userIds");
    expect(core).not.toContain("insertInAppNotifications(");
    expect(core).toContain('if (!db.rpc) throw new TransportError("TRANSPORT_NOT_READY")');
    expect(core).toContain("siga_transport_set_day_status_atomic");
    expect(core).toContain('saved.error?.code === "PGRST202"');
  });

  it("RPCs atómicos têm migração e falham de forma explícita se indisponíveis", () => {
    const sql = readFileSync(
      "supabase/migrations/20261007083733_atomic_student_enrollment_and_academic_year.sql",
      "utf8",
    );
    const client = readFileSync("src/integrations/supabase/workflow-rpcs.ts", "utf8");
    for (const name of workflowFunctions) {
      expect(sql).toContain(`FUNCTION public.${name}(`);
      expect(client).toContain(name);
    }
    expect(client).toContain('error?.code === "PGRST202"');
  });

  it("valores literais de estado são os que a base aceita", () => {
    const allowed = new Map(
      snapshot.valores.map((v) => [`${v.tabela}.${v.coluna}`, new Set(v.valores)]),
    );
    const wrong: string[] = [];
    const check = (where: string, key: string, value: string) => {
      const values = allowed.get(key);
      if (values && !values.has(value)) wrong.push(`${where} ${key}=${value}`);
    };
    for (const file of walk("src")) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/(?<!storage)\.from\("([a-z_0-9]+)"\)/g)) {
        const table = match[1]!;
        const chain = chainAfter(source, match.index! + match[0].length);
        const where = `${file}:${source.slice(0, match.index).split("\n").length}`;
        if (/^\s*\.(insert|update|upsert)\(/.test(chain)) {
          for (const pair of chain.matchAll(/\b([a-z_]+):\s*"([a-z_]+)"/g)) {
            check(where, `${table}.${pair[1]}`, pair[2]!);
          }
        }
        for (const filter of chain.matchAll(/\.(?:eq|neq)\(\s*"([a-z_]+)",\s*"([a-z_]+)"\)/g)) {
          check(where, `${table}.${filter[1]}`, filter[2]!);
        }
        for (const filter of chain.matchAll(/\.in\(\s*"([a-z_]+)",\s*\[([^\]]*)\]/g)) {
          for (const value of filter[2]!.matchAll(/"([a-z_]+)"/g)) {
            check(where, `${table}.${filter[1]}`, value[1]!);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
