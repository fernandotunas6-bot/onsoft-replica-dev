import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  BookOpen,
  Download,
  GraduationCap,
  Home,
  NotebookPen,
  Search,
  Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Separator } from '@/components/ui/separator'
import { useUIStore } from '@/store/ui-store'
import { commands, unwrapResult } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import {
  shortcutKeys,
  useAppVersion,
  useOnline,
} from '@/hooks/use-desktop-status'
import { cn } from '@/lib/utils'

interface LeftSideBarProps {
  children?: React.ReactNode
  className?: string
}

const SITE = 'https://www.portal-siga.com'
const DOCS = 'https://docs.portal-siga.com/siga/primeiros-passos.html'

function NavButton({
  icon: Icon,
  label,
  shortcut,
  current,
  onClick,
}: {
  icon: LucideIcon
  label: string
  shortcut?: string
  current?: boolean
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        'h-9 justify-start gap-2 px-2 font-normal',
        current && 'bg-accent font-medium text-accent-foreground'
      )}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate text-start">{label}</span>
      {shortcut ? (
        <KbdGroup className="hidden lg:inline-flex">
          {shortcutKeys(shortcut).map(key => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </KbdGroup>
      ) : null}
    </Button>
  )
}

function openExternal(url: string) {
  openUrl(url).catch(error =>
    logger.error('Não foi possível abrir a ligação', { url, error })
  )
}

export function LeftSideBar({ children, className }: LeftSideBarProps) {
  const { t } = useTranslation()
  const openPreferences = useUIStore(state => state.setPreferencesOpen)
  const openPalette = useUIStore(state => state.setCommandPaletteOpen)
  const setRightSidebarVisible = useUIStore(
    state => state.setRightSidebarVisible
  )
  const online = useOnline()
  const version = useAppVersion()

  const openPortal = async () => {
    try {
      unwrapResult(await commands.openSigaPortal())
    } catch (error) {
      logger.error('Não foi possível abrir o portal', { error })
    }
  }

  return (
    <nav
      aria-label={t('siga.navigation')}
      className={cn(
        'flex h-full flex-col gap-1 border-e bg-sidebar p-3 text-sidebar-foreground',
        className
      )}
    >
      {children || (
        <>
          <div className="mb-3 flex items-center gap-2 px-2 pt-1">
            <img src="/siga-icon.png" alt="" className="size-7 rounded-lg" />
            <span className="truncate font-semibold">SIGA Desktop</span>
          </div>

          <NavButton
            icon={Home}
            label={t('nav.home')}
            current
            onClick={() => undefined}
          />
          <NavButton
            icon={GraduationCap}
            label={t('nav.portal')}
            onClick={() => void openPortal()}
          />
          <NavButton
            icon={NotebookPen}
            label={t('nav.quickNote')}
            shortcut="CommandOrControl+2"
            onClick={() => setRightSidebarVisible(true)}
          />
          <NavButton
            icon={Search}
            label={t('nav.search')}
            shortcut="CommandOrControl+K"
            onClick={() => openPalette(true)}
          />
          <NavButton
            icon={Settings}
            label={t('home.shortcuts.preferences')}
            shortcut="CommandOrControl+,"
            onClick={() => openPreferences(true)}
          />

          <Separator className="my-2" />

          <NavButton
            icon={BookOpen}
            label={t('nav.help')}
            onClick={() => openExternal(DOCS)}
          />
          <NavButton
            icon={Download}
            label={t('nav.download')}
            onClick={() => openExternal(`${SITE}/download`)}
          />

          <div className="mt-auto flex items-center gap-2 px-2 pt-3 text-xs text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full',
                online ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              aria-hidden="true"
            />
            <span className="truncate">
              {t(online ? 'home.status.online' : 'home.status.offline')}
              {version ? ` · v${version}` : ''}
            </span>
          </div>
        </>
      )}
    </nav>
  )
}
