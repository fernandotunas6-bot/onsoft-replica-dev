import * as React from "react"
import { assetUrl, cn } from "@/lib/utils"

interface LogoProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  size?: number
}

/**
 * Ícone oficial do SIGA Plus: o «S» em squircle da app (o mesmo ficheiro de
 * public/icons/ no SIGA, copiado para public/brand/). Substitui o carrinho de
 * compras que vinha do modelo ShadcnStore. Decorativo por omissão, porque os
 * sítios onde aparece têm o nome «SIGA Plus» ao lado.
 */
export function Logo({ size = 24, alt = "", className, ...props }: LogoProps) {
  return (
    <img
      src={assetUrl("brand/siga-plus-icon.png")}
      width={size}
      height={size}
      alt={alt}
      decoding="async"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      {...props}
    />
  )
}
