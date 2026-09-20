import { cn } from "@/lib/utils";

const sizes = {
  xs: 20,
  sm: 24,
  md: 36,
  lg: 48,
  xl: 64,
} as const;

export type PayflowBrandSize = keyof typeof sizes;

/** Ícone oficial PayFlow — `public/brands/payflow-icon.png` (nunca assets SIGA). */
export const PAYFLOW_ICON_SRC = "/brands/payflow-icon.png";

/**
 * Marca PayFlow — azulejos azuis oficiais da pasta `painel/payflow/public`.
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
  return (
    <img
      src={PAYFLOW_ICON_SRC}
      alt={title}
      width={px}
      height={px}
      decoding="async"
      className={cn(
        "object-contain select-none shadow-sm",
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
