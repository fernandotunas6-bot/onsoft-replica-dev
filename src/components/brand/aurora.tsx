import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fundo animado da marca: manchas azul→violeta em movimento lento e uma grelha
 * que se desvanece no canto (estilos em index.css, secção «Aurora»). Decorativo:
 * `aria-hidden`, sem eventos, e parado com «reduzir movimento».
 */
export function Aurora({
  variant = "hero",
  fade = true,
  className,
}: {
  variant?: "hero" | "soft";
  fade?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("aurora", variant === "soft" && "aurora--soft", className)}
    >
      <span className="aurora__blob aurora__blob--a" />
      <span className="aurora__blob aurora__blob--b" />
      <span className="aurora__blob aurora__blob--c" />
      <span className="aurora__grid" />
      {fade ? <span className="aurora__fade" /> : null}
    </div>
  );
}

/**
 * Paralaxe pelo ponteiro: escreve `--px`/`--py` (−1…1) no elemento, e as peças
 * de vidro e os olhos da mascote leem-nas em CSS. Sem estado React (não
 * re-renderiza), um só `requestAnimationFrame` por movimento, e desligado em
 * ecrãs tácteis e com «reduzir movimento».
 */
export function usePointerParallax<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        el.style.setProperty("--px", Math.max(-1, Math.min(1, x)).toFixed(3));
        el.style.setProperty("--py", Math.max(-1, Math.min(1, y)).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return ref;
}

/** Ícone em vidro 3D a flutuar. `depth` controla a paralaxe; `delay` desencontra a flutuação. */
export function GlassTile({
  children,
  tone = "violet",
  size = 88,
  tilt = -8,
  depth = 14,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  tone?: "violet" | "blue" | "sky";
  size?: number;
  tilt?: number;
  depth?: number;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("glass-tile", `glass-tile--${tone}`, className)}
      style={
        {
          width: size,
          height: size,
          "--tilt": `${tilt}deg`,
          "--depth": `${depth}px`,
          ...style,
        } as CSSProperties
      }
    >
      <span className="glass-tile__float" style={{ animationDelay: `${-delay}s` }}>
        {children}
      </span>
    </div>
  );
}

/**
 * Mascote do SIGA: uma pasta de pautas com olhos que piscam e seguem o
 * ponteiro. Dá personalidade sem pesar (só CSS) e aparece onde a pessoa
 * decide: no topo do site, no registo e no «está criada».
 */
export function SigaMascot({
  size = 96,
  tilt = 8,
  className,
  style,
}: {
  size?: number;
  tilt?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <GlassTile
      tone="blue"
      size={size}
      tilt={tilt}
      depth={22}
      delay={2}
      className={className}
      style={style}
    >
      <span className="relative flex h-full w-full items-center justify-center">
        {/* Separador da pasta */}
        <span className="absolute -top-[9%] left-[14%] h-[18%] w-[36%] rounded-t-[40%] bg-[oklch(0.78_0.12_242)]" />
        <span className="flex w-[46%] items-center justify-between" style={{ height: "40%" }}>
          <span className="mascot-eye" />
          <span className="mascot-eye" style={{ animationDelay: "0.05s" }} />
        </span>
      </span>
    </GlassTile>
  );
}
