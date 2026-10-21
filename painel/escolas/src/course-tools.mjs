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

export function setupCourseNavigation({doc = document, win = window} = {}) {
  const nav = doc.querySelector('.course-subnav'); if (!nav || !win.IntersectionObserver) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const pairs = links.map(link => ({link, section: doc.getElementById(link.hash.slice(1))})).filter(pair => pair.section);
  const visible = new Set();
  const activate = link => {for (const item of links) {item.classList.toggle('current', item === link); if (item === link) item.setAttribute('aria-current', 'location'); else item.removeAttribute('aria-current');}};
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
    const first = pairs.find(pair => visible.has(pair.section)); if (first) activate(first.link);
  }, {rootMargin: '-15% 0px -55% 0px', threshold: 0});
  pairs.forEach(pair => observer.observe(pair.section));
  const initial = pairs.find(pair => pair.link.hash === win.location.hash) || pairs[0]; if (initial) activate(initial.link);
  nav.addEventListener('click', event => {const link = event.target.closest('a[href^="#"]'); if (links.includes(link)) activate(link);});
}
