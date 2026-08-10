import type { ElementType } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimals-style icon chip: the icon sits inside a soft tinted rounded square.
 * Tones map to existing design tokens only — no new colours are introduced.
 */
export type ChipTone =
  | "primary"
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "muted"
  | "sidebar";

export type ChipSize = "xs" | "sm" | "md" | "lg";

/* Tons Minimals: fundo suave a 12% + glifo na cor cheia do mesmo token. */
const toneClass: Record<ChipTone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  info: "bg-info/12 text-info",
  destructive: "bg-destructive/12 text-destructive",
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
  className,
  glyphClassName,
}: {
  icon: ElementType;
  tone?: ChipTone;
  size?: ChipSize;
  soft?: boolean;
  className?: string;
  glyphClassName?: string;
}) {
  return (
    <span
      aria-hidden
      data-icon-chip=""
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none transition-colors",
        boxSize[size],
        soft ? toneClass[tone] : "text-current",
        className,
      )}
    >
      <Icon
        className={cn("block shrink-0", glyphSize[size], glyphClassName)}
        strokeWidth={1.8}
      />
    </span>
  );
}
