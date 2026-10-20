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
 * Ênfase no conteúdo: `*assim*` passa a `<em>assim</em>` depois de esc().
 *
 * Os títulos do site destacam parte da frase. Sem uma convenção, o conteúdo
 * teria de trazer `<em>` — isto é, marcação — e deixaria de poder ser escapado.
 * Aqui a ênfase fecha-se sempre e tudo o que não seja ênfase é texto.
 */
export function emphasis(value, caminho) {
  text(value, caminho);
  const marks = (value.match(/\*/g) ?? []).length;
  if (marks % 2 !== 0 || /\*\s*\*/.test(value)) throw Error('Ênfase mal fechada em ' + caminho + ': ' + value);
  return value;
}

/**
 * Converte a ênfase do conteúdo em marcação, depois de o gerador escapar.
 *
 * O `esc` vem do gerador: o conteúdo é escapado primeiro e só depois ganha
 * `<em>`, pelo que um `<` no conteúdo nunca chega ao HTML como marcação.
 */
export function renderHeadline(value, esc) {
  return value.map(line => esc(line).replace(/\*([^*]+)\*/g, '<em>$1</em>')).join('<br>');
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
