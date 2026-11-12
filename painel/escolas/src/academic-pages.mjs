import {setupSectionNavigation} from './course-tools.mjs';

const labelOf = node => {
  const copy = node.cloneNode(true);for (const br of copy.querySelectorAll('br')) br.replaceWith(' ');
  return copy.textContent.replace(/\s+/g, ' ').trim();
};
const element = (doc, name, text, className) => {const node = doc.createElement(name);if (text) node.textContent = text;if (className) node.className = className;return node;};

/** Page navigation derives from the school's published headings and existing links. */
export function setupAcademicPages({doc = document, win = window} = {}) {
  if (doc.querySelector('.portal-sidebar') || doc.querySelector('[data-academic-enhanced]')) return {destroy() {}};
  const hero = doc.querySelector('.academic-page-head'), courseHero = doc.querySelector('main>.course-hero');
  if (!hero && !courseHero) return {destroy() {}};
  (hero || courseHero).setAttribute('data-academic-enhanced', 'true');
  let resize;
  const cleanups = [];
  if (courseHero) {
    const summary = doc.querySelector('.course-summary'), facts = summary?.querySelectorAll('dl>div');
    const buttons = courseHero.querySelector('.hero-buttons'), curriculum = doc.querySelector('.course-subnav a[href="#plano"]');
    if (facts?.length === 9 && buttons && curriculum) {
      const band = element(doc, 'section', null, 'academic-course-overview');band.setAttribute('aria-label', 'Informações do curso');
      const wrap = element(doc, 'div', null, 'wrap'), list = element(doc, 'dl'), actions = element(doc, 'div', null, 'academic-course-actions');
      wrap.append(list, actions);band.append(wrap);courseHero.after(band);cleanups.push(() => band.remove());
      // Move existing published nodes: edited labels, links and button handlers survive.
      const move = (node, target) => {
        if (!node) return;const marker = doc.createComment('academic-layout');node.before(marker);target.append(node);
        cleanups.push(() => {marker.replaceWith(node);});
      };
      for (const index of [0, 1, 4, 5, 6, 7]) move(facts[index], list);
      const unit = element(doc, 'p', labelOf(facts[6].querySelector('dd')), 'academic-course-campus');
      courseHero.querySelector('h1').after(unit);cleanups.push(() => unit.remove());
      move(buttons, actions);
      const plan = element(doc, 'a', labelOf(curriculum), 'outline-button academic-curriculum-link');plan.href = curriculum.getAttribute('href');buttons.firstElementChild.after(plan);
      cleanups.push(() => plan.remove());
      move(courseHero.querySelector('.course-code'), actions);move(courseHero.querySelector('.quiet-note'), actions);
      const meta = courseHero.querySelector('.course-hero-meta');
      if (meta) {const hidden = meta.hidden;meta.hidden = true;cleanups.push(() => {meta.hidden = hidden;});}
      courseHero.classList.add('academic-course-hero');cleanups.push(() => courseHero.classList.remove('academic-course-hero'));
    }
  }
  if (hero) {
    const main = hero.closest('main');
    const sourceLinks = [...main.querySelectorAll('.service-card[href],.resource-card[href]')].slice(0, 7);
    const sections = [...main.querySelectorAll(':scope>section')].filter(section => section !== hero && !section.classList.contains('cta') && section.querySelector('h2'));
    const usesResourceLinks = sourceLinks.length > 1;
    const entries = usesResourceLinks ? sourceLinks.map(source => ({label: labelOf(source.querySelector('h2,h3') || source), source})) : sections.map(section => ({label: labelOf(section.querySelector('h2')), section}));
    if (entries.length > 1) {
      const nav = element(doc, 'nav', null, 'academic-section-nav');nav.setAttribute('aria-label', usesResourceLinks ? 'Serviços e recursos desta área' : 'Nesta página');
      const wrap = element(doc, 'div', null, 'wrap'), caption = element(doc, 'span', usesResourceLinks ? 'Explore esta área' : 'Nesta página', 'academic-nav-caption'), links = [];
      wrap.append(caption);
      entries.forEach((entry, index) => {
        const a = element(doc, 'a', entry.label);a.title = entry.label;
        if (entry.source) {a.href = entry.source.href;a.target = entry.source.target;if (entry.source.rel) a.rel = entry.source.rel;}
        else {
          if (!entry.section.id) {
            let id = 'academic-section-' + (index + 1), suffix = 1;while (doc.getElementById(id)) id = 'academic-section-' + (index + 1) + '-' + suffix++;
            entry.section.id = id;cleanups.push(() => entry.section.removeAttribute('id'));
          }
          const originalClass = entry.section.getAttribute('class');
          if (!entry.section.classList.contains('academic-section-target')) {
            entry.section.classList.add('academic-section-target');cleanups.push(() => {entry.section.classList.remove('academic-section-target');if (originalClass === null && !entry.section.className) entry.section.removeAttribute('class');});
          }
          a.href = '#' + entry.section.id;
        }
        wrap.append(a);links.push(a);
      });
      nav.append(wrap);hero.after(nav);cleanups.push(() => nav.remove());
      const header = doc.querySelector('.site-header');
      const measure = () => nav.style.setProperty('--academic-nav-top', Math.ceil(header?.getBoundingClientRect().height || 80) + 'px');
      measure();if (header && win.ResizeObserver) {resize = new win.ResizeObserver(measure);resize.observe(header);}
      if (!usesResourceLinks) {
        const navigation = setupSectionNavigation({nav, pairs: entries.map((entry, index) => ({link: links[index], section: entry.section})), doc, win});
        cleanups.push(() => navigation.destroy());
      }
    }
  }
  let destroyed = false;
  return {destroy() {if (destroyed) return;destroyed = true;resize?.disconnect();for (const cleanup of cleanups.reverse()) cleanup();(hero || courseHero).removeAttribute('data-academic-enhanced');}};
}
