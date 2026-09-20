import { Button } from "@/components/ui/button";
import { PayflowBrandIcon } from "@/features/finance/components/PayflowBrandIcon";
import { getPayflowPayerUrl } from "@/lib/ecosystem-urls";
import { cn } from "@/lib/utils";

type PayflowPayerLinkProps = {
  className?: string;
  label?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
};

/** Abre o portal público do pagador no PayFlow (app própria, nunca UI SIGA). */
export function PayflowPayerLink({
  className,
  label = "Pagar no PayFlow",
  size = "sm",
  variant = "outline",
}: PayflowPayerLinkProps) {
  const href = getPayflowPayerUrl();
  if (!href) return null;

  return (
    <Button
      asChild
      variant={variant}
      size={size}
      className={cn("gap-2 font-bold text-xs", className)}
    >
      <a href={href} target="_blank" rel="noreferrer">
        <PayflowBrandIcon size={14} />
        {label}
      </a>
    </Button>
  );
}
