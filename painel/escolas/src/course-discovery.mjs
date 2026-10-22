import {siteHref} from './site-urls.mjs';
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function findCourseSuggestions(courses, query, level = '') {
  const words = normal(query).trim().split(/\s+/).filter(Boolean);
  if (words.join('').length < 2) return [];
  return courses.filter(course => {
    if (level && course.level !== level) return false;
    const text = normal([course.name, course.description, course.level, ...(course.modules || []), ...(course.careers || [])].join(' '));
    return /^[a-z0-9-]+$/.test(course.id) && words.every(word => text.includes(word));
  }).sort((a, b) => Number(normal(b.name).startsWith(normal(query))) - Number(normal(a.name).startsWith(normal(query))) || a.name.localeCompare(b.name, 'pt')).slice(0, 5);
}

export function setupCourseDiscovery(courses, {doc = document, navigate = url => location.assign(url), input = doc.querySelector('#hero-search-q'), idPrefix = 'hero'} = {}) {
  const form = input?.form;
  if (!input || !form || input.dataset.discoveryReady) return;
  const originalAttributes = new Map(['role','aria-autocomplete','aria-controls','aria-expanded','autocomplete','aria-activedescendant'].map(name => [name, input.getAttribute(name)]));
  input.dataset.discoveryReady = 'true';
  const field = input.parentElement, level = form.querySelector('#hero-search-level');
  const hadFieldClass = field.classList.contains('discovery-field');field.classList.add('discovery-field');
  const popup = doc.createElement('div'); popup.className = 'course-suggestions'; popup.hidden = true;
  const list = doc.createElement('ul'); list.id = idPrefix + '-course-options'; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Sugestões de cursos');
  const status = doc.createElement('p'); status.className = 'discovery-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  popup.append(list, status); field.append(popup);
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'false'); input.setAttribute('autocomplete', 'off');
  let selected = -1, composing = false, placementFrame;
  function place() {
    if (popup.hidden || form.classList.contains('header-search-form')) return;
    const viewport = doc.defaultView?.visualViewport, win = doc.defaultView;
    const top = viewport?.offsetTop || 0, bottom = top + (viewport?.height || win?.innerHeight || doc.documentElement.clientHeight);
    const bounds = field.getBoundingClientRect(), header = doc.querySelector('.site-header')?.getBoundingClientRect();
    const start = Math.max(top, header && header.top <= top && header.bottom > top ? header.bottom : top);
    const below = Math.max(0, bottom - bounds.bottom - 17), above = Math.max(0, bounds.top - start - 17);
    // Keep the existing list within the visible viewport, including a mobile keyboard.
    const required = Math.min(popup.scrollHeight, 360, (bottom - top) * .6);
    const upwards = below < required && above > below;
    popup.classList.toggle('is-above', upwards);
    popup.style.maxHeight = Math.max(0, Math.min(required, upwards ? above : below)) + 'px';
    revealSelection();
  }
  const schedulePlacement = () => {
    if (popup.hidden || placementFrame !== undefined) return;
    placementFrame = doc.defaultView.requestAnimationFrame(() => {placementFrame = undefined;place();});
  };
  const options = () => [...list.querySelectorAll('[role=option]')];
  function close() {if (placementFrame !== undefined) {doc.defaultView.cancelAnimationFrame(placementFrame);placementFrame = undefined;}popup.hidden = true; selected = -1; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); for (const option of options()) option.setAttribute('aria-selected', 'false');}
  function choose(index) {
    const items = options(); if (!items.length) return;
    selected = (index + items.length) % items.length;
    items.forEach((item, i) => item.setAttribute('aria-selected', String(i === selected)));
    input.setAttribute('aria-activedescendant', items[selected].id);
    revealSelection();
  }
  function revealSelection() {
    const option = options()[selected];if (!option) return;
    const bounds = popup.getBoundingClientRect(), item = option.getBoundingClientRect();
    if (item.top < bounds.top) popup.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) popup.scrollTop += item.bottom - bounds.bottom;
  }
  function update() {
    selected = -1; input.removeAttribute('aria-activedescendant'); list.replaceChildren();
    if (input.value.trim().length < 2) {close(); return;}
    const matches = findCourseSuggestions(courses, input.value, level?.value || '');
    matches.forEach((course, i) => {
      const item = doc.createElement('li'); item.setAttribute('role', 'presentation');
      const link = doc.createElement('a'); link.href = siteHref('/cursos/' + encodeURIComponent(course.id) + '/'); link.id = idPrefix + '-course-option-' + i; link.setAttribute('role', 'option'); link.setAttribute('aria-selected', 'false'); link.tabIndex = -1;
      const name = doc.createElement('strong'); name.textContent = course.name;
      const detail = doc.createElement('span'); detail.textContent = [course.level, course.mode, course.duration].filter(Boolean).join(' · ');
      link.append(name, detail); item.append(link); list.append(item);
    });
    status.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'sugestão disponível' : 'sugestões disponíveis'}. Use as setas para escolher ou pesquise todos os cursos.` : 'Sem sugestões para esta pesquisa. Pode procurar no catálogo completo.';
    popup.hidden = false; input.setAttribute('aria-expanded', 'true');place();
  }
  const cleanups = [];
  const listen = (node, name, callback, options) => {if (!node) return;node.addEventListener(name, callback, options);cleanups.push(() => node.removeEventListener(name, callback, options));};
  listen(input, 'input', event => {if (!composing && !event.isComposing) update();});
  listen(input, 'compositionstart', () => {composing = true;close();});
  listen(input, 'compositionend', () => {composing = false;update();});
  listen(input, 'focus', () => {if (!composing) update();});
  listen(level, 'change', () => {if (doc.activeElement === input) update(); else close();});
  listen(input, 'keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {if (!popup.hidden) event.preventDefault(); close();}
    else if (event.key === 'Tab') close();
    else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {event.preventDefault(); if (popup.hidden) update(); choose(selected < 0 ? (event.key === 'ArrowDown' ? 0 : options().length - 1) : selected + (event.key === 'ArrowDown' ? 1 : -1));}
    else if (event.key === 'Enter' && !popup.hidden && selected >= 0) {event.preventDefault(); const href = options()[selected]?.getAttribute('href'); if (href) {close(); navigate(href);}}
  });
  // Keep focus in the combobox while choosing with a pointer; links still support normal navigation.
  listen(list, 'mousedown', event => event.preventDefault());
  listen(list, 'click', event => {if (event.target.closest('[role=option]')) close();});
  listen(doc, 'pointerdown', event => {if (!field.contains(event.target)) close();});
  listen(form, 'submit', close);
  listen(field, 'focusout', event => {if (!field.contains(event.relatedTarget)) close();});
  listen(doc.defaultView, 'resize', schedulePlacement);
  listen(doc, 'scroll', event => {if (event.target !== popup) schedulePlacement();}, true);
  listen(doc.defaultView?.visualViewport, 'resize', schedulePlacement);
  listen(doc.defaultView?.visualViewport, 'scroll', schedulePlacement);
  let destroyed = false;
  return {destroy() {if (destroyed) return;destroyed = true;cleanups.splice(0).forEach(fn => fn());close();popup.remove();if (!hadFieldClass) field.classList.remove('discovery-field');delete input.dataset.discoveryReady;for (const [attr, value] of originalAttributes) value === null ? input.removeAttribute(attr) : input.setAttribute(attr, value);}};
}
