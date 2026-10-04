import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tempo real: o cliente só recebe eventos de tabelas que existem na produção e estão
 * na publicação `supabase_realtime`. A 2026-10-04 o /faturas e o painel ouviam
 * `invoices` e `payments` (esquema antigo, não existem no SIGA) e as mensagens, o
 * /alunos e o painel ouviam tabelas que nunca foram publicadas: nada chegava.
 */

/** Publicadas na produção a 2026-10-04 (pg_publication_tables, só leitura). */
const PUBLICADAS_NA_PRODUCAO = [
  "document_requests",
  "school_announcements",
  "siga_chat_members",
  "siga_chat_messages",
];
const MIGRACAO_TEMPO_REAL =
  "supabase/migrations/20261004101000_realtime_publish_school_screens.sql";
const MIGRACAO_COMUNICADOS = "supabase/migrations/20261004100000_announcements_read_by_role.sql";

const snapshot = JSON.parse(readFileSync("supabase/PRODUCTION_SNAPSHOT.json", "utf8")) as {
  tabelas: Array<{ tabela: string }>;
};
const naProducao = new Set(snapshot.tabelas.map((t) => t.tabela));

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

/** Tabelas em `.on("postgres_changes", { … table: "x" … })` em todo o src. */
function tabelasSubscritas() {
  const encontradas = new Map<string, string[]>();
  for (const ficheiro of ficheiros("src")) {
    const codigo = readFileSync(ficheiro, "utf8");
    for (const m of codigo.matchAll(/"postgres_changes",\s*\{[^}]*?table:\s*"([a-z_]+)"/g)) {
      encontradas.set(m[1]!, [...(encontradas.get(m[1]!) ?? []), ficheiro]);
    }
  }
  return encontradas;
}

function publicadasPelaMigracao() {
  const sql = readFileSync(MIGRACAO_TEMPO_REAL, "utf8");
  const lista = sql.match(/FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\]/)?.[1] ?? "";
  return [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe("tempo real contra a produção", () => {
  const subscritas = tabelasSubscritas();

  it("encontra as subscrições do cliente (o teste vale alguma coisa)", () => {
    expect(subscritas.size).toBeGreaterThanOrEqual(8);
  });

  it("cada tabela subscrita existe na produção", () => {
    const inexistentes = [...subscritas.keys()].filter((t) => !naProducao.has(t));
    expect(inexistentes).toEqual([]);
  });

  it("cada tabela subscrita está publicada (na produção ou pela migração de 2026-10-04)", () => {
    const publicadas = new Set([...PUBLICADAS_NA_PRODUCAO, ...publicadasPelaMigracao()]);
    const porPublicar = [...subscritas.entries()]
      .filter(([t]) => !publicadas.has(t))
      .map(([t, onde]) => `${t} (${onde.join(", ")})`);
    expect(porPublicar).toEqual([]);
  });

  it("a migração só publica tabelas que existem e é idempotente", () => {
    const sql = readFileSync(MIGRACAO_TEMPO_REAL, "utf8");
    for (const t of publicadasPelaMigracao()) expect(naProducao.has(t), t).toBe(true);
    expect(sql).toContain("to_regclass('public.' || t) IS NULL");
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM pg_publication_tables/);
  });
});

describe("comunicados: leitura pela regra da lista", () => {
  const sql = readFileSync(MIGRACAO_COMUNICADOS, "utf8");

  it("restringe (RESTRICTIVE) a leitura: o pessoal vê todos, os outros só enviados e não do corpo docente", () => {
    expect(sql).toMatch(/AS RESTRICTIVE\s+FOR SELECT\s+TO authenticated/);
    expect(sql).toContain("private.is_school_staff(school_id)");
    expect(sql).toContain("status = 'sent' AND audience <> 'teaching_staff'");
    expect(sql).toContain('DROP POLICY IF EXISTS "Announcements visible by role"');
  });

  it("é a mesma regra que a lista do servidor aplica a alunos e encarregados", () => {
    const servidor = readFileSync("src/features/communications/server.ts", "utf8");
    expect(servidor).toContain('.eq("status", "sent").neq("audience", "teaching_staff")');
  });
});

describe("pacote para o SQL Editor", () => {
  it("leva as duas migrações tal como estão, com a confirmação no fim", () => {
    const pacote = readFileSync("docs/agents/SIGA_aplicar_comunicados_tempo_real.sql", "utf8");
    for (const migracao of [MIGRACAO_COMUNICADOS, MIGRACAO_TEMPO_REAL]) {
      expect(pacote, migracao).toContain(readFileSync(migracao, "utf8"));
    }
    expect(pacote).toMatch(/══════════ Confirmar ══════════[\s\S]*'Announcements visible by role'/);
  });
});
