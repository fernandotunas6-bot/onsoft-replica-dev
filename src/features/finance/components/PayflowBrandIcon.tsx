import { MediaFrame } from "@/components/ui/media-frame";
import { cn } from "@/lib/utils";

/** Ícone oficial PayFlow (azulejos azuis) — não usar favicon/logo do SIGA. */
export const PAYFLOW_BRAND_ICON = "/brands/payflow-icon.png";

export function PayflowBrandIcon({ size = 16, className }: { size?: number; className?: string }) {
  // O ícone é decorativo — `alt=""` e `aria-hidden` no contentor, porque o texto
  // ao lado já diz "PayFlow". A imagem passa por MediaFrame como as restantes do
  // SIGA (é o que `check:style` exige); o tamanho fica no invólucro, já que
  // MediaFrame define a moldura pelo rácio e não aceita `style`.
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <MediaFrame
        src={PAYFLOW_BRAND_ICON}
        alt=""
        ratio="1/1"
        rounded="rounded"
        priority
        className="size-full bg-transparent"
        imgClassName="object-contain"
      />
    </span>
  );
}
