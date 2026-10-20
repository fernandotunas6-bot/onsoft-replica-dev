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
const LINK = /\[([^\]]+)\]\(([^()\s]+)\)/g;

export function renderInline(value, esc, tag = 'em') {
  return esc(value)
    .replace(LINK, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<' + tag + '>$1</' + tag + '>');
}

export function renderHeadline(value, esc, tag = 'em') {
  return value.map(line => renderInline(line, esc, tag)).join('<br>');
}

/**
 * Ligação dentro de uma frase: `[o meu perfil](/portal/perfil/)`.
 *
 * As páginas de texto corrido têm ligações no meio dos parágrafos. Sem uma
 * convenção, o parágrafo teria de trazer `<a href>` — marcação, logo
 * inescapável. O destino é validado como caminho interno, como em toda a
 * navegação do site.
 */
export function richText(value, caminho) {
  emphasis(value, caminho);
  const rest = value.replace(LINK, (match, label, url) => {
    internalUrl(url, caminho);
    return label;
  });
  if (/[[\]]/.test(rest)) throw Error('Ligação mal formada em ' + caminho + ': ' + value);
  return value;
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

/**
 * Forma de um ficheiro de conteúdo, declarada em vez de escrita à mão.
 *
 * Uma cadeia é um validador (`'text'`, `'lines'`, `'action'`, …); um array de
 * um elemento é uma lista dessa forma; um objecto é um objecto com as mesmas
 * chaves. O caminho do erro é construído pelo caminho, pelo que uma chave em
 * falta continua a dizer onde está: `home.band.steps[1].title`.
 */
const SHAPES = {
  text: (value, caminho) => text(value, caminho),
  lines: (value, caminho) => lines(value, caminho),
  rich: (value, caminho) => richText(value, caminho),
  url: (value, caminho) => internalUrl(value, caminho),
  external: (value, caminho) => externalUrl(value, caminho),
  action: (value, caminho) => ({
    url: internalUrl(value?.url, caminho + '.url'),
    label: text(value?.label, caminho + '.label'),
  }),
  link: (value, caminho) => navLink(value, caminho),
  iconLink: (value, caminho) => ({...navLink(value, caminho), icon: text(value?.icon, caminho + '.icon')}),
};

export function shaped(value, shape, caminho) {
  if (typeof shape === 'string') {
    const check = SHAPES[shape];
    if (!check) throw Error('Forma desconhecida em ' + caminho + ': ' + shape);
    return check(value, caminho);
  }
  if (Array.isArray(shape)) return list(value, caminho).map((item, i) => shaped(item, shape[0], `${caminho}[${i}]`));
  const out = {};
  for (const [key, inner] of Object.entries(shape)) {
    // `chave?` é opcional: ausente dá null, presente é validada como as outras.
    const optional = key.endsWith('?');
    const name = optional ? key.slice(0, -1) : key;
    const found = value?.[name];
    out[name] = optional && (found === undefined || found === null) ? null : shaped(found, inner, caminho + '.' + name);
  }
  return out;
}

/** Lê um ficheiro de conteúdo e valida-o contra uma forma. */
export function loadPage(name, shape) {
  return shaped(loadContent(name), shape, name);
}

/** Página de entrada: oito secções, todas com texto próprio. */
export function loadHome() {
  return loadPage('home', {
    title: 'text',
    hero: {
      eyebrow: 'text', headline: 'lines', text: 'lines',
      primary: 'action', secondary: 'action', small: 'lines',
      photoAlt: 'text', photoCaption: 'text', float: 'lines', badge: 'text', side: 'text',
    },
    finder: {eyebrow: 'text', link: 'link', tagsLabel: 'text', tags: ['link']},
    marquee: ['text'],
    quickPathsLabel: 'text',
    quickPaths: [{url: 'url', icon: 'text', title: 'text', text: 'text'}],
    areas: {eyebrow: 'text', headline: 'lines', text: 'lines', countLabel: 'text'},
    courses: {eyebrow: 'text', headline: 'lines', link: 'action', note: 'text'},
    split: {
      photoAlt: 'text', photoLabel: 'lines', eyebrow: 'text', headline: 'lines',
      text: 'text', items: ['text'], link: 'action',
    },
    band: {
      eyebrow: 'text', headline: 'lines',
      steps: [{number: 'text', title: 'text', text: 'text'}],
      action: 'action',
    },
    articles: {eyebrow: 'text', headline: 'lines', link: 'action'},
  });
}

/** Texto corrido: títulos, parágrafos com ligações e, às vezes, uma lista. */
const PROSE = {
  title: 'text', crumb: 'text',
  sections: [{
    title: 'text',
    paragraphs: ['rich'],
    'links?': [{url: 'external', label: 'text', text: 'text'}],
  }],
};

/**
 * Marcadores que o gerador resolve na página de curso, antes do `brand()`.
 *
 * O conteúdo do curso é um molde para 18 páginas: o que varia entra por
 * marcador. Esta lista é o contrato entre o conteúdo e o gerador — o build
 * verifica que os valores que fornece são exactamente estes.
 */
export const GENERATOR_TOKENS = ['COURSE', 'EVENT', 'TOTAL'];

export const COURSE_TOKENS = [
  'COURSE', 'DESCRIPTION', 'LEVEL', 'DURATION', 'MODE', 'SHIFT', 'UNIT',
  'STRUCTURE', 'LANGUAGE', 'DELIVERY', 'PRACTICE', 'ASSESSMENT', 'RESOURCES', 'ACCESS',
];

/** Cartões e caixas de pesquisa que aparecem em várias páginas. */
export function loadComponents() {
  return loadPage('components', {
    courseCard: {favouriteLabel: 'text', link: 'text', compare: 'text'},
    articleCard: {tag: 'text', link: 'text'},
    eventCard: {tag: 'text', saveLabel: 'text', save: 'text'},
    searchBox: {
      queryLabel: 'text', placeholder: 'text',
      levelLabel: 'text', levelAll: 'text', button: 'text',
    },
  });
}

/** Páginas institucionais: uma forma por página, o ficheiro em content/pages/. */
export const PAGE_SHAPES = {
  sobre: {
    title: 'text', crumb: 'text',
    split: {
      photoAlt: 'text', photoLabel: 'lines', eyebrow: 'text', headline: 'lines',
      paragraphs: ['text'], link: 'action',
    },
    ideas: {headline: 'lines', items: [{icon: 'text', title: 'text', text: 'text'}]},
  },
  'vida-academica': {
    title: 'text', crumb: 'text', photoAlt: 'text', photoLabel: 'text',
    items: [{title: 'text', text: 'text', link: 'action'}],
    articles: {headline: 'lines', ids: ['text']},
  },
  campus: {
    title: 'text', crumb: 'text', altSuffix: 'text',
    spaces: [{image: 'text', title: 'text', text: 'text'}],
  },
  servicos: {
    title: 'text', crumb: 'text', eyebrow: 'text', headline: 'lines',
    text: 'lines', cardLabel: 'text',
  },
  // As três páginas de texto corrido partilham a mesma forma.
  privacidade: PROSE,
  acessibilidade: PROSE,
  'sobre-o-projecto': PROSE,
  favoritos: {
    title: 'text', crumb: 'text',
    empty: {icon: 'text', title: 'text', text: 'text', action: 'action'},
  },
  comparar: {title: 'text', crumb: 'text', addLabel: 'text', placeholder: 'text', addButton: 'text'},
  candidaturas: {title: 'text', crumb: 'text', next: {title: 'text', text: 'text', link: 'action'}},
  noticias: {title: 'text', crumb: 'text'},
  pesquisa: {title: 'text', crumb: 'text', label: 'text', placeholder: 'text', button: 'text'},
  ajuda: {
    title: 'text', crumb: 'text',
    aside: {title: 'text', text: 'text', placeholder: 'text', searchLabel: 'text'},
    help: {title: 'text', text: 'text', link: 'action'},
    empty: 'text',
  },
  // Duas rotas, um ficheiro: a agenda e o calendário mostram a mesma lista.
  agenda: {
    events: {title: 'text', crumb: 'text'},
    calendar: {title: 'text', crumb: 'text'},
    month: 'text', timezone: 'text',
  },
  login: {
    title: 'text', crumb: 'text',
    story: {eyebrow: 'text', headline: 'lines', text: 'text', photoAlt: 'text'},
    card: {
      icon: 'text', title: 'text', text: 'text',
      hostedLabel: 'text', portalLabel: 'text', hint: 'text',
      separator: 'text', demoLabel: 'text', note: 'text', links: ['link'],
    },
  },
  biblioteca: {
    title: 'text', crumb: 'text', headline: 'lines', text: 'lines', cardLabel: 'text',
    resources: [{icon: 'text', eyebrow: 'text', title: 'text', text: 'text', url: 'external'}],
    guide: {title: 'text', text: 'text', link: 'action'},
  },
  cursos: {
    title: 'text', crumb: 'text',
    search: {label: 'text', placeholder: 'text', button: 'text'},
    favourites: {icon: 'text', label: 'text'},
    compare: {icon: 'text', label: 'text'},
    mobileFilters: {icon: 'text', label: 'text', hint: 'text'},
    countLabel: 'text',
    sort: {label: 'text', featured: 'text', az: 'text', duration: 'text'},
    empty: {icon: 'text', title: 'text', text: 'text', button: 'text'},
    compareBar: {text: 'text', button: 'text'},
    filters: {
      title: 'text', clear: 'text',
      area: {label: 'text', all: 'text'},
      level: {label: 'text', all: 'text'},
      mode: {label: 'text'},
      shift: {label: 'text', all: 'text'},
      unit: {label: 'text', all: 'text'},
      help: {title: 'text', text: 'text', link: 'link'},
    },
  },
  contactos: {
    title: 'text', crumb: 'text',
    aside: {
      headline: 'lines', text: 'text',
      options: [{icon: 'text', title: 'text', 'text?': 'text', 'link?': 'action'}],
    },
    form: {
      title: 'text', text: 'text',
      name: {label: 'text', placeholder: 'text'},
      email: {label: 'text', placeholder: 'text'},
      subject: {label: 'text', placeholder: 'text', options: ['text']},
      message: {label: 'text', placeholder: 'text'},
      submit: 'text', hint: 'text',
    },
  },
  ingresso: {
    title: 'text', crumb: 'text', action: 'action',
    ways: {
      eyebrow: 'text', headline: 'lines', text: 'lines', linkLabel: 'text',
      items: [{number: 'text', title: 'text', text: 'text', url: 'url'}],
    },
    checklist: {
      eyebrow: 'text', headline: 'lines', text: 'text', link: 'action',
      steps: [{number: 'text', title: 'text', text: 'text'}],
    },
  },
  candidatura: {
    title: 'text', crumb: 'text',
    aside: {
      eyebrow: 'text',
      steps: [{number: 'text', title: 'text', text: 'text'}],
      help: {title: 'text', text: 'text', link: 'link'},
    },
    step1: {
      eyebrow: 'text', title: 'text', text: 'text',
      course: {label: 'text', placeholder: 'text'},
      via: {label: 'text', placeholder: 'text', options: ['text']},
      period: {label: 'text', placeholder: 'text', options: ['text']},
    },
    step2: {
      eyebrow: 'text', title: 'text', text: 'text',
      name: {label: 'text', placeholder: 'text'},
      email: {label: 'text', placeholder: 'text'},
      province: {label: 'text', placeholder: 'text', options: ['text']},
      motivation: {label: 'text', placeholder: 'text'},
      checklist: {title: 'text', text: 'text', items: ['text']},
    },
    step3: {eyebrow: 'text', title: 'text', text: 'text', consent: 'text'},
    controls: {back: 'text', draft: 'text', next: 'text'},
  },
  // Um ficheiro para as 18 páginas de curso: o que muda entre elas são os dados.
  curso: {
    hero: {
      codeLabel: 'text', apply: {label: 'text'}, save: {icon: 'text', label: 'text'},
      note: 'text', photoAlt: 'text',
    },
    subnav: {label: 'text', items: [{anchor: 'text', label: 'text'}]},
    presentation: {eyebrow: 'text', headline: 'lines', paragraphs: ['text']},
    skills: {eyebrow: 'text', title: 'text', text: 'text', audienceTitle: 'text', startLabel: 'text'},
    plan: {eyebrow: 'text', title: 'text', text: 'text', moduleCaption: 'text'},
    method: {
      eyebrow: 'text', title: 'text',
      cards: [{icon: 'text', title: 'text', text: 'text'}],
      resources: {summary: 'text', text: 'text', link: 'action'},
    },
    careers: {eyebrow: 'text', title: 'text', text: 'text'},
    entry: {
      title: 'text', text: 'text', link: 'action',
      requirement: {icon: 'text', title: 'text', text: 'text'},
    },
    questions: {title: 'text', items: [{question: 'text', answer: 'text'}]},
    summary: {
      eyebrow: 'text', fields: [{label: 'text', value: 'text'}],
      apply: 'text', guide: 'text', compare: 'text', contact: 'link',
    },
    mobile: {label: 'text', tag: 'text', button: 'text'},
    related: {eyebrow: 'text', title: 'text', link: 'action'},
  },
  artigo: {
    tag: 'text',
    byline: {author: 'text', date: 'text', datetime: 'text', readingTime: 'text'},
    coverAlt: 'text',
    share: {copy: 'text', link: 'action'},
  },
  portal: {
    label: 'text', navLabel: 'text',
    sidebar: {links: ['iconLink'], signOut: {icon: 'text', label: 'text'}},
    profile: {initials: 'text', name: 'text', role: 'text', viewLabel: 'text'},
    header: {menuLabel: 'text', eyebrow: 'text', searchLabel: 'text', noticesLabel: 'text'},
    demoStrip: {icon: 'text', title: 'text', text: 'text', link: 'link'},
    pageEyebrow: 'text', semester: 'text',
    footer: {text: 'text', link: 'link'},
  },
  'escolher-curso': {
    title: 'text', crumb: 'text',
    questions: {headline: 'lines', items: [{title: 'text', text: 'text'}]},
    areas: {eyebrow: 'text', headline: 'lines', text: 'lines', cardLabel: 'text'},
    steps: {headline: 'lines', items: [{number: 'text', title: 'text', text: 'text', link: 'action'}]},
  },
  'planear-custos': {
    title: 'text', crumb: 'text',
    form: {
      title: 'text', text: 'text', amountPlaceholder: 'text', selectPlaceholder: 'text',
      trainingLegend: 'text', livingLegend: 'text',
      // As chaves são os nomes dos campos que o app.js lê.
      fields: {
        tuition: {label: 'text', hint: 'text'},
        installments: {label: 'text'},
        upfront: {label: 'text', hint: 'text'},
        months: {label: 'text'},
        transport: {label: 'text', hint: 'text'},
        meals: {label: 'text', hint: 'text'},
        housing: {label: 'text', hint: 'text'},
        other: {label: 'text', hint: 'text'},
      },
      submit: 'text', reset: 'text',
    },
    summary: {
      label: 'text', eyebrow: 'text', title: 'text', state: 'text', resultLabel: 'text',
      rows: {
        'budget-tuition': 'text', 'budget-living': 'text',
        'budget-upfront': 'text', 'budget-total': 'text',
      },
      download: 'text', note: 'text', link: 'action',
    },
    inlineCta: {text: 'text', action: 'action'},
  },
  'preparar-candidatura': {
    title: 'text', crumb: 'text',
    summary: {title: 'text', count: 'text', download: 'text', reset: 'text', progressLabel: 'text'},
    inlineCta: {text: 'text', action: 'action'},
  },
  'percursos-de-ingresso': {
    title: 'text', crumb: 'text',
    questions: {headline: 'lines', items: [{title: 'text', text: 'text'}]},
    faq: {headline: 'lines', items: [{question: 'text', answer: 'text'}]},
    inlineCta: {text: 'text', action: 'action'},
  },
  'novos-estudantes': {
    title: 'text', crumb: 'text',
    first: {headline: 'lines', items: [{title: 'text', text: 'text', link: 'action'}]},
    second: {headline: 'lines', items: [{title: 'text', text: 'text', link: 'action'}]},
    inlineCta: {text: 'text', action: 'action'},
  },
  // As nove páginas do portal demonstrativo.
  'portal-inicio': {
    title: 'text',
    welcome: {
      eyebrow: 'text', greeting: 'text', question: 'text', text: 'text',
      action: 'action', note: 'lines',
    },
    stats: [{icon: 'text', value: 'text', label: 'text', color: 'text'}],
    week: {title: 'text', link: 'link', days: ['text'], note: 'text'},
    quick: {title: 'text', items: [{url: 'url', icon: 'text', label: 'text'}]},
    radar: {title: 'text', link: 'link', note: 'text', saveLabel: 'text'},
  },
  'portal-disciplinas': {title: 'text', info: 'text', tag: 'text', link: 'text'},
  'portal-notas': {
    title: 'text', info: 'text',
    stats: [{icon: 'text', value: 'text', label: 'text', color: 'text'}],
    panel: {title: 'text', export: 'text'},
    columns: ['text'], rowSubtitle: 'text', gradeScale: 'text', rowStatus: 'text',
  },
  'portal-horarios': {
    title: 'text', info: 'text',
    panel: {title: 'text', grid: 'text', list: 'text'},
    timeColumn: 'text', days: ['text'], empty: 'text', listNote: 'text',
  },
  'portal-candidaturas': {title: 'text', inlineCta: {text: 'text', action: 'action'}},
  'portal-financeiro': {
    title: 'text', info: 'text',
    stats: [{icon: 'text', value: 'text', label: 'text', color: 'text'}],
    panel: {title: 'text', badge: 'text'},
    columns: ['text'], rows: ['text'],
    rowCategory: 'text', rowPeriod: 'text', rowValue: 'text', rowStatus: 'text',
    note: {title: 'text', text: 'text', link: 'action'},
  },
  'portal-documentos': {
    title: 'text', info: 'text', icon: 'text', status: 'text', download: 'text',
    cards: [{id: 'text', title: 'text', text: 'text'}],
    official: {title: 'text', text: 'text', link: 'action'},
  },
  'portal-pedidos': {
    title: 'text', info: 'text',
    form: {
      title: 'text', text: 'text',
      type: {label: 'text', placeholder: 'text', options: ['text']},
      description: {label: 'text', placeholder: 'text'},
      submit: 'text',
    },
    list: {title: 'text', icon: 'text'},
  },
  'portal-perfil': {
    title: 'text',
    profile: {initials: 'text', name: 'text', course: 'text', status: 'text'},
    preferences: {title: 'text', nameLabel: 'text', namePlaceholder: 'text', motionLabel: 'text', submit: 'text'},
    data: {title: 'text', text: 'text', export: 'text', clear: 'text', link: 'action'},
  },
  'mapa-do-site': {
    title: 'text', crumb: 'text',
    groups: {discover: 'text', courses: 'text', articles: 'text', portal: 'text'},
  },
};

/** Lê uma página de content/pages/, validada pela forma declarada acima. */
export function loadInstitutionalPage(name) {
  const shape = PAGE_SHAPES[name];
  if (!shape) throw Error('Página sem forma declarada em content.mjs: ' + name);
  return loadPage('pages/' + name, shape);
}
