import {siteHref,sitePathname} from './site-urls.mjs';
import {iconHTML} from './icons.mjs';
const titles={'':'Visão geral',disciplinas:'As minhas disciplinas',notas:'Notas e frequência',horarios:'O meu horário',candidaturas:'Inscrição e matrícula',financeiro:'Financeiro',documentos:'Documentos',pedidos:'Requerimentos',perfil:'O meu perfil'};
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node};
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('pt-AO',{maximumFractionDigits:1}):'—';
const array=value=>Array.isArray(value)?value:[];
function portalURL(config){try{const u=new URL(config.portalUrl);return !u.username&&!u.password&&(u.protocol==='https:'||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))?u:null}catch{return null}}
export function setupStudentPortal(config,{connected=false,win=window}={}){
  if(!document.body.classList.contains('portal-body'))return;
  const portal=portalURL(config),student=portal?new URL(portal):null;if(student)student.searchParams.set('vista','estudante');
  const exit=document.querySelector('.sidebar-bottom a[href*="signout"]');
  if(!connected){
    if(exit){exit.href=siteHref('/login/');exit.textContent='← Escolher outro portal';exit.removeAttribute('target')}
    if(student){const a=el('a','Entrar com a conta da escola ↗');a.href=student.href;document.querySelector('.demo-strip')?.append(a)}
    return;
  }
  const section=sitePathname().match(/^\/portal\/(?:([^/]+)\/)?$/)?.[1]||'';
  const main=document.querySelector('main');if(!main||!Object.hasOwn(titles,section))return;
  document.body.dataset.portalMode='connected';
  const strip=document.querySelector('.demo-strip');strip?.replaceChildren(el('span','Portal do estudante'),el('p','A ligar à sua conta académica…'));
  document.querySelector('.sidebar-profile')?.replaceChildren();document.querySelector('.profile-small')?.replaceChildren();document.querySelector('.portal-footer')?.replaceChildren(el('span',String(config.schoolName||'')+' · Portal do estudante'));
  const notification=document.querySelector('#portal-notifications');
  if(notification){const a=el('a',null,'icon-button');a.innerHTML=iconHTML('♧');a.setAttribute('aria-label','Abrir comunicações');if(portal){a.href=new URL('/comunicacoes',portal).href;a.target='_top'}notification.replaceWith(a)}
  const schoolSlug=String(config.schoolSlug||'');let requestId='',timer,disposed=false;
  function heading(){const title=el('div',null,'portal-page-title');title.append(el('h1',titles[section]));main.replaceChildren(title)}
  function accountLink(label,path){const a=el('a',label,'button small');if(portal){a.href=new URL(path,portal).href;a.target='_top'}return a}
  function state(message,error=false){heading();const panel=el('section',null,'portal-panel');const p=el('p',message);p.setAttribute('role',error?'alert':'status');panel.append(p);if(student){const a=el('a','Entrar na minha conta ↗','text-link');a.href=student.href;a.target='_top';panel.append(a)}if(error&&win.parent!==win){const button=el('button','Tentar novamente','outline-button');button.type='button';button.addEventListener('click',request);panel.append(button)}main.append(panel);document.body.dataset.studentPortalState=error?'error':'loading'}
  function panel(title){const node=el('section',null,'portal-panel');node.append(el('h2',title));main.append(node);return node}
  function table(node,headers,rows){if(!rows.length){node.append(el('p','Ainda não existem registos disponíveis para a sua conta.','quiet-note'));return}const wrap=el('div',null,'table-scroll'),t=el('table',null,'data-table');const head=el('thead'),tr=el('tr');for(const h of headers)tr.append(el('th',h));head.append(tr);const body=el('tbody');for(const row of rows){const line=el('tr');for(const value of row)line.append(el('td',value));body.append(line)}t.append(head,body);wrap.append(t);node.append(wrap)}
  function render(data){
    heading();document.body.dataset.studentPortalState='ready';
    strip?.replaceChildren(el('span','Conta académica'),el('p','Dados consultados no SIGA Plus · '+String(data.yearLabel||'')));
    const profile=document.querySelector('.sidebar-profile');if(profile){const text=el('div');text.append(el('strong',data.name),el('small','Estudante'));profile.replaceChildren(el('span',String(data.name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('')),text)}
    const small=document.querySelector('.profile-small');if(small)small.textContent=String(data.name||'').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('');
    const footer=document.querySelector('.portal-footer');footer?.replaceChildren(el('span',String(data.schoolName||config.schoolName)+' · Portal do estudante'));
    if(section===''){
      const welcome=el('section',null,'portal-welcome'),copy=el('div');copy.append(el('span','O SEU ESPAÇO ACADÉMICO','eyebrow'),el('h2','Olá, '+String(data.name||'').split(' ')[0]),el('p',data.agenda?.className||'Consulte os seus registos e serviços académicos.'));welcome.append(copy);main.append(welcome);
      const grid=el('div',null,'stat-grid');for(const [label,value] of [['Média registada',number(data.agenda?.average)],['Presença',data.attendance?.stats?.total?number(data.attendance.stats.rate)+'%':'—'],['Próxima aula',data.agenda?.nextLesson?.subjectName||'Sem aula indicada'],['Ano lectivo',data.yearLabel||'—']]){const card=el('article',null,'stat-card');card.append(el('strong',value),el('p',label));grid.append(card)}main.append(grid);
      const assessments=panel('Próximas avaliações');table(assessments,['Avaliação','Disciplina','Data'],array(data.agenda?.upcomingAssessments).map(a=>[a.name,a.subjectName,a.date]));
      const quick=panel('Acessos rápidos'),links=el('div',null,'quick-grid');for(const [path,label] of [['notas','Notas e frequência'],['horarios','O meu horário'],['documentos','Documentos'],['pedidos','Requerimentos']]){const a=el('a',label+' ↗');a.href=siteHref('/portal/'+path+'/?connected=1');links.append(a)}quick.append(links);
    }else if(section==='disciplinas'||section==='notas'){
      const year=data.year;const node=panel(section==='notas'?'O seu boletim':'Disciplinas do seu percurso');if(year)node.append(el('p',[year.name,year.className].filter(Boolean).join(' · ')));
      const subjects=array(year?.subjects);if(section==='notas'){
        table(node,['Disciplina','Médias por período','Média final'],subjects.map(s=>[s.subjectName,array(s.terms).map((t,i)=>(i+1)+'.º: '+number(t?.mt)+(t?.provisional?' (provisória)':'')).join(' · '),number(s.finalAverage)]));
        const attendance=panel('Frequência registada'),stats=data.attendance?.stats;attendance.append(el('p',stats?.total?`${stats.present} presenças · ${stats.absent} faltas · ${stats.excused} justificadas`:'Ainda não existem registos de frequência.'));
      }else table(node,['Disciplina','Média final registada'],subjects.map(s=>[s.subjectName,number(s.finalAverage)]));
    }else if(section==='horarios'){
      const schedule=data.timetable;const node=panel(schedule?.className||'Horário publicado');const days=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];table(node,['Dia','Horário','Disciplina','Docente','Sala'],array(schedule?.days).flatMap(d=>array(d.lessons).map(l=>[days[d.weekday]||'—',l.startsAt+' – '+l.endsAt,l.subjectName,l.teacherName||'—',l.room||'—'])));
    }else if(section==='perfil'){
      const node=panel('A sua conta');const dl=el('dl',null,'student-profile');for(const [label,value] of [['Nome',data.name],['E-mail',data.email],['Instituição',data.schoolName]]){const row=el('div');row.append(el('dt',label),el('dd',value||'—'));dl.append(row)}node.append(dl,accountLink('Gerir o meu perfil ↗','/perfil'));
    }else{
      const actions={candidaturas:['Inscrição e matrícula','Consulte as opções de inscrição e renovação disponíveis para a sua conta.','/portal'],financeiro:['Os seus serviços financeiros','Consulte os valores e os meios de pagamento disponíveis na sua conta académica.','/financeiro'],documentos:['Documentos académicos','Consulte os documentos disponibilizados à sua conta ou acompanhe os seus pedidos.','/documentos'],pedidos:['Requerimentos à secretaria','Abra o serviço de documentos para acompanhar ou preparar um requerimento institucional.','/documentos']};
      const [title,text,path]=actions[section];const node=panel(title);node.append(el('p',text),accountLink('Abrir o serviço na minha conta ↗',path));
    }
  }
  function receive(event){const value=event.data;if(!disposed&&event.source===win.parent&&event.origin===win.location.origin&&value?.type==='siga-student-init'&&value.schoolSlug===schoolSlug){request();return}if(disposed||event.source!==win.parent||event.origin!==win.location.origin||!value||value.type!=='siga-student-response'||value.version!==1||value.requestId!==requestId||value.schoolSlug!==schoolSlug||value.section!==section)return;clearTimeout(timer);if(value.ok===true&&value.data&&typeof value.data.name==='string')render(value.data);else state('Não foi possível actualizar os seus dados. Tente novamente dentro de instantes.',true)}
  function request(){if(disposed)return;clearTimeout(timer);state('A consultar os seus dados académicos…');requestId=win.crypto.randomUUID();if(win.parent===win){state('Entre na sua conta académica para consultar os seus dados.',false);return}win.parent.postMessage({type:'siga-student-request',version:1,requestId,schoolSlug,section},win.location.origin);timer=win.setTimeout(()=>state('A ligação à sua conta não respondeu. Pode voltar a tentar.',true),15000)}
  if(exit){const button=el('button','Terminar sessão','text-button');button.type='button';button.addEventListener('click',()=>win.parent.postMessage({type:'siga-student-request',version:1,requestId:win.crypto.randomUUID(),schoolSlug,section,action:'signout'},win.location.origin));exit.replaceWith(button)}
  for(const a of document.querySelectorAll('a[href]')){const u=new URL(a.href,win.location.origin);if(u.origin===win.location.origin&&/\/portal\/(?:[^/]+\/)?$/.test(u.pathname)){u.searchParams.set('connected','1');a.href=u.href}else a.target='_top'}
  win.addEventListener('message',receive);request();
  const cleanup=()=>{disposed=true;clearTimeout(timer);win.removeEventListener('message',receive)};win.addEventListener('pagehide',cleanup,{once:true});return cleanup;
}
