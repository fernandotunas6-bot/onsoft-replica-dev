import {siteAsset,siteHref} from './site-urls.mjs';
// Public site search only. Browser-local records and portal data are never indexed.
export function setupSiteSearch({courses,normal,esc,schoolName}){
  const form=document.querySelector('#site-search-form');if(!form)return;
  const input=document.querySelector('#site-query'),count=document.querySelector('#site-results-count'),results=document.querySelector('#site-results');
  let index=null,loading=false,timer;
  input.value=new URLSearchParams(location.search).get('q')||'';
  function updateUrl(){history.replaceState(null,'',location.pathname+(input.value.trim()?'?q='+encodeURIComponent(input.value.trim()):''));}
  function render(){
    updateUrl();if(!index)return;
    const query=normal(input.value.trim()),words=query.split(/\s+/).filter(Boolean);
    const found=query?index.filter(row=>words.every(word=>row.hay.includes(word))).map(row=>{
      const score=(row.titleNormal===query?1000:0)+(row.titleNormal.startsWith(query)?200:0)+(row.titleNormal.includes(query)?100:0)+words.reduce((sum,word)=>sum+(row.titleNormal.includes(word)?20:0),0);
      return {row,score};
    }).sort((a,b)=>b.score-a.score||a.row.order-b.row.order).map(item=>item.row):index.filter(row=>['/cursos/','/ingresso/','/biblioteca/','/servicos/','/candidaturas/','/login/'].includes(row.url));
    count.textContent=query?found.length+' resultados encontrados':'Alguns pontos de partida para a sua pesquisa';
    results.innerHTML=found.map(row=>`<a class="site-result" href="${esc(siteHref(row.url))}"><span>${esc(row.kind)}</span><h2>${esc(row.title)} <span>↗</span></h2><small>${esc(siteHref(row.url))}</small></a>`).join('')||(query?'<div class="empty-state"><span>⌕</span><h2>Vamos tentar outra palavra?</h2><p>Nenhum resultado encontrado para esta pesquisa.</p><a class="text-link" href="/mapa-do-site/">Explorar mapa do site ↗</a></div>':'');
  }
  async function load(){
    if(loading)return;loading=true;results.setAttribute('aria-busy','true');count.textContent='A carregar a pesquisa…';
    try{
      const response=await fetch(siteAsset('/search-index.json'));if(!response.ok)throw Error('Unavailable');
      const data=await response.json();if(!Array.isArray(data)||!data.length)throw Error('Invalid index');
      index=data.filter(row=>row&&typeof row.title==='string'&&typeof row.url==='string'&&row.url.startsWith('/')&&!row.url.startsWith('//')&&!row.url.startsWith('/portal/')&&(!/^\/cursos\/[^/]+\/$/.test(row.url)||courses.some(course=>row.url==='/cursos/'+course.id+'/'))).map((row,order)=>{
        const course=courses.find(course=>row.url==='/cursos/'+course.id+'/');
        if(course)row={...row,title:course.name};
        if(schoolName)row={...row,title:row.title.replaceAll('ISPAB',schoolName),searchText:typeof row.searchText==='string'?row.searchText.replaceAll('ISPAB',schoolName):''};
        return {...row,kind:typeof row.kind==='string'?row.kind:'Página',order,titleNormal:normal(row.title),hay:normal(row.title+' '+row.url+' '+(typeof row.searchText==='string'?row.searchText:'')+' '+(course?[course.description,...course.modules,...course.careers].join(' '):''))};
      });
      if(!index.length)throw Error('Empty index');render();
    }catch{
      index=null;count.textContent='A pesquisa está temporariamente indisponível. Tente pesquisar novamente ou explore o mapa do site.';
      results.innerHTML='<a class="text-link" href="/mapa-do-site/">Explorar mapa do site ↗</a>';updateUrl();
    }finally{loading=false;results.removeAttribute('aria-busy');}
  }
  form.addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);if(index)render();else void load();});
  input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{updateUrl();if(index)render();},180);});
  void load();
}
