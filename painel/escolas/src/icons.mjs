export const paths={
 '↗':'<path d="M5 19 19 5M5 5h14v14"/>',
 '→':'<path d="M4 12h16m-7-7 7 7-7 7"/>',
 '←':'<path d="M20 12H4m7-7-7 7 7 7"/>',
 '↑':'<path d="M12 20V4m-7 7 7-7 7 7"/>',
 '↓':'<path d="M12 4v16m-7-7 7 7 7-7"/>',
 '⌕':'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
 '♡':'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 '♥':'<path fill="currentColor" d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
 '✳':'<path stroke-width="3.5" d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5"/>',
 '✦':'<path d="M12 2c0 6-4 10-10 10 6 0 10 4 10 10 0-6 4-10 10-10-6 0-10-4-10-10Z" fill="currentColor" stroke="none"/>',
 '◎':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
 '⌘':'<path d="M8 8h8v8H8zM8 8H5a3 3 0 1 1 3-3Zm8 0V5a3 3 0 1 1 3 3Zm0 8h3a3 3 0 1 1-3 3Zm-8 0v3a3 3 0 1 1-3-3Z"/>',
 '⌁':'<path d="m3 16 5-8 5 8 5-8 3 5M3 21h18"/>',
 '◫':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
 '◷':'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 '▤':'<path d="M4 3h13l3 3v15H4zM8 8h8M8 12h8M8 16h5"/>',
 '▥':'<path d="M3 21V3M3 21h18M8 17v-5M13 17V7M18 17V3"/>',
 '▧':'<path d="M4 3h11l5 5v13H4zM15 3v6h5M8 13h8M8 17h5"/>',
 '◈':'<path d="m12 2 10 10-10 10L2 12z"/><path d="M8 9h6a2 2 0 1 1 0 4h-4a2 2 0 1 0 0 4h6M12 7v12"/>',
 '⊕':'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
 '⇄':'<path d="M3 7h18l-4-4m4 14H3l4 4"/>',
 '⇥':'<path d="M20 3v18M3 12h12m-5-5 5 5-5 5"/>',
 '☷':'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
 '♧':'<path d="M6 9a6 6 0 0 1 12 0v6l2 3H4l2-3zM10 21h4"/>',
 'ⓘ':'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>'
};
export const iconRegex=/[↗→←↑↓⌕♡♥✳✦◎⌘⌁◫◷▤▥▧◈⊕⇄⇥☷♧ⓘ]/g;
export function iconHTML(symbol){return `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[symbol]}</svg>`}
export function iconifyHTML(html){return html.split(/(<[^>]+>)/g).map((part,i)=>i%2?part:part.replace(iconRegex,iconHTML)).join('')}
