import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O que fez o Lighthouse do main passar de 0,80-0,87 para 0,94-0,97 (PR #161-#163).
 * Cada regra aqui desfez um atraso medido no primeiro desenho; voltar atrás em
 * qualquer uma delas fazia a CI do main falhar outra vez.
 */
describe("orçamento do primeiro desenho", () => {
  it("browser-check.js não bloqueia o desenho (defer)", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    // Síncrono no <head>, ficava na fila atrás dos pré-carregamentos de JS e
    // o primeiro desenho esperava ~0,5 s por ele.
    expect(root).toMatch(/\{\s*src:\s*"\/browser-check\.js",\s*defer:\s*true\s*\}/);
  });

  it("o logótipo não carrega imagem nenhuma", () => {
    const logo = readFileSync("src/components/ui/siga-logo.tsx", "utf8");
    // O mascote (PNG de 1254 px, 670 KB) era pré-carregado em todas as páginas e
    // disputava a rede com o CSS; o webp de 256 px foi o remendo. A marca passou a
    // ser o letreiro em texto, por isso não há imagem nenhuma a carregar aqui.
    expect(logo).not.toMatch(/<img/);
    // Só o uso conta: o comentário do ficheiro explica de onde veio o mascote.
    expect(logo).not.toMatch(/src="\/brands\//);
  });

  it("o favicon é um ícone pequeno, não o logótipo grande", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    expect(root).toContain('href: "/favicon.png"');
    // A 12/10 o ficheiro foi trocado por um logótipo de 2007x783 (1,04 MB) e
    // o favicon real ficou ao lado como `#favicon.png`. Serve em cada página.
    const favicon = statSync("public/favicon.png");
    expect(favicon.size).toBeLessThan(32 * 1024);
    // Um favicon é quadrado; o logótipo que entrou por engano não era.
    const bytes = readFileSync("public/favicon.png");
    expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeLessThanOrEqual(256);
  });

  it("o vídeo do ecrã de entrada tem ficheiro e poster", () => {
    const gate = readFileSync("src/components/auth/AuthGate.tsx", "utf8");
    const video = readFileSync("src/components/auth/AuthBackgroundVideo.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    // O componente desmonta-se em silêncio se o ficheiro faltar: a 16/10 o mp4 foi
    // apagado por "sem uso" e o ecrã ficava sem vídeo sem ninguém dar por isso.
    expect(gate).toContain("<AuthBackgroundVideo />");
    expect(video).toContain('src="/auth-classroom.mp4"');
    expect(existsSync("public/auth-classroom.mp4")).toBe(true);
    // O poster embutido evita que o 1.º frame do vídeo seja o LCP (~2 s no CI).
    expect(css).toContain(".auth-hero-poster");
    expect(css).toContain("data:image/webp;base64,");
  });

  it("ícones e núcleo saem em poucos ficheiros (não um por ícone)", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    expect(vite).toContain('name: "icons"');
    expect(vite).toContain('name: "framework"');
  });

  it("o catálogo de temas não entra pelo provider de aparência", () => {
    const appearance = readFileSync("src/lib/appearance.tsx", "utf8");
    // `__root.tsx` monta o `AppearanceProvider`, por isso tudo o que este ficheiro
    // importa de forma estática fica nos 36 recursos da raiz. Os catálogos Shadcn e
    // Tweakcn somavam 109 833 bytes (10,2% da raiz) para o `applyAppearance` fazer
    // um `.find()` de um tema — e o estado por omissão não tem tema de catálogo.
    expect(appearance).not.toMatch(/^import .*config\/theme-data/m);
    // Sob demanda, e com guarda de geração para um catálogo atrasado não escrever
    // as variáveis de um estado já substituído.
    expect(appearance).toMatch(/import\("@\/config\/theme-data"\)/);
    expect(appearance).toContain("appearanceGeneration");
  });

  /**
   * Percorre o grafo de imports **estáticos** a partir da rota `/`, que é o que o
   * manifesto do router pré-carrega. As guardas por texto abaixo dizem *como* cada
   * caso foi corrigido; esta diz *o que* não pode voltar a acontecer, por qualquer
   * caminho — foi assim que se descobriu que o `PickFileButton` chegava por três
   * sítios diferentes (portais, `TeacherWorkspacePanel` e `UserProfileModal`).
   */
  function moduloEstaticoDoLogin() {
    const raiz = process.cwd();
    const src = resolve(raiz, "src");
    const estatico = /^[ \t]*(?:import|export)\s+(?:type\s+)?[^;]*?from\s*["']([^"']+)["']/gm;
    const simples = /^[ \t]*import\s*["']([^"']+)["']/gm;
    const resolver = (spec: string, de: string) => {
      let base: string;
      if (spec.startsWith("@/")) base = resolve(src, spec.slice(2));
      else if (spec.startsWith(".")) base = resolve(dirname(de), spec);
      else return { pacote: spec };
      for (const c of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`])
        if (existsSync(c) && statSync(c).isFile()) return { ficheiro: c };
      return {};
    };
    const vistos = new Set<string>();
    const pacotes = new Set<string>();
    const pilha = [resolve(raiz, "src/routes/__root.tsx"), resolve(raiz, "src/routes/index.tsx")];
    while (pilha.length) {
      const atual = pilha.pop() as string;
      if (vistos.has(atual)) continue;
      vistos.add(atual);
      let texto: string;
      try {
        texto = readFileSync(atual, "utf8");
      } catch {
        continue;
      }
      const specs: string[] = [];
      for (const m of texto.matchAll(estatico)) {
        // `import type` desaparece na compilação: não traz código nenhum.
        if (/^[ \t]*(?:import|export)\s+type\s/.test(m[0])) continue;
        specs.push(m[1]);
      }
      for (const m of texto.matchAll(simples)) specs.push(m[1]);
      for (const spec of specs) {
        const r = resolver(spec, atual);
        if (r.pacote) pacotes.add(r.pacote);
        else if (r.ficheiro && !vistos.has(r.ficheiro)) pilha.push(r.ficheiro);
      }
    }
    return { ficheiros: [...vistos].map((f) => relative(raiz, f)), pacotes };
  }

  it("os recursos sem hash têm cache, e o service worker não", () => {
    // O `_headers` gerado só cobria `/assets/*`, que tem hash no nome. Tudo o que
    // vive na raiz de `public/` ficava sem política: o Lighthouse do CI mediu
    // `cacheLifetimeMs=0` no vídeo e marcou os seus 1 716 789 bytes como
    // desperdício — rebuscados a cada visita.
    const vite = readFileSync("vite.config.ts", "utf8");
    // Delimitado por chavetas, não por outro identificador: `tanstackStart`
    // aparece antes, no import, e uma fatia até lá sairia vazia — a guarda
    // passaria a não verificar nada.
    const inicio = vite.indexOf("routeRules");
    expect(inicio, "o bloco routeRules desapareceu do vite.config.ts").toBeGreaterThan(0);
    const i = vite.indexOf("{", inicio);
    let profundidade = 0;
    let fim = i;
    for (; fim < vite.length; fim += 1) {
      if (vite[fim] === "{") profundidade += 1;
      else if (vite[fim] === "}") {
        profundidade -= 1;
        if (profundidade === 0) break;
      }
    }
    const bloco = vite.slice(i, fim + 1);
    expect(bloco.length, "o bloco routeRules saiu vazio").toBeGreaterThan(80);
    for (const alvo of ["/auth-classroom.mp4", "/fonts/**", "/icons/**", "/brands/**"]) {
      expect(bloco, `${alvo} perdeu a política de cache`).toContain(`"${alvo}"`);
    }
    // Sete dias com revalidação, não um ano imutável: estes nomes não têm hash,
    // por isso uma substituição tem de chegar aos visitantes em prazo humano.
    expect(bloco).toContain("max-age=604800");
    expect(bloco).toContain("stale-while-revalidate");
    expect(bloco).not.toContain("immutable");
    // O que **não** pode ser apanhado. Um service worker preso numa versão antiga
    // é muito pior do que um pedido a mais, e o `browser-check.js` corre em todas
    // as páginas. Nenhuma regra pode cobrir a raiz nem estes ficheiros.
    for (const proibido of [
      "/sw.js",
      "/firebase-messaging-sw.js",
      "/browser-check.js",
      "/manifest",
      "/**",
      "/*",
    ]) {
      expect(bloco, `${proibido} não pode ganhar cache`).not.toContain(`"${proibido}"`);
    }
  });

  it("o grafo estático do ecrã de entrada não alcança os pesos pesados", () => {
    const { ficheiros, pacotes } = moduloEstaticoDoLogin();
    // Cada um destes já esteve lá e já foi tirado; o teste existe para não voltarem.
    for (const alvo of [
      "src/features/dashboard/DashboardCharts.tsx",
      "src/features/arquivos/PickFileButton.tsx",
      "src/components/auth/UserProfileModal.tsx",
      "src/features/dashboard/portals/StudentPortalDashboard.tsx",
      "src/features/dashboard/portals/GuardianPortalDashboard.tsx",
      "src/features/dashboard/portals/TeacherPortalDashboard.tsx",
      "src/features/dashboard/portals/AdminPortalDashboard.tsx",
    ])
      expect(ficheiros, `${alvo} voltou ao grafo estático da rota /`).not.toContain(alvo);
    for (const pkg of ["recharts", "exceljs", "jspdf", "html2canvas"])
      expect(pacotes, `${pkg} voltou ao grafo estático da rota /`).not.toContain(pkg);
    // Se o extractor deixar de funcionar, o teste passa a não guardar nada.
    expect(ficheiros.length).toBeGreaterThan(200);
    expect(pacotes).toContain("react");
  });

  it("o ecrã de entrada não arrasta o pedaço dos gráficos", () => {
    // A rota `/` é o painel e desenha o login a quem não tem sessão. O manifesto
    // do router pré-carrega o grafo **estático** da rota: `/pedagogica`,
    // `/financeiro` e os relatórios têm zero pedaços de gráficos no seu
    // manifesto, mas `/` tinha o `DashboardCharts` — e o navegador seguia o
    // import estático dele para o pedaço `BarChart` (369 980 bytes) no ecrã de
    // entrada, apesar do `lazy()`. O esqueleto é marcação pura e vive à parte.
    const skeletonModule = "@/features/dashboard/DashboardChartsSkeleton";
    for (const path of [
      "src/routes/index.tsx",
      "src/features/dashboard/portals/AdminPortalDashboard.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain(`from "${skeletonModule}"`);
      // Só o import estático conta: o `lazy(() => import(...))` é o que se quer.
      expect(source).not.toMatch(/^import .*features\/dashboard\/DashboardCharts";$/m);
    }
    // Um import no módulo do esqueleto voltaria a ligá-lo ao grafo dos gráficos.
    const skeleton = readFileSync("src/features/dashboard/DashboardChartsSkeleton.tsx", "utf8");
    expect(skeleton).not.toMatch(/^import /m);
    expect(readFileSync("src/features/dashboard/DashboardCharts.tsx", "utf8")).not.toContain(
      "DashboardChartsSkeleton",
    );
  });

  it("os portais entram por papel, não todos no ecrã de entrada", () => {
    // Um utilizador vê um portal, o do seu papel. Importados estaticamente, os
    // quatro entravam no grafo da rota `/` — que desenha o login a quem não tem
    // sessão — e arrastavam 55 módulos só deles (`higher-ed/server.ts`,
    // `pedagogica/attendance-server.ts`, …). O grafo estático do login passou de
    // 412 para 358 módulos quando foram separados.
    const route = readFileSync("src/routes/index.tsx", "utf8");
    for (const portal of [
      "StudentPortalDashboard",
      "GuardianPortalDashboard",
      "TeacherPortalDashboard",
      "AdminPortalDashboard",
    ]) {
      expect(route).toMatch(
        new RegExp(`lazy\\(\\(\\) =>\\s*import\\("@/features/dashboard/portals/${portal}"\\)`),
      );
      expect(route).not.toMatch(new RegExp(`^import \\{[^}]*\\b${portal}\\b[^}]*\\} from`, "m"));
    }
    // O esqueleto da espera não pode voltar a ligar o login aos portais.
    const skeleton = readFileSync(
      "src/features/dashboard/portals/PortalDashboardSkeleton.tsx",
      "utf8",
    );
    expect(skeleton).not.toMatch(/^import /m);

    // Mesma armadilha, terceira vez: a dica do docente vinha do módulo que a rota
    // carrega por `lazy()`, e arrastava `ClassMaterialsPanel` -> `PickFileButton`.
    expect(route).toContain('from "@/features/academic/TeacherWorkspaceHint"');
    expect(route).not.toMatch(
      /^import \{[^}]*TeacherWorkspaceHint[^}]*\} from "@\/features\/academic\/TeacherWorkspacePanel"/m,
    );
    expect(readFileSync("src/features/academic/TeacherWorkspacePanel.tsx", "utf8")).not.toContain(
      "TeacherWorkspaceHint",
    );
  });
});
