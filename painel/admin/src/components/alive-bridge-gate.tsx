"use client"

import { useEffect } from "react"
import { resolveAdminAliveBridge } from "@/lib/alive-bridges"

/**
 * Endereços herdados do modelo de UI. Em desenvolvimento o proxy redirecciona-os,
 * mas o ADMIN publicado é estático (sem proxy): aqui o redireccionamento acontece no
 * navegador. As páginas de demonstração por trás saíram a 11/11/2026.
 */
export function AliveBridgeGate({ path, children }: { path: string; children: React.ReactNode }) {
  const bridge = resolveAdminAliveBridge(path)

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
