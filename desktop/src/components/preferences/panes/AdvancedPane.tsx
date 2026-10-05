import { useTranslation } from 'react-i18next'
import { SettingsSection } from '../shared/SettingsComponents'

export function AdvancedPane() {
  const { t } = useTranslation()
  return (
    <SettingsSection title={t('siga.advanced')}>
      <p className="text-sm text-muted-foreground">
        {t('siga.advancedDescription')}
      </p>
      <p className="mt-4 text-sm">
        {t('siga.version', { version: __APP_VERSION__ })}
      </p>
    </SettingsSection>
  )
}
