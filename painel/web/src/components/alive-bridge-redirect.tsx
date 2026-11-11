import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { resolveWebAliveBridge } from '@/lib/alive-bridges'
import { bridgeInternalPath } from '@/lib/bridge-target'

/** Ponte: rota morta → destino vivo (interno ou outra app). */
export function AliveBridgeRedirect({ path }: { path: string }) {
  const bridge = resolveWebAliveBridge(path)
  const internal = bridge ? bridgeInternalPath(bridge, window.location.origin) : null

  useEffect(() => {
    if (bridge && internal === null) {
      window.location.replace(bridge.to)
    }
  }, [bridge, internal])

  if (!bridge) return <Navigate to="/" replace />
  if (internal !== null) return <Navigate to={internal} replace />
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="animate-spin rounded-full border-b-2 border-primary h-8 w-8"></div>
      <p className="text-sm font-medium text-foreground">A redireccionar para {bridge.label}…</p>
      <a
        href={bridge.to}
        className="text-xs text-primary underline underline-offset-4 hover:opacity-80"
      >
        Se não for redireccionado automaticamente, clique aqui.
      </a>
    </div>
  )
}
