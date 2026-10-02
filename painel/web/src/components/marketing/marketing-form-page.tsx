import { MarketingAuthShell } from "@/components/marketing/marketing-auth-shell"
import { MarketingLayout } from "@/components/layouts/marketing-layout"
import { Aurora } from "@/components/brand/aurora"

interface MarketingFormPageProps {
  children: React.ReactNode
  showFooter?: boolean
  maxWidth?: "sm" | "md" | "lg" | "5xl"
  /** Fundo Aurora suave da marca por trás do formulário (registo de escola). */
  aurora?: boolean
}

/** Login, registo e wizard — shell comercial uniforme. */
export function MarketingFormPage({
  children,
  showFooter = true,
  maxWidth,
  aurora = false,
}: MarketingFormPageProps) {
  const shell = <MarketingAuthShell maxWidth={maxWidth}>{children}</MarketingAuthShell>
  return (
    <MarketingLayout variant="auth" showFooter={showFooter}>
      {aurora ? (
        <div className="relative flex flex-1 flex-col">
          <Aurora variant="soft" fade={false} />
          <div className="relative flex flex-1 flex-col">{shell}</div>
        </div>
      ) : (
        shell
      )}
    </MarketingLayout>
  )
}
