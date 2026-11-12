/** Reveal a destination inside its own rail without scrolling the document. */
export function revealVerticalTab(tab: HTMLElement) {
  const list = tab.closest<HTMLElement>('[role="tablist"][aria-orientation="vertical"]');
  if (!list || list.clientHeight === 0) return;
  const viewport = list.getBoundingClientRect();
  const target = tab.getBoundingClientRect();
  const top = viewport.top + list.clientTop;
  const bottom = top + list.clientHeight;
  if (target.top < top) list.scrollTop += target.top - top;
  else if (target.bottom > bottom) list.scrollTop += target.bottom - bottom;
}
