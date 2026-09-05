import { cn } from "@/lib/utils";

const sizes = {
  xs: 20,
  sm: 24,
  md: 36,
  lg: 48,
  xl: 64,
} as const;

export type PayflowBrandSize = keyof typeof sizes;

/**
 * Marca PayFlow — ícone oficial SIGA Plus.
 * Favicon leve: `/favicon.png` · Ícone UI: `/brands/siga-plus-icon.png`
 */
export function PayflowBrandMark({
  size = "md",
  className,
  rounded = true,
  title = "PayFlow",
}: {
  size?: PayflowBrandSize;
  className?: string;
  rounded?: boolean;
  title?: string;
}) {
  const px = sizes[size];
  const src = size === "xs" || size === "sm" ? "/favicon.png" : "/brands/siga-plus-icon.png";
  return (
    <img
      src={src}
      alt={title}
      width={px}
      height={px}
      decoding="async"
      className={cn(
        "object-contain select-none bg-background shadow-sm",
        rounded && "rounded-lg",
        className,
      )}
      style={{ width: px, height: px }}
    />
  );
}

export function PayflowBrandLockup({
  subtitle,
  size = "md",
  className,
}: {
  subtitle?: string;
  size?: PayflowBrandSize;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <PayflowBrandMark size={size} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">
          PayFlow
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
