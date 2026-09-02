import { cn } from "@/lib/utils";
import type { ChipSize, ChipTone } from "@/components/ui/icon-chip";
import { toneClass, boxSize } from "@/components/ui/icon-chip-styles";

export function resolveDisplayLogo(
  customUrl?: string | null,
  schoolLogoUrl?: string | null,
): string | null {
  const custom = customUrl?.trim();
  if (custom) return custom;
  const school = schoolLogoUrl?.trim();
  if (school) return school;
  return null;
}

export function LogoChip({
  src,
  alt = "Logótipo",
  tone = "primary",
  size = "sm",
  soft = true,
  label,
  className,
  imgClassName,
}: {
  src: string;
  alt?: string;
  tone?: ChipTone;
  size?: ChipSize;
  soft?: boolean;
  label?: string;
  className?: string;
  imgClassName?: string;
}) {
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <span
      {...a11y}
      data-logo-chip=""
      data-tone={tone}
      data-size={size}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden leading-none",
        boxSize[size],
        soft ? toneClass[tone] : "bg-background",
        className,
      )}
    >
      <img
        src={src}
        alt={label ?? alt}
        className={cn("size-[72%] object-contain", imgClassName)}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/** Logótipo explícito (URL própria). O logótipo institucional fica na sidebar — não usar como ícone genérico. */
export function SchoolLogoChip({
  logoUrl,
  alt,
  tone = "primary",
  size = "sm",
  soft = true,
  label,
  className,
}: {
  logoUrl?: string | null;
  alt?: string;
  tone?: ChipTone;
  size?: ChipSize;
  soft?: boolean;
  label?: string;
  className?: string;
}) {
  const src = logoUrl?.trim();
  if (!src) return null;
  return (
    <LogoChip
      src={src}
      alt={alt ?? label ?? "Logótipo"}
      tone={tone}
      size={size}
      soft={soft}
      label={label ?? alt}
      className={className}
    />
  );
}
