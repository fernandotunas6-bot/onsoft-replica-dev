import test from 'node:test';
import assert from 'node:assert/strict';
import {loadContent, text, internalUrl, list, loadNavigation} from '../scripts/content.mjs';

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
