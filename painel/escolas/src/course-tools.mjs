const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function setupCurriculumTools(doc = document) {
  const list = doc.querySelector('#plano .module-list');
  if (!list || list.dataset.toolsReady) return;
  list.dataset.toolsReady = 'true';
  const modules = [...list.querySelectorAll('details')]; if (!modules.length) return;
  const controls = doc.createElement('div'); controls.className = 'curriculum-tools';
  const label = doc.createElement('label'); label.textContent = 'Encontrar um tema no plano';
  const input = doc.createElement('input'); input.type = 'search'; input.id = 'curriculum-query'; input.maxLength = 120; input.placeholder = 'Ex.: programação, gestão, investigação'; label.htmlFor = input.id; label.append(input);
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'text-button'; toggle.setAttribute('aria-controls', 'curriculum-modules');
  const count = doc.createElement('p'); count.className = 'curriculum-count'; count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
  list.id = 'curriculum-modules'; controls.append(label, toggle, count); list.before(controls);
  let savedOpen = null;
  function sync() {
    const visible = modules.filter(module => !module.hidden), expanded = visible.length > 0 && visible.every(module => module.open);
    toggle.textContent = expanded ? 'Recolher todos os temas −' : 'Expandir todos os temas +'; toggle.disabled = !visible.length; toggle.setAttribute('aria-expanded', String(expanded));
    count.textContent = visible.length ? `${visible.length} de ${modules.length} temas disponíveis` : 'Nenhum tema encontrado. Experimente outra palavra.';
  }
  input.addEventListener('input', () => {
    const words = normal(input.value).trim().split(/\s+/).filter(Boolean);
    if (words.length && savedOpen === null) savedOpen = modules.map(module => module.open);
    modules.forEach((module, i) => {module.hidden = !words.every(word => normal(module.textContent).includes(word)); if (words.length && !module.hidden) module.open = true; else if (!words.length && savedOpen) module.open = savedOpen[i];});
    if (!words.length) savedOpen = null;
    sync();
  });
  toggle.addEventListener('click', () => {const expand = toggle.getAttribute('aria-expanded') !== 'true'; for (const module of modules) if (!module.hidden) module.open = expand; sync();});
  modules.forEach(module => module.addEventListener('toggle', sync)); sync();
}

/** Follow the same reading position used by native section anchors. */
export function setupSectionNavigation({nav, pairs, doc = document, win = window} = {}) {
  if (!nav || !pairs?.length || nav.dataset.sectionNavigationReady) return {destroy() {}};
  nav.dataset.sectionNavigationReady = 'true';
  const links = pairs.map(pair => pair.link), scroller = nav.querySelector('.wrap') || nav;
  const previous = links.map(link => ({link, current: link.classList.contains('current'), aria: link.getAttribute('aria-current')}));
  let observer, frame, destroyed = false;
  const reveal = link => {
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const bounds = scroller.getBoundingClientRect(), item = link.getBoundingClientRect();
    if (item.left < bounds.left) scroller.scrollLeft += item.left - bounds.left - 12;
    else if (item.right > bounds.right) scroller.scrollLeft += item.right - bounds.right + 12;
  };
  const activate = link => {
    for (const item of links) {
      item.classList.toggle('current', item === link);
      if (item === link) item.setAttribute('aria-current', 'location');else item.removeAttribute('aria-current');
    }
    reveal(link);
  };
  const fromHash = () => activate((pairs.find(pair => pair.link.hash === win.location.hash) || pairs[0]).link);
  const clicked = event => {const link = event.target.closest?.('a[href^="#"]');if (links.includes(link)) activate(link);};
  const observe = () => {
    if (destroyed || !win.IntersectionObserver) return;
    observer?.disconnect?.();
    const height = win.innerHeight || doc.documentElement.clientHeight || 800;
    const style = node => win.getComputedStyle?.(node);
    const offset = (parseFloat(style(doc.documentElement)?.scrollPaddingTop) || 0) + (parseFloat(style(pairs[0].section)?.scrollMarginTop) || 0);
    // A narrow band prevents a small remnant of the previous section stealing the current marker.
    const line = Math.min(height - 2, Math.max(1, Math.ceil(offset) + 1)), visible = new Set();
    const currentObserver = new win.IntersectionObserver(entries => {
      if (destroyed || observer !== currentObserver) return;
      for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
      const current = pairs.find(pair => visible.has(pair.section));if (current) activate(current.link);
    }, {rootMargin: `-${line}px 0px -${height - line - 1}px 0px`, threshold: 0});
    observer = currentObserver;pairs.forEach(pair => observer.observe(pair.section));
  };
  const resized = () => {
    if (frame !== undefined) return;
    frame = win.requestAnimationFrame(() => {frame = undefined;observe();});
  };
  fromHash();observe();nav.addEventListener('click', clicked);
  win.addEventListener?.('hashchange', fromHash);win.addEventListener?.('resize', resized);
  return {destroy() {
    if (destroyed) return;destroyed = true;observer?.disconnect?.();
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    nav.removeEventListener('click', clicked);win.removeEventListener?.('hashchange', fromHash);win.removeEventListener?.('resize', resized);
    for (const {link, current, aria} of previous) {link.classList.toggle('current', current);if (aria === null) link.removeAttribute('aria-current');else link.setAttribute('aria-current', aria);}
    delete nav.dataset.sectionNavigationReady;
  }};
}

export function setupCourseNavigation({doc = document, win = window} = {}) {
  const nav = doc.querySelector('.course-subnav');
  const pairs = [...(nav?.querySelectorAll('a[href^="#"]') || [])].map(link => ({link, section: doc.getElementById(link.hash.slice(1))})).filter(pair => pair.section);
  return setupSectionNavigation({nav, pairs, doc, win});
}
