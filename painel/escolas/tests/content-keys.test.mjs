import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fieldKey,writeContentManifest} from '../scripts/content-manifest.mjs';

// Chaves estáveis (resolve o problema da #206 sem migrar rascunhos nem publicações):
// as chaves existentes ficam congeladas em content-keys.json; um campo novo recebe a
// chave pelo texto. Acrescentar um parágrafo já não desloca as chaves dos outros.
const page=body=>`<!doctype html><html lang="pt-AO"><head><title>Teste</title></head><body><nav><a href="/sobre/">Sobre</a></nav><main>${body}</main><footer><p>Rodapé</p></footer></body></html>`;

function build(dir,html,keysFile,bootstrap=false){
  fs.mkdirSync(path.join(dir,'teste'),{recursive:true});
  fs.writeFileSync(path.join(dir,'teste','index.html'),html);
  writeContentManifest(dir,[{url:'/teste/',title:'Teste'}],{keysFile,bootstrap});
  const out=fs.readFileSync(path.join(dir,'teste','index.html'),'utf8');
  return Object.fromEntries([...out.matchAll(/<!--site:([\w.-]+)-->([^<]*)/g)].map(([,key,text])=>[text.trim(),key]));
}

test('um parágrafo novo não muda as chaves dos outros campos', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'escolas-keys-'));
  const keysFile=path.join(dir,'content-keys.json');
  const before=build(dir,page('<p>Um</p><p>Dois</p>'),keysFile);
  assert.ok(fs.existsSync(keysFile),'o primeiro build grava o registo');
  const after=build(dir,page('<p>Novo</p><p>Um</p><p>Dois</p>'),keysFile);
  assert.equal(after['Um'],before['Um']);
  assert.equal(after['Dois'],before['Dois']);
  assert.equal(after['Sobre'],before['Sobre']);
  assert.equal(after['Rodapé'],before['Rodapé']);
  assert.equal(after['Novo'],fieldKey('/teste/','','Novo'));
  assert.notEqual(after['Novo'],before['Um']);
});

test('com o contador antigo, as chaves deslizavam (o defeito que isto corrige)', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'escolas-keys-'));
  const keysFile=path.join(dir,'content-keys.json');
  const before=build(dir,page('<p>Um</p><p>Dois</p>'),keysFile,true);
  const after=build(dir,page('<p>Novo</p><p>Um</p><p>Dois</p>'),keysFile,true);
  assert.equal(after['Novo'],before['Um'],'o texto novo herdava a chave do «Um»');
  assert.notEqual(after['Um'],before['Um']);
});

test('textos repetidos na mesma secção têm chaves distintas e estáveis', () => {
  assert.notEqual(fieldKey('/x/','','Ver mais',1),fieldKey('/x/','','Ver mais',2));
  assert.equal(fieldKey('/x/','','  Ver   mais '),fieldKey('/x/','','Ver mais'));
});

test('o registo do modelo existe e cobre as chaves do manifesto actual', () => {
  const registry=JSON.parse(fs.readFileSync(new URL('../content-keys.json',import.meta.url),'utf8'));
  assert.ok(Object.keys(registry.keys).length>4000);
  const manifest=JSON.parse(fs.readFileSync(new URL('../../../src/features/school-website/template.json',import.meta.url),'utf8'));
  const frozen=new Set(Object.values(registry.keys));
  const free=manifest.fields.filter(f=>!f.key.startsWith('data.')&&!frozen.has(f.key));
  assert.deepEqual(free.map(f=>f.key),[],'nenhuma chave do modelo publicado fica fora do registo');
});
