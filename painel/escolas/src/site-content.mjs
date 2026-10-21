const safeUrl=(value,image=false)=>{
  if(typeof value!=='string'||/[\u0000-\u0020\\]/.test(value))return false;
  if(value.startsWith('/')&&!value.startsWith('//'))return true;
  try{const u=new URL(value);return !u.username&&!u.password&&(u.protocol==='https:'||(!image&&['mailto:','tel:'].includes(u.protocol)))}catch{return false}
};
export function applyPublishedContent(document,values){
  const walker=document.createTreeWalker(document,128);const markers=[];
  while(walker.nextNode())if(walker.currentNode.data.startsWith('site:'))markers.push(walker.currentNode);
  for(const marker of markers){const value=values[marker.data.slice(5)];if(typeof value!=='string')continue;const text=marker.nextSibling;if(text?.nodeType===3&&text.nextSibling?.nodeType===8&&text.nextSibling.data==='/site')text.textContent=value}
  for(const node of document.querySelectorAll('[data-site-fields]'))for(const pair of node.dataset.siteFields.split(' ')){
    const [attr,key]=pair.split(':');let value=values[key];if(attr==='src'&&/^data\.courses\.\d+\.image$/.test(key)&&typeof value==='string'&&/^[a-z0-9-]{1,80}$/.test(value))value='/assets/'+value+'.webp';if(typeof value!=='string')continue;
    if((attr==='src'||attr==='href')&&!safeUrl(value,attr==='src'))continue;
    if(attr==='title')node.textContent=value;else node.setAttribute(attr,value);
    if(attr==='src')node.removeAttribute('srcset');
  }
}
const portalUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
export async function connectSchoolWebsite(data){
  let config;
  try{const r=await fetch('/school-runtime.json',{cache:'no-store'});if(!r.ok)return;config=await r.json()}catch{return}
  // This navigation hands authentication to the existing SIGA, including its MFA.
  const portal=portalUrl(config.portalUrl);
  if(portal){
    for(const link of document.querySelectorAll('a[href]'))if(link.getAttribute('href')==='/login/'||link.hasAttribute('data-siga-login'))link.href=portal;
    const enter=document.querySelector('[data-siga-login]');if(enter){enter.href=portal;enter.removeAttribute('aria-disabled')}
    document.querySelector('[data-siga-status]')?.replaceChildren(document.createTextNode('Utilize a mesma conta do sistema académico. A palavra-passe e a verificação de segurança são tratadas no SIGA Plus.'));
    if(location.pathname.startsWith('/portal/')){if(!new URLSearchParams(location.search).has('demo')){location.replace(portal);return}for(const link of document.querySelectorAll('a[href^="/portal/"]')){const u=new URL(link.href);u.searchParams.set('demo','1');link.href=u.href}}
  }
  if(!config.contentUrl)return;
  try{
    const url=new URL(config.contentUrl);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return;
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),6000);
    let payload;try{const response=await fetch(url,{credentials:'omit',cache:'no-store',signal:abort.signal});if(!response.ok)throw Error('unavailable');payload=await response.json()}finally{clearTimeout(timer)}
    const manifest=await fetch('/content-bindings.json').then(r=>r.json());
    if(payload.apiVersion!==1||!payload.values||typeof payload.values!=='object')throw Error('version');
    // A chave de cada campo vem do seu texto, não da sua posição, por isso um
    // modelo mais recente não desloca ligações: aplica-se o que ainda existe e
    // ignora-se o resto. A versão fica como sinal, não como porta fechada.
    const modeloActual=payload.templateVersion===manifest.version;
    if(payload.admissions){
      const destination=payload.admissions.isOpen&&typeof payload.admissions.path==='string'&&/^\/matricula\/[a-z0-9-]{2,80}$/.test(payload.admissions.path)?new URL(payload.admissions.path,url.origin).href:null;
      for(const link of document.querySelectorAll('a[href]'))if(new URL(link.href).pathname==='/candidatura/'){
        if(destination)link.href=destination;else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.textContent='Candidaturas encerradas'}
      }
      if(location.pathname==='/candidatura/'){
        if(destination){location.replace(destination);return}
        const main=document.querySelector('main');if(main){const section=document.createElement('section');section.className='wrap section empty-state';const h=document.createElement('h1');h.textContent='Candidaturas encerradas';const p=document.createElement('p');p.textContent='A campanha encontra-se encerrada no SIGA Plus. Consulte as orientações de ingresso ou contacte a instituição.';section.append(h,p);main.replaceChildren(section)}
      }
    }
    // The local manifest owns allowed fields and object paths; the API supplies values only.
    const values={...payload.values};for(const field of manifest.fields){const value=payload.values[field.key];if(typeof value!=='string')continue;values[field.key]=value;if(field.dataPath){let target=data;for(const part of field.dataPath.slice(0,-1))target=target?.[part];if(target)target[field.dataPath.at(-1)]=field.kind==='number'?Number(value):value}}
    applyPublishedContent(document,values);
    const unavailable=new Set();for(const key of payload.unavailablePrograms||[]){const field=manifest.fields.find(f=>f.key===key);if(field?.dataPath?.[0]==='courses'){const course=data.courses[Number(field.dataPath[1])];if(course)unavailable.add(course.id)}}
    if(unavailable.size){
      for(let i=data.courses.length-1;i>=0;i--)if(unavailable.has(data.courses[i].id))data.courses.splice(i,1);
      for(const node of document.querySelectorAll('[data-course]'))if(unavailable.has(node.dataset.course))node.remove();
      for(const select of document.querySelectorAll('select'))for(const option of [...select.options])if(unavailable.has(option.value))option.remove();
      const current=location.pathname.match(/^\/cursos\/([^/]+)\//)?.[1];
      if(current&&unavailable.has(current)){const main=document.querySelector('main');if(main){const section=document.createElement('section');section.className='wrap section empty-state';const h=document.createElement('h1');h.textContent='Curso indisponível';const p=document.createElement('p');p.textContent='Este curso deixou de estar activo no sistema académico. Consulte os restantes percursos.';const a=document.createElement('a');a.className='button';a.href='/cursos/';a.textContent='Explorar cursos';section.append(h,p,a);main.replaceChildren(section)}}
    }
    document.documentElement.dataset.sigaContent=modeloActual?'synced':'synced-older';
  }catch{
    document.documentElement.dataset.sigaContent='unavailable';
    const notice=document.createElement('div');notice.className='notice wrap';notice.setAttribute('role','status');const p=document.createElement('p');p.textContent='A sincronização com o SIGA Plus está indisponível. Esta página apresenta os conteúdos de demonstração incluídos no website; confirme as informações no sistema académico.';notice.append(p);document.querySelector('main')?.prepend(notice);
    const status=document.querySelector('[data-siga-status]');if(status)status.textContent='Não foi possível actualizar os conteúdos agora. Pode voltar a tentar ou entrar directamente no SIGA Plus.';
  }
}
