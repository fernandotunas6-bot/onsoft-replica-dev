import { useEffect, useState } from "react"
import {
  detectDesktopOs,
  fetchLatestDesktopRelease,
  type DesktopOs,
  type DesktopRelease,
} from "@/lib/desktop-downloads"

function readVisitorOs(): DesktopOs | null {
  if (typeof navigator === "undefined") return null
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return detectDesktopOs(nav.userAgent, nav.userAgentData?.platform ?? nav.platform ?? "")
}

/** Sistema do visitante, para destacar o botão certo (o site não tem SSR). */
export function useVisitorOs() {
  const [os] = useState(readVisitorOs)
  return os
}

// Um só pedido por visita, partilhado pelos cartões e pela página.
let latestRelease: Promise<DesktopRelease | null> | null = null

/** Versão e tamanhos da última release publicada; null enquanto carrega ou sem resposta. */
export function useDesktopRelease() {
  const [release, setRelease] = useState<DesktopRelease | null>(null)
  useEffect(() => {
    let active = true
    latestRelease ??= fetchLatestDesktopRelease()
    void latestRelease.then((value) => {
      if (active) setRelease(value)
    })
    return () => {
      active = false
    }
  }, [])
  return release
}
