export function isHeaderSearchShortcut(event) {
  if (event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey || event.key?.toLowerCase() !== 'k') return false;
  const target = event.target, owner = target?.closest?.('[contenteditable]');
  const editable = typeof target?.isContentEditable === 'boolean' ? target.isContentEditable : owner && owner.getAttribute('contenteditable') !== 'false';
  return !editable && !target?.closest?.('input,textarea,select,[role=textbox]');
}

/** A hidden submenu or mobile control cannot receive focus after a dialog/viewport change. */
export function restoreHeaderFocus(opener, {doc = document, win = window} = {}) {
  const header = doc.querySelector('.site-header'), nav = header?.querySelector('#main-nav'), toggle = header?.querySelector('.mobile-toggle');
  const mobile = win.matchMedia('(max-width:760px)').matches;
  const fallback = () => mobile ? toggle : header?.querySelector('.brand,.header-search,summary');
  let target = opener?.isConnected ? opener : header?.querySelector('.header-search') || fallback();
  if (target && header?.contains(target)) {
    if (mobile && nav?.contains(target) && (nav.inert || !nav.classList.contains('open'))) target = toggle;
    else if (!mobile && target === toggle) target = fallback();
    else {
      const section = target.closest('.nav-dropdown');
      if (section && !section.open && section.querySelector('.mega-menu')?.contains(target)) target = section.querySelector('summary');
    }
    if (target && (!target.getClientRects().length || target.closest('[inert]'))) target = fallback();
  }
  target?.focus({preventScroll: true});return target;
}

/** Progressive header behaviour. Existing disclosures and public links remain the fallback. */
export function setupAcademicNavigation({doc = document, win = window} = {}) {
  const header = doc.querySelector('.site-header'), nav = doc.querySelector('#main-nav'), toggle = doc.querySelector('.mobile-toggle');
  if (!header || !nav || !toggle || header.dataset.navigationReady) return {refresh() {}, destroy() {}};
  const shell = header.closest('.site-navigation') || header, originalContext = header.getAttribute('data-navigation-context');
  header.dataset.navigationReady = 'true';header.dataset.navigationContext = doc.querySelector('.home-hero') ? 'home' : 'inner';
  const mobile = win.matchMedia('(max-width:760px)'), hover = win.matchMedia('(hover:hover) and (pointer:fine) and (min-width:761px)');
  const disposers = [], timers = new Map(), activeLinks = new Map(), sections = [...nav.querySelectorAll('.nav-dropdown')];
  const listen = (node, name, fn, options) => {node.addEventListener(name, fn, options);disposers.push(() => node.removeEventListener(name, fn, options));};
  const cancel = section => {win.clearTimeout(timers.get(section));timers.delete(section);};
  const cancelPending = () => {for (const section of timers.keys()) cancel(section);};
  const scrim = doc.createElement('div');scrim.className = 'navigation-scrim';scrim.hidden = true;scrim.setAttribute('aria-hidden', 'true');header.after(scrim);
  let frame = 0, condensed = false, locked = false, destroyed = false, originalOverflow, background = [];
  const originalHeight = doc.documentElement.style.getPropertyValue('--site-header-height');
  const originalMenuHeight = header.style.getPropertyValue('--navigation-max-height');
  const measure = () => {if (!destroyed) {
    const rect = shell.getBoundingClientRect(), viewport = win.visualViewport;
    doc.documentElement.style.setProperty('--site-header-height', Math.ceil(rect.height) + 'px');
    header.style.setProperty('--navigation-max-height', Math.max(0, (viewport?.height || win.innerHeight) + (viewport?.offsetTop || 0) - rect.bottom - 8) + 'px');
  }};
  const renderScroll = () => {
    frame = 0;const y = Math.max(0, win.scrollY || 0);condensed = condensed ? y > 36 : y > 108;
    header.dataset.condensed = String(condensed);measure();
  };
  const schedule = () => {if (!frame) frame = win.requestAnimationFrame(renderScroll);};
  const resetActive = () => {
    for (const [link, previous] of activeLinks) {if (previous === null) link.removeAttribute('aria-current');else link.setAttribute('aria-current', previous);}activeLinks.clear();
    sections.forEach(section => section.classList.remove('navigation-current-section'));
  };
  const refresh = () => {
    resetActive();
    const current = new URL(win.location.href);
    for (const link of nav.querySelectorAll('a[href]')) {
      const url = new URL(link.href, current);if (url.origin !== current.origin) continue;
      const path = url.pathname.replace(/\/$/, '');
      if (url.pathname === current.pathname && url.search === current.search) {activeLinks.set(link, link.getAttribute('aria-current'));link.setAttribute('aria-current', 'page');}
      if (path && (current.pathname.replace(/\/$/, '') === path || current.pathname.startsWith(path + '/'))) link.closest('.nav-dropdown')?.classList.add('navigation-current-section');
    }
    measure();
  };
  const syncMobile = () => {
    const open = mobile.matches && nav.classList.contains('open');scrim.hidden = !open;
    if (open && !locked) {
      originalOverflow = doc.body.style.overflow;background = [...doc.querySelectorAll('main,.site-footer')].map(node => [node, node.inert]);
      background.forEach(([node]) => {node.inert = true;});doc.body.style.overflow = 'hidden';locked = true;
    } else if (!open && locked) {
      doc.body.style.overflow = originalOverflow;background.forEach(([node, inert]) => {node.inert = inert;});background = [];locked = false;
    }
  };
  listen(scrim, 'click', () => {if (nav.classList.contains('open')) toggle.click();toggle.focus();});
  const mutation = new win.MutationObserver(syncMobile);mutation.observe(nav, {attributes: true, attributeFilter: ['class']});
  listen(mobile, 'change', () => {cancelPending();syncMobile();});listen(hover, 'change', cancelPending);
  // Explicit actions take precedence over a delayed hover, including dismissal.
  listen(doc, 'click', cancelPending);listen(doc, 'keydown', cancelPending);listen(doc, 'pointerdown', cancelPending);
  listen(nav, 'click', event => {
    const link = event.target.closest?.('a[href]');
    if (!mobile.matches || !nav.classList.contains('open') || !link || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    toggle.click();syncMobile();
  });
  for (const section of sections) {
    const summary = section.querySelector('summary');
    const anotherMenuHasFocus = () => sections.some(other => other !== section && other.open && other.querySelector('.mega-menu')?.contains(doc.activeElement));
    listen(section, 'pointerenter', event => {
      cancel(section);if (!hover.matches || event.pointerType === 'touch' || anotherMenuHasFocus()) return;
      timers.set(section, win.setTimeout(() => {timers.delete(section);if (!anotherMenuHasFocus()) sections.forEach(other => {other.open = other === section;});}, 90));
    });
    listen(section, 'pointerleave', event => {
      cancel(section);if (!hover.matches || event.pointerType === 'touch') return;
      timers.set(section, win.setTimeout(() => {timers.delete(section);if (!section.contains(doc.activeElement)) section.open = false;}, 180));
    });
    listen(section, 'focusout', event => {if (!mobile.matches && !section.contains(event.relatedTarget)) {cancel(section);section.open = false;}});
    listen(summary, 'keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      const links = [...section.querySelectorAll('.mega-menu a[href]')];if (!links.length) return;
      event.preventDefault();cancel(section);sections.forEach(other => {other.open = other === section;});
      const visible = links.filter(link => link.getClientRects().length), targets = visible.length ? visible : links;
      (event.key === 'ArrowDown' ? targets[0] : targets.at(-1)).focus();
    });
  }
  listen(header, 'keydown', event => {
    if (event.key !== 'Tab' || !mobile.matches || !nav.classList.contains('open')) return;
    const focusable = [...header.querySelectorAll('a[href],button:not([disabled]),summary,input:not([disabled])')].filter(node => !node.closest('[inert]') && node.getClientRects().length);
    if (!focusable.length) return;
    if (event.shiftKey && doc.activeElement === focusable[0]) {event.preventDefault();focusable.at(-1).focus();}
    else if (!event.shiftKey && doc.activeElement === focusable.at(-1)) {event.preventDefault();focusable[0].focus();}
  });
  listen(win, 'scroll', schedule, {passive: true});listen(win, 'pageshow', schedule);listen(win, 'resize', measure, {passive: true});
  if (win.visualViewport) listen(win.visualViewport, 'resize', measure, {passive: true});
  const resize = win.ResizeObserver ? new win.ResizeObserver(measure) : null;resize?.observe(shell);
  renderScroll();refresh();syncMobile();
  return {refresh, destroy() {
    if (destroyed) return;destroyed = true;if (frame) win.cancelAnimationFrame(frame);for (const timer of timers.values()) win.clearTimeout(timer);
    mutation.disconnect();resize?.disconnect();disposers.reverse().forEach(fn => fn());resetActive();scrim.remove();
    if (locked) {doc.body.style.overflow = originalOverflow;background.forEach(([node, inert]) => {node.inert = inert;});}
    if (originalHeight) doc.documentElement.style.setProperty('--site-header-height', originalHeight);else doc.documentElement.style.removeProperty('--site-header-height');
    if (originalMenuHeight) header.style.setProperty('--navigation-max-height', originalMenuHeight);else {header.style.removeProperty('--navigation-max-height');if (!header.getAttribute('style')) header.removeAttribute('style');}
    delete header.dataset.navigationReady;if (originalContext === null) delete header.dataset.navigationContext;else header.setAttribute('data-navigation-context', originalContext);delete header.dataset.condensed;
  }};
}
