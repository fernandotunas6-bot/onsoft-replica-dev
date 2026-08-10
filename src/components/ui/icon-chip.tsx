import type { ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimals-style icon chip: the icon sits inside a soft tinted rounded square.
 * Tones map to existing design tokens only — no new colours are introduced.
 */
export type ChipTone =
  "primary" | "success" | "warning" | "info" | "destructive" | "muted" | "sidebar";

export type ChipSize = "xs" | "sm" | "md" | "lg";

/* Tons Minimals: fundo suave a 12% + glifo na cor cheia do mesmo token. */
const toneClass: Record<ChipTone, string> = {
  primary: "bg-primary/12 text-primary-strong",
  success: "bg-success/14 text-success-strong",
  warning: "bg-warning/16 text-warning-strong",
  info: "bg-info/12 text-info-strong",
  destructive: "bg-destructive/12 text-destructive-strong",
  muted: "bg-muted text-muted-foreground",
  sidebar: "bg-sidebar-accent text-sidebar-foreground",
};

/* Caixa quadrada, raio proporcional (Minimals ~ 0.36 do lado). */
const boxSize: Record<ChipSize, string> = {
  xs: "size-7 rounded-[10px]",
  sm: "size-9 rounded-xl",
  md: "size-11 rounded-[14px]",
  lg: "size-14 rounded-2xl",
};

/* Glifo a ~55% do lado da caixa, sempre centrado e sem distorção. */
const glyphSize: Record<ChipSize, string> = {
  xs: "size-4",
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
};

export function IconChip({
  icon: Icon,
  tone = "primary",
  size = "sm",
  soft = true,
  label,
  className,
  glyphClassName,
}: {
  icon: ElementType;
  tone?: ChipTone;
  size?: ChipSize;
  soft?: boolean;
  /** Quando o chip carrega significado próprio, passa um rótulo acessível. */
  label?: string;
  className?: string;
  glyphClassName?: string;
}) {
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <span
      {...a11y}
      data-icon-chip=""
      data-tone={tone}
      data-size={size}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none transition-colors",
        boxSize[size],
        soft ? toneClass[tone] : "text-current",
        className,
      )}
    >
      <Icon className={cn("block shrink-0", glyphSize[size], glyphClassName)} strokeWidth={1.8} />
    </span>
  );
}
