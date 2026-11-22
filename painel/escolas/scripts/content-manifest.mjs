import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as data from '../src/data.mjs';

const decode=s=>s.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[v.toLowerCase()]);
const labels={courses:'Cursos',areas:'Áreas de formação',events:'Agenda',articles:'Notícias',services:'Serviços',faqs:'Perguntas frequentes'};
const names={name:'Nome',title:'Título',description:'Descrição',text:'Texto',level:'Formação',mode:'Modalidade',shift:'Turno',duration:'Duração',years:'Duração em anos',modules:'Plano de estudos',image:'Imagem do catálogo',subjects:'Plano de estudos',careers:'Saídas profissionais',category:'Categoria',date:'Data',time:'Horário',place:'Local',day:'Dia',month:'Mês',url:'Destino'};

/**
 * Chaves estáveis dos campos editáveis (resolve o problema que motivou a #206).
 *
 * A chave antiga era um contador por secção (`sha256(scope:n)`): acrescentar um
 * parágrafo ao modelo deslocava as chaves de todos os campos seguintes, e o que a
 * escola escreveu passava para outros elementos. Agora:
 *  - as chaves que já existiam ficam congeladas em `content-keys.json` (gerado uma vez
 *    com o algoritmo antigo), por isso o manifesto do modelo actual sai igual, byte a
 *    byte, e nenhum rascunho ou publicação das escolas precisa de migração;
 *  - um campo novo recebe uma chave pelo texto (`fieldKey`, o esquema da #206): âmbito,
 *    atributo e texto normalizado, com desempate pela ordem só entre repetições.
 * Mudar o texto de um campo dá-lhe uma chave nova, como na #206.
 */
const KEYS_FILE=new URL('../content-keys.json',import.meta.url);
export const normalizeFieldText=value=>String(value).replace(/\s+/g,' ').trim();
export function fieldKey(scope,attr,value,occurrence=1){
  const base=scope+'\u0000'+attr+'\u0000'+normalizeFieldText(value);
  return createHash('sha256').update(occurrence>1?base+'\u0000'+occurrence:base).digest('hex').slice(0,16);
}
const registryId=(scope,attr,value,occurrence)=>createHash('sha256').update(scope+'\u0000'+attr+'\u0000'+normalizeFieldText(value)+'\u0000'+occurrence).digest('hex').slice(0,24);
function readKeyRegistry(file){
  try{const parsed=JSON.parse(fs.readFileSync(file,'utf8'));return parsed&&typeof parsed.keys==='object'?parsed.keys:null}catch{return null}
}

/** Mark text ranges with comments: no extra wrappers or changes to layout. */
export function writeContentManifest(out,routes,options={}){
  const keysFile=options.keysFile??KEYS_FILE;
  // Sem registo (primeira vez), gera as chaves antigas e grava-as: o registo nunca falta.
  const frozen=options.bootstrap?null:readKeyRegistry(keysFile);
  const recorded={};
  const fields=[];const byKey=new Map();const shared=new Map();
  const add=field=>{if(!byKey.has(field.key)){fields.push(field);byKey.set(field.key,field)}return field.key};
  for(const [collection,group] of Object.entries(labels)){
    function visit(value,parts,record){
      if(value&&typeof value==='object'){for(const [key,item] of Object.entries(value))if(!['id','area','icon','color','featured'].includes(key))visit(item,[...parts,key],record);return}
      if(!['string','number'].includes(typeof value))return;
      const prop=parts.at(-1),kind=typeof value==='number'?'number':prop==='image'?'asset':prop==='url'?'link':'text';
      const key='data.'+collection+'.'+parts.join('.');
      add({key,group:group+' · '+record,kind,label:names[prop]||names[parts.at(-2)]||'Texto',value:String(value),dataPath:[collection,...parts]});
      if(kind==='text'&&String(value).trim().length>2)shared.set(String(value),shared.has(String(value))?null:key);
    }
    data[collection].forEach((row,index)=>visit(row,[String(index)],row.name||row.title||String(index+1)));
  }
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const route of routes){
    if(route.url.startsWith('/portal/')||route.url==='/404/')continue;
    const file=path.join(out,route.url,'index.html');let n=0,scope=route.url+':metadata',seen=new Map();const stack=[];const contexts=[];const scopes=[];const routeCourse=data.courses.findIndex(c=>route.url==='/cursos/'+c.id+'/');
    const key=(attr,value)=>{
      const legacy=createHash('sha256').update(scope+':'+(++n)).digest('hex').slice(0,16);
      const text=normalizeFieldText(value);const slot=scope+'\u0000'+attr+'\u0000'+text;
      const occurrence=(seen.get(slot)??0)+1;seen.set(slot,occurrence);
      const id=registryId(scope,attr,text,occurrence);
      if(!frozen){const votes=recorded[id]??=new Map();votes.set(legacy,(votes.get(legacy)??0)+1);return legacy}
      return frozen[id]??fieldKey(scope,attr,text,occurrence);
    };
    const pageGroup=route.title+' · '+route.url;
    const currentGroup=()=>scope==='navigation'?'Navegação':scope==='footer'?'Rodapé':pageGroup;
    let html=fs.readFileSync(file,'utf8');
    html=html.replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g,token=>{
      if(token.startsWith('<!'))return token;
      const closing=token.match(/^<\/([\w-]+)/);
      if(closing){const i=stack.lastIndexOf(closing[1].toLowerCase());if(i>=0){stack.splice(i);while(contexts.at(-1)?.depth>=i+1)contexts.pop();while(scopes.at(-1)?.depth>=i+1){const previous=scopes.pop();scope=previous.scope;n=previous.n;seen=previous.seen}}return token}
      const opening=token.match(/^<([\w-]+)/);
      if(opening){
        const tag=opening[1].toLowerCase();
        if(['body','main','footer'].includes(tag)){scope=tag==='body'?'navigation':tag==='footer'?'footer':route.url;n=0;seen=new Map()}
        const group=currentGroup();const excluded=stack.some(t=>['script','style','svg','textarea','select','noscript'].includes(t));
        if(!voids.has(tag))stack.push(tag);
        const namedScope=token.match(/data-site-scope="([a-z0-9-]+)"/)?.[1];if(namedScope){scopes.push({depth:stack.length,scope,n,seen});scope=route.url+':'+namedScope;n=0;seen=new Map()}
        const courseId=token.match(/data-course="([^"]+)"/)?.[1];if(courseId)contexts.push({depth:stack.length,index:data.courses.findIndex(c=>c.id===courseId)});
        if(excluded||['script','style','svg','link'].includes(tag))return token;
        const attrs=[];
        token=token.replace(/\s(src|alt|href|placeholder|aria-label|content)="([^"]*)"/g,(whole,attr,raw)=>{
          if(attr==='content'&&!/name="description"/.test(token))return whole;
          if(attr==='href'&&(tag!=='a'||raw.startsWith('#')||raw.startsWith('/signin')))return whole;
          if(attr==='src'&&tag!=='img')return whole;
          const value=decode(raw);if(!value&&attr!=='alt')return whole;
          const index=contexts.at(-1)?.index??routeCourse;const imageField=attr==='src'&&index>=0&&value==='/assets/'+data.courses[index].image+'.webp'?'data.courses.'+index+'.image':null;
          const id=imageField||key(attr,value);attrs.push(attr+':'+id);add({key:id,group,kind:attr==='src'?'image':attr==='href'?'link':'text',label:({src:'Imagem',alt:'Descrição da imagem',href:'Destino do link',content:'Descrição para motores de pesquisa',placeholder:'Ajuda do campo','aria-label':'Rótulo acessível'})[attr],value});return whole;
        });
        if(tag==='title'){const id=key('title',route.title);attrs.push('title:'+id);add({key:id,group,kind:'text',label:'Título no navegador',value:route.title+' | ISPAB'})}
        return attrs.length?token.replace(/>$/,' data-site-fields="'+attrs.join(' ')+'">'):token;
      }
      if(stack.some(t=>['head','script','style','svg','textarea','select','noscript'].includes(t)))return token;
      const value=decode(token).trim();if(!value||!/[\p{L}\p{N}]/u.test(value))return token;
      const index=contexts.at(-1)?.index??routeCourse;const matching=index>=0&&scope!=='navigation'&&scope!=='footer'?fields.find(f=>f.dataPath?.[0]==='courses'&&f.dataPath[1]===String(index)&&f.value===value&&f.kind==='text'):null;
      const id=matching?.key||shared.get(value)||key('',value);if(!byKey.has(id))add({key:id,group:currentGroup(),kind:'text',label:'Texto · '+value.slice(0,70),value});
      return '<!--site:'+id+'-->'+token+'<!--/site-->';
    });
    fs.writeFileSync(file,html);
  }
  // A mesma secção partilhada (menu, rodapé) repete-se em todas as páginas: fica a chave
  // que a maioria das páginas lhe dava. Nas poucas onde o contador antigo deslizava (um
  // texto do menu igual a um campo do curso da página), o menu passa a ter a chave certa.
  if(!frozen){
    const keys=Object.fromEntries(Object.entries(recorded).map(([id,votes])=>[id,[...votes].sort((a,b)=>b[1]-a[1])[0][0]]).sort(([a],[b])=>a.localeCompare(b)));
    fs.writeFileSync(keysFile,JSON.stringify({about:'Chaves congeladas dos campos editáveis do website (scripts/content-manifest.mjs). Não editar à mão.',keys})+'\n');
  }
  const version=createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0,20);
  const manifest={version,fields};fs.writeFileSync(path.join(out,'content-manifest.json'),JSON.stringify(manifest));
  fs.writeFileSync(path.join(out,'content-bindings.json'),JSON.stringify({version,fields:fields.filter(f=>f.dataPath).map(({key,kind,dataPath})=>({key,kind,dataPath}))}));
  return manifest;
}
