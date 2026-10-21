import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveSchool, createBrand, paletteCss, recolor, recolorCss, rgbToHsl, hslToHex, DEFAULT_BLUE} from '../scripts/school.mjs';

const base = {id: 'escola-exemplo', shortName: 'Escola Exemplo', country: 'Angola'};
const brandFor = extra => createBrand(resolveSchool({...base, ...extra}));

test('resolveSchool preenche idioma e moeda por omissão', () => {
  const school = resolveSchool(base);
  assert.equal(school.lang, 'pt-AO');
  assert.equal(school.currency, 'Kz');
  assert.equal(school.portal, null);
});

test('resolveSchool recusa configurações inválidas', () => {
  const invalid = [
    {id: 'MAIUSCULAS'},
    {id: 'a'},
    {id: 'com espaço'},
    {shortName: 'x'},
    {shortName: '...'},
    {shortName: 'a'.repeat(41)},
    {country: 'a'},
    {lang: 'português'},
    {lang: 'PT'},
    {currency: ''},
    {currency: 'moeda demasiado longa'},
  ];
  for (const extra of invalid) {
    assert.throws(() => resolveSchool({...base, ...extra}), /Configuração da escola inválida/, JSON.stringify(extra));
  }
});

test('o nome, o país e a moeda não podem conter metacaracteres de HTML', () => {
  // build.mjs insere estes valores depois de esc(): a validação é o que torna
  // essa inserção segura. Se estes casos passarem a ser aceites, o site fica
  // aberto a injecção a partir da configuração.
  for (const value of ['Escola <b>', 'Escola & Co', 'Escola "X"', "Escola 'X'"]) {
    assert.throws(() => resolveSchool({...base, shortName: value}), /inválida/, value);
    assert.throws(() => resolveSchool({...base, country: value}), /inválida/, value);
  }
});

test('portalUrl exige https sem credenciais, query nem fragmento', () => {
  assert.equal(resolveSchool({...base, portalUrl: 'https://portal.exemplo/auth'}).portal.href, 'https://portal.exemplo/auth');
  for (const url of [
    'http://portal.exemplo/auth',
    'https://utilizador:senha@portal.exemplo/auth',
    'https://portal.exemplo/auth?token=1',
    'https://portal.exemplo/auth#x',
  ]) {
    assert.throws(() => resolveSchool({...base, portalUrl: url}), /URL do portal SIGA inválido/, url);
  }
});

test('substitui cada marcador pelo valor da configuração', () => {
  const brand = brandFor({id: 'ispab', shortName: 'ISPAB', country: 'Angola', currency: 'Kz'});
  assert.equal(brand('{{SCHOOL}} · {{COUNTRY}}'), 'ISPAB · Angola');
  assert.equal(brand('{{SCHOOL_ID}}-notas.txt'), 'ispab-notas.txt');
  assert.equal(brand('<html lang="{{LANG}}">'), '<html lang="pt-AO">');
  assert.equal(brand('1 000,00 {{CURRENCY}}'), '1 000,00 Kz');
  assert.equal(brand('{{COUNTRY_UPPER}}'), 'ANGOLA');
  assert.equal(brand('{{SCHOOL_UPPER}}'), 'ISPAB');
});

test('REGRESSÃO: a segunda substituição não come o nome da escola', () => {
  // O brand() anterior fazia replaceAll('ISPAB') e depois replaceAll('Angola')
  // sobre o texto já gerado. Com este par, o nome da escola — que contém o nome
  // do país antigo — era reescrito: 682 ocorrências de "Mocambique Tech" no dist.
  const brand = brandFor({id: 'angola-tech', shortName: 'Angola Tech', country: 'Mocambique'});
  assert.equal(brand('Bem-vindo ao {{SCHOOL}}, em {{COUNTRY}}.'), 'Bem-vindo ao Angola Tech, em Mocambique.');
  assert.doesNotMatch(brand('{{SCHOOL}} · {{COUNTRY}}'), /Mocambique Tech/);
});

test('REGRESSÃO: a caixa alta é um marcador próprio, não uma coincidência de texto', () => {
  // replaceAll('Angola') nunca tocava em 'ANGOLA': a home publicava
  // "FRONTEIRAS · ANGOLA" para qualquer escola configurada.
  const brand = brandFor({country: 'Mocambique'});
  assert.equal(brand('FRONTEIRAS · {{COUNTRY_UPPER}}'), 'FRONTEIRAS · MOCAMBIQUE');
});

test('a configuração não pode conter um marcador', () => {
  assert.throws(() => resolveSchool({...base, shortName: 'Escola {{COUNTRY}}'}), /inválida/);
});

test('um marcador trazido por um valor é recusado, não reexpandido', () => {
  // Dupla defesa contra o encadeamento que partiu o brand() anterior: a
  // substituição é de uma só passagem (não reexamina o que inseriu) e o guarda
  // final recusa qualquer marcador no resultado. Contorna-se resolveSchool,
  // que já recusaria este valor, para testar createBrand directamente.
  const brand = createBrand({shortName: 'Escola {{COUNTRY}}', country: 'Angola', id: 'e', lang: 'pt-AO', currency: 'Kz'});
  assert.throws(() => brand('{{SCHOOL}}'), /Marcador desconhecido no conteúdo: \{\{COUNTRY\}\}/);
});

test('um marcador desconhecido é um erro, não conteúdo publicado', () => {
  const brand = brandFor({});
  assert.throws(() => brand('olá {{SCHOOLL}}'), /Marcador desconhecido no conteúdo: \{\{SCHOOLL\}\}/);
  assert.throws(() => brand('{{COUNRTY}}'), /Marcador desconhecido/);
});

test('texto sem marcadores atravessa inalterado', () => {
  const brand = brandFor({});
  for (const text of ['', 'sem marcadores', 'chaves { simples } e {{minusculas}}', '{{a}}']) {
    assert.equal(brand(text), text);
  }
});

test('o nome da moeda tem omissão e validação próprias', () => {
  // O símbolo vai nos rótulos dos campos («propina (Kz)»); o nome vai no corpo
  // das frases («em kwanzas»). Sem nome configurado, vale o símbolo.
  assert.equal(resolveSchool(base).currencyName, 'Kz');
  assert.equal(resolveSchool({...base, currency: 'MT', currencyName: 'meticais'}).currencyName, 'meticais');
  for (const value of ['', 'moeda & co', 'moeda <b>', 'a'.repeat(41)]) {
    assert.throws(() => resolveSchool({...base, currencyName: value}), /inválida/, JSON.stringify(value));
  }
});

test('{{CURRENCY}} e {{CURRENCY_NAME}} são marcadores distintos', () => {
  const brand = brandFor({currency: 'MT', currencyName: 'meticais'});
  assert.equal(brand('propina ({{CURRENCY}}) em {{CURRENCY_NAME}}'), 'propina (MT) em meticais');
});

test('a paleta só aceita os tokens do CSS e cores hexadecimais', () => {
  assert.deepEqual(resolveSchool(base).palette, {});
  assert.deepEqual(resolveSchool({...base, palette: {blue: '#1A7F4B'}}).palette, {blue: '#1a7f4b'});
  assert.throws(() => resolveSchool({...base, palette: {azul: '#1a7f4b'}}), /Token de cor desconhecido na paleta: azul/);
  for (const value of ['#1a7f4', 'red', 'var(--blue)', '#fff;}body{display:none', 123, null]) {
    assert.throws(() => resolveSchool({...base, palette: {blue: value}}), /Cor inválida na paleta/, JSON.stringify(value));
  }
  for (const value of ['#1a7f4b', ['#1a7f4b'], null]) {
    assert.throws(() => resolveSchool({...base, palette: value}), /Paleta da escola inválida|Cor inválida/, JSON.stringify(value));
  }
});

test('paletteCss escreve um :root só com o que a escola mudou', () => {
  assert.equal(paletteCss({}), '');
  assert.equal(paletteCss({deep: '#0d2a1b', blue: '#1a7f4b'}), '\n:root{--blue:#1a7f4b;--deep:#0d2a1b}\n');
});

test('a cor do tema segue a paleta', () => {
  assert.equal(resolveSchool(base).themeColor, DEFAULT_BLUE);
  assert.equal(resolveSchool({...base, palette: {blue: '#1a7f4b'}}).themeColor, '#1a7f4b');
});

test('o azul por omissão é o que está no :root do CSS', () => {
  // Duplicação necessária: a cor do tema é um atributo HTML e não pode ler o
  // CSS. Se alguém mudar o `--blue` do src/style.css, este teste avisa.
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const root = /:root\{([^}]*)\}/.exec(css);
  assert.ok(root, ':root não encontrado em src/style.css');
  assert.match(root[1], new RegExp('--blue:' + DEFAULT_BLUE + '\\b'));
});

const AZUL = [...'1558ee'.match(/../g)].map(x => parseInt(x, 16));
const familia = alvo => {
  const to = [...alvo.slice(1).match(/../g)].map(x => parseInt(x, 16));
  return hex => recolor(hex, rgbToHsl(AZUL), rgbToHsl(to));
};

test('a cor de marca sai exactamente na cor pedida', () => {
  // O ponto fixo da transformação: quem configura #1a7f4b vê #1a7f4b.
  for (const alvo of ['#1a7f4b', '#b3121e', '#6b4fbb', '#0d2a1b']) {
    assert.equal(familia(alvo)('#1558ee'), alvo);
  }
});

test('a rotação não toca em cores fora da família de azuis', () => {
  const verde = familia('#1a7f4b');
  // O lima do desenho e as cores dos cartões de área (roxo, areia, rosa).
  for (const cor of ['#dcf59a', '#7b5cc3', '#f2effc', '#e8a33d', '#c2410c']) {
    assert.equal(verde(cor), cor, cor);
  }
  // Nem em cinzentos puros, brancos e pretos.
  for (const cor of ['#fff', '#000', '#808080', '#f5f5f5']) {
    assert.equal(verde(cor), cor, cor);
  }
});

test('a rotação preserva o canal alfa e a escala de luminosidade', () => {
  const verde = familia('#1a7f4b');
  assert.match(verde('#1558ee08'), /^#[0-9a-f]{6}08$/);
  assert.equal(verde('#1558ee08').slice(0, 7), verde('#1558ee'));
  // Um tom quase branco continua quase branco; um quase preto continua escuro.
  const claro = rgbToHsl([...verde('#edf3ff').slice(1).match(/../g)].map(x => parseInt(x, 16)));
  const escuro = rgbToHsl([...verde('#11223e').slice(1).match(/../g)].map(x => parseInt(x, 16)));
  assert.ok(claro[2] > 0.85, 'claro: ' + claro[2]);
  assert.ok(escuro[2] < 0.25, 'escuro: ' + escuro[2]);
});

test('sem cor de marca configurada, o CSS não é tocado', () => {
  const css = '.button{background:linear-gradient(110deg,#1e63f0,#1558ee)}';
  assert.equal(recolorCss(css, {}), css);
  assert.equal(recolorCss(css, {lime: '#dcf59a'}), css);
});

test('com cor de marca, o CSS inteiro roda — inclusive as cores escritas à mão', () => {
  // Era o defeito: o gradiente do .button em polish.css ignorava o var(--blue).
  const css = ':root{--blue:#1558ee}.button{background:linear-gradient(110deg,#1e63f0,#1558ee)}.area-card.lime{background:#dcf59a}';
  const saida = recolorCss(css, {blue: '#1a7f4b'});
  assert.ok(!saida.includes('#1558ee'), saida);
  assert.ok(!saida.includes('#1e63f0'), saida);
  assert.ok(saida.includes('--blue:#1a7f4b'));
  assert.ok(saida.includes('#dcf59a'));
});

test('hslToHex e rgbToHsl fecham o círculo', () => {
  for (const cor of ['#1558ee', '#dcf59a', '#11223e', '#edf3ff', '#808080']) {
    const rgb = [...cor.slice(1).match(/../g)].map(x => parseInt(x, 16));
    assert.equal(hslToHex(rgbToHsl(rgb)), cor.length === 7 ? cor : cor);
  }
});

test('o modo de demonstração é o estado por omissão', () => {
  assert.equal(resolveSchool(base).demo, true);
  assert.equal(resolveSchool({...base, demo: true}).demo, true);
  assert.throws(() => resolveSchool({...base, demo: 'sim'}), /inválida/);
});

test('sair da demonstração exige um destino real para as candidaturas', () => {
  // Sem API configurada, o formulário não envia nada — e o site deixaria de o
  // dizer. É a combinação que o build recusa, não o sinalizador.
  assert.throws(() => resolveSchool({...base, demo: false}), /`api`/);
  assert.throws(
    () => resolveSchool({...base, demo: false, api: {origin: 'https://siga.example', campaignSlug: 'campanha-x'}}),
    /portalUrl/,
  );
  const real = resolveSchool({
    ...base, demo: false, portalUrl: 'https://portal.example',
    api: {origin: 'https://siga.example', campaignSlug: 'campanha-x'},
  });
  assert.equal(real.demo, false);
  assert.deepEqual(real.api, {origin: 'https://siga.example', campaignSlug: 'campanha-x'});
});

test('a origem da API e o slug da campanha são validados', () => {
  const com = api => () => resolveSchool({...base, api});
  for (const origin of ['http://siga.example', 'https://siga.example/api', 'https://u:p@siga.example', 'siga.example']) {
    assert.throws(com({origin, campaignSlug: 'campanha-x'}), /Origem da API inválida/, origin);
  }
  for (const campaignSlug of ['', 'Campanha', 'campanha com espaços', 'c']) {
    assert.throws(com({origin: 'https://siga.example', campaignSlug}), /Slug da campanha inválido/, JSON.stringify(campaignSlug));
  }
  // Localhost continua a servir para ensaiar antes de publicar.
  assert.deepEqual(
    resolveSchool({...base, api: {origin: 'http://localhost:4184', campaignSlug: 'campanha-x'}}).api,
    {origin: 'http://localhost:4184', campaignSlug: 'campanha-x'},
  );
});
