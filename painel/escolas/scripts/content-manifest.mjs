import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as data from '../src/data.mjs';

const decode=s=>s.replace(/&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[v.toLowerCase()]);
const labels={courses:'Cursos',areas:'Áreas de formação',events:'Agenda',articles:'Notícias',services:'Serviços',faqs:'Perguntas frequentes'};
const names={name:'Nome',title:'Título',description:'Descrição',text:'Texto',level:'Formação',mode:'Modalidade',shift:'Turno',duration:'Duração',years:'Duração em anos',modules:'Plano de estudos',image:'Imagem do catálogo',subjects:'Plano de estudos',careers:'Saídas profissionais',category:'Categoria',date:'Data',time:'Horário',place:'Local',day:'Dia',month:'Mês',url:'Destino'};

/** Mark text ranges with comments: no extra wrappers or changes to layout. */
// O manifesto mostra ao editor o texto como o visitante o lê: os valores que
// saem do data.mjs passam pelo brand(), como passam no site. As ligações para
// os dados (dataPath) continuam a apontar ao ficheiro de origem.
export function writeContentManifest(out,routes,brand=x=>x){
  const fields=[];const byKey=new Map();const shared=new Map();
  const add=field=>{if(!byKey.has(field.key)){fields.push(field);byKey.set(field.key,field)}return field.key};
  for(const [collection,group] of Object.entries(labels)){
    function visit(value,parts,record){
      if(value&&typeof value==='object'){for(const [key,item] of Object.entries(value))if(!['id','area','icon','color','featured'].includes(key))visit(item,[...parts,key],record);return}
      if(!['string','number'].includes(typeof value))return;
      const prop=parts.at(-1),kind=typeof value==='number'?'number':prop==='image'?'asset':prop==='url'?'link':'text';
      const key='data.'+collection+'.'+parts.join('.');
      add({key,group:group+' · '+brand(record),kind,label:names[prop]||names[parts.at(-2)]||'Texto',value:brand(String(value)),dataPath:[collection,...parts]});
      if(kind==='text'&&brand(String(value)).trim().length>2){const texto=brand(String(value));shared.set(texto,shared.has(texto)?null:key)}
    }
    data[collection].forEach((row,index)=>visit(row,[String(index)],String(row.name||row.title||index+1)));
  }
  const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const route of routes){
    if(route.url.startsWith('/portal/')||route.url==='/404/')continue;
    const file=path.join(out,route.url,'index.html');let n=0,scope=route.url+':metadata';const stack=[];const contexts=[];const routeCourse=data.courses.findIndex(c=>route.url==='/cursos/'+c.id+'/');
    const key=()=>createHash('sha256').update(scope+':'+(++n)).digest('hex').slice(0,16);
    const pageGroup=brand(route.title)+' · '+route.url;
    const currentGroup=()=>scope==='navigation'?'Navegação':scope==='footer'?'Rodapé':pageGroup;
    let html=fs.readFileSync(file,'utf8');
    html=html.replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g,token=>{
      if(token.startsWith('<!'))return token;
      const closing=token.match(/^<\/([\w-]+)/);
      if(closing){const i=stack.lastIndexOf(closing[1].toLowerCase());if(i>=0){stack.splice(i);while(contexts.at(-1)?.depth>=i+1)contexts.pop()}return token}
      const opening=token.match(/^<([\w-]+)/);
      if(opening){
        const tag=opening[1].toLowerCase();
        if(['body','main','footer'].includes(tag)){scope=tag==='body'?'navigation':tag==='footer'?'footer':route.url;n=0}
        const group=currentGroup();const excluded=stack.some(t=>['script','style','svg','textarea','select','noscript'].includes(t));
        if(!voids.has(tag))stack.push(tag);
        const courseId=token.match(/data-course="([^"]+)"/)?.[1];if(courseId)contexts.push({depth:stack.length,index:data.courses.findIndex(c=>c.id===courseId)});
        if(excluded||['script','style','svg','link'].includes(tag))return token;
        const attrs=[];
        token=token.replace(/\s(src|alt|href|placeholder|aria-label|content)="([^"]*)"/g,(whole,attr,raw)=>{
          if(attr==='content'&&!/name="description"/.test(token))return whole;
          if(attr==='href'&&(tag!=='a'||raw.startsWith('#')||raw.startsWith('/signin')))return whole;
          if(attr==='src'&&tag!=='img')return whole;
          const value=decode(raw);if(!value&&attr!=='alt')return whole;
          const index=contexts.at(-1)?.index??routeCourse;const imageField=attr==='src'&&index>=0&&value==='/assets/'+data.courses[index].image+'.webp'?'data.courses.'+index+'.image':null;
          const id=imageField||key();attrs.push(attr+':'+id);add({key:id,group,kind:attr==='src'?'image':attr==='href'?'link':'text',label:({src:'Imagem',alt:'Descrição da imagem',href:'Destino do link',content:'Descrição para motores de pesquisa',placeholder:'Ajuda do campo','aria-label':'Rótulo acessível'})[attr],value});return whole;
        });
        if(tag==='title'){const id=key();attrs.push('title:'+id);add({key:id,group,kind:'text',label:'Título no navegador',value:brand(route.title+' | {{SCHOOL}}')})}
        return attrs.length?token.replace(/>$/,' data-site-fields="'+attrs.join(' ')+'">'):token;
      }
      if(stack.some(t=>['head','script','style','svg','textarea','select','noscript'].includes(t)))return token;
      const value=decode(token).trim();if(!value||!/[\p{L}\p{N}]/u.test(value))return token;
      const index=contexts.at(-1)?.index??routeCourse;const matching=index>=0?fields.find(f=>f.dataPath?.[0]==='courses'&&f.dataPath[1]===String(index)&&f.value===value&&f.kind==='text'):null;
      const id=matching?.key||shared.get(value)||key();if(!byKey.has(id))add({key:id,group:currentGroup(),kind:'text',label:'Texto · '+value.slice(0,70),value});
      return '<!--site:'+id+'-->'+token+'<!--/site-->';
    });
    fs.writeFileSync(file,html);
  }
  const version=createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0,20);
  const manifest={version,fields};fs.writeFileSync(path.join(out,'content-manifest.json'),JSON.stringify(manifest));
  fs.writeFileSync(path.join(out,'content-bindings.json'),JSON.stringify({version,fields:fields.filter(f=>f.dataPath).map(({key,kind,dataPath})=>({key,kind,dataPath}))}));
  return manifest;
}
