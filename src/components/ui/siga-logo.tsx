import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Identidade SIGA Plus — só tipografia.
 *
 * O ícone-mascote (`/brands/siga-plus-icon.png`) foi removido a pedido do dono (2026-10-14).
 * Com ele saíram as variantes que existiam só para o mostrar — `icon`, `3d`, `pwa`,
 * `monochrome`, `dark-hero`, `login`, `animated` — e o `SigaAiLoader`. Nenhuma delas era usada
 * em lado nenhum: os três sítios que mostram o logótipo (`AuthGate`, `InstitutionOnboarding`,
 * `verificar`) usavam todos a variante horizontal por omissão.
 *
 * O ícone da app (separador do browser e PWA) não vem daqui: sai de
 * `public/brands/app-icon-*.png`, gerados do logótipo horizontal e declarados no
 * `public/manifest.json`.
 */
export type SigaLogoVariant = "horizontal" | "header";

export interface SigaLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SigaLogoVariant;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
}

export function SigaLogo({ className, ...props }: SigaLogoProps) {
  return (
    <div className={cn("inline-flex items-center select-none", className)} {...props}>
      <div className="relative flex flex-col">
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="font-sans text-2xl md:text-3xl font-black tracking-tighter text-[#0A192F] dark:text-white">
            SIGA
          </span>
          <span className="font-serif italic text-2xl md:text-3xl font-extrabold tracking-tight text-[#0A192F] dark:text-amber-400">
            Plus
          </span>
        </div>

        {/* Sub-linha decorativa */}
        <div className="h-1.5 w-full mt-1 rounded-full bg-gradient-to-r from-[#C59B27] to-amber-300 opacity-90" />
      </div>
    </div>
  );
}
