import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GraduationCap, ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { commands, unwrapResult } from '@/lib/tauri-bindings'
import { cn } from '@/lib/utils'

interface MainWindowContentProps {
  children?: React.ReactNode
  className?: string
}

export function MainWindowContent({
  children,
  className,
}: MainWindowContentProps) {
  const { t } = useTranslation()
  const [opening, setOpening] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('')
  async function openPortal() {
    setOpening(true)
    setStatus('')
    try {
      unwrapResult(await commands.openSigaPortal())
    } catch (error) {
      setStatus(String(error))
    } finally {
      setOpening(false)
    }
  }
  async function checkUpdate() {
    setChecking(true)
    try {
      const update = unwrapResult(await commands.desktopUpdateStatus())
      setStatus(
        !update.configured
          ? t('siga.update.disabled')
          : update.available
            ? t('siga.update.available', { version: update.version })
            : t('siga.update.current')
      )
    } catch (error) {
      setStatus(String(error))
    } finally {
      setChecking(false)
    }
  }
  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {children || (
        <main className="flex flex-1 flex-col justify-center gap-6 p-8 lg:p-12">
          <GraduationCap
            className="h-12 w-12 text-primary"
            aria-hidden="true"
          />
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              SIGA Plus · OnSoft
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {t('siga.title')}
            </h1>
            <p className="mt-4 max-w-xl text-muted-foreground">
              {t('siga.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={opening} onClick={openPortal}>
              {t(opening ? 'siga.opening' : 'siga.open')}
              <ArrowRight className="ms-2 h-4 w-4" />
            </Button>
            <Button variant="outline" disabled={checking} onClick={checkUpdate}>
              <RefreshCw className="me-2 h-4 w-4" />
              {t('siga.update.check')}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm">
            {status || t('siga.onlineRequired')}
          </p>
          <p className="text-xs text-muted-foreground">{t('siga.shortcuts')}</p>
        </main>
      )}
    </div>
  )
}
