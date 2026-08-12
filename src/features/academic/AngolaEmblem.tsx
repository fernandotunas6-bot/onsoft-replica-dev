/** Emblema institucional para cabeçalhos oficiais (pautas, boletins). */

export function AngolaEmblem({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="Emblema da República de Angola"
    >
      <circle cx="60" cy="60" r="58" fill="#ce1126" />
      <circle cx="60" cy="60" r="48" fill="#000000" />
      <path d="M20 78 A42 42 0 0 1 100 78 L60 78 Z" fill="#ffcd00" />
      <circle cx="60" cy="52" r="10" fill="#ffcd00" />
      <path d="M60 28 L63 38 H74 L65 44 L68 54 L60 48 L52 54 L55 44 L46 38 H57 Z" fill="#ffcd00" />
      <rect x="48" y="62" width="24" height="4" fill="#ffcd00" />
      <rect x="50" y="68" width="20" height="10" fill="#f4f1e8" />
      <path d="M36 70 L52 86" stroke="#c0c0c0" strokeWidth="4" strokeLinecap="round" />
      <path d="M84 70 L68 86" stroke="#c0c0c0" strokeWidth="4" strokeLinecap="round" />
      <text
        x="60"
        y="108"
        textAnchor="middle"
        fill="#ffcd00"
        fontSize="7"
        fontFamily="Georgia, serif"
        fontWeight="700"
      >
        REPÚBLICA DE ANGOLA
      </text>
    </svg>
  );
}
