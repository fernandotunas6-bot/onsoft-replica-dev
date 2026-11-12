import { useEffect, useRef, useState } from "react";

/**
 * Abertura «SIGA Plus»: a animação do vídeo de marca (céu azul-noite, nuvens, «SIGA» a
 * branco e «Plus» em degradê) refeita em CSS, sem a nave a descolar. Uma vez por sessão do
 * navegador, ~3 s, com o som da marca quando o navegador o deixa tocar.
 *
 * Não atrasa nada: o ecrã de entrada e a app carregam por baixo e ficam prontos quando a
 * abertura sai. Clicar, tocar ou carregar numa tecla salta-a. Com «reduzir movimento»
 * não aparece.
 */
const SEEN_KEY = "siga.opening.v1";
const SOUND_SRC = "/media/siga-plus-abertura.m4a";
/** Fim da animação (o CSS desvanece entre 2,4 s e 3,0 s). */
const DURATION_MS = 3000;

function alreadySeen() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Sem armazenamento (modo privado restrito): volta a aparecer, sem mais efeitos.
  }
}

export function SigaOpening() {
  const [visible, setVisible] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (alreadySeen()) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      markSeen();
      return;
    }
    markSeen();
    setVisible(true);

    const sound = new Audio(SOUND_SRC);
    sound.volume = 0.7;
    audio.current = sound;
    // Os navegadores só deixam tocar som depois de um gesto; sem ele, fica a imagem.
    void sound.play().catch(() => undefined);

    const done = window.setTimeout(() => setVisible(false), DURATION_MS);
    return () => {
      window.clearTimeout(done);
      sound.pause();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      audio.current?.pause();
      return;
    }
    const skip = () => setVisible(false);
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="siga-opening" onPointerDown={() => setVisible(false)}>
      <Cloud className="siga-opening-cloud siga-opening-cloud--tl" />
      <Cloud className="siga-opening-cloud siga-opening-cloud--tr" />
      <Cloud className="siga-opening-cloud siga-opening-cloud--bl" />
      <Cloud className="siga-opening-cloud siga-opening-cloud--br" />
      <p className="siga-opening-mark" role="img" aria-label="SIGA Plus">
        <span aria-hidden="true" className="siga-opening-siga">
          {"SIGA".split("").map((letter, index) => (
            <span key={letter} style={{ animationDelay: `${120 + index * 90}ms` }}>
              {letter}
            </span>
          ))}
        </span>
        <span aria-hidden="true" className="siga-opening-plus">
          Plus
        </span>
      </p>
      <button
        type="button"
        className="siga-opening-skip"
        onClick={() => setVisible(false)}
        onPointerDown={(event) => event.stopPropagation()}
      >
        Saltar
      </button>
    </div>
  );
}

function Cloud({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 240 90" aria-hidden="true" focusable="false">
      <path d="M22 78c-13 0-20-8-20-17s8-17 19-17c3-15 15-25 31-25 11 0 20 5 26 13 5-11 16-19 30-19 18 0 32 13 33 30 3-1 6-1 9-1 16 0 27 9 30 21 2-1 5-1 7-1 13 0 23 7 23 16s-9 17-21 17H22z" />
    </svg>
  );
}
