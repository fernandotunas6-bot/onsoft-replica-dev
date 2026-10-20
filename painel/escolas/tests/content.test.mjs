import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContent, text, internalUrl, list, flag, emphasis, lines, renderHeadline, externalUrl, loadNavigation, loadHeader, loadFooter, loadSite, loadSimplePages} from '../scripts/content.mjs';
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
  for (const name of ['navigation', 'header', 'footer', 'site', 'simple-pages']) {
    for (const value of strings(loadContent(name))) {
      assert.doesNotThrow(() => brand(value), name + ': ' + value);
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
