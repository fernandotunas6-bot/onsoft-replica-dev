/**
 * Ícones de traço originais do SIGA Plus Mobile (grelha 24×24, traço 1,8).
 * A cor e o relevo de cada função vêm do CSS (`data-tone`), não do desenho.
 */
export const paths: Record<string, string> = {
  menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  house: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  "grid-2x2":
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  "messages-square":
    '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H14a8 8 0 0 1 7 8.5Z"/><path d="M8 10h9M8 14h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  "list-filter": '<path d="M4 7h16M7 12h10M10 17h4"/>',
  ellipsis:
    '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "arrow-up": '<path d="m5 12 7-7 7 7M12 5v14"/>',
  "user-round": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings:
    '<path d="M12 3 14 5l3-.2.6 3 2.6 1.5-1 2.7 1 2.7-2.6 1.5-.6 3-3-.2-2 2-2-2-3 .2-.6-3L3.8 15l1-3-1-2.7L6.4 8l.6-3 3 .2z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  inbox: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h5l2 3h4l2-3h5"/>',
  "book-open": '<path d="M12 7c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V6c-3-1-6-1-9 1ZM12 7v14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>',
  "monitor-smartphone":
    '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M7 20h6M10 16v4"/><rect x="17" y="10" width="5" height="10" rx="1"/>',
  star: '<path d="m12 2 3.1 6.3 7 .9-5.1 5 .9 7-5.9-3.2-5.9 3.2.9-7-5.1-5 7-.9z"/>',
  "trash-2": '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  pencil: '<path d="m4 20 4.5-1 11-11-3.5-3.5-11 11L4 20ZM14 6l4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  "external-link":
    '<path d="M13 4h7v7M20 4l-9 9"/><path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/>',
  school: '<path d="M3 21V9l9-6 9 6v12M3 21h18M8 21v-7h8v7M7 10h.01M12 10h.01M17 10h.01"/>',
  "circle-help":
    '<circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 18h.01"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>',
  gift: '<rect x="3" y="10" width="18" height="11" rx="2"/><path d="M12 10v11M3 14h18M12 10C3 10 5 3 9 4c2 0 3 6 3 6Zm0 0c9 0 7-7 3-6-2 0-3 6-3 6Z"/>',
  plug: '<path d="M8 3v6m8-6v6M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3"/>',
  "sliders-horizontal":
    '<path d="M4 7h8m4 0h4M4 17h4m4 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  "panel-top": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  "refresh-cw":
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
};
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg
      className="ui-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: paths[name] || paths["circle-help"] }}
    />
  );
}
