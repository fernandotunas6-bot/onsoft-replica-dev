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

  let portal = null;
  if (school.portalUrl) {
    portal = new URL(school.portalUrl);
    if (portal.protocol !== 'https:' || portal.username || portal.password || portal.search || portal.hash) throw Error('URL do portal SIGA inválido.');
  }
  return {...school, portal};
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
