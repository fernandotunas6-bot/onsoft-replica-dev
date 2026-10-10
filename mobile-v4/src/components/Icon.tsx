/**
 * Ícones de traço do SIGA Plus Mobile: grelha 24×24, traço 1,8, pontas e
 * junções redondas. Cada serviço tem um símbolo com significado próprio
 * (calendário, relógio, prancheta…); um nome que não existe cai no «?» e o
 * teste `icons.test.ts` recusa-o.
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
    '<path d="M18.84 10.11L21.04 10.27L21.04 13.73L18.84 13.89L18.18 15.50L19.61 17.17L17.17 19.61L15.50 18.18L13.89 18.84L13.73 21.04L10.27 21.04L10.11 18.84L8.50 18.18L6.83 19.61L4.39 17.17L5.82 15.50L5.16 13.89L2.96 13.73L2.96 10.27L5.16 10.11L5.82 8.50L4.39 6.83L6.83 4.39L8.50 5.82L10.11 5.16L10.27 2.96L13.73 2.96L13.89 5.16L15.50 5.82L17.17 4.39L19.61 6.83L18.18 8.50Z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>',
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
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12M12 8v13M12 8S10.5 3.5 8 3.5a2.25 2.25 0 0 0 0 4.5M12 8s1.5-4.5 4-4.5a2.25 2.25 0 0 1 0 4.5"/>',
  plug: '<path d="M8 3v6m8-6v6M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3"/>',
  "sliders-horizontal":
    '<path d="M4 7h8m4 0h4M4 17h4m4 0h8"/><circle cx="14" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  "panel-top": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>',
  "refresh-cw":
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  "clipboard-check":
    '<rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5v-.7a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8v.7M9 13l2 2 4-4.5"/>',
  presentation:
    '<path d="M3 4h18M4.5 4v10a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V4M12 15.5V20M8.5 20h7M8 11.5l2.5-2.5 2 2L16 7.5"/>',
  notebook:
    '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M5 7.5H3.5M5 12H3.5M5 16.5H3.5M9.5 8h5M9.5 12h5"/>',
  "list-checks":
    '<path d="m3.5 6.5 1.5 1.5 3-3M3.5 14.5 5 16l3-3M11.5 7h9M11.5 15h9M11.5 19.5h5"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.6 13.3-1.3 7.2L12 18l4.7 2.5-1.3-7.2"/>',
  "file-text":
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  "file-pen":
    '<path d="M11 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v2.5"/><path d="M14 3v5h5M14.5 21l.6-2.6 4.7-4.7a1.4 1.4 0 0 1 2 2l-4.7 4.7z"/>',
  layers: '<path d="m12 3 9 4.8-9 4.8-9-4.8z"/><path d="m3 12.2 9 4.8 9-4.8M3 16.6l9 4.8 9-4.8"/>',
  wallet:
    '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M21 9h-5a3 3 0 0 0 0 6h5zM16.5 12h.01"/>',
  receipt:
    '<path d="M5 3h14v18l-2.3-1.5-2.4 1.5-2.3-1.5-2.3 1.5-2.4-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  newspaper:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 8h10M7 12h4M7 16h4M14 12h3v4h-3z"/>',
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
