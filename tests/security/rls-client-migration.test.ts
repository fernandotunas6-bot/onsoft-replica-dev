import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Progresso do ARQ-01, travado por teste.
 *
 * O isolamento entre escolas assenta hoje na camada TypeScript: quase tudo lê
 * com `loadSgaAdminClient()`, que usa o service role e ignora RLS. Um `.eq()`
 * esquecido devolve dados de outra escola e nada na base o impede.
 *
 * A migração é ficheiro a ficheiro, e cada troca exige evidência da base — não
 * do SQL versionado, que não descreve a produção. `npm run siga:rls-readiness`
 * produz essa evidência.
 *
 * Este teste faz duas coisas: impede que um módulo já migrado volte atrás, e
 * impede que o número de ficheiros privilegiados cresça sem alguém reparar.
 */

const REPO = resolve(__dirname, "../..");

/**
 * Migrados para `context.supabase`. Cada entrada diz porque foi seguro — a
 * política que o permite está no cabeçalho do próprio ficheiro.
 */
const MIGRADOS = [
  {
    ficheiro: "src/features/access/grants.ts",
    porque:
      "staff_module_grants tem política ALL para authenticated com " +
      "USING/CHECK is_school_member(school_id): cobre select, upsert e delete",
  },
];

/**
 * Usam o cliente privilegiado por razão de desenho, não por dívida. Não entram
 * na contagem de dívida abaixo.
 */
const PRIVILEGIO_POR_DESENHO = new Set([
  // Corre antes de existir sessão: resolve BI → e-mail no ecrã de entrada.
  // Não há JWT para levar, logo não há cliente de utilizador possível.
  "src/features/access/bi-login.ts",

  // Cria o tenant, a escola, a conta e a membership. Enquanto corre, o
  // utilizador ainda não é membro de nada — nenhuma política de escola lhe
  // daria acesso, porque a escola só existe no fim.
  "src/features/saas/provisioning-core.ts",

  // Resolve a escola pelo slug ou pelo hostname antes do ecrã de entrada. Sem
  // sessão não há JWT; a projecção pública é a protecção (ver SEC-04).
  "src/features/saas/tenant-lookup.ts",

  // Webhook de entrada da Resend: quem chama é a Resend, não um utilizador.
  // A assinatura Svix é a autenticação.
  "src/routes/api/integrations/resend.webhook.tsx",

  // Os três seguintes servem tanto o administrador de plataforma como o da
  // escola. O de plataforma não é membro de escola nenhuma, por isso as
  // políticas school-scoped recusá-lo-iam; a autorização vive em
  // `requirePlatformAdminFromRequest` / `requireTenantAccess`.
  "src/routes/api/saas/domains.poll.tsx",
  "src/routes/api/saas/email.routes.tsx",
  "src/routes/api/saas/mailboxes.tsx",
]);

/**
 * Lê código, não prosa.
 *
 * A primeira versão procurava a palavra em todo o ficheiro e acusou
 * `access/grants.ts` de ter voltado ao service role por causa de uma frase no
 * comentário que explica porque deixou de o usar. Um teste que não distingue
 * uma chamada de uma menção acaba a ensinar as pessoas a não escrever
 * comentários.
 */
function semComentarios(código: string): string {
  return código.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function usaClientePrivilegiado(código: string): boolean {
  return /loadSgaAdminClient\s*\(/.test(semComentarios(código));
}

function ficheirosComClientePrivilegiado(): string[] {
  const encontrados: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (usaClientePrivilegiado(readFileSync(full, "utf8"))) {
        encontrados.push(relative(REPO, full));
      }
    }
  };
  walk(resolve(REPO, "src"));
  return encontrados.sort();
}

const privilegiados = ficheirosComClientePrivilegiado();

/**
 * Tecto da dívida — ficheiros com privilégio que não está justificado acima.
 * Desce quando um módulo migra; nunca sobe sem alguém decidir que sobe.
 *
 * Em 2026-09-14, antes da primeira fatia, eram 82 ficheiros a usar o service
 * role. Depois de migrar `access/grants.ts` e de justificar os sete de
 * privilégio-por-desenho, a dívida real é 74.
 */
const TECTO_FICHEIROS_PRIVILEGIADOS = 74;

describe("migração para o cliente que respeita RLS (ARQ-01)", () => {
  it("o conjunto inspeccionado é o que se diz", () => {
    expect(privilegiados.length).toBeGreaterThan(50);
  });

  it.each(MIGRADOS)("$ficheiro não volta ao service role", ({ ficheiro, porque }) => {
    const caminho = resolve(REPO, ficheiro);
    expect(existsSync(caminho), `${ficheiro} desapareceu — actualize a lista`).toBe(true);
    const código = readFileSync(caminho, "utf8");

    expect(
      usaClientePrivilegiado(código),
      `${ficheiro} voltou a usar o service role. Foi migrado porque ${porque}. ` +
        `Se a política mudou, confirme com \`npm run siga:rls-readiness\` antes de reverter.`,
    ).toBe(false);

    expect(
      código.includes("context.supabase"),
      `${ficheiro} deixou de usar o cliente do utilizador`,
    ).toBe(true);
  });

  it("a dívida não cresce", () => {
    const emDívida = privilegiados.filter((f) => !PRIVILEGIO_POR_DESENHO.has(f));
    expect(
      emDívida.length,
      `${emDívida.length} ficheiros usam o cliente privilegiado (tecto: ${TECTO_FICHEIROS_PRIVILEGIADOS}). ` +
        `Se é código novo, prefira \`context.supabase\` — as políticas já existem para a maioria ` +
        `das tabelas nucleares. Se o privilégio é mesmo necessário, junte o ficheiro a ` +
        `PRIVILEGIO_POR_DESENHO com a razão escrita.`,
    ).toBeLessThanOrEqual(TECTO_FICHEIROS_PRIVILEGIADOS);
  });

  it("nenhum ficheiro migrado aparece na lista de privilégio por desenho", () => {
    const confusos = MIGRADOS.filter((m) => PRIVILEGIO_POR_DESENHO.has(m.ficheiro));
    expect(confusos.map((c) => c.ficheiro)).toEqual([]);
  });

  it("a lista de privilégio por desenho não tem entradas obsoletas", () => {
    const obsoletas = [...PRIVILEGIO_POR_DESENHO].filter((f) => !privilegiados.includes(f));
    expect(
      obsoletas,
      `já não usam o cliente privilegiado e podem sair da lista: ${obsoletas.join(", ")}`,
    ).toEqual([]);
  });
});
