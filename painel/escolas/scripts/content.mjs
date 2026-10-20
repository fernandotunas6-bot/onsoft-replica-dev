/**
 * Conteúdo editável do site, separado do gerador.
 *
 * Tudo o que está em `content/` destina-se a ser editado sem tocar em código:
 * textos, rótulos, ligações e listas. O gerador decide a estrutura das páginas;
 * o conteúdo decide o que elas dizem.
 *
 * Duas regras, ambas verificadas no build:
 *  - uma chave em falta é um erro, nunca uma página com um buraco;
 *  - o conteúdo é texto, não marcação: vai sempre por esc() no gerador.
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'content';

/** Lê um ficheiro de conteúdo. O nome não vem de dados, só de chamadas do gerador. */
export function loadContent(name) {
  const file = path.join(DIR, name + '.json');
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw Error('Ficheiro de conteúdo em falta: ' + file);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw Error('Conteúdo inválido em ' + file + ': ' + error.message);
  }
}

/** Texto obrigatório, não vazio. `caminho` é só para a mensagem de erro. */
export function text(value, caminho) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Texto obrigatório em falta: ' + caminho);
  return value;
}

/** Caminho interno do site: nunca um URL absoluto nem um protocolo. */
export function internalUrl(value, caminho) {
  text(value, caminho);
  if (!value.startsWith('/') || value.startsWith('//')) throw Error('Ligação interna inválida em ' + caminho + ': ' + value);
  return value;
}

/** Lista obrigatória, não vazia. */
export function list(value, caminho) {
  if (!Array.isArray(value) || value.length === 0) throw Error('Lista obrigatória vazia ou em falta: ' + caminho);
  return value;
}

/** Valida a navegação e devolve-a na forma que o gerador consome. */
export function loadNavigation() {
  const {menus} = loadContent('navigation');
  return list(menus, 'navigation.menus').map((menu, i) => {
    const base = `navigation.menus[${i}]`;
    const feature = menu.feature ?? {};
    return {
      title: text(menu.title, base + '.title'),
      feature: {
        title: text(feature.title, base + '.feature.title'),
        text: text(feature.text, base + '.feature.text'),
        url: internalUrl(feature.url, base + '.feature.url'),
        label: text(feature.label, base + '.feature.label'),
      },
      links: list(menu.links, base + '.links').map((link, j) => ({
        url: internalUrl(link.url, `${base}.links[${j}].url`),
        label: text(link.label, `${base}.links[${j}].label`),
        sub: text(link.sub, `${base}.links[${j}].sub`),
      })),
    };
  });
}

/** Sinalizador opcional: ausente é falso, presente tem de ser booleano. */
export function flag(value, caminho) {
  if (value !== undefined && typeof value !== 'boolean') throw Error('Sinalizador inválido em ' + caminho + ': esperado true ou false');
  return value === true;
}

/** Ligação de navegação simples: caminho interno, rótulo e marca de saída. */
function navLink(link, caminho) {
  const value = link ?? {};
  return {
    url: internalUrl(value.url, caminho + '.url'),
    label: text(value.label, caminho + '.label'),
    external: flag(value.external, caminho + '.external'),
  };
}

function navLinks(value, caminho) {
  return list(value, caminho).map((link, i) => navLink(link, `${caminho}[${i}]`));
}

/** Cabeçalho: barra superior, ligações simples, pesquisa e botão do portal. */
export function loadHeader() {
  const raw = loadContent('header');
  const topline = raw.topline ?? {};
  const search = raw.search ?? {};
  const portal = raw.portal ?? {};
  return {
    skipLink: text(raw.skipLink, 'header.skipLink'),
    homeLabel: text(raw.homeLabel, 'header.homeLabel'),
    navLabel: text(raw.navLabel, 'header.navLabel'),
    menuLabel: text(raw.menuLabel, 'header.menuLabel'),
    topline: {
      identity: text(topline.identity, 'header.topline.identity'),
      tagline: text(topline.tagline, 'header.topline.tagline'),
      links: navLinks(topline.links, 'header.topline.links'),
    },
    links: navLinks(raw.links, 'header.links'),
    search: {
      url: internalUrl(search.url, 'header.search.url'),
      label: text(search.label, 'header.search.label'),
    },
    portal: {
      url: internalUrl(portal.url, 'header.portal.url'),
      label: text(portal.label, 'header.portal.label'),
      mobileLabel: text(portal.mobileLabel, 'header.portal.mobileLabel'),
    },
  };
}

/** Rodapé: assinatura, colunas de ligações, aviso e barra legal. */
export function loadFooter() {
  const raw = loadContent('footer');
  return {
    tagline: list(raw.tagline, 'footer.tagline').map((line, i) => text(line, `footer.tagline[${i}]`)),
    locale: text(raw.locale, 'footer.locale'),
    columns: list(raw.columns, 'footer.columns').map((column, i) => ({
      title: text(column?.title, `footer.columns[${i}].title`),
      links: navLinks(column?.links, `footer.columns[${i}].links`),
    })),
    notice: text(raw.notice, 'footer.notice'),
    copyright: text(raw.copyright, 'footer.copyright'),
    legal: navLinks(raw.legal, 'footer.legal'),
    backToTop: text(raw.backToTop, 'footer.backToTop'),
  };
}

/**
 * Ênfase no conteúdo: `*assim*` e `**assim**`, depois de esc().
 *
 * Os títulos do site destacam parte da frase. Sem uma convenção, o conteúdo
 * teria de trazer `<em>` — isto é, marcação — e deixaria de poder ser escapado.
 * Aqui a ênfase fecha-se sempre e tudo o que não seja ênfase é texto.
 */
export function emphasis(value, caminho) {
  text(value, caminho);
  const rest = value.replace(/\*\*[^*]+\*\*/g, '').replace(/\*[^*]+\*/g, '');
  if (rest.includes('*')) throw Error('Ênfase mal fechada em ' + caminho + ': ' + value);
  return value;
}

/**
 * Converte a ênfase do conteúdo em marcação, depois de o gerador escapar.
 *
 * O `esc` vem do gerador: o conteúdo é escapado primeiro e só depois ganha
 * `<em>`, pelo que um `<` no conteúdo nunca chega ao HTML como marcação.
 *
 * O `tag` também vem do gerador. A faixa azul da entrada destaca com `<span>`
 * e não com `<em>`: o conteúdo diz que há ênfase, o gerador diz como se vê.
 */
export function renderHeadline(value, esc, tag = 'em') {
  return value
    .map(line =>
      esc(line)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<' + tag + '>$1</' + tag + '>'),
    )
    .join('<br>');
}

/** Título em várias linhas: cada linha é uma quebra no site. */
export function lines(value, caminho) {
  return list(value, caminho).map((line, i) => emphasis(line, `${caminho}[${i}]`));
}

/** Blocos que aparecem em todas as páginas: metadados, aviso e chamada final. */
export function loadSite() {
  const raw = loadContent('site');
  const meta = raw.meta ?? {};
  const cta = raw.cta ?? {};
  const action = (value, caminho) => ({
    url: internalUrl(value?.url, caminho + '.url'),
    label: text(value?.label, caminho + '.label'),
  });
  return {
    meta: {
      titleSuffix: text(meta.titleSuffix, 'site.meta.titleSuffix'),
      descriptionSuffix: text(meta.descriptionSuffix, 'site.meta.descriptionSuffix'),
    },
    breadcrumbHome: text(raw.breadcrumbHome, 'site.breadcrumbHome'),
    notice: text(raw.notice, 'site.notice'),
    cta: {
      eyebrow: text(cta.eyebrow, 'site.cta.eyebrow'),
      title: lines(cta.title, 'site.cta.title'),
      text: text(cta.text, 'site.cta.text'),
      primary: action(cta.primary, 'site.cta.primary'),
      secondary: action(cta.secondary, 'site.cta.secondary'),
    },
  };
}

/**
 * Ligação para fora do site: só https, sem credenciais.
 *
 * O site é de uma instituição, e um recurso externo — a agência de bolsas do
 * país, por exemplo — muda de escola para escola. É a única excepção a
 * `internalUrl()`, e é explícita: aparece num bloco `resources`, nunca numa
 * ligação de navegação.
 */
export function externalUrl(value, caminho) {
  text(value, caminho);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error('Ligação externa inválida em ' + caminho + ': ' + value);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('Ligação externa inválida em ' + caminho + ': ' + value);
  return value;
}

/** Páginas de serviço com a mesma forma: cabeçalho, três cartões e uma acção. */
export function loadSimplePages() {
  const raw = loadContent('simple-pages');
  return {
    inlineCta: text(raw.inlineCta, 'simple-pages.inlineCta'),
    pages: list(raw.pages, 'simple-pages.pages').map((page, i) => {
      const base = `simple-pages.pages[${i}]`;
      const resources = page.resources;
      return {
        url: internalUrl(page.url, base + '.url'),
        title: text(page.title, base + '.title'),
        eyebrow: text(page.eyebrow, base + '.eyebrow'),
        headline: lines(page.headline, base + '.headline'),
        description: text(page.description, base + '.description'),
        sectionTitle: text(page.sectionTitle, base + '.sectionTitle'),
        items: list(page.items, base + '.items').map((item, j) => ({
          title: text(item?.title, `${base}.items[${j}].title`),
          text: text(item?.text, `${base}.items[${j}].text`),
        })),
        action: {
          url: internalUrl(page.action?.url, base + '.action.url'),
          label: text(page.action?.label, base + '.action.label'),
        },
        resources: resources === undefined ? null : {
          secondary: {
            url: internalUrl(resources.secondary?.url, base + '.resources.secondary.url'),
            label: text(resources.secondary?.label, base + '.resources.secondary.label'),
          },
          prefix: text(resources.prefix, base + '.resources.prefix'),
          links: list(resources.links, base + '.resources.links').map((link, j) => ({
            url: externalUrl(link?.url, `${base}.resources.links[${j}].url`),
            label: text(link?.label, `${base}.resources.links[${j}].label`),
          })),
          notice: text(resources.notice, base + '.resources.notice'),
        },
      };
    }),
  };
}

/**
 * Cabeçalho de cada página, por rota: olho, título e descrição.
 *
 * A rota é a chave porque é o que o gerador conhece no sítio onde desenha o
 * cabeçalho. Uma rota sem entrada é erro no build, e não uma página sem título.
 */
export function loadPageHeads() {
  const raw = loadContent('page-heads');
  const heads = new Map();
  for (const [route, value] of Object.entries(raw ?? {})) {
    const base = `page-heads["${route}"]`;
    internalUrl(route, base);
    heads.set(route, {
      eyebrow: text(value?.eyebrow, base + '.eyebrow'),
      headline: lines(value?.headline, base + '.headline'),
      description: text(value?.description, base + '.description'),
    });
  }
  if (heads.size === 0) throw Error('Nenhum cabeçalho de página em content/page-heads.json');
  return heads;
}

/**
 * Avisos de demonstração, por chave.
 *
 * São os textos que dizem que a oferta, as candidaturas e os dados não são
 * oficiais. Na activação de uma escola real é isto que tem de ser reescrito, e
 * é por isso que estão juntos num ficheiro, e não espalhados pelo gerador.
 */
export function loadNotices() {
  const raw = loadContent('notices');
  const notices = new Map();
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!/^[a-z0-9-]{2,48}$/.test(key)) throw Error('Chave de aviso inválida em content/notices.json: ' + key);
    notices.set(key, text(value, `notices.${key}`));
  }
  if (notices.size === 0) throw Error('Nenhum aviso em content/notices.json');
  return notices;
}

/** Página de entrada: oito secções, todas com texto próprio. */
export function loadHome() {
  const raw = loadContent('home');
  const action = (value, caminho) => ({
    url: internalUrl(value?.url, caminho + '.url'),
    label: text(value?.label, caminho + '.label'),
  });
  const {hero, finder, areas, courses, split, band, articles} = raw;
  return {
    title: text(raw.title, 'home.title'),
    hero: {
      eyebrow: text(hero?.eyebrow, 'home.hero.eyebrow'),
      headline: lines(hero?.headline, 'home.hero.headline'),
      text: lines(hero?.text, 'home.hero.text'),
      primary: action(hero?.primary, 'home.hero.primary'),
      secondary: action(hero?.secondary, 'home.hero.secondary'),
      small: lines(hero?.small, 'home.hero.small'),
      photoAlt: text(hero?.photoAlt, 'home.hero.photoAlt'),
      photoCaption: text(hero?.photoCaption, 'home.hero.photoCaption'),
      float: lines(hero?.float, 'home.hero.float'),
      badge: text(hero?.badge, 'home.hero.badge'),
      side: text(hero?.side, 'home.hero.side'),
    },
    finder: {
      eyebrow: text(finder?.eyebrow, 'home.finder.eyebrow'),
      link: navLink(finder?.link, 'home.finder.link'),
      tagsLabel: text(finder?.tagsLabel, 'home.finder.tagsLabel'),
      tags: navLinks(finder?.tags, 'home.finder.tags'),
    },
    marquee: list(raw.marquee, 'home.marquee').map((word, i) => text(word, `home.marquee[${i}]`)),
    quickPathsLabel: text(raw.quickPathsLabel, 'home.quickPathsLabel'),
    quickPaths: list(raw.quickPaths, 'home.quickPaths').map((path, i) => ({
      url: internalUrl(path?.url, `home.quickPaths[${i}].url`),
      icon: text(path?.icon, `home.quickPaths[${i}].icon`),
      title: text(path?.title, `home.quickPaths[${i}].title`),
      text: text(path?.text, `home.quickPaths[${i}].text`),
    })),
    areas: {
      eyebrow: text(areas?.eyebrow, 'home.areas.eyebrow'),
      headline: lines(areas?.headline, 'home.areas.headline'),
      text: lines(areas?.text, 'home.areas.text'),
      countLabel: text(areas?.countLabel, 'home.areas.countLabel'),
    },
    courses: {
      eyebrow: text(courses?.eyebrow, 'home.courses.eyebrow'),
      headline: lines(courses?.headline, 'home.courses.headline'),
      link: action(courses?.link, 'home.courses.link'),
      note: text(courses?.note, 'home.courses.note'),
    },
    split: {
      photoAlt: text(split?.photoAlt, 'home.split.photoAlt'),
      photoLabel: lines(split?.photoLabel, 'home.split.photoLabel'),
      eyebrow: text(split?.eyebrow, 'home.split.eyebrow'),
      headline: lines(split?.headline, 'home.split.headline'),
      text: text(split?.text, 'home.split.text'),
      items: list(split?.items, 'home.split.items').map((item, i) => text(item, `home.split.items[${i}]`)),
      link: action(split?.link, 'home.split.link'),
    },
    band: {
      eyebrow: text(band?.eyebrow, 'home.band.eyebrow'),
      headline: lines(band?.headline, 'home.band.headline'),
      steps: list(band?.steps, 'home.band.steps').map((step, i) => ({
        number: text(step?.number, `home.band.steps[${i}].number`),
        title: text(step?.title, `home.band.steps[${i}].title`),
        text: text(step?.text, `home.band.steps[${i}].text`),
      })),
      action: action(band?.action, 'home.band.action'),
    },
    articles: {
      eyebrow: text(articles?.eyebrow, 'home.articles.eyebrow'),
      headline: lines(articles?.headline, 'home.articles.headline'),
      link: action(articles?.link, 'home.articles.link'),
    },
  };
}
