import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  KeyRound,
  RefreshCw,
  Tag,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { commands, unwrapResult } from '@/lib/tauri-bindings'
import {
  shortcutKeys,
  useAppVersion,
  useOnline,
  useQuickPaneShortcut,
} from '@/hooks/use-desktop-status'
import { cn } from '@/lib/utils'

interface MainWindowContentProps {
  children?: React.ReactNode
  className?: string
}

/** Atalhos fixos do template (lib/commands e menu da app). */
const FIXED_SHORTCUTS = [
  { key: 'home.shortcuts.palette', keys: 'CommandOrControl+K' },
  { key: 'home.shortcuts.preferences', keys: 'CommandOrControl+,' },
  { key: 'home.shortcuts.left', keys: 'CommandOrControl+1' },
  { key: 'home.shortcuts.right', keys: 'CommandOrControl+2' },
] as const

function Shortcut({ value }: { value: string }) {
  return (
    <KbdGroup>
      {shortcutKeys(value).map(key => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}

export function MainWindowContent({
  children,
  className,
}: MainWindowContentProps) {
  const { t } = useTranslation()
  const online = useOnline()
  const version = useAppVersion()
  const quickPaneShortcut = useQuickPaneShortcut()
  const [opening, setOpening] = useState(false)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('')

  async function openPortal() {
    setOpening(true)
    setStatus('')
    try {
      unwrapResult(await commands.openSigaPortal())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
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
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-y-auto bg-background',
        className
      )}
    >
      {children || (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8 lg:p-12">
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-4">
              <img
                src="/siga-icon.png"
                alt=""
                className="size-14 rounded-2xl shadow-sm"
              />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t('home.eyebrow')}
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">
                  {t('siga.title')}
                </h1>
              </div>
            </div>
            <p className="max-w-xl text-muted-foreground">
              {t('siga.description')}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" disabled={opening} onClick={openPortal}>
                {t(opening ? 'siga.opening' : 'siga.open')}
                <ArrowRight className="ms-2 h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={checking}
                onClick={checkUpdate}
              >
                <RefreshCw
                  className={cn('me-2 h-4 w-4', checking && 'animate-spin')}
                  aria-hidden="true"
                />
                {t('siga.update.check')}
              </Button>
            </div>
            <p
              role="status"
              aria-live="polite"
              className="min-h-5 text-sm text-muted-foreground"
            >
              {status || (online ? '' : t('siga.onlineRequired'))}
            </p>
          </section>

          <section
            aria-labelledby="desktop-status"
            className="flex flex-col gap-3"
          >
            <p
              id="desktop-status"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {t('home.status.title')}
            </p>
            <ItemGroup className="gap-2">
              <Item variant="outline" role="listitem">
                <ItemMedia variant="icon">
                  {online ? (
                    <Wifi aria-hidden="true" />
                  ) : (
                    <WifiOff aria-hidden="true" />
                  )}
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('home.status.network')}</ItemTitle>
                  <ItemDescription>
                    {t(
                      online
                        ? 'home.status.onlineHint'
                        : 'home.status.offlineHint'
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Badge variant={online ? 'default' : 'secondary'}>
                    {t(online ? 'home.status.online' : 'home.status.offline')}
                  </Badge>
                </ItemActions>
              </Item>
              <Item variant="outline" role="listitem">
                <ItemMedia variant="icon">
                  <KeyRound aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('home.status.security')}</ItemTitle>
                  <ItemDescription>
                    {t('home.status.securityHint')}
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Item variant="outline" role="listitem">
                <ItemMedia variant="icon">
                  <Tag aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t('home.status.version')}</ItemTitle>
                  <ItemDescription>
                    {t('home.status.versionHint')}
                  </ItemDescription>
                </ItemContent>
                {version ? (
                  <ItemActions>
                    <Badge variant="outline">v{version}</Badge>
                  </ItemActions>
                ) : null}
              </Item>
            </ItemGroup>
          </section>

          <Separator />

          <section
            aria-labelledby="desktop-shortcuts"
            className="flex flex-col gap-3"
          >
            <p
              id="desktop-shortcuts"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {t('home.shortcuts.title')}
            </p>
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              {FIXED_SHORTCUTS.map(item => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="text-muted-foreground">{t(item.key)}</dt>
                  <dd>
                    <Shortcut value={item.keys} />
                  </dd>
                </div>
              ))}
              {quickPaneShortcut ? (
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <dt className="text-muted-foreground">
                    {t('home.shortcuts.quickPane')}
                  </dt>
                  <dd>
                    <Shortcut value={quickPaneShortcut} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </main>
      )}
    </div>
  )
}
