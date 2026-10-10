import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";
import { COLUNAS_ESPERA_MIGRACAO, FUNCOES_ESPERA_MIGRACAO } from "./espera-migracao";

/**
 * Nomes de coluna que o código pede e a base não tem.
 *
 * O caminho privilegiado (`loadSgaAdminClient`) não tem tipos — passa por
 * `sgaClient()`, que relaxa para `any` — por isso um nome de coluna errado não
 * é apanhado por nada. O PostgREST recusa o `select` inteiro, e o chamador
 * costuma tratar o erro como «não há dados».
 *
 * Aconteceu duas vezes, ambas encontradas a 2026-09-14:
 *
 *   · `dashboard/server.ts` pedia `people.birth_date` (é `date_of_birth`) num
 *     bloco com `catch` vazio — o cartão «aniversários hoje» mostrava zero
 *     desde sempre
 *   · `alumni/server.ts` pedia a mesma coluna e o perfil Alumni ficava sem
 *     dados pessoais nenhuns
 *
 * Este teste lê os `select("…")` do código e compara as colunas com o retrato
 * da produção. Não cobre tudo — `select("*")`, embeds e colunas em `.eq()`
 * ficam de fora — mas cobre a forma exacta que já falhou duas vezes.
 *
 * A 2026-09-16 passou a cobrir também o caminho de ESCRITA — `insert`, `update` e
 * `upsert`. Só os selects estavam a ser verificados, e o lado da escrita tinha 14
 * chamadas com colunas inventadas: `people.gender` (é `sex` — o mesmo nome que já
 * tinha sido corrigido nas leituras, e que ninguém corrigiu aqui),
 * `subjects.weekly_hours` (é `annual_hours`), `grade_levels.sort_order`/`status`
 * (são `sequence`/`is_active`), `saas_audit_logs.entity_type`/`actor_id` em seis
 * ficheiros de autenticação, e uma tabela inteira — `school_email_routes` — escrita
 * com uma forma que a produção nunca teve.
 *
 * Uma escrita recusada é pior do que uma leitura recusada: a leitura devolve um ecrã
 * vazio, a escrita faz o utilizador acreditar que gravou.
 */

const REPO = resolve(__dirname, "../..");

type Retrato = {
  tabelas: { tabela: string; colunas?: string[] }[];
  funcoes?: { schema: string; funcao: string }[];
};

const retrato = JSON.parse(
  readFileSync(resolve(REPO, "supabase/PRODUCTION_SNAPSHOT.json"), "utf8"),
) as Retrato;

/** Colunas por tabela, quando o retrato as traz. */
const colunasPorTabela = new Map<string, Set<string>>();
for (const t of retrato.tabelas) {
  if (t.colunas?.length) colunasPorTabela.set(t.tabela, new Set(t.colunas));
}

/** `.from("x").select("a, b, c")` — só a forma directa, sem embeds. */
function leiturasDoCodigo(): { ficheiro: string; tabela: string; colunas: string[] }[] {
  const achados: { ficheiro: string; tabela: string; colunas: string[] }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      const padrão =
        /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)(?:\s|\/\/[^\n]*\n)*\.select\(\s*"([^"]+)"/g;
      for (const m of código.matchAll(padrão)) {
        const [, tabela, lista] = m;
        if (lista.includes("(") || lista.includes("*")) continue; // embeds e select(*)
        achados.push({
          ficheiro: relative(REPO, full),
          tabela,
          colunas: lista.split(",").map((c) => c.trim().split(":")[0].trim()),
        });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

/**
 * Chaves de topo de um objecto literal (sem as chavetas). Também em objectos numa só
 * linha — `update({ status: "issued", updated_at: now })` passou por aqui porque só se lia
 * uma chave por linha, e a base recusava a escrita (a coluna não existe).
 */
function chavesDeTopo(corpo: string): string[] {
  const chaves: string[] = [];
  let nível = 0;
  let aspas: string | null = null;
  let segmento = "";
  const fecharSegmento = () => {
    const chave = segmento.match(/^\s*(?:\/\/[^\n]*\n\s*)*([a-z_][a-z0-9_]*)\s*:/i);
    if (chave) chaves.push(chave[1]);
    segmento = "";
  };
  for (let i = 0; i < corpo.length; i++) {
    const ch = corpo[i]!;
    if (aspas) {
      if (ch === "\\") i++;
      else if (ch === aspas) aspas = null;
      if (nível === 0) segmento += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") aspas = ch;
    else if ("{[(".includes(ch)) nível++;
    else if ("}])".includes(ch)) nível--;
    else if (ch === "," && nível === 0) {
      fecharSegmento();
      continue;
    }
    if (nível === 0 || "{[(".includes(ch)) segmento += ch;
  }
  fecharSegmento();
  return chaves;
}

/**
 * `.from("x").insert({ a: …, b: … })`, e o mesmo para `update`/`upsert`.
 *
 * Só conta as chaves de topo do objecto literal: um valor aninhado (`metadata: {…}`)
 * são dados dentro de uma coluna jsonb, não nomes de coluna. Escritas cujo payload é
 * uma variável (`insert(linha)`) ficam de fora — não há literal para ler.
 */
function escritasDoCodigo(): {
  ficheiro: string;
  tabela: string;
  operacao: string;
  colunas: string[];
}[] {
  const achados: {
    ficheiro: string;
    tabela: string;
    operacao: string;
    colunas: string[];
  }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      const padrão =
        /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)(?:\s|\/\/[^\n]*\n)*\.(insert|update|upsert)\(\s*\{/g;
      for (const m of código.matchAll(padrão)) {
        const [, tabela, operacao] = m;
        const início = (m.index ?? 0) + m[0].length - 1;

        // Equilibra chavetas para delimitar o objecto literal.
        let profundidade = 0;
        let fim = início;
        for (; fim < código.length; fim++) {
          if (código[fim] === "{") profundidade++;
          else if (código[fim] === "}") {
            profundidade--;
            if (profundidade === 0) break;
          }
        }
        const corpo = código.slice(início + 1, fim);

        const colunas = chavesDeTopo(corpo);

        achados.push({ ficheiro: relative(REPO, full), tabela, operacao, colunas });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

/**
 * Colunas de topo de um `select` que TEM embeds — `finance_invoices` com `students(…)`,
 * por exemplo. O leitor acima salta estas listas inteiras porque contêm `(`, e foi nessa
 * sombra que sobreviveram `finance_invoices.amount_paid`/`paid_at`/`payment_channel`,
 * `teachers.specialty` e `class_groups.room`: cinco exportações que devolviam sempre um
 * ficheiro vazio.
 *
 * Só as colunas de topo. O que está dentro de parêntesis pertence à tabela embebida, e o
 * nome antes do parêntesis é uma relação, não uma coluna.
 */
function colunasDeTopo(lista: string): string[] {
  const out: string[] = [];
  let profundidade = 0;
  let actual = "";
  for (const ch of lista) {
    if (ch === "(") {
      profundidade++;
      actual = ""; // "students(" — o que veio antes é o nome do embed
      continue;
    }
    if (ch === ")") {
      profundidade--;
      actual = "";
      continue;
    }
    if (ch === "," && profundidade === 0) {
      out.push(actual);
      actual = "";
      continue;
    }
    if (profundidade === 0) actual += ch;
  }
  out.push(actual);
  return out
    .map((c) => c.trim().split(":").pop()!.trim())
    .filter((c) => c && !c.includes("*") && /^[a-z_][a-z0-9_]*$/.test(c));
}

function leiturasComEmbed(): { ficheiro: string; tabela: string; colunas: string[] }[] {
  const achados: { ficheiro: string; tabela: string; colunas: string[] }[] = [];
  const padrão =
    /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)\s*\n?\s*\.select\(\s*(?:\n\s*)?["'`]([\s\S]*?)["'`]\s*[,)]/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      for (const m of código.matchAll(padrão)) {
        const [, tabela, lista] = m;
        if (!lista.includes("(")) continue; // sem embed: coberto pelo leitor directo
        achados.push({ ficheiro: relative(REPO, full), tabela, colunas: colunasDeTopo(lista) });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

/**
 * Colunas usadas em filtros — `.eq("coluna", …)` e companhia. Terceira superfície que
 * ninguém verificava, e onde estavam `tenant_domains.domain` (é `hostname`, no caminho de
 * autenticação), `profiles.email` (vive em `people` — a mesma correcção que as leituras já
 * tinham levado), `siga_attendance_records.date` (a data está na sessão) e seis
 * `.is("deleted_at", null)` sobre tabelas sem soft delete.
 *
 * A cadeia de um `.from(…)` vai até ao `.from(` seguinte. Filtros com "." no nome são
 * sobre recursos embebidos e ficam de fora.
 */
function filtrosDoCodigo(): {
  ficheiro: string;
  tabela: string;
  operacao: string;
  coluna: string;
}[] {
  const achados: { ficheiro: string; tabela: string; operacao: string; coluna: string }[] = [];
  const FROM = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  const FILTRO =
    /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*["'`]([^"'`]+)["'`]/g;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      for (const m of código.matchAll(FROM)) {
        const tabela = m[1];
        const início = (m.index ?? 0) + m[0].length;
        const próximo = código.indexOf(".from(", início);
        const cadeia = código.slice(
          início,
          Math.min(próximo === -1 ? código.length : próximo, início + 1200),
        );
        for (const f of cadeia.matchAll(FILTRO)) {
          const [, operacao, coluna] = f;
          if (coluna.includes(".") || coluna.includes("(")) continue;
          if (!/^[a-z_][a-z0-9_]*$/.test(coluna)) continue;
          achados.push({ ficheiro: relative(REPO, full), tabela, operacao, coluna });
        }
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

/**
 * Funções chamadas por `.rpc("nome")` que o esquema `public` não expõe.
 *
 * O PostgREST só chama o que está em `public`. Uma função que vive apenas em `private`
 * devolve PGRST202 — e o padrão desta base é precisamente ter o trabalho em `private` com
 * um wrapper fino em `public` (`register_payment`, `reverse_receipt`, …), por isso é fácil
 * chamar a privada por engano. Foi o que aconteceu com `next_document_number` no webhook
 * do gateway: a chamada falhava sempre, o erro era ignorado, e o recibo saía com um número
 * baseado no relógio em vez da sequência oficial da escola.
 */
function rpcsDoCodigo(): { ficheiro: string; funcao: string }[] {
  const achados: { ficheiro: string; funcao: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const código = readFileSync(full, "utf8");
      for (const m of código.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g)) {
        achados.push({ ficheiro: relative(REPO, full), funcao: m[1] });
      }
    }
  };
  walk(resolve(REPO, "src"));
  return achados;
}

const funcoesPublicas = new Set(
  (retrato.funcoes ?? []).filter((f) => f.schema === "public").map((f) => f.funcao),
);

/**
 * Funções `public` que o código chama e a produção ainda não tem, porque há uma migração
 * escrita e por aplicar. A lista só encolhe: o teste obriga a tirar a entrada quando o
 * retrato mostrar a função.
 *
 * `siga_publish_assessment_rule` e `siga_rate_limit_consume` saíram a 2026-09-28.
 * A 2026-10-02 saíram `settle_gateway_payment_service` (20261002090137) e
 * `hr_redeem_teacher_qr_secure`, com `20260926203852_harden_teacher_qr_attendance.sql` aplicada: a presença do docente por QR
 * esteve seis dias sem ser registada, porque `hr/teacher-lessons.ts` chamava-a desde
 * eaceb8f2 e a produção devolvia PGRST202.
 *
 * Vazia desde então, até 2026-10-10 (`siga_merge_people`). A lista está em
 * ./espera-migracao.ts, partilhada com `production-columns.test.ts`.
 */
/**
 * Colunas que o código grava e a produção ainda não tem porque há uma migração escrita e
 * por aplicar. Aplicar SQL à base é decisão do dono do projecto, não do agente — esta
 * lista é o registo explícito dessa espera, e o teste seguinte obriga-a a encolher.
 *
 * Está vazia desde 2026-09-16: `school_email_routes.cloudflare_route_id` era a única
 * entrada e a migração `20260916120000_…` foi aplicada nessa data, com o retrato
 * recapturado a seguir. Vazia é o estado correcto — uma entrada aqui é uma escrita que a
 * produção recusa.
 */
// Vazia outra vez desde 2026-09-28: as colunas do motor de importação
// (`import_jobs.*`) foram aplicadas e o retrato recapturado.
// Desde 2026-10-05 a lista está em ./espera-migracao.ts, partilhada com
// production-columns.test.ts, e vale também para os selects (só sondas que tratam o erro).
const ESPERA_MIGRACAO = COLUNAS_ESPERA_MIGRACAO;

const leituras = leiturasDoCodigo();
const escritas = escritasDoCodigo();
const comEmbed = leiturasComEmbed();
const filtros = filtrosDoCodigo();

describe("colunas pedidas vs colunas que existem", () => {
  it("o retrato traz colunas para comparar", () => {
    expect(
      colunasPorTabela.size,
      "o retrato não tem colunas por tabela — corra npm run siga:db-snapshot",
    ).toBeGreaterThan(50);
  });

  it("encontra leituras suficientes para a verificação valer", () => {
    expect(leituras.length).toBeGreaterThan(50);
  });

  it("nenhum select pede coluna que a tabela não tem", () => {
    const erradas: string[] = [];
    for (const leitura of leituras) {
      const colunas = colunasPorTabela.get(leitura.tabela);
      if (!colunas) continue; // tabela fora do retrato: outro teste trata disso
      for (const coluna of leitura.colunas) {
        if (!colunas.has(coluna) && !ESPERA_MIGRACAO.has(`${leitura.tabela}.${coluna}`)) {
          erradas.push(`${leitura.ficheiro}: ${leitura.tabela}.${coluna}`);
        }
      }
    }
    expect(
      erradas,
      `Estes selects pedem colunas que não existem: ${erradas.join("; ")}. ` +
        `O PostgREST recusa o select inteiro, e quase sempre o erro é tratado ` +
        `como "não há dados" — é assim que um cartão fica a zero para sempre.`,
    ).toEqual([]);
  });

  it("encontra escritas suficientes para a verificação valer", () => {
    expect(escritas.length).toBeGreaterThan(50);
  });

  it("nenhum insert/update grava coluna que a tabela não tem", () => {
    const erradas: string[] = [];
    for (const escrita of escritas) {
      const colunas = colunasPorTabela.get(escrita.tabela);
      if (!colunas) continue; // tabela fora do retrato: outro teste trata disso
      for (const coluna of escrita.colunas) {
        if (!colunas.has(coluna) && !ESPERA_MIGRACAO.has(`${escrita.tabela}.${coluna}`)) {
          erradas.push(`${escrita.ficheiro}: ${escrita.operacao} ${escrita.tabela}.${coluna}`);
        }
      }
    }
    expect(
      erradas,
      `Estas escritas gravam colunas que não existem: ${erradas.join("; ")}. ` +
        `O PostgREST recusa a escrita inteira — e ao contrário de uma leitura ` +
        `recusada, que dá um ecrã vazio, uma escrita recusada deixa o utilizador ` +
        `convencido de que gravou.`,
    ).toEqual([]);
  });

  it("nenhum select com embed pede coluna de topo que a tabela não tem", () => {
    const erradas: string[] = [];
    for (const leitura of comEmbed) {
      const colunas = colunasPorTabela.get(leitura.tabela);
      if (!colunas) continue;
      for (const coluna of leitura.colunas) {
        if (!colunas.has(coluna)) {
          erradas.push(`${leitura.ficheiro}: ${leitura.tabela}.${coluna}`);
        }
      }
    }
    expect(
      erradas,
      `Estes selects com embed pedem colunas que não existem: ${erradas.join("; ")}. ` +
        `O embed não protege nada: o PostgREST recusa a consulta na mesma, e a ` +
        `exportação sai vazia sem dizer porquê.`,
    ).toEqual([]);
  });

  it("encontra filtros suficientes para a verificação valer", () => {
    expect(filtros.length).toBeGreaterThan(100);
  });

  it("nenhum filtro aponta para coluna que a tabela não tem", () => {
    const erradas: string[] = [];
    for (const filtro of filtros) {
      const colunas = colunasPorTabela.get(filtro.tabela);
      if (!colunas) continue;
      if (colunas.has(filtro.coluna)) continue;
      if (ESPERA_MIGRACAO.has(`${filtro.tabela}.${filtro.coluna}`)) continue;
      erradas.push(
        `${filtro.ficheiro}: .${filtro.operacao}("${filtro.coluna}") em ${filtro.tabela}`,
      );
    }
    expect(
      erradas,
      `Estes filtros usam colunas que não existem: ${erradas.join("; ")}. ` +
        `Um filtro inválido não devolve zero linhas — faz o PostgREST recusar a ` +
        `consulta inteira, e o chamador lê isso como "não há dados".`,
    ).toEqual([]);
  });

  it("nenhuma chamada rpc aponta para função fora do esquema public", () => {
    const rpcs = rpcsDoCodigo();
    expect(rpcs.length, "não encontrou chamadas rpc para verificar").toBeGreaterThan(10);

    const invisiveis = [
      ...new Set(
        rpcs
          .filter((r) => !funcoesPublicas.has(r.funcao) && !FUNCOES_ESPERA_MIGRACAO.has(r.funcao))
          .map((r) => `${r.ficheiro}: ${r.funcao}`),
      ),
    ].sort();

    expect(
      invisiveis,
      `Estas funções não estão em public e o PostgREST não as alcança: ` +
        `${invisiveis.join("; ")}. Devolvem PGRST202, e o chamador quase sempre ` +
        `ignora o erro — o trabalho simplesmente não acontece.`,
    ).toEqual([]);
  });

  it("a lista de funções à espera de migração não tem entradas obsoletas", () => {
    const jaExistem = [...FUNCOES_ESPERA_MIGRACAO].filter((f) => funcoesPublicas.has(f));
    expect(jaExistem, `já estão na produção, tirar da lista: ${jaExistem.join(", ")}`).toEqual([]);
  });

  it("a lista de colunas à espera de migração não tem entradas obsoletas", () => {
    const jaExistem = [...ESPERA_MIGRACAO]
      .filter((entrada) => {
        const [tabela, coluna] = entrada.split(".");
        return colunasPorTabela.get(tabela)?.has(coluna);
      })
      .sort();

    expect(
      jaExistem,
      `A migração destas colunas já foi aplicada: ${jaExistem.join(", ")}. ` +
        `Retire-as de ESPERA_MIGRACAO — a lista existe para encolher até ficar vazia.`,
    ).toEqual([]);
  });
});
