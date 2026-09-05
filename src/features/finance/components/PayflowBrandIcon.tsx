import { cn } from "@/lib/utils";

/** Ícone oficial PayFlow (azulejos azuis) — não usar favicon/logo do SIGA. */
export const PAYFLOW_BRAND_ICON = "/brands/payflow-icon.png";

export function PayflowBrandIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={PAYFLOW_BRAND_ICON}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn("shrink-0 rounded object-contain", className)}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
