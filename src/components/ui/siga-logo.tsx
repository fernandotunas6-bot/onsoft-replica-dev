import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Identidade SIGA Plus — só tipografia.
 *
 * O ícone-mascote (coruja dourada, `/brands/siga-plus-icon.png` e o `-256.webp`
 * reduzido) saiu a pedido do dono: a marca nova é o letreiro «SIGA Plus», com o
 * «Plus» em gradiente (`.siga-wordmark-plus` em styles.css), e o ícone da app é o
 * «S» em squircle que vem da app Flutter (`public/icons/`, declarado no
 * `manifest.webmanifest`). Com o mascote saíram as variantes que existiam só para o
 * mostrar — `icon`, `3d`, `pwa`, `monochrome`, `dark-hero`, `login`, `animated` — e o
 * `SigaAiLoader`. Nenhuma era usada: os dois sítios que desenham o logótipo
 * (`InstitutionOnboarding` e `verificar`) usavam a variante horizontal por omissão.
 */
export interface SigaLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
}

/** Tamanhos do letreiro; o `.siga-wordmark` herda o `font-size` de quem o contém. */
const wordmarkSizes: Record<NonNullable<SigaLogoProps["size"]>, string> = {
  xs: "text-base",
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
  "2xl": "text-5xl",
};

/** Marca tipográfica partilhada; cor reservada à palavra Plus. */
export function SigaWordmark({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="SIGA Plus" className={cn("siga-wordmark", className)}>
      <span aria-hidden="true">SIGA</span>
      <span aria-hidden="true" className="siga-wordmark-plus">
        Plus
      </span>
    </span>
  );
}

export function SigaLogo({ size = "md", className, ...props }: SigaLogoProps) {
  return (
    <div className={cn("inline-flex items-center select-none", className)} {...props}>
      <SigaWordmark className={wordmarkSizes[size]} />
    </div>
  );
}
