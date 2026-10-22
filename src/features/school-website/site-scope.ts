/**
 * Âmbito do website de cada escola.
 *
 * O modelo (`site-pages.generated.json`) é um site de demonstração completo:
 * 56 páginas, 18 cursos inventados, 4 notícias, 3 eventos e 6 áreas de
 * formação. O próprio modelo assume-o — «Website demonstrativo», «Curso
 * demonstrativo · Não constitui oferta oficial». Servir isso sob o nome de uma
 * escola recém-criada publicaria, como oferta dela, cursos que ela não tem.
 *
 * Por isso a escola nasce com o âmbito mínimo: as páginas que dependem só da
 * sua identidade. As restantes ficam fora do site — não são servidas e não
 * aparecem em menu nenhum — até a escola as adoptar no editor, depois de lhes
 * dar conteúdo próprio. `narrowToScope` é o que faz o corte no HTML servido:
 * sem ele, a página inicial continuaria a anunciar o catálogo do modelo mesmo
 * com as páginas de curso já fora do ar.
 */

/** Páginas que só precisam da identidade da escola. Servidas desde o nascimento. */
export const IDENTITY_PAGES = ["/", "/contactos/", "/login/", "/blog/"] as const;

/**
 * Classes dos blocos que anunciam o catálogo do modelo: grelhas de curso,
 * cartões de notícia, áreas de formação, agenda, perguntas frequentes e o
 * buscador de cursos. Saem das páginas servidas enquanto a página de destino
 * não for adoptada. São classes do gerador em `painel/escolas`; mudar lá uma
 * destas classes é mudar aqui — `tests/school-website/site-scope.test.ts`
 * falha se um bloco de catálogo voltar a passar.
 */
const MODEL_BLOCK_CLASSES = [
  "finder",
  "course-card",
  "course-grid",
  "article-card",
  "area-card",
  "areas",
  "agenda",
  "event-card",
  "faq",
] as const;

/** Elementos onde um bloco de catálogo pode estar embrulhado. */
const BLOCK_TAGS = ["section", "div", "article", "li", "form"] as const;
/** Elementos que se podem apagar inteiros por apontarem para fora do âmbito. */
const CARD_TAGS = ["article", "li", "div"] as const;

/**
 * Um `div` só se apaga por apontar para fora se for um cartão — `contact-option`,
 * `quick-path-card`, `service-item`. Sem esta restrição o `div` apagado era o
 * contentor da página inteira, que também contém a ligação.
 */
const CARD_CLASS = /(?:^|-)(?:card|option|item|tile|cell|path)$/;

export function servedPages(adopted: readonly string[] = []): Set<string> {
  return new Set<string>([...IDENTITY_PAGES, ...adopted]);
}

export function isPageInScope(page: string, adopted: readonly string[] = []): boolean {
  const path = page.endsWith("/") ? page : page + "/";
  // O blog tem artigos por baixo de `/blog/`: o âmbito é o ramo, não a folha.
  if (path.startsWith("/blog/")) return true;
  return servedPages(adopted).has(path);
}

/**
 * Pares de abertura/fecho equilibrados de um elemento, do mais externo para o
 * mais interno. Um `<tag …/>` não abre nada. Serve para apagar um bloco inteiro
 * sem partir o HTML em volta — o que uma expressão regular por si só não faz.
 */
function spans(html: string, tag: string): Array<[number, number]> {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
  const open: number[] = [];
  const out: Array<[number, number]> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[0].startsWith("</")) {
      const start = open.pop();
      if (start !== undefined) out.push([start, match.index + match[0].length]);
    } else if (!match[0].endsWith("/>")) {
      open.push(match.index);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Apaga os elementos mais externos que satisfazem `drop`, de trás para a frente. */
function dropBlocks(
  html: string,
  tags: readonly string[],
  drop: (block: string) => boolean,
): string {
  for (const tag of tags) {
    const hits = spans(html, tag).filter(([start, end]) => drop(html.slice(start, end)));
    const outer = hits.filter(
      ([start], i) => !hits.some(([s2, e2], j) => j !== i && s2 < start && start < e2),
    );
    for (const [start, end] of outer.reverse()) html = html.slice(0, start) + html.slice(end);
  }
  return html;
}

function classesOf(block: string): string[] {
  const tag = block.slice(0, block.indexOf(">") + 1);
  return (tag.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

function isModelClass(name: string): boolean {
  return MODEL_BLOCK_CLASSES.some((model) => name === model || name.startsWith(model));
}

function isModelBlock(block: string): boolean {
  return classesOf(block).some(isModelClass);
}

/**
 * Uma secção que *contém* catálogo sai inteira, com o seu título. Apagar só a
 * grelha deixava para trás o cabeçalho e o subtítulo a anunciar uma oferta que
 * já não está na página («Conheça o nosso catálogo demonstrativo.»).
 */
function containsModelBlock(block: string): boolean {
  return [...block.matchAll(/class="([^"]*)"/g)].some((match) =>
    match[1].split(/\s+/).filter(Boolean).some(isModelClass),
  );
}

/**
 * Caminho interno de um `href`, sem query nem fragmento. `/cursos/?nivel=X`
 * conta como `/cursos/`: tratar a query como parte do caminho deixava passar
 * todos os itens de menu por nível de ensino.
 */
function internalPath(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const path = href.split(/[?#]/)[0];
  return path.endsWith("/") ? path : null;
}

function outOfScope(path: string, served: Set<string>): boolean {
  return !served.has(path) && !path.startsWith("/blog/");
}

/** Caminhos internos para onde o bloco aponta e que não são servidos. */
function linksOutOfScope(block: string, served: Set<string>): string[] {
  return [...block.matchAll(/href="([^"]*)"/g)]
    .map((match) => internalPath(match[1]))
    .filter((path): path is string => path !== null && outOfScope(path, served));
}

/** Um contentor sem texto, sem ligações e sem controlos deixou de dizer algo. */
function isEmptyShell(block: string): boolean {
  const inner = block.slice(block.indexOf(">") + 1, block.lastIndexOf("<"));
  if (/<(?:a|img|input|button|form|iframe|svg)\b/.test(inner)) return false;
  return !inner.replace(/<[^>]+>/g, "").trim();
}

/**
 * Corta do HTML servido tudo o que pertence ao catálogo do modelo ou aponta
 * para uma página fora do âmbito desta escola.
 */
export function narrowToScope(html: string, adopted: readonly string[] = []): string {
  const served = servedPages(adopted);
  let out = dropBlocks(html, ["section"], containsModelBlock);
  out = dropBlocks(out, BLOCK_TAGS, isModelBlock);
  out = dropBlocks(out, CARD_TAGS, (block) => {
    if (block.startsWith("<div") && !classesOf(block).some((name) => CARD_CLASS.test(name)))
      return false;
    return linksOutOfScope(block, served).length > 0;
  });
  // Ligações soltas (botões do herói, chamadas de acção, itens de menu).
  out = out.replace(/<a\b[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>/g, (whole, href: string) => {
    const path = internalPath(href);
    return path && outOfScope(path, served) ? "" : whole;
  });
  // Um menu suspenso sem nenhum item deixou de ser navegação: era «Estudar ⌄»
  // a abrir um painel com títulos e sem uma única ligação.
  out = dropBlocks(out, ["details"], (block) => !/<a\b[^>]*href="/.test(block));
  // Podar o que ficou vazio: menus sem itens, grelhas sem cartões.
  for (let pass = 0; pass < 3; pass += 1) {
    const before = out;
    out = dropBlocks(out, ["section", "div", "ul", "nav"], isEmptyShell);
    if (out === before) break;
  }
  return out;
}

/**
 * O âmbito em vigor para um estado do website. `null` significa «não há âmbito
 * declarado»: é o caso de um conteúdo publicado antes de o âmbito existir, e
 * esse continua a sair inteiro, para não encolher o site de quem já o publicou
 * de propósito. Sem publicação, o âmbito é o das páginas de identidade.
 */
export function siteScope(state: {
  published: { content: { adoptedPages?: readonly string[] } } | null;
}): readonly string[] | null {
  if (!state.published) return [];
  return state.published.content.adoptedPages ?? null;
}
