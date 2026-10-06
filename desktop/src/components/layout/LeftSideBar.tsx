import { useTranslation } from 'react-i18next'
import { Settings, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

interface LeftSideBarProps {
  children?: React.ReactNode
  className?: string
}

export function LeftSideBar({ children, className }: LeftSideBarProps) {
  const { t } = useTranslation()
  const openPreferences = useUIStore(state => state.setPreferencesOpen)
  const openPalette = useUIStore(state => state.setCommandPaletteOpen)
  return (
    <nav
      aria-label={t('siga.navigation')}
      className={cn(
        'flex h-full flex-col gap-3 border-r bg-background p-4',
        className
      )}
    >
      {children || (
        <>
          <p className="mb-3 font-semibold">SIGA Desktop</p>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => openPalette(true)}
          >
            <Search className="me-2 h-4 w-4" />
            {t('commandPalette.placeholder')}
          </Button>
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => openPreferences(true)}
          >
            <Settings className="me-2 h-4 w-4" />
            {t('commands.openPreferences.label')}
          </Button>
        </>
      )}
    </nav>
  )
}
