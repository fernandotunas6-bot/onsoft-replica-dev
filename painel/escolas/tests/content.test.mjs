import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContent, text, internalUrl, list, flag, emphasis, lines, renderHeadline, externalUrl, loadNavigation, loadHeader, loadFooter, loadSite, loadSimplePages, loadPageHeads, loadNotices, loadHome, shaped, PAGE_SHAPES, loadInstitutionalPage, loadComponents, renderInline, richText, COURSE_TOKENS, GENERATOR_TOKENS} from '../scripts/content.mjs';
import {resolveSchool, createBrand} from '../scripts/school.mjs';

test('uma chave em falta é um erro, não uma página com um buraco', () => {
  // A regra que torna o conteúdo editável sem risco: quem apaga uma linha do
  // JSON vê o build falhar, em vez de publicar uma página com um texto vazio.
  assert.throws(() => text(undefined, 'menu.title'), /Texto obrigatório em falta: menu\.title/);
  assert.throws(() => text('   ', 'menu.title'), /menu\.title/);
  assert.throws(() => text(42, 'menu.title'), /menu\.title/);
  assert.throws(() => list([], 'menu.links'), /Lista obrigatória vazia ou em falta: menu\.links/);
  assert.throws(() => list(undefined, 'menu.links'), /menu\.links/);
  assert.throws(() => list({0: 'a'}, 'menu.links'), /menu\.links/);
});

test('internalUrl recusa saídas do site', () => {
  // O conteúdo descreve a navegação do próprio site. Um URL absoluto aqui
  // seria uma ligação externa com a aparência de uma página interna.
  for (const value of ['https://exemplo.com/', '//exemplo.com/', 'javascript:alert(1)', 'cursos/', '']) {
    assert.throws(() => internalUrl(value, 'menu.url'), /menu\.url/, JSON.stringify(value));
  }
  assert.equal(internalUrl('/cursos/?nivel=Licenciatura', 'menu.url'), '/cursos/?nivel=Licenciatura');
});

test('loadContent distingue ficheiro em falta de ficheiro inválido', () => {
  assert.throws(() => loadContent('ficheiro-que-nao-existe'), /Ficheiro de conteúdo em falta/);
});

test('a navegação publicada passa a validação', () => {
  // Corre sobre o content/navigation.json real: se alguém o editar e partir
  // uma chave, este teste falha antes do build.
  const menus = loadNavigation();
  assert.ok(menus.length >= 1);
  const urls = [];
  for (const menu of menus) {
    assert.equal(typeof menu.title, 'string');
    assert.ok(menu.feature.url.startsWith('/'));
    assert.ok(menu.links.length >= 1);
    urls.push(menu.feature.url, ...menu.links.map(l => l.url));
  }
  for (const url of urls) assert.ok(url.startsWith('/'), url);
});

test('o conteúdo da navegação é texto, não marcação', () => {
  // build.mjs passa estes valores por esc(). O teste fixa a expectativa de
  // que o conteúdo publicado não depende disso para ficar legível.
  for (const menu of loadNavigation()) {
    const values = [menu.title, menu.feature.title, menu.feature.text, menu.feature.label, ...menu.links.flatMap(l => [l.label, l.sub])];
    for (const value of values) assert.ok(!/[<>]/.test(value), value);
  }
});

test('flag só aceita a ausência ou um booleano', () => {
  assert.equal(flag(undefined, 'link.external'), false);
  assert.equal(flag(true, 'link.external'), true);
  for (const value of ['true', 1, null, {}]) {
    assert.throws(() => flag(value, 'link.external'), /Sinalizador inválido em link\.external/, JSON.stringify(value));
  }
});

test('o cabeçalho e o rodapé publicados passam a validação', () => {
  const header = loadHeader();
  assert.ok(header.topline.links.length >= 1);
  assert.equal(header.topline.links.every(l => typeof l.external === 'boolean'), true);
  assert.ok(header.portal.url.startsWith('/'));
  const footer = loadFooter();
  assert.ok(footer.tagline.length >= 1);
  assert.ok(footer.columns.length >= 1);
  for (const column of footer.columns) assert.ok(column.links.length >= 1);
  assert.ok(footer.legal.length >= 1);
});

test('todos os marcadores do conteúdo são marcadores que a identidade conhece', () => {
  // Um `{{SCHOL}}` num ficheiro de conteúdo só dava erro no build. Aqui falha
  // na suite, que é onde quem edita o conteúdo olha primeiro.
  const brand = createBrand(resolveSchool({id: 'escola-exemplo', shortName: 'Escola Exemplo', country: 'Angola'}));
  const strings = value => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  };
  // O molde do curso usa marcadores que o gerador resolve antes do brand().
  const locais = [...COURSE_TOKENS, ...GENERATOR_TOKENS];
  const semMarcadoresDoCurso = value => value.replace(new RegExp('\\{\\{(' + locais.join('|') + ')\\}\\}', 'g'), 'x');
  for (const name of ['navigation', 'header', 'footer', 'site', 'simple-pages', 'page-heads', 'notices', 'home', 'pages/sobre', 'pages/vida-academica', 'pages/campus', 'pages/servicos', 'pages/privacidade', 'pages/acessibilidade', 'pages/sobre-o-projecto', 'pages/mapa-do-site', 'pages/favoritos', 'pages/comparar', 'pages/candidaturas', 'pages/noticias', 'pages/pesquisa', 'pages/ajuda', 'pages/agenda', 'pages/login', 'pages/biblioteca', 'pages/cursos', 'pages/contactos', 'pages/ingresso', 'pages/candidatura', 'pages/curso', 'components', 'pages/artigo', 'pages/portal']) {
    for (const value of strings(loadContent(name))) {
      assert.doesNotThrow(() => brand(semMarcadoresDoCurso(value)), name + ': ' + value);
    }
  }
});

test('a ênfase do conteúdo fecha-se sempre', () => {
  assert.equal(emphasis('para a *sua próxima ideia.*', 'site.cta.title[1]'), 'para a *sua próxima ideia.*');
  assert.equal(emphasis('sem ênfase', 'x'), 'sem ênfase');
  for (const value of ['abre *e não fecha', '*', 'três * asteriscos * seguidos *', 'vazia **']) {
    assert.throws(() => emphasis(value, 'site.cta.title[0]'), /Ênfase mal fechada em site\.cta\.title\[0\]/, value);
  }
  assert.throws(() => lines([], 'site.cta.title'), /Lista obrigatória/);
});

test('renderHeadline escapa antes de acrescentar a ênfase', () => {
  // A ordem é o que torna a convenção segura: se a ênfase entrasse antes do
  // esc(), o <em> gerado seria escapado; se o esc() não corresse, um `<` do
  // conteúdo passava a marcação.
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  assert.equal(renderHeadline(['O futuro tem espaço', 'para a *sua próxima ideia.*'], esc), 'O futuro tem espaço<br>para a <em>sua próxima ideia.</em>');
  assert.equal(renderHeadline(['<script>alert(1)</script>'], esc), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(renderHeadline(['*<b>*'], esc), '<em>&lt;b&gt;</em>');
});

test('os blocos comuns a todas as páginas passam a validação', () => {
  const site = loadSite();
  assert.ok(site.meta.titleSuffix.length > 0);
  assert.ok(site.notice.length > 0);
  assert.ok(site.cta.title.length >= 1);
  assert.ok(site.cta.primary.url.startsWith('/'));
  assert.ok(site.cta.secondary.url.startsWith('/'));
});

test('externalUrl é a única saída do site, e é estreita', () => {
  assert.equal(externalUrl('https://www.inagbe.gov.ao/', 'r.url'), 'https://www.inagbe.gov.ao/');
  assert.equal(externalUrl('https://exemplo.ao/bolsas?ano=2026', 'r.url'), 'https://exemplo.ao/bolsas?ano=2026');
  for (const value of ['http://exemplo.ao/', 'javascript:alert(1)', 'https://u:p@exemplo.ao/', '/bolsas/', 'exemplo.ao']) {
    assert.throws(() => externalUrl(value, 'r.url'), /r\.url/, JSON.stringify(value));
  }
});

test('as páginas de serviço publicadas passam a validação', () => {
  const {inlineCta, pages} = loadSimplePages();
  assert.ok(inlineCta.length > 0);
  assert.equal(pages.length, 5);
  for (const page of pages) {
    assert.ok(page.url.startsWith('/'));
    assert.ok(page.headline.length >= 1);
    assert.equal(page.items.length, 3);
    assert.ok(page.action.url.startsWith('/'));
  }
  // O bloco de recursos é opcional: só a página de bolsas o traz.
  const comRecursos = pages.filter(p => p.resources);
  assert.equal(comRecursos.length, 1);
  assert.equal(comRecursos[0].resources.links.every(l => l.url.startsWith('https://')), true);
});

test('os cabeçalhos de página publicados passam a validação', () => {
  const heads = loadPageHeads();
  assert.ok(heads.size >= 27);
  for (const [route, head] of heads) {
    assert.ok(route.startsWith('/'), route);
    assert.ok(head.eyebrow.length > 0, route);
    assert.ok(head.headline.length >= 1, route);
    assert.ok(head.description.length > 0, route);
  }
  // As rotas que o gerador procura pelo nome têm de existir no conteúdo.
  for (const route of ['/cursos/', '/ingresso/', '/eventos/', '/calendario/', '/404/']) {
    assert.ok(heads.has(route), route);
  }
});

test('os títulos das páginas respeitam a convenção de ênfase', () => {
  // `lines()` já recusa uma ênfase mal fechada; isto fixa que a conversão
  // feita a partir do gerador não deixou `<em>` nem `<br>` para trás.
  for (const [route, head] of loadPageHeads()) {
    for (const line of head.headline) assert.ok(!/[<>]/.test(line), route + ': ' + line);
  }
});

test('os avisos de demonstração estão todos num sítio', () => {
  const notices = loadNotices();
  assert.ok(notices.size >= 12);
  for (const [key, value] of notices) {
    assert.match(key, /^[a-z0-9-]{2,48}$/);
    assert.ok(value.length > 20, key);
  }
  for (const key of ['curso', 'candidatura', 'campus', 'agenda', 'portal-candidaturas']) {
    assert.ok(notices.has(key), key);
  }
});

test('a ênfase forte é **assim** e não colide com a simples', () => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  assert.equal(renderHeadline(['**Escolher quem quer ser.**'], esc), '<strong>Escolher quem quer ser.</strong>');
  assert.equal(renderHeadline(['*uma* e **outra**'], esc), '<em>uma</em> e <strong>outra</strong>');
  assert.equal(emphasis('**forte**', 'x'), '**forte**');
  for (const value of ['***a***', '**a*', 'a**', '**']) {
    assert.throws(() => emphasis(value, 'x'), /Ênfase mal fechada/, value);
  }
});

test('o gerador escolhe a etiqueta da ênfase', () => {
  // A faixa azul da entrada destaca com <span>; o conteúdo diz só que há ênfase.
  const esc = s => String(s);
  assert.equal(renderHeadline(['à *sua candidatura.*'], esc, 'span'), 'à <span>sua candidatura.</span>');
});

test('a página de entrada passa a validação', () => {
  const home = loadHome();
  assert.equal(home.hero.headline.length, 2);
  assert.ok(home.hero.primary.url.startsWith('/'));
  assert.equal(home.quickPaths.length, 3);
  assert.equal(home.band.steps.length, 3);
  assert.ok(home.marquee.length >= 2);
  for (const path of home.quickPaths) assert.ok(path.url.startsWith('/'), path.url);
  for (const tag of home.finder.tags) assert.ok(tag.url.startsWith('/'), tag.url);
});

test('shaped constrói o caminho do erro até à folha', () => {
  const shape = {band: {steps: [{title: 'text'}]}};
  assert.throws(() => shaped({band: {steps: [{title: 'ok'}, {}]}}, shape, 'home'), /home\.band\.steps\[1\]\.title/);
  assert.throws(() => shaped({band: {}}, shape, 'home'), /home\.band\.steps/);
  assert.throws(() => shaped({}, {x: 'forma-que-nao-existe'}, 'p'), /Forma desconhecida em p\.x/);
});

test('as páginas institucionais passam a validação', () => {
  for (const [name, shape] of Object.entries(PAGE_SHAPES)) {
    const page = loadInstitutionalPage(name);
    assert.ok(Object.keys(page).length > 0, name);
    // Nem toda a página tem título próprio: a agenda traz um por rota e o
    // `curso` é o molde das 18 páginas de curso, cujo título é o nome do curso.
    if (shape.title) {
      assert.ok(page.title.length > 0, name);
      assert.ok(page.crumb.length > 0, name);
    }
  }
  for (const page of [loadInstitutionalPage('agenda').events, loadInstitutionalPage('agenda').calendar]) {
    assert.ok(page.title.length > 0);
    assert.ok(page.crumb.length > 0);
  }
  assert.equal(loadInstitutionalPage('sobre').ideas.items.length, 3);
  assert.equal(loadInstitutionalPage('campus').spaces.length, 4);
  const vida = loadInstitutionalPage('vida-academica');
  assert.equal(vida.items.length, 3);
  assert.equal(vida.articles.ids.length, 3);
  assert.throws(() => loadInstitutionalPage('pagina-que-nao-existe'), /Página sem forma declarada/);
});

test('os artigos em destaque existem no catálogo', async () => {
  // O conteúdo escolhe os artigos pelo id. Um id errado tem de ser um erro de
  // build, não uma grelha com menos cartões do que o esperado.
  const {articles} = await import('../src/data.mjs');
  const ids = new Set(articles.map(a => a.id));
  for (const id of loadInstitutionalPage('vida-academica').articles.ids) assert.ok(ids.has(id), id);
});

test('uma ligação dentro de uma frase é [rótulo](/caminho/)', () => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  assert.equal(renderInline('Pode exportar em [O meu perfil](/portal/perfil/).', esc), 'Pode exportar em <a href="/portal/perfil/">O meu perfil</a>.');
  assert.equal(richText('ver [aqui](/ajuda/)', 'x'), 'ver [aqui](/ajuda/)');
  // O destino é validado como caminho interno, como o resto da navegação.
  assert.throws(() => richText('ver [aqui](https://exemplo.com/)', 'x'), /Ligação interna inválida/);
  assert.throws(() => richText('ver [aqui](javascript:alert(1))', 'x'), /x/);
  for (const value of ['ver [aqui sem destino', 'ver aqui](/x/)', '[](/x/)']) {
    assert.throws(() => richText(value, 'x'), /x/, value);
  }
  // E escapa antes de converter: o conteúdo não pode trazer marcação.
  assert.equal(renderInline('<b>[x](/y/)</b>', esc), '&lt;b&gt;<a href="/y/">x</a>&lt;/b&gt;');
});

test('as páginas de texto corrido passam a validação', () => {
  for (const name of ['privacidade', 'acessibilidade', 'sobre-o-projecto']) {
    const page = loadInstitutionalPage(name);
    assert.ok(page.sections.length >= 4, name);
    for (const section of page.sections) {
      assert.ok(section.title.length > 0, name);
      assert.ok(section.paragraphs.length >= 1, name);
    }
  }
  // A lista de referências é opcional e só existe numa secção.
  const projecto = loadInstitutionalPage('sobre-o-projecto');
  assert.equal(projecto.sections.filter(s => s.links).length, 1);
  assert.equal(projecto.sections.find(s => s.links).links.length, 4);
  assert.equal(loadInstitutionalPage('privacidade').sections.every(s => s.links === null), true);
});

test('o botão de acesso ao portal tem os dois rótulos no conteúdo', () => {
  // Antes, o rótulo do SIGA Plus era uma substituição de texto sobre o HTML já
  // gerado. Agora é conteúdo, e o gerador escolhe qual usar.
  const card = loadInstitutionalPage('login').card;
  assert.ok(card.hostedLabel.length > 0);
  assert.ok(card.portalLabel.length > 0);
  assert.notEqual(card.hostedLabel, card.portalLabel);
});

test('os recursos da biblioteca são ligações externas validadas', () => {
  const biblioteca = loadInstitutionalPage('biblioteca');
  assert.equal(biblioteca.resources.length, 4);
  for (const r of biblioteca.resources) {
    assert.ok(r.url.startsWith('https://'), r.url);
    assert.ok(r.title.length > 0);
  }
  assert.ok(biblioteca.guide.link.url.startsWith('/'));
});

test('os rótulos do catálogo são conteúdo, os valores dos filtros não', async () => {
  const catalogo = loadInstitutionalPage('cursos');
  assert.ok(catalogo.filters.area.all.length > 0);
  assert.ok(catalogo.sort.featured.length > 0);
  // O conteúdo não contém os valores que a filtragem compara com os dados.
  const {courses} = await import('../src/data.mjs');
  const niveis = new Set(courses.map(c => c.level));
  const texto = JSON.stringify(catalogo);
  for (const nivel of niveis) assert.ok(!texto.includes(`"${nivel}"`), nivel);
});

test('as províncias da candidatura são conteúdo, não código angolano', () => {
  // Estavam escritas no gerador: 22 províncias de Angola para qualquer escola.
  const province = loadInstitutionalPage('candidatura').step2.province;
  assert.ok(province.options.length > 1);
  assert.ok(province.label.length > 0);
});

test('as confirmações da candidatura correspondem aos campos do formulário', () => {
  // O gerador guarda duas confirmações com nomes que o app.js lê. Se o conteúdo
  // trouxer outro número, o build pára — este teste fixa o número esperado.
  assert.equal(loadInstitutionalPage('candidatura').step2.checklist.items.length, 2);
});

test('as opções de contacto trazem texto ou ligação, nunca as duas em falta', () => {
  for (const option of loadInstitutionalPage('contactos').aside.options) {
    assert.ok(option.text || option.link, option.title);
  }
});

test('o molde das páginas de curso usa marcadores para os dados', () => {
  // As 18 páginas de curso partilham um ficheiro. O que varia entre elas entra
  // por marcador; o que se lê é igual em todas e é editável num sítio só.
  const curso = loadInstitutionalPage('curso');
  const texto = JSON.stringify(curso);
  for (const token of ['{{COURSE}}', '{{LEVEL}}', '{{DURATION}}', '{{ACCESS}}']) {
    assert.ok(texto.includes(token), token);
  }
  assert.equal(curso.summary.fields.length, 9);
  assert.equal(curso.questions.items.length, 3);
  // Os âncoras da navegação do curso são os ids das secções do gerador.
  assert.deepEqual(curso.subnav.items.map(i => i.anchor), ['apresentacao', 'competencias', 'plano', 'carreiras', 'ingresso']);
});

test('os cartões partilhados são conteúdo', () => {
  const ui = loadComponents();
  assert.ok(ui.courseCard.favouriteLabel.includes('{{COURSE}}'));
  assert.ok(ui.eventCard.saveLabel.includes('{{EVENT}}'));
  assert.ok(ui.searchBox.button.length > 0);
});

test('a moldura do portal e a ficha do artigo passam a validação', () => {
  const portal = loadInstitutionalPage('portal');
  assert.equal(portal.sidebar.links.every(l => l.icon && l.url.startsWith('/')), true);
  assert.ok(portal.profile.initials.length <= 3);
  assert.ok(portal.footer.link.url.startsWith('/'));
  const artigo = loadInstitutionalPage('artigo');
  assert.match(artigo.byline.datetime, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(artigo.share.link.url.startsWith('/'));
});
