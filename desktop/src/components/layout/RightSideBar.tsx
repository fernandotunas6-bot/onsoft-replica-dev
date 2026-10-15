import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/ui-store'
import { cn } from '@/lib/utils'

interface RightSideBarProps {
  children?: React.ReactNode
  className?: string
}

export function RightSideBar({ children, className }: RightSideBarProps) {
  const { t } = useTranslation()
  const note = useUIStore(state => state.lastQuickPaneEntry)
  return (
    <aside
      className={cn(
        'flex h-full flex-col gap-4 border-l bg-background p-4',
        className
      )}
    >
      {children || (
        <>
          <h2 className="font-semibold">{t('siga.notes.title')}</h2>
          <p className="whitespace-pre-wrap break-words text-sm">
            {note || t('siga.notes.empty')}
          </p>
          <p className="mt-auto text-xs text-muted-foreground">
            {t('siga.notes.temporary')}
          </p>
        </>
      )}
    </aside>
  )
}
