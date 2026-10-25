import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { commands } from '@/lib/tauri-bindings'
import { getPlatform } from '@/hooks/use-platform'

/** `true` com rede; actualiza-se quando o sistema avisa que a ligação mudou. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  )
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/** Versão da app instalada (`null` enquanto lê ou fora da app). */
export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getVersion()
      .then(value => active && setVersion(value))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  return version
}

/**
 * Detecta versões assinadas a partir da shell local, mesmo sem abrir a janela
 * escolar. Só avisa: instalar continua no portal, protegido contra envios pendentes.
 */
export function useDesktopAvailableUpdate(): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    let checking = false
    const check = async () => {
      if (navigator.onLine === false || checking) return
      checking = true
      try {
        const result = await commands.desktopUpdateStatus()
        if (active && result.status === 'ok') {
          setVersion(result.data.available ? (result.data.version ?? 'nova') : null)
        }
      } catch {
        // Sem rede real ou sem chave pública, a shell continua a funcionar.
        // A verificação manual continua a mostrar as falhas ao utilizador.
      } finally {
        checking = false
      }
    }

    const reconnect = () => void check()
    const timer = window.setTimeout(reconnect, 15_000)
    const interval = window.setInterval(reconnect, 6 * 60 * 60_000)
    window.addEventListener('online', reconnect)
    return () => {
      active = false
      window.clearTimeout(timer)
      window.clearInterval(interval)
      window.removeEventListener('online', reconnect)
    }
  }, [])
  return version
}

/** Atalho global da nota rápida (o das preferências ou o de origem). */
export function useQuickPaneShortcut(): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const prefs = await commands.loadPreferences()
        const saved =
          prefs.status === 'ok' ? prefs.data.quick_pane_shortcut : null
        const value = saved ?? (await commands.getDefaultQuickPaneShortcut())
        if (active) setShortcut(value ?? null)
      } catch {
        // Sem atalho conhecido: a linha do atalho não aparece.
      }
    })()
    return () => {
      active = false
    }
  }, [])
  return shortcut
}

/** «CommandOrControl+Shift+N» → ["⌘", "⇧", "N"] no Mac, ["Ctrl", "Shift", "N"] fora. */
export function shortcutKeys(shortcut: string): string[] {
  const mac = getPlatform() === 'macos'
  const names: Record<string, string> = mac
    ? {
        commandorcontrol: '⌘',
        cmdorctrl: '⌘',
        command: '⌘',
        cmd: '⌘',
        super: '⌘',
        control: '⌃',
        ctrl: '⌃',
        shift: '⇧',
        alt: '⌥',
        option: '⌥',
      }
    : {
        commandorcontrol: 'Ctrl',
        cmdorctrl: 'Ctrl',
        control: 'Ctrl',
        ctrl: 'Ctrl',
        command: 'Win',
        cmd: 'Win',
        super: 'Win',
        shift: 'Shift',
        alt: 'Alt',
        option: 'Alt',
      }
  return shortcut
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => names[part.toLowerCase()] ?? part.replace(/^Key/, ''))
}
