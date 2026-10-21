import test from 'node:test';
import assert from 'node:assert/strict';
import {areas, courses, articles, events, services, faqs, portalNav} from '../src/data.mjs';
import {preparationItems} from '../src/admissions.mjs';

const unique = values => new Set(values).size === values.length;
const slug = /^[a-z0-9-]+$/;

test('os identificadores são únicos e usáveis num URL', () => {
  // Cada id de curso vira um directório /cursos/<id>/; o check.mjs valida 4420
  // ligações, mas um id duplicado faria duas páginas colidirem silenciosamente.
  for (const [nome, lista] of [['areas', areas], ['courses', courses], ['articles', articles], ['events', events]]) {
    const ids = lista.map(item => item.id);
    assert.ok(unique(ids), `${nome}: id duplicado`);
    for (const id of ids) assert.match(id, slug, `${nome}: id inválido ${id}`);
  }
});

test('cada curso aponta para uma área que existe', () => {
  const conhecidas = new Set(areas.map(a => a.id));
  for (const course of courses) assert.ok(conhecidas.has(course.area), `${course.id} → ${course.area}`);
});

test('cada área tem pelo menos um curso', () => {
  // A home desenha um cartão por área com a contagem de percursos: uma área
  // sem cursos publicaria "0 percursos de exemplo".
  for (const area of areas) {
    const n = courses.filter(c => c.area === area.id).length;
    assert.ok(n > 0, `${area.id} sem cursos`);
  }
});

test('os campos derivados de cada curso são coerentes com os de origem', () => {
  for (const course of courses) {
    assert.equal(course.image, course.area, course.id);
    assert.equal(course.unit, course.mode === 'Online' ? 'Campus Digital' : 'Campus Académico', course.id);
    const esperado = course.years < 1 ? '6 meses' : course.years === 1 ? '1 ano' : course.years + ' anos';
    assert.equal(course.duration, esperado, course.id);
  }
});

test('nenhum curso fica sem módulos nem saídas', () => {
  // Ambos vêm de split('|'): um campo vazio dava [''] e não um array vazio.
  for (const course of courses) {
    assert.ok(course.modules.length > 0, course.id);
    assert.ok(course.careers.length > 0, course.id);
    for (const value of [...course.modules, ...course.careers]) assert.ok(value.trim().length > 0, `${course.id}: entrada vazia`);
  }
});

test('os cursos em destaque são um subconjunto não vazio', () => {
  const destaque = courses.filter(c => c.featured);
  assert.ok(destaque.length > 0);
  assert.ok(destaque.length < courses.length);
  // A home mostra os três primeiros destaques.
  assert.ok(destaque.length >= 3, 'a home precisa de três destaques');
});

test('os níveis e as modalidades ficam no conjunto que o site filtra', () => {
  // A navegação liga a /cursos/?nivel=... com estes valores exactos.
  const niveis = new Set(['Licenciatura', 'Pós-graduação', 'Curso de curta duração']);
  const modos = new Set(['Presencial', 'Online', 'Híbrido']);
  for (const course of courses) {
    assert.ok(niveis.has(course.level), `${course.id}: nível ${course.level}`);
    assert.ok(modos.has(course.mode), `${course.id}: modalidade ${course.mode}`);
  }
});

test('as perguntas frequentes são pares de pergunta e resposta', () => {
  assert.ok(faqs.length > 0);
  for (const faq of faqs) {
    assert.equal(faq.length, 2);
    assert.ok(faq[0].trim().endsWith('?'), `sem interrogação: ${faq[0]}`);
    assert.ok(faq[1].trim().length > 20, faq[0]);
  }
});

test('as datas dos eventos são válidas e exportáveis', () => {
  for (const event of events) {
    assert.match(event.date, /^\d{4}-\d{2}-\d{2}$/, event.id);
    assert.equal(new Date(event.date + 'T00:00:00Z').toISOString().slice(0, 10), event.date, event.id);
    assert.match(event.time, /^([01]\d|2[0-3]):[0-5]\d – ([01]\d|2[0-3]):[0-5]\d$/, `${event.id}: ${event.time}`);
  }
});

test('os serviços têm id único e ligação interna', () => {
  assert.ok(services.length > 0);
  assert.ok(unique(services.map(s => s.id)), 'id de serviço duplicado');
  for (const service of services) {
    assert.match(service.id, slug, service.id);
    assert.ok(service.url.startsWith('/') && !service.url.startsWith('//'), `${service.id}: ${service.url}`);
    for (const key of ['icon', 'title', 'text']) assert.ok(service.title.trim().length > 0, `${service.id}.${key}`);
  }
});

test('a navegação do portal gera caminhos /portal/<chave>/ distintos', () => {
  // Cada entrada é [chave, título, ícone]; build.mjs monta o URL como
  // '/portal/' + (chave ? chave + '/' : ''). A chave vazia é a visão geral.
  assert.ok(portalNav.length > 0);
  const chaves = portalNav.map(item => item[0]);
  assert.ok(unique(chaves), 'chave de portal duplicada');
  assert.ok(chaves.includes(''), 'falta a visão geral');
  for (const [chave, titulo, icone] of portalNav) {
    if (chave !== '') assert.match(chave, slug, `chave inválida: ${chave}`);
    assert.ok(titulo.trim().length > 0, chave);
    assert.ok(icone.trim().length > 0, chave);
  }
});

test('a lista de preparação tem ids únicos e ligações internas', () => {
  assert.ok(preparationItems.length > 0);
  assert.ok(unique(preparationItems.map(i => i.id)), 'id duplicado');
  for (const item of preparationItems) {
    assert.match(item.id, slug, item.id);
    for (const key of ['title', 'text', 'label']) assert.ok(item[key].trim().length > 0, `${item.id}.${key}`);
    assert.ok(item.url.startsWith('/') && !item.url.startsWith('//'), `${item.id}: ${item.url}`);
  }
});

test('a lista de preparação não promete requisitos oficiais', () => {
  // O ficheiro declara-se "not an institutional requirements list": cada entrada
  // remete para a instituição em vez de afirmar o requisito.
  for (const item of preparationItems) {
    assert.match(item.text, /[Cc]onfirm|[Pp]ergunt|[Pp]eça|[Cc]onsidere|[Aa]note/, item.id);
  }
});
