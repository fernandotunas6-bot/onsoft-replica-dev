/**
 * Emblema oficial da República de Angola para cabeçalhos institucionais (pautas, boletins, relatórios).
 * Utiliza o ficheiro vetorial oficial do Estado Angolano (/brands/emblem-angola.svg).
 */

export function AngolaEmblem({ className = "size-16" }: { className?: string }) {
  return (
    <img
      src="/brands/emblem-angola.svg"
      alt="Emblema da República de Angola"
      className={className}
      loading="eager"
    />
  );
}
