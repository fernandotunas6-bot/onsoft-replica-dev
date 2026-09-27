import { MarketingAuthShell } from "@/components/marketing/marketing-auth-shell"
import { MarketingLayout } from "@/components/layouts/marketing-layout"

interface MarketingFormPageProps {
  children: React.ReactNode
  showFooter?: boolean
  maxWidth?: "sm" | "md" | "lg" | "5xl"
}

/** Login, registo e wizard — shell comercial uniforme. */
export function MarketingFormPage({
  children,
  showFooter = true,
  maxWidth,
}: MarketingFormPageProps) {
  return (
    <MarketingLayout variant="auth" showFooter={showFooter}>
      <MarketingAuthShell maxWidth={maxWidth}>{children}</MarketingAuthShell>
    </MarketingLayout>
  )
}
