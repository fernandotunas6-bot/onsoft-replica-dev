import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, Eraser, PanelTop } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useUIStore } from '@/store/ui-store'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface RightSideBarProps {
  children?: React.ReactNode
  className?: string
}

/**
 * Nota rápida: o mesmo texto que a janela flutuante (atalho global) envia para aqui.
 * Fica só nesta sessão, nunca no SIGA.
 */
export function RightSideBar({ children, className }: RightSideBarProps) {
  const { t } = useTranslation()
  const note = useUIStore(state => state.lastQuickPaneEntry)
  const setNote = useUIStore(state => state.setLastQuickPaneEntry)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(note ?? '')
      toast.success(t('notes.copied'))
    } catch (error) {
      logger.error('Não foi possível copiar a nota', { error })
    }
  }

  const openPane = async () => {
    const result = await commands.showQuickPane()
    if (result.status === 'error') {
      logger.error('Não foi possível abrir a nota rápida', {
        error: result.error,
      })
    }
  }

  return (
    <aside
      aria-labelledby="quick-note-title"
      className={cn(
        'flex h-full flex-col gap-3 border-s bg-sidebar p-4 text-sidebar-foreground',
        className
      )}
    >
      {children || (
        <>
          <h2 id="quick-note-title" className="font-semibold">
            {t('siga.notes.title')}
          </h2>
          <Textarea
            value={note ?? ''}
            onChange={event => setNote(event.target.value)}
            placeholder={t('siga.notes.empty')}
            aria-labelledby="quick-note-title"
            className="min-h-40 flex-1 resize-none bg-background"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!note}
              onClick={() => void copy()}
            >
              <Copy className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('notes.copy')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!note}
              onClick={() => setNote('')}
            >
              <Eraser className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('notes.clear')}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            onClick={() => void openPane()}
          >
            <PanelTop className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('notes.openPane')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('siga.notes.temporary')}
          </p>
        </>
      )}
    </aside>
  )
}
