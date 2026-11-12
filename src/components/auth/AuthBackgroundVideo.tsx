import { useEffect, useRef, useState } from "react";
import { useAuthMotionActive } from "./use-auth-motion-active";

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
  const [failed, setFailed] = useState(false);
  const active = useAuthMotionActive();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!active || enabled || failed) return;
    const id = window.setTimeout(() => setEnabled(true), 600);
    return () => window.clearTimeout(id);
  }, [active, enabled, failed]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      // Autoplay pode ser recusado pelo navegador; o poster permanece disponível.
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [active, enabled]);
  return (
    <>
      {/* Poster em CSS (`.auth-hero-poster` em styles.css), só ≥ 1024 px: pinta com o HTML. */}
      <div aria-hidden className="auth-hero-poster pointer-events-none absolute inset-0" />
      {enabled ? (
        <video
          ref={videoRef}
          aria-hidden
          // `inset-px`: 1 px para dentro do poster. O 1.º frame (igual ao poster já pintado)
          // media ~1 200 px² a mais por arredondamento e o Chrome promovia-o a LCP aos ~2 s.
          className="pointer-events-none absolute left-px top-px h-[calc(100%-2px)] w-[calc(100%-2px)] object-cover animate-fade-in"
          src="/auth-classroom.mp4"
          autoPlay={active}
          muted
          loop
          playsInline
          // `preload="none"` contradiz o `autoPlay`: o Safari não arranca sozinho sem metadados.
          preload="metadata"
          // Enquanto o ficheiro não estiver em `public/`, desmonta-se em silêncio.
          onError={() => {
            setFailed(true);
            setEnabled(false);
          }}
        />
      ) : null}
    </>
  );
}
