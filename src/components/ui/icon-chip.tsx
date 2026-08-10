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

const toneClass: Record<ChipTone, string> = {
  primary: "bg-primary/12 text-primary",
  success: "bg-success/14 text-success",
  warning: "bg-warning/16 text-warning",
  info: "bg-info/14 text-info",
  destructive: "bg-destructive/12 text-destructive",
  muted: "bg-muted text-muted-foreground",
  sidebar: "bg-sidebar-accent text-sidebar-foreground",
};

const boxSize: Record<ChipSize, string> = {
  xs: "size-7 rounded-lg",
  sm: "size-9 rounded-xl",
  md: "size-11 rounded-2xl",
  lg: "size-14 rounded-2xl",
};

const glyphSize: Record<ChipSize, string> = {
  xs: "size-3.5",
  sm: "size-[18px]",
  md: "size-5",
  lg: "size-6",
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
        "inline-flex shrink-0 items-center justify-center transition-colors",
        boxSize[size],
        soft ? toneClass[tone] : "text-current",
        className,
      )}
    >
      <Icon className={cn(glyphSize[size], glyphClassName)} />
    </span>
  );
}
