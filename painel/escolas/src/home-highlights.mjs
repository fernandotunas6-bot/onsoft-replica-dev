const text = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';
const button = (doc, label, symbol) => {const node = doc.createElement('button');node.type = 'button';node.setAttribute('aria-label', label);node.textContent = symbol;return node;};
export function setupHomeHighlights({doc = document, win = window} = {}) {
  const hero = doc.querySelector('[data-hero-carousel]');
  if (!hero || hero.dataset.carouselReady) return {destroy() {}};
  const slides = [...hero.querySelectorAll(':scope>.hero-photo')];if (slides.length < 2) return {destroy() {}};
  hero.dataset.carouselReady = 'true';hero.setAttribute('role', 'region');hero.setAttribute('aria-roledescription', 'carrossel');hero.setAttribute('aria-label', 'Destaques da instituição');
  const originals = slides.map(slide => ({hidden: slide.hidden, inert: slide.inert, label: slide.getAttribute('aria-label'), role: slide.getAttribute('role'), ariaHidden: slide.getAttribute('aria-hidden')}));
  const controls = doc.createElement('div');controls.className = 'home-slide-controls';controls.setAttribute('aria-label', 'Controlos dos destaques');
  const prev = button(doc, 'Destaque anterior', '‹'), next = button(doc, 'Destaque seguinte', '›'), play = button(doc, 'Pausar destaques', 'Ⅱ');
  const dots = doc.createElement('div');dots.className = 'home-slide-dots';
  const status = doc.createElement('span');status.className = 'sr-only';status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');
  const labels = slides.map(slide => text(slide.querySelector('.hero-photo-caption')).replace(/↗/g, '').trim());
  const choices = slides.map((slide, index) => {const node = button(doc, `Mostrar destaque ${index + 1}: ${labels[index]}`, '');dots.append(node);return node;});
  controls.append(prev, dots, next, play, status);hero.after(controls);
  const media = win.matchMedia('(prefers-reduced-motion: reduce)'), disposers = [];
  const listen = (node, name, fn, opts) => {node.addEventListener(name, fn, opts);disposers.push(() => node.removeEventListener(name, fn, opts));};
  let index = 0, timer = 0, paused = false, hovered = false, visible = !win.IntersectionObserver, suspended = false, animation, pointer, playIntent = null, destroyed = false;
  const reduced = () => media.matches || doc.documentElement.classList.contains('reduce-motion');
  function schedule() {
    win.clearTimeout(timer);timer = 0;play.disabled = reduced();play.textContent = paused || reduced() ? '▷' : 'Ⅱ';
    play.setAttribute('aria-label', reduced() ? 'Rotação automática desactivada por preferência de movimento' : paused ? 'Reproduzir destaques' : 'Pausar destaques');
    if (!destroyed && !paused && !hovered && visible && !suspended && !doc.hidden && !reduced()) timer = win.setTimeout(() => show(index + 1), 7000);
  }
  function show(value, manual = false) {
    animation?.cancel();if (manual) paused = true;index = (value + slides.length) % slides.length;
    slides.forEach((slide, i) => {slide.hidden = i !== index;slide.inert = i !== index;slide.setAttribute('role', 'group');slide.setAttribute('aria-label', `Destaque ${i + 1} de ${slides.length}`);slide.setAttribute('aria-hidden', String(i !== index));choices[i].setAttribute('aria-pressed', String(i === index));});
    if (manual) status.textContent = `Destaque ${index + 1} de ${slides.length}: ${labels[index]}`;
    if (!reduced() && slides[index].animate) animation = slides[index].animate([{opacity: .35}, {opacity: 1}], {duration: 280, easing: 'ease-out'});
    schedule();
  }
  listen(prev, 'click', () => show(index - 1, true));listen(next, 'click', () => show(index + 1, true));choices.forEach((node, i) => listen(node, 'click', () => show(i, true)));
  listen(play, 'pointerdown', () => {playIntent = !paused;});
  listen(play, 'pointercancel', () => {playIntent = null;});
  listen(play, 'click', () => {paused = playIntent ?? !paused;playIntent = null;schedule();});
  const region = hero.parentElement;
  listen(region, 'pointerenter', event => {if (event.pointerType !== 'touch') {hovered = true;schedule();}});
  listen(region, 'pointerleave', () => {hovered = false;schedule();});
  listen(region, 'focusin', () => {paused = true;schedule();});
  listen(hero, 'pointerdown', event => {if (event.pointerType === 'touch' && !event.target.closest('a,button')) pointer = {x: event.clientX, y: event.clientY};});
  listen(hero, 'pointercancel', () => {pointer = null;});
  listen(hero, 'pointerup', event => {if (!pointer) return;const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;pointer = null;if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1), true);});
  listen(media, 'change', () => {if (reduced()) animation?.cancel();schedule();});listen(doc, 'visibilitychange', schedule);
  listen(win, 'pagehide', () => {suspended = true;schedule();});listen(win, 'pageshow', () => {suspended = false;schedule();});
  const preference = new win.MutationObserver(() => {if (reduced()) animation?.cancel();schedule();});preference.observe(doc.documentElement, {attributes: true, attributeFilter: ['class']});
  const observer = win.IntersectionObserver ? new win.IntersectionObserver(entries => {visible = entries.some(entry => entry.isIntersecting);schedule();}, {threshold: .15}) : null;observer?.observe(hero);
  show(0);
  return {destroy() {
    if (destroyed) return;destroyed = true;win.clearTimeout(timer);animation?.cancel();observer?.disconnect();preference.disconnect();disposers.reverse().forEach(fn => fn());controls.remove();
    slides.forEach((slide, i) => {const old = originals[i];slide.hidden = old.hidden;slide.inert = old.inert;for (const [attr, value] of [['aria-label', old.label], ['aria-hidden', old.ariaHidden], ['role', old.role]]) value === null ? slide.removeAttribute(attr) : slide.setAttribute(attr, value);});
    for (const attr of ['role', 'aria-roledescription', 'aria-label', 'data-carousel-ready']) hero.removeAttribute(attr);
  }};
}

export function setupHomeCardRails({doc = document, win = window} = {}) {
  if (!doc.querySelector('.home-hero')) return {destroy() {}};
  const cleanups = [];
  for (const rail of doc.querySelectorAll('main .course-grid,main .article-grid[data-school-blog-feed]')) {
    if (rail.children.length < 2 || rail.classList.contains('home-card-rail')) continue;
    const controls = doc.createElement('div');controls.className = 'home-rail-controls';
    const title = text(rail.closest('section')?.querySelector('h2')), previous = button(doc, `Anterior: ${title}`, '‹'), next = button(doc, `Seguinte: ${title}`, '›');controls.append(previous, next);rail.before(controls);rail.classList.add('home-card-rail');
    const update = () => {previous.disabled = rail.scrollLeft <= 2;next.disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;};
    const scroll = direction => rail.scrollBy({left: direction * (rail.firstElementChild.getBoundingClientRect().width + 16), behavior: win.matchMedia('(prefers-reduced-motion: reduce)').matches || doc.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth'});
    const back = () => scroll(-1), forward = () => scroll(1);previous.addEventListener('click', back);next.addEventListener('click', forward);rail.addEventListener('scroll', update, {passive: true});
    const observer = win.ResizeObserver ? new win.ResizeObserver(update) : null;observer?.observe(rail);update();
    cleanups.push(() => {observer?.disconnect();previous.removeEventListener('click', back);next.removeEventListener('click', forward);rail.removeEventListener('scroll', update);controls.remove();rail.classList.remove('home-card-rail');});
  }
  return {destroy() {cleanups.splice(0).reverse().forEach(fn => fn());}};
}
