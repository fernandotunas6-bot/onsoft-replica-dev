import * as React from "react";
import { cn } from "@/lib/utils";

export type SigaLogoVariant =
  | "icon"
  | "3d"
  | "pwa"
  | "monochrome"
  | "dark-hero"
  | "login"
  | "horizontal"
  | "header"
  | "animated";

export interface SigaLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SigaLogoVariant;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  color?: string;
  badgeText?: string;
  useOfficialImage?: boolean;
}

const iconSizes = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 64,
  xl: 96,
  "2xl": 128,
};

/**
 * Ícone Mascote Oficial SIGA Plus — Formato Exclusivo PNG (/brands/siga-plus-icon.png / logo.png).
 */
export function SigaMascotIcon({
  size = 44,
  className,
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <img
      src="/brands/siga-plus-icon.png"
      alt="SIGA Plus Mascot"
      width={size}
      height={size}
      className={cn(
        "object-contain select-none transition-transform duration-300",
        animated && "animate-pulse",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}

export function SigaLogo({
  variant = "horizontal",
  size = "md",
  color,
  badgeText,
  useOfficialImage,
  className,
  ...props
}: SigaLogoProps) {
  const pixelSize = iconSizes[size];

  // Variante 1: PWA / App Icon 3D com margem de segurança (PNG)
  if (variant === "3d" || variant === "pwa") {
    return (
      <div
        className={cn(
          "inline-flex items-center justify-center rounded-3xl bg-white border border-slate-200/80 p-3 shadow-md shadow-amber-500/10",
          className,
        )}
        {...props}
      >
        <SigaMascotIcon size={pixelSize} />
      </div>
    );
  }

  // Variante 2: Monocromático (PNG + Texto)
  if (variant === "monochrome") {
    return (
      <div className={cn("inline-flex items-center gap-3 select-none", className)} {...props}>
        <SigaMascotIcon size={pixelSize} />
        <span className="font-sans text-xl md:text-2xl font-black tracking-tight text-foreground">
          SIGA Plus
        </span>
      </div>
    );
  }

  // Variante 3: Dark Hero / Login Screen (PNG Mascot + Texto Vertical Stack)
  if (variant === "dark-hero" || variant === "login") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center select-none py-2",
          className,
        )}
        {...props}
      >
        <div className="p-3.5 rounded-3xl bg-slate-900/90 border border-amber-500/30 shadow-xl shadow-amber-500/10 backdrop-blur-md">
          <SigaMascotIcon size={pixelSize * 1.25} />
        </div>

        <div className="mt-4 flex items-center gap-2 font-display text-2xl md:text-4xl font-extrabold tracking-tight">
          <span className="text-white">SIGA</span>
          <span className="text-[#C59B27]">Plus</span>
        </div>

        {/* Divisor com Estrela */}
        <div className="mt-3 flex items-center gap-2 text-[#C59B27]/60 text-xs">
          <span className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#C59B27]/60" />
          <span className="text-[#C59B27] text-xs">✦</span>
          <span className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#C59B27]/60" />
        </div>
      </div>
    );
  }

  // Variante 4: Horizontal Header (PNG Mascot + Texto)
  return (
    <div className={cn("inline-flex items-center gap-3.5 select-none", className)} {...props}>
      <SigaMascotIcon size={pixelSize} />

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

/**
 * Componente animado PNG para estados de carregamento e IA
 */
export function SigaAiLoader({
  label = "SIGA Plus a processar…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-3 p-6 text-center", className)}
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute size-20 rounded-full bg-[#C59B27]/20 animate-ping" />
        <div className="relative z-10 p-3 bg-background/90 backdrop-blur-md rounded-2xl border border-[#C59B27]/40 shadow-xl">
          <SigaMascotIcon size={56} animated />
        </div>
      </div>
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground animate-pulse">
          {label}
        </p>
      )}
    </div>
  );
}
