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

/**
 * Recolorir o CSS pela cor de marca da escola.
 *
 * O `:root` com `--blue` não chega: o CSS tem 26 ocorrências do azul da marca
 * escritas à mão, e uma delas — o gradiente do `.button` em polish.css —
 * sobrepõe-se à regra que usa a variável. Com uma paleta verde, o título ficava
 * verde e o botão principal continuava azul.
 *
 * Em vez de reescrever 600 cores do CSS de origem à mão, o build roda a
 * **família de azuis** inteira para a cor da escola: mesma luminosidade, mesma
 * relação entre tons, outro matiz. As cores de fora da família — o lima, os
 * roxos e areias dos cartões de área — não se mexem.
 */
const HEX = /#([0-9a-fA-F]{3,8})\b/g;
// Janela da família: do azul-petróleo ao azul-violeta deste desenho.
const FAMILY = [195, 250];
const SATURATION_FLOOR = 0.06;

function toRgb(hex) {
  const value = hex.length <= 4 ? [...hex].map(c => c + c).join('') : hex;
  return [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
}

export function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex([h, s, l]) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(hue / 60) % 6;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/**
 * Transporta um valor de 0–1 fixando três pontos: 0, a cor de marca, e 1.
 *
 * Assim o próprio azul da marca sai exactamente na cor pedida, o branco
 * continua branco e o quase-preto continua quase-preto — o que muda é a
 * distância relativa de cada tom à cor da escola.
 */
function anchored(value, from, to) {
  if (from <= 0 || from >= 1) return value;
  return value <= from ? (value * to) / from : to + ((value - from) * (1 - to)) / (1 - from);
}

/** Roda uma cor da família de azuis para a cor da escola. */
export function recolor(hex, from, to) {
  const alpha = hex.length === 9 ? hex.slice(7) : hex.length === 5 ? hex.slice(4).repeat(2) : '';
  const base = alpha ? hex.slice(0, hex.length - (hex.length === 9 ? 2 : 1)) : hex;
  const [h, s, l] = rgbToHsl(toRgb(base.slice(1)));
  if (s < SATURATION_FLOOR || h < FAMILY[0] || h > FAMILY[1]) return hex;
  return hslToHex([to[0] + (h - from[0]), anchored(s, from[1], to[1]), anchored(l, from[2], to[2])]) + alpha;
}

/** Aplica a rotação a todo o CSS. Sem cor de marca configurada, não toca em nada. */
export function recolorCss(css, palette) {
  if (!palette.blue) return css;
  const from = rgbToHsl(toRgb(DEFAULT_BLUE.slice(1)));
  const to = rgbToHsl(toRgb(palette.blue.slice(1)));
  return css.replace(HEX, hex => recolor(hex, from, to));
}
