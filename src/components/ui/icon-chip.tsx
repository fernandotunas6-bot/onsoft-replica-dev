import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import { toneClass, boxSize, glyphSize } from "@/components/ui/icon-chip-styles";

/**
 * Minimals-style icon chip: the icon sits inside a soft tinted rounded square.
 * Tones map to existing design tokens only — no new colours are introduced.
 */
export type ChipTone =
  "primary" | "success" | "warning" | "info" | "destructive" | "muted" | "sidebar";

export type ChipSize = "xs" | "sm" | "md" | "lg";

export { toneClass, boxSize, glyphSize };

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
