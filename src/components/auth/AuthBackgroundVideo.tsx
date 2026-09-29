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
 *
 * O poster (1.º frame do vídeo, embutido em `.auth-hero-poster` no styles.css) pinta com o
 * primeiro render, só em ecrãs ≥ 1024 px. Sem ele, o 1.º frame do vídeo — que só monta depois da
 * hidratação e cobre o painel inteiro — era o elemento LCP: ~2 s no Lighthouse do CI, cujo
 * Chrome reproduz H.264. Com o poster o painel pinta logo e o vídeo entra por cima sem salto.
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
  return (
    <>
      {/* Poster em CSS (`.auth-hero-poster` em styles.css), só ≥ 1024 px: pinta com o HTML. */}
      <div aria-hidden className="auth-hero-poster pointer-events-none absolute inset-0" />
      {enabled ? (
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
      ) : null}
    </>
  );
}
