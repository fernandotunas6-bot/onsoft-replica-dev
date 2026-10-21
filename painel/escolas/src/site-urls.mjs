const meta=name=>typeof document==='undefined'?'':document.querySelector(`meta[name="${name}"]`)?.content||'';
export const siteAsset=value=>{const base=meta('school-site-assets');return base&&value.startsWith('/')&&!value.startsWith(base+'/')?base+value:value};
export const sitePathname=()=>{const base=meta('school-site-base'),current=location.pathname;return base&&(current===base||current.startsWith(base+'/'))?current.slice(base.length)||'/':current};
export function siteHref(value){
  const base=meta('school-site-base');if(!base||typeof value!=='string')return value;
  let url;try{url=new URL(value,location.origin)}catch{return value}
  if(url.origin!==location.origin||!['http:','https:'].includes(url.protocol)||!value.startsWith('/'))return value;
  if(url.pathname===base||url.pathname.startsWith(base+'/')||url.pathname.startsWith('/_school-website/'))return value;
  if(url.pathname==='/')return (meta('school-site-home')||'/')+url.search+url.hash;
  if(/^\/(?:login|portal)(?:\/|$)/.test(url.pathname)){try{return JSON.parse(document.querySelector('#school-site-bootstrap')?.textContent||'{}').portalUrl||'/portal'}catch{return'/portal'}}
  if(url.pathname.startsWith('/noticias/'))return base+'/blog/';
  let routes=[];try{routes=JSON.parse(document.querySelector('#school-site-bootstrap')?.textContent||'{}').routes||[]}catch{}
  return routes.includes(url.pathname)||url.pathname.startsWith('/blog/')?base+url.pathname+url.search+url.hash:value;
}
export function mountWebsiteLinks(){
  if(!meta('school-site-base'))return;
  const update=root=>{
    const nodes=[];if(root.nodeType===1)nodes.push(root);if(root.querySelectorAll)nodes.push(...root.querySelectorAll('a[href],form[action],img[src]'));
    for(const node of nodes){if(node.matches?.('a[href]'))node.setAttribute('href',siteHref(node.getAttribute('href')));if(node.matches?.('form[action]'))node.setAttribute('action',siteHref(node.getAttribute('action')))}
  };
  update(document);
  new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)if(node.nodeType===1)update(node)}).observe(document.body,{childList:true,subtree:true});
}
