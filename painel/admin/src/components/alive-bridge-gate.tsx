"use client"

import { useEffect } from "react"
import { resolveAdminAliveBridge } from "@/lib/alive-bridges"
import { SHOW_TEMPLATE_SURFACES } from "@/lib/feature-flags"

/**
 * Páginas de demonstração do template. Em desenvolvimento o proxy redirecciona-as,
 * mas o ADMIN publicado é estático (sem proxy) e mostrava formulários falsos que
 * só faziam console.log. Aqui o redireccionamento acontece no navegador.
 */
export function AliveBridgeGate({ path, children }: { path: string; children: React.ReactNode }) {
  const bridge = SHOW_TEMPLATE_SURFACES ? null : resolveAdminAliveBridge(path)

  useEffect(() => {
    if (bridge) window.location.replace(bridge.to)
  }, [bridge])

  if (!bridge) return <>{children}</>
  return (
    <p className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-muted-foreground">
      A abrir {bridge.label}…
    </p>
  )
}
