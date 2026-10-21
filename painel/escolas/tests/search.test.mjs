import test from 'node:test';
import assert from 'node:assert/strict';
import {rankResults, scoreRow, STARTING_POINTS} from '../src/search.mjs';

// `normal()` em app.js: sem acentos, minúsculas. O índice já guarda os campos
// normalizados, por isso os testes escrevem-nos assim directamente.
const normal = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const row = (title, url, {searchText = '', kind = 'Página', order = 0} = {}) => ({
  title, url, kind, order,
  titleNormal: normal(title),
  hay: normal(title + ' ' + url + ' ' + searchText),
});

test('pesquisa vazia devolve os pontos de partida, pela ordem do índice', () => {
  const index = [
    row('Notícias', '/noticias/', {order: 0}),
    row('Cursos', '/cursos/', {order: 1}),
    row('Ingresso', '/ingresso/', {order: 2}),
  ];
  assert.deepEqual(rankResults(index, '').map(r => r.url), ['/cursos/', '/ingresso/']);
  assert.deepEqual(rankResults(index, '').map(r => r.url), rankResults(index, null).map(r => r.url));
});

test('os pontos de partida são todos caminhos internos', () => {
  for (const url of STARTING_POINTS) assert.ok(url.startsWith('/') && !url.startsWith('//'), url);
});

test('todas as palavras têm de aparecer, não apenas uma', () => {
  const index = [
    row('Engenharia Informática', '/cursos/engenharia-informatica/', {order: 0}),
    row('Gestão', '/cursos/gestao/', {order: 1}),
  ];
  assert.equal(rankResults(index, 'engenharia informatica').length, 1);
  assert.equal(rankResults(index, 'engenharia gestao').length, 0);
});

test('a pesquisa ignora acentos e caixa', () => {
  const index = [row('Informática Médica', '/cursos/informatica-medica/')];
  assert.equal(rankResults(index, normal('INFORMÁTICA')).length, 1);
  assert.equal(rankResults(index, normal('medica')).length, 1);
});

test('encontra pelo texto da página, não só pelo título', () => {
  const index = [row('Biblioteca', '/biblioteca/', {searchText: 'acervo e fontes abertas de estudo'})];
  assert.equal(rankResults(index, 'acervo').length, 1);
  assert.equal(rankResults(index, 'inexistente').length, 0);
});

test('o título exacto vence o prefixo, que vence a ocorrência no meio', () => {
  const index = [
    row('Guia de gestão de projectos', '/a/', {order: 0}),
    row('Gestão', '/b/', {order: 1}),
    row('Gestão de empresas', '/c/', {order: 2}),
  ];
  assert.deepEqual(rankResults(index, 'gestao').map(r => r.url), ['/b/', '/c/', '/a/']);
});

test('pontuações iguais mantêm a ordem do índice', () => {
  const index = [
    row('Curso de Gestão B', '/b/', {order: 5}),
    row('Curso de Gestão A', '/a/', {order: 2}),
  ];
  const found = rankResults(index, 'gestao');
  assert.equal(found.length, 2);
  assert.deepEqual(found.map(r => r.order), [2, 5]);
});

test('scoreRow soma os componentes de forma previsível', () => {
  const exacto = row('gestao', '/a/');
  const prefixo = row('gestao de empresas', '/b/');
  const meio = row('guia de gestao', '/c/');
  // exacto: 1000 + 200 (startsWith) + 100 (includes) + 20 (palavra) = 1320
  assert.equal(scoreRow(exacto, 'gestao', ['gestao']), 1320);
  assert.equal(scoreRow(prefixo, 'gestao', ['gestao']), 320);
  assert.equal(scoreRow(meio, 'gestao', ['gestao']), 120);
  assert.ok(scoreRow(exacto, 'gestao', ['gestao']) > scoreRow(prefixo, 'gestao', ['gestao']));
  assert.ok(scoreRow(prefixo, 'gestao', ['gestao']) > scoreRow(meio, 'gestao', ['gestao']));
});

test('uma ocorrência só no corpo pontua zero mas continua a aparecer', () => {
  // Sem correspondência no título o score é 0; o resultado não é descartado.
  const corpo = row('Biblioteca', '/biblioteca/', {searchText: 'gestao do acervo'});
  assert.equal(scoreRow(corpo, 'gestao', ['gestao']), 0);
  assert.equal(rankResults([corpo], 'gestao').length, 1);
});

test('não devolve nada para uma pesquisa sem correspondência', () => {
  const index = [row('Cursos', '/cursos/')];
  assert.deepEqual(rankResults(index, 'xptoinexistente'), []);
});

test('não altera o índice recebido', () => {
  const index = [row('Gestão', '/b/', {order: 1}), row('Cursos', '/cursos/', {order: 0})];
  const antes = JSON.stringify(index);
  rankResults(index, 'gestao');
  rankResults(index, '');
  assert.equal(JSON.stringify(index), antes);
});
