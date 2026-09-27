import { useEffect, useState } from "react";

/**
 * Vídeo de fundo leve: só carrega em ecrãs grandes, sem som, respeita "reduzir movimento".
 *
 * O ficheiro vive em `public/auth-classroom.mp4` e é servido na raiz do site. Não usar o
 * descritor `@/assets/auth-classroom.mp4.asset.json` do Lovable: o `url` que ele declara
 * (`/__l5e/assets-v1/…`) é um proxy do servidor de desenvolvimento — o plugin
 * `@lovable.dev/vite-tanstack-config` só o reencaminha quando `LOVABLE_PREVIEW_HOST` está
 * definido, e nada copia o ficheiro para o build. Em produção dava 404 e o ecrã de login
 * ficava sem vídeo nenhum.
 */
export function AuthBackgroundVideo() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!wide || reduce || conn?.saveData) return;
    const id = window.setTimeout(() => setEnabled(true), 600);
    return () => window.clearTimeout(id);
  }, []);
  if (!enabled) return null;
  return (
    <video
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full object-cover animate-fade-in"
      src="/auth-classroom.mp4"
      autoPlay
      muted
      loop
      playsInline
      // `preload="none"` contradiz o `autoPlay`: o Safari não arranca sozinho sem metadados.
      preload="metadata"
      // Enquanto o ficheiro não estiver em `public/`, desmonta-se em silêncio.
      onError={() => setEnabled(false)}
    />
  );
}
