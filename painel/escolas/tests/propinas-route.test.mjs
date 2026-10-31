import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const generated=(path)=>readFileSync(new URL('../dist/'+path,import.meta.url),'utf8');
const target='https://ispab.portal-siga.com/portal?escola=ispab';

test('reuses existing ISPAB academic domain and Pages website',()=>{
 const cfg=JSON.parse(readFileSync(new URL('../school.config.json',import.meta.url),'utf8'));
 assert.equal(cfg.id,'ispab');
 assert.equal(cfg.portalUrl,target);
 const runtime=JSON.parse(generated('school-runtime.json'));
 assert.equal(runtime.schoolSlug,'ispab');
 assert.equal(runtime.portalUrl,target);
});

test('offers a real, unprivileged destination for the Kursinha delivery field',()=>{
 const html=generated('propinas/confirmacao/index.html');
 assert.match(html,/<title>Acompanhar pagamento — ISPAB \| ISPAB<\/title>/);
 assert.ok(html.includes(target.replace(/&/g,'&amp;')) || html.includes(target));
 assert.match(html,/A abertura desta página não confirma por si só o recebimento/);
 assert.match(html,/não cria recibos, não altera saldos e não confirma pagamentos/);
 assert.doesNotMatch(html,/<input[^>]+(?:type="password"|name="password")/i);
 assert.doesNotMatch(html,/Pagamento confirmado|Propina liquidada|Pagamento aprovado/i);
});

test('integrates propinas route into the original institutional site navigation',()=>{
 const html=generated('propinas/index.html');
 assert.ok(html.includes('/propinas/confirmacao/'));
 assert.ok(html.includes(target.replace(/&/g,'&amp;')) || html.includes(target));
 assert.ok(generated('index.html').includes('/propinas/'));
 assert.ok(generated('propinas/confirmacao/index.html').includes('/servicos/secretaria/'));
 const sitemap=generated('mapa-do-site/index.html');
 assert.ok(sitemap.includes('/propinas/'));
 assert.ok(sitemap.includes('/propinas/confirmacao/'));
});
