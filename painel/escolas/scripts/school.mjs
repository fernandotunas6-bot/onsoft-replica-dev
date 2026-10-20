/**
 * Identidade da escola e substituição por marcadores.
 *
 * Os textos de origem nunca contêm o nome nem o país de uma escola concreta:
 * contêm marcadores `{{...}}`. `brand()` substitui-os pelos valores da
 * configuração. Ao contrário de um `replaceAll('ISPAB')` sobre o texto já
 * gerado, um marcador não pode colidir com uma palavra do conteúdo nem
 * depender da caixa das letras.
 */
import fs from 'node:fs';

const DEFAULTS = {lang: 'pt-AO', currency: 'Kz'};

/**
 * Paleta: os sete tokens de cor que o CSS do site declara em `:root`.
 *
 * A escola só precisa de nomear os que quer mudar. O build acrescenta um
 * `:root` no fim do CSS com esses — e só esses — pelo que uma escola sem
 * paleta configurada recebe exactamente o CSS de origem.
 */
export const PALETTE_TOKENS = ['blue', 'deep', 'text', 'muted', 'line', 'soft', 'lime'];

/** Tem de ser igual ao `--blue` do `:root` em src/style.css (fixado por um teste). */
export const DEFAULT_BLUE = '#1558ee';

const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function resolvePalette(raw) {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Paleta da escola inválida.');
  const palette = {};
  for (const [token, value] of Object.entries(raw)) {
    if (!PALETTE_TOKENS.includes(token)) throw Error('Token de cor desconhecido na paleta: ' + token);
    // A cor entra num `:root` do CSS publicado: sem esta validação, a
    // configuração podia fechar a declaração e escrever regras próprias.
    if (typeof value !== 'string' || !COLOR.test(value)) throw Error('Cor inválida na paleta (' + token + '): ' + String(value));
    palette[token] = value.toLowerCase();
  }
  return palette;
}

/** O `:root` que o build acrescenta ao CSS. Vazio quando não há paleta. */
export function paletteCss(palette) {
  const entries = PALETTE_TOKENS.filter(token => token in palette);
  return entries.length === 0 ? '' : '\n:root{' + entries.map(token => '--' + token + ':' + palette[token]).join(';') + '}\n';
}

/** Marcador por substituir no fim da substituição: erro de escrita, não conteúdo. */
const LEFTOVER = /\{\{[A-Z_]{2,32}\}\}/;

export function resolveSchool(raw) {
  const school = {...DEFAULTS, ...raw};
  const invalid = () => {
    throw Error('Configuração da escola inválida.');
  };
  if (typeof school.id !== 'string' || !/^[a-z0-9-]{2,48}$/.test(school.id)) invalid();
  if (typeof school.shortName !== 'string' || !/[\p{L}\p{N}]/u.test(school.shortName) || !/^[\p{L}\p{N} .-]{2,40}$/u.test(school.shortName)) invalid();
  if (typeof school.country !== 'string' || !/^[\p{L} .-]{2,50}$/u.test(school.country)) invalid();
  // BCP 47 reduzido: o valor entra em <html lang> e em Intl.NumberFormat.
  if (typeof school.lang !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(school.lang)) invalid();
  if (typeof school.currency !== 'string' || !/^[\p{L}\p{Sc}.$ ]{1,8}$/u.test(school.currency)) invalid();
  // O nome da moeda aparece no corpo das frases («em kwanzas»); o símbolo aparece
  // nos rótulos dos campos. Por omissão, o nome é o próprio símbolo.
  if (school.currencyName === undefined) school.currencyName = school.currency;
  if (typeof school.currencyName !== 'string' || !/^[\p{L}\p{N} .-]{1,40}$/u.test(school.currencyName)) invalid();

  const palette = resolvePalette(school.palette);

  let portal = null;
  if (school.portalUrl) {
    portal = new URL(school.portalUrl);
    if (portal.protocol !== 'https:' || portal.username || portal.password || portal.search || portal.hash) throw Error('URL do portal SIGA inválido.');
  }
  return {...school, palette, themeColor: palette.blue ?? DEFAULT_BLUE, portal};
}

export function createBrand(school) {
  const upper = value => value.toLocaleUpperCase(school.lang);
  const tokens = new Map([
    ['SCHOOL', school.shortName],
    ['SCHOOL_UPPER', upper(school.shortName)],
    ['SCHOOL_ID', school.id],
    ['COUNTRY', school.country],
    ['COUNTRY_UPPER', upper(school.country)],
    ['LANG', school.lang],
    ['CURRENCY', school.currency],
    ['CURRENCY_NAME', school.currencyName],
  ]);
  return function brand(text) {
    const output = String(text).replace(/\{\{([A-Z_]{2,32})\}\}/g, (match, name) => (tokens.has(name) ? tokens.get(name) : match));
    const leftover = LEFTOVER.exec(output);
    if (leftover) throw Error('Marcador desconhecido no conteúdo: ' + leftover[0]);
    return output;
  };
}

export function loadSchool(file = 'school.config.json') {
  return resolveSchool(JSON.parse(fs.readFileSync(file, 'utf8')));
}
