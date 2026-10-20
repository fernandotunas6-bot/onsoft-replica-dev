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
