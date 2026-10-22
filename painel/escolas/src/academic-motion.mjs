const targets = '.reveal,.area-card,.course-card,.info-card,.service-card,.article-card,.event-card,.resource-card';

// Content remains visible when JavaScript, observation or animation is unavailable.
export function setupAcademicMotion({doc = document, win = window} = {}) {
  if (doc.querySelector('.portal-shell,.portal-sidebar') || !win.IntersectionObserver) return {refresh() {}, destroy() {}};
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const pending = new Set(), seen = new WeakSet(), running = new Map();
  let disabled = media.matches || (doc.documentElement.classList.contains('reduce-motion') || doc.documentElement.dataset.websiteMotion === 'none'), destroyed = false;
  const stop = () => {for (const animation of running.values()) animation.cancel(); running.clear();};
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting || disabled || destroyed || doc.hidden) continue;
      const node = entry.target;
      observer.unobserve(node); pending.delete(node); seen.add(node);
      if (!node.animate || node.contains(doc.activeElement)) continue;
      const siblings = [...(node.parentElement?.children || [])].filter(child => child.matches(targets));
      const delay = Math.min(Math.max(siblings.indexOf(node), 0), 3) * 45;
      const keyframes = doc.documentElement.dataset.websiteMotion === 'fade' ? [{opacity:.55},{opacity:1}] : [{opacity:.55,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}];
      const animation = node.animate(keyframes, {duration: 440, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'});
      running.set(node, animation);
      animation.onfinish = animation.oncancel = () => running.delete(node);
    }
  }, {threshold: .06, rootMargin: '0px 0px -20px 0px'});
  function refresh() {
    if (disabled || destroyed) return;
    for (const node of doc.querySelectorAll(targets)) {
      if (seen.has(node) || pending.has(node) || node.hidden || node.closest('[hidden]')) continue;
      const parent = node.parentElement?.closest('.reveal');
      if (parent) continue;
      pending.add(node); observer.observe(node);
    }
    for (const node of pending) if (!node.isConnected) {pending.delete(node); observer.unobserve(node);}
  }
  function preferenceChanged() {
    const next = media.matches || (doc.documentElement.classList.contains('reduce-motion') || doc.documentElement.dataset.websiteMotion === 'none');
    if (next === disabled) return;
    disabled = next;
    if (disabled) {stop(); observer.disconnect(); pending.clear();}
    else refresh();
  }
  const preferences = new win.MutationObserver(preferenceChanged);
  preferences.observe(doc.documentElement, {attributes: true, attributeFilter: ['class','data-website-motion']});
  media.addEventListener('change', preferenceChanged);
  const visibilityChanged = () => {for (const animation of running.values()) doc.hidden ? animation.pause() : animation.play(); if (!doc.hidden) refresh();};
  const focused = event => {for (const [node, animation] of running) if (node.contains(event.target)) animation.cancel();};
  doc.addEventListener('visibilitychange', visibilityChanged);
  doc.addEventListener('focusin', focused);
  // Only the catalogue changes its card children after initial setup.
  const collections = [...doc.querySelectorAll('#course-results,[data-school-blog]')];
  const cards = collections.length ? new win.MutationObserver(refresh) : null;
  for (const collection of collections) cards.observe(collection, {childList: true, subtree: collection.hasAttribute('data-school-blog')});
  refresh();
  return {refresh, destroy() {destroyed = true; stop(); observer.disconnect(); preferences.disconnect(); cards?.disconnect(); media.removeEventListener('change', preferenceChanged); doc.removeEventListener('visibilitychange', visibilityChanged); doc.removeEventListener('focusin', focused); pending.clear();}};
}
