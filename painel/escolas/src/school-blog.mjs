export async function setupSchoolBlog(config,{esc}){
  const root=document.querySelector('[data-school-blog]')||document.querySelector('[data-school-blog-feed]');const isFeed=root?.hasAttribute('data-school-blog-feed');if(!root||config?.serverBlog)return;
  let endpoint=config?.blogUrl;
  if(!endpoint&&config?.contentUrl){try{const url=new URL(config.contentUrl);if(url.pathname.startsWith('/api/public/school-content/')){url.pathname=url.pathname.replace('/school-content/','/school-blog/');endpoint=url.href}}catch{}}
  if(!endpoint)return;
  try{
    const url=new URL(endpoint);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))return;
    const slug=new URLSearchParams(location.search).get('artigo'),page=Number(new URLSearchParams(location.search).get('page')||0);
    if(slug)url.searchParams.set('slug',slug);else url.searchParams.set('page',String(Number.isInteger(page)&&page>=0?page:0));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);let data;
    try{const response=await fetch(url,{credentials:'omit',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('unavailable');data=await response.json()}finally{clearTimeout(timer)}
    const cover=post=>{try{const u=new URL(post.coverUrl);return u.protocol==='https:'&&!u.username&&!u.password?`<img src="${esc(u.href)}" alt="${esc(post.coverAlt||'')}" loading="lazy">`:''}catch{return''}};
    if(slug){
      const post=data.post;if(!post||typeof post.title!=='string'||typeof post.body!=='string')throw Error('invalid');
      root.innerHTML=`<article class="prose"><a class="text-link" href="/blog/">Voltar ao blog ↗</a><p class="eyebrow">${esc(post.category)}</p><h2>${esc(post.title)}</h2><p>${esc(post.excerpt)}</p>${cover(post)}${post.body.split(/\n\s*\n/).map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('')}</article>`;
      document.title=post.title+' | Blog da escola';
    }else{
      if(!Array.isArray(data.posts))throw Error('invalid');
      root.innerHTML=data.posts.length?`${isFeed?'':'<div class="article-grid">'}${(isFeed?data.posts.slice(0,3):data.posts).map(post=>`<article class="article-card"><a href="/blog/?artigo=${encodeURIComponent(post.slug)}">${cover(post)}<span class="eyebrow">${esc(post.category)}</span><h3>${esc(post.title)}</h3></a><p>${esc(post.excerpt)}</p><a class="text-link" href="/blog/?artigo=${encodeURIComponent(post.slug)}">Ler artigo ↗</a></article>`).join('')}${isFeed?'':'</div>'}`:'<p class="quiet-note">Ainda não há publicações disponíveis. Volte em breve para conhecer as novidades da instituição.</p>';
      if(!isFeed&&(page>0||((page+1)*12<data.total))){const nav=document.createElement('nav');nav.className='blog-pagination';nav.setAttribute('aria-label','Páginas do blog');for(const [number,label] of [[page-1,'Anterior'],[page+1,'Seguinte']])if(number>=0&&(number<=page||number*12<data.total)){const link=document.createElement('a');link.className='outline-button';link.href='/blog/?page='+number;link.textContent=label;nav.append(link)}root.append(nav)}
    }
  }catch{root.replaceChildren();const p=document.createElement('p');p.setAttribute('role','status');p.textContent='Não foi possível carregar as publicações agora. Volte a tentar dentro de instantes.';root.append(p)}
}
