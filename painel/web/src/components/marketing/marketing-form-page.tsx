import { MarketingAuthShell } from "@/components/marketing/marketing-auth-shell"
import { MarketingLayout } from "@/components/layouts/marketing-layout"

interface MarketingFormPageProps {
  children: React.ReactNode
  showFooter?: boolean
}

/** Login, registo e wizard — shell comercial uniforme. */
export function MarketingFormPage({ children, showFooter = true }: MarketingFormPageProps) {
  return (
    <MarketingLayout variant="auth" showFooter={showFooter}>
      <MarketingAuthShell>{children}</MarketingAuthShell>
    </MarketingLayout>
  )
}
