import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { resolveWebAliveBridge } from '@/lib/alive-bridges'

/** Ponte: rota morta → destino vivo (interno ou outra app). */
export function AliveBridgeRedirect({ path }: { path: string }) {
  const bridge = resolveWebAliveBridge(path)

  useEffect(() => {
    if (bridge?.external) {
      window.location.replace(bridge.to)
    }
  }, [bridge])

  if (!bridge) return <Navigate to="/" replace />
  if (bridge.external) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-sm text-muted-foreground">
        A abrir {bridge.label}…
      </div>
    )
  }
  return <Navigate to={bridge.to} replace />
}
