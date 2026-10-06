import { GraduationCap } from 'lucide-react'
import { commands, unwrapResult } from '@/lib/tauri-bindings'
import type { AppCommand } from './types'

export const sigaCommands: AppCommand[] = [
  {
    id: 'open-siga-portal',
    labelKey: 'siga.portal.label',
    descriptionKey: 'siga.portal.description',
    group: 'navigation',
    icon: GraduationCap,
    keywords: ['siga', 'escola', 'alunos', 'portal'],
    execute: async () => {
      unwrapResult(await commands.openSigaPortal())
    },
  },
]
